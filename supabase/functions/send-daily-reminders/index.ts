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
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID secrets not configured", sent: 0 }, 500);
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Threshold for "more than 2 days overdue" = due_date < (today - 2 days)
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 2);
  const thresholdStr = thresholdDate.toISOString().split("T")[0];

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

    // Due today
    const { data: dueTodayRows } = await supabase
      .from("payments")
      .select("borrower_name")
      .in("loan_id", loanIds)
      .in("payment_status", ["Pending", "Partial"])
      .is("deleted_at", null)
      .eq("due_date", today);

    // Overdue more than 2 days (due_date strictly before threshold)
    const { data: overdueRows } = await supabase
      .from("payments")
      .select("borrower_name")
      .in("loan_id", loanIds)
      .in("payment_status", ["Pending", "Partial"])
      .is("deleted_at", null)
      .lt("due_date", thresholdStr);

    const dueTodayCount = (dueTodayRows ?? []).length;
    const overdueList   = (overdueRows ?? []) as { borrower_name: string }[];

    if (!dueTodayCount && !overdueList.length) continue;

    const lines: string[] = [];
    if (dueTodayCount > 0) lines.push(`${dueTodayCount} payment(s) due today`);
    if (overdueList.length > 0) {
      const names   = [...new Set(overdueList.map((p) => p.borrower_name))];
      const preview = names.length <= 2
        ? names.join(" · ")
        : `${names[0]} · ${names[1]} & ${names.length - 2} more`;
      lines.push(`${overdueList.length} payment(s) overdue 3+ days: ${preview}`);
    }

    const payload = JSON.stringify({
      title: "Loan Reminder",
      body: lines.join("\n"),
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
