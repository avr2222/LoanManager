-- ============================================================
-- Fix: phone users getting "Failed to add loan"
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Ensure INSERT policy allows lender_phone match ────────
--    (safe to re-run — drops & recreates)
DROP POLICY IF EXISTS "phone_insert_own_loans" ON loans;
CREATE POLICY "phone_insert_own_loans" ON loans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
      OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- ── 2. Ensure UPDATE policy exists for lenders AND borrowers ─
--    Borrowers can update loans they personally created (e.g. a
--    mediator recording their own liability from an external source).
DROP POLICY IF EXISTS "phone_update_own_loans" ON loans;
CREATE POLICY "phone_update_own_loans" ON loans
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(lender_phone)   = public.user_phone() OR
      public.norm_phone(borrower_phone) = public.user_phone()
    )
  )
  WITH CHECK (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(lender_phone)   = public.user_phone() OR
      public.norm_phone(borrower_phone) = public.user_phone()
    )
  );

-- ── 3. DELETE policy for lenders AND borrowers ───────────────
DROP POLICY IF EXISTS "phone_delete_own_loans" ON loans;
CREATE POLICY "phone_delete_own_loans" ON loans
  FOR DELETE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(lender_phone)   = public.user_phone() OR
      public.norm_phone(borrower_phone) = public.user_phone()
    )
  );

-- ── 4. Payments — INSERT / UPDATE / DELETE for lenders & mediators ──
--    Phone users can act on payments for loans they own as lender OR mediator.
--    Mediator access covers the case where the lender doesn't use the app
--    and the mediator manages everything on their behalf.

DROP POLICY IF EXISTS "phone_insert_own_payments" ON payments;
CREATE POLICY "phone_insert_own_payments" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone)   = public.user_phone()
         OR public.norm_phone(mediator_phone)  = public.user_phone()
    )
  );

DROP POLICY IF EXISTS "phone_update_own_payments" ON payments;
CREATE POLICY "phone_update_own_payments" ON payments
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone)   = public.user_phone()
         OR public.norm_phone(mediator_phone)  = public.user_phone()
    )
  )
  WITH CHECK (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone)   = public.user_phone()
         OR public.norm_phone(mediator_phone)  = public.user_phone()
    )
  );

DROP POLICY IF EXISTS "phone_delete_own_payments" ON payments;
CREATE POLICY "phone_delete_own_payments" ON payments
  FOR DELETE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone)   = public.user_phone()
         OR public.norm_phone(mediator_phone)  = public.user_phone()
    )
  );

-- ── 5. SECURITY DEFINER function to get next loan ID ─────────
--    Bypasses RLS so phone users see the real global max,
--    preventing loan ID collisions.
CREATE OR REPLACE FUNCTION public.get_next_loan_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_num INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REGEXP_REPLACE(loan_id, '[^0-9]', '', 'g') AS INTEGER)),
    0
  )
  INTO v_max_num
  FROM loans
  WHERE loan_id ~ '^L[0-9]+$';   -- only count well-formed IDs

  RETURN 'L' || LPAD((v_max_num + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_loan_id TO authenticated;
