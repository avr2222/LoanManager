// Supabase Edge Function — send-test-notification
// Called by super admins from the Users page to test push delivery for any user.
//
// Deploy with: supabase functions deploy send-test-notification
// (JWT is verified inside — do NOT use --no-verify-jwt)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="npm:@types/web-push@3.6.3"
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL       = Deno.env.get("VAPID_EMAIL") ?? "mailto:admin@loanmgr.app";

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  // Verify caller JWT
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, jwt, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Verify caller is super admin
  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: callerProfile } = await serviceClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.is_super_admin) return json({ error: "Forbidden" }, 403);

  // Parse target user and optional custom message
  const { user_id, message } = await req.json() as { user_id: string; message?: string };
  if (!user_id) return json({ error: "user_id is required" }, 400);

  // Fetch push subscriptions for target user
  const { data: subs } = await serviceClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (!subs?.length) return json({ sent: false, reason: "no_subscription" });

  const payload = JSON.stringify({
    title: "Test Notification",
    body: message ?? "Push notifications are working ✓",
    url: "/LoanManager/",
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (_) {
      // Ignore expired subscriptions during test
    }
  }

  return json({ sent: sent > 0, count: sent });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
