-- ============================================================
-- V2 Migration 21 — Optional principal repayment date on loans
-- Adds loans.principal_due_date and teaches the create_loan RPC
-- about the new column. Run in the Supabase SQL Editor (schema is
-- applied by hand). Safe to re-run.
-- ============================================================

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS principal_due_date DATE;

-- Re-declare create_loan (see v2_15) with principal_due_date included.
CREATE OR REPLACE FUNCTION public.create_loan(p_loan JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.loans (
    loan_id, creator_id,
    lender_name, lender_phone,
    borrower_name, borrower_phone, borrower_address,
    loan_type,
    mediator_name, mediator_phone, mediator_commission_pct,
    principal_amount, annual_interest_rate, monthly_interest_rate,
    date_given, monthly_due_day, expected_tenure_months, principal_due_date,
    monthly_interest_amount, mediator_monthly_share, net_monthly_receipt,
    loan_status, remarks,
    created_at, updated_at
  ) VALUES (
    p_loan->>'loan_id',
    v_uid,
    COALESCE(p_loan->>'lender_name',    ''),
    COALESCE(p_loan->>'lender_phone',   ''),
    p_loan->>'borrower_name',
    COALESCE(p_loan->>'borrower_phone', ''),
    COALESCE(p_loan->>'borrower_address',''),
    p_loan->>'loan_type',
    COALESCE(p_loan->>'mediator_name',  ''),
    COALESCE(p_loan->>'mediator_phone', ''),
    COALESCE((p_loan->>'mediator_commission_pct')::NUMERIC, 0),
    (p_loan->>'principal_amount')::NUMERIC,
    (p_loan->>'annual_interest_rate')::NUMERIC,
    (p_loan->>'monthly_interest_rate')::NUMERIC,
    (p_loan->>'date_given')::DATE,
    (p_loan->>'monthly_due_day')::INTEGER,
    COALESCE((p_loan->>'expected_tenure_months')::INTEGER, 0),
    (p_loan->>'principal_due_date')::DATE,
    (p_loan->>'monthly_interest_amount')::NUMERIC,
    COALESCE((p_loan->>'mediator_monthly_share')::NUMERIC, 0),
    (p_loan->>'net_monthly_receipt')::NUMERIC,
    p_loan->>'loan_status',
    COALESCE(p_loan->>'remarks', ''),
    COALESCE((p_loan->>'created_at')::TIMESTAMPTZ, now()),
    now()
  );
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION public.create_loan(JSONB) TO authenticated;
