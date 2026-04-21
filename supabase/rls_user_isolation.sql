-- ============================================================
-- User data isolation: each phone user sees only their own data
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the old open policies
DROP POLICY IF EXISTS "Allow all for anon" ON loans;
DROP POLICY IF EXISTS "Allow all for anon" ON payments;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "admin_all_loans"          ON loans;
DROP POLICY IF EXISTS "phone_select_own_loans"   ON loans;
DROP POLICY IF EXISTS "phone_insert_own_loans"   ON loans;
DROP POLICY IF EXISTS "admin_all_payments"       ON payments;
DROP POLICY IF EXISTS "phone_select_own_payments" ON payments;

-- ── Helper: extract phone from phone@user.local email ────────
-- NOTE: must live in public schema — Supabase blocks auth schema DDL
CREATE OR REPLACE FUNCTION public.user_phone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN (auth.jwt() ->> 'email') LIKE '%@user.local'
    THEN split_part(auth.jwt() ->> 'email', '@', 1)
    ELSE NULL
  END;
$$;

-- ── Helper: is current user an admin (non-phone login)? ──────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth.uid() IS NOT NULL
    AND (auth.jwt() ->> 'email') NOT LIKE '%@user.local';
$$;

-- ── Normalize stored phone to last 10 digits ─────────────────
-- (handles spaces, dashes, +91 prefix etc.)
CREATE OR REPLACE FUNCTION public.norm_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10);
$$;


-- ════════════════════════════════════════════════════════════
-- LOANS
-- ════════════════════════════════════════════════════════════

-- Admin: access only their own loans (where they are the owner)
CREATE POLICY "admin_all_loans" ON loans
  FOR ALL TO authenticated
  USING (public.is_admin() AND owner_id = auth.uid())
  WITH CHECK (public.is_admin());

-- Phone user: SELECT own loans (as borrower OR mediator)
CREATE POLICY "phone_select_own_loans" ON loans
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
    )
  );

-- Phone user: INSERT loans they are involved in
CREATE POLICY "phone_insert_own_loans" ON loans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
    )
  );


-- ════════════════════════════════════════════════════════════
-- PAYMENTS
-- ════════════════════════════════════════════════════════════

-- Admin: full access
CREATE POLICY "admin_all_payments" ON payments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Phone user: SELECT payments for their loans only
CREATE POLICY "phone_select_own_payments" ON payments
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(borrower_phone) = public.user_phone()
         OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
    )
  );
