// Supabase Edge Function — send-daily-reminders
// Schedule: daily at 7 AM (set up via pg_cron or an external cron like cron-job.org)
//
// Required secrets (set via: supabase secrets set KEY=value):
//   VAPID_PUBLIC_KEY   — base64url VAPID public key
//   VAPID_PRIVATE_KEY  — base64url VAPID private key
//   VAPID_EMAIL        — mailto:your@email.com
//   SUPABASE_URL       — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
//
// Deploy with: supabase functions deploy send-daily-reminders --no-verify-jwt
// The --no-verify-jwt flag lets cron-job.org call this without a user token.
// Security: protect with a shared secret header if needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push@3.6.3"
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL       = Deno.env.get("VAPID_EMAIL") ?? "mailto:admin@loanmgr.app";

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (_req) => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Fetch all push subscriptions
  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");

  if (subErr) return json({ error: subErr.message }, 500);
  if (!subs?.length) return json({ sent: 0, message: "no subscriptions" });

  let sent = 0;
  const expired: string[] = [];

  for (const sub of subs) {
    // Get active loans owned by this user
    const { data: loans } = await supabase
      .from("loans")
      .select("loan_id")
      .eq("creator_id", sub.user_id)
      .eq("loan_status", "Active")
      .is("deleted_at", null);

    const loanIds = (loans ?? []).map((l: { loan_id: string }) => l.loan_id);
    if (!loanIds.length) continue;

    // Get pending/partial payments due today or overdue
    const { data: payments } = await supabase
      .from("payments")
      .select("due_date, payment_status")
      .in("loan_id", loanIds)
      .in("payment_status", ["Pending", "Partial"])
      .is("deleted_at", null)
      .lte("due_date", today);

    if (!payments?.length) continue;

    const dueToday = payments.filter((p: { due_date: string }) => p.due_date === today).length;
    const overdue  = payments.filter((p: { due_date: string }) => p.due_date <  today).length;

    let body = "";
    if (dueToday > 0 && overdue > 0)      body = `${dueToday} payment(s) due today · ${overdue} overdue`;
    else if (dueToday > 0)                 body = `${dueToday} payment(s) due today`;
    else if (overdue  > 0)                 body = `${overdue} overdue payment(s) need attention`;
    if (!body) continue;

    const payload = JSON.stringify({
      title: "Loan Reminder",
      body,
      url: "/LoanManager/",
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        // Subscription expired or unregistered — clean it up
        expired.push(sub.id);
      }
    }
  }

  // Remove expired subscriptions
  if (expired.length) {
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }

  return json({ sent, expired: expired.length });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
