-- ============================================================
-- User Management — Soft Disable
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ── 1. Add is_active + display_name + audit columns to profiles ─
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_name TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_by  TEXT        DEFAULT NULL;

-- ── 2. Update handle_new_user trigger to handle @user.local ──
--    (earlier version only handled @mediator.local)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, phone)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email LIKE '%@user.local'      THEN 'mediator'
      WHEN NEW.email LIKE '%@mediator.local'  THEN 'mediator'
      ELSE 'admin'
    END,
    CASE
      WHEN NEW.email LIKE '%@user.local'     THEN REPLACE(NEW.email, '@user.local', '')
      WHEN NEW.email LIKE '%@mediator.local' THEN REPLACE(NEW.email, '@mediator.local', '')
      ELSE ''
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 3. Replace old per-user policies with admin-aware ones ──
--    Drop old policies from add_profiles.sql first
DROP POLICY IF EXISTS "Users read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles"  ON public.profiles;
DROP POLICY IF EXISTS "admin_update_profiles"    ON public.profiles;

-- Admin sees all profiles; phone users see only their own
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NULL   -- admin has no phone → sees all
    OR id = auth.uid()            -- phone users see own profile only
  );

-- Admin can update any profile (enable/disable)
-- Phone users can update only their own (to set display_name etc.)
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NULL   -- admin: any row
    OR id = auth.uid()            -- phone user: own row only
  )
  WITH CHECK (
    public.user_phone() IS NULL
    OR id = auth.uid()
  );

-- ── 5. Block disabled phone users from reading loan data ─────
--    Add is_active check to existing loan SELECT policies.
--    Admin (user_phone() IS NULL) is never blocked.
--    Phone users are blocked if their profile has is_active = FALSE.

-- Helper function: returns TRUE if current user is active (or is admin)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN public.user_phone() IS NULL THEN TRUE   -- admin always active
    ELSE COALESCE(
      (SELECT is_active FROM public.profiles WHERE id = auth.uid()),
      TRUE
    )
  END;
$$;

-- NOTE: After running this migration, edit your existing RLS SELECT
-- policies on loans and payments to also include:
--   AND public.is_active_user() = TRUE
--
-- Or add a separate blocking policy:

DROP POLICY IF EXISTS "block_disabled_users_loans" ON public.loans;
CREATE POLICY "block_disabled_users_loans" ON public.loans
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_active_user() = TRUE);

DROP POLICY IF EXISTS "block_disabled_users_payments" ON public.payments;
CREATE POLICY "block_disabled_users_payments" ON public.payments
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_active_user() = TRUE);

-- ── 6. Fix existing @user.local profiles that got role='admin' ──
--    The old trigger only handled @mediator.local; @user.local fell
--    through to 'admin'. Correct those rows now.
UPDATE public.profiles
SET
  role  = 'mediator',
  phone = REPLACE(auth.users.email, '@user.local', '')
FROM auth.users
WHERE public.profiles.id   = auth.users.id
  AND auth.users.email      LIKE '%@user.local'
  AND public.profiles.role  = 'admin';

-- ── 7. Back-fill @user.local profiles that don't exist yet ───
INSERT INTO public.profiles (id, role, phone)
SELECT
  id,
  'mediator',
  REPLACE(email, '@user.local', '')
FROM auth.users
WHERE email LIKE '%@user.local'
ON CONFLICT (id) DO NOTHING;
