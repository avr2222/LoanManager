-- ============================================================
-- V2 Migration 07 — UPI ID + Payment Claim Flow
-- Safe to re-run. Run AFTER v2_06_triggers.sql.
-- ============================================================

-- ── 1. Add upi_id column to profiles ─────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upi_id TEXT NOT NULL DEFAULT '';

-- ── 2. RPC: get_upi_id_by_phone ───────────────────────────────
--    SECURITY DEFINER so borrowers can fetch their lender/
--    mediator UPI ID even if RLS restricts cross-user reads.
--    Returns '' if no profile found or UPI not set.

CREATE OR REPLACE FUNCTION public.get_upi_id_by_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(upi_id, '')
  FROM public.profiles
  WHERE phone = public.norm_phone(p_phone)
  LIMIT 1;
$$;


-- ── 3. Extend payment_status CHECK to include 'Claimed' ───────
--    Drop whichever auto-named or named constraint exists, then
--    re-add with the new value. Safe to re-run.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'payments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT chk_payment_status
    CHECK (payment_status IN ('Received', 'Pending', 'Waived', 'Partial', 'Claimed'));


-- ── 4. RPC: claim_payment ────────────────────────────────────
--    Called by borrowers after completing a UPI payment.
--    RLS blocks borrowers from directly UPDATE-ing payments,
--    so this SECURITY DEFINER function performs the write after
--    verifying the caller is the borrower on that loan.

CREATE OR REPLACE FUNCTION public.claim_payment(
  p_payment_id TEXT,
  p_utr_number TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loan_id TEXT;
BEGIN
  -- Verify the calling user is the borrower on this payment's loan
  SELECT l.loan_id INTO v_loan_id
  FROM public.payments p
  JOIN public.loans l ON l.loan_id = p.loan_id
  WHERE p.id = p_payment_id
    AND p.deleted_at IS NULL
    AND l.deleted_at IS NULL
    AND public.norm_phone(l.borrower_phone) = public.my_phone();

  IF v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: you are not the borrower on this payment';
  END IF;

  UPDATE public.payments
  SET
    payment_status  = 'Claimed',
    amount_received = net_amount_expected,
    confirmed_by    = auth.uid(),
    confirmed_at    = now(),
    remarks         = CASE
                        WHEN p_utr_number != ''
                        THEN TRIM(COALESCE(NULLIF(remarks, ''), '') || ' UTR: ' || p_utr_number)
                        ELSE remarks
                      END,
    updated_at      = now()
  WHERE id = p_payment_id
    AND deleted_at IS NULL;
END;
$$;
