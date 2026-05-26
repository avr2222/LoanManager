-- Returns distinct user IDs that have at least one push subscription.
-- Only callable by super admins (checked inside the function body).
CREATE OR REPLACE FUNCTION public.get_subscribed_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ps.user_id
  FROM push_subscriptions ps
  WHERE EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  );
$$;

REVOKE ALL ON FUNCTION public.get_subscribed_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscribed_user_ids() TO authenticated;
