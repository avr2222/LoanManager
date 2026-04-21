-- Add lender fields to loans table
-- Run AFTER rls_user_isolation.sql in Supabase SQL Editor

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS lender_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lender_phone TEXT NOT NULL DEFAULT '';

-- Update RLS: phone users can also see loans where they are the lender
DROP POLICY IF EXISTS "phone_select_own_loans"  ON loans;
DROP POLICY IF EXISTS "phone_insert_own_loans"  ON loans;

CREATE POLICY "phone_select_own_loans" ON loans
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
      OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

CREATE POLICY "phone_insert_own_loans" ON loans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
      OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- Update payments RLS to include lender loans
DROP POLICY IF EXISTS "phone_select_own_payments" ON payments;

CREATE POLICY "phone_select_own_payments" ON payments
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(borrower_phone) = public.user_phone()
         OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
         OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );
