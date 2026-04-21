-- Allow phone users who are the LENDER of a loan to mark its payments as received.
-- Run this in Supabase SQL Editor (requires add_lender_fields.sql to have run first).

DROP POLICY IF EXISTS "phone_update_lender_payments" ON payments;

CREATE POLICY "phone_update_lender_payments" ON payments
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone) = public.user_phone()
    )
  )
  WITH CHECK (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone) = public.user_phone()
    )
  );
