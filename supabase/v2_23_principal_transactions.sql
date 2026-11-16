-- ============================================================
-- V2 Migration 23 — Principal repayments, top-ups and closures
-- Run in the Supabase SQL Editor AFTER v2_21. Safe to re-run.
--
-- Adds:
--   1. principal_transactions      — ledger of principal movements per loan
--   2. can_manage_loan()           — who may record principal movements
--   3. record_principal_txn()      — records a Repayment / TopUp / Closure
--   4. undo_principal_txn()        — undoes the latest ledger entry of a loan
--   5. reset_confirmations_on_edit — now skips principal movements
--   6. get_deleted_payment_keys()  — lets every party (not just the super
--      admin) tell the app which months were deliberately deleted, so the
--      auto-generator does not recreate them
--
-- Why RPCs: only a loan's creator may UPDATE a loans row under RLS, and a
-- change to principal_amount would otherwise reset party confirmations.
-- A repayment is not a change of terms, and a lender who did not create
-- the loan must still be able to record one.
-- ============================================================


-- ── 1. Ledger table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.principal_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id          TEXT        NOT NULL REFERENCES public.loans(loan_id) ON DELETE CASCADE,
  txn_type         TEXT        NOT NULL CHECK (txn_type IN ('Repayment', 'TopUp', 'Closure')),
  amount           NUMERIC     NOT NULL CHECK (amount >= 0),
  txn_date         DATE        NOT NULL,
  principal_before NUMERIC     NOT NULL,
  principal_after  NUMERIC     NOT NULL,
  remarks          TEXT        NOT NULL DEFAULT '',
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_principal_txn_loan
  ON public.principal_transactions (loan_id, created_at);

ALTER TABLE public.principal_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_principal_txns" ON public.principal_transactions;
CREATE POLICY "super_admin_all_principal_txns" ON public.principal_transactions
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Every party of the loan can read its ledger. No INSERT/UPDATE policy for
-- non-admins: writes go through the functions below.
DROP POLICY IF EXISTS "party_select_principal_txns" ON public.principal_transactions;
CREATE POLICY "party_select_principal_txns" ON public.principal_transactions
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR (
          public.my_phone() != '' AND (
            public.norm_phone(lender_phone)      = public.my_phone()
            OR public.norm_phone(borrower_phone) = public.my_phone()
            OR (loan_type = 'Through Mediator'
                AND public.norm_phone(mediator_phone) = public.my_phone())
          )
        )
      )
    )
  );


-- ── 2. can_manage_loan() ─────────────────────────────────────
--    Super admin, the loan's creator, or its lender (matched by phone).

CREATE OR REPLACE FUNCTION public.can_manage_loan(p_loan_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.loan_id = p_loan_id
        AND l.deleted_at IS NULL
        AND (
          l.creator_id = auth.uid()
          OR (public.my_phone() != ''
              AND public.norm_phone(l.lender_phone) = public.my_phone())
        )
    )
  );
$$;

ALTER FUNCTION public.can_manage_loan(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_loan(TEXT) TO authenticated;


-- ── 3. record_principal_txn() ────────────────────────────────
--    p_loan     — the loan's NEW amounts, computed by the app:
--                 principal_amount, monthly_interest_amount,
--                 mediator_monthly_share, net_monthly_receipt
--                 (required for Repayment / TopUp, ignored for Closure)
--    p_payments — pending payments to re-price, computed by the app:
--                 [{ id, interest_amount, mediator_share,
--                    net_amount_expected, pending_amount }]
--    Everything happens in one transaction. The function recomputes the new
--    principal itself and refuses a mismatching (stale) p_loan.

CREATE OR REPLACE FUNCTION public.record_principal_txn(
  p_loan_id  TEXT,
  p_type     TEXT,
  p_amount   NUMERIC,
  p_date     DATE,
  p_remarks  TEXT  DEFAULT '',
  p_loan     JSONB DEFAULT NULL,
  p_payments JSONB DEFAULT '[]'::JSONB
)
RETURNS public.principal_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan   public.loans%ROWTYPE;
  v_before NUMERIC;
  v_after  NUMERIC;
  v_txn    public.principal_transactions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_loan
    FROM public.loans
   WHERE loan_id = p_loan_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF NOT public.can_manage_loan(p_loan_id) THEN
    RAISE EXCEPTION 'Only the lender or the loan creator can record principal changes';
  END IF;

  IF p_type NOT IN ('Repayment', 'TopUp', 'Closure') THEN
    RAISE EXCEPTION 'Unknown principal transaction type: %', p_type;
  END IF;

  IF p_amount IS NULL OR p_amount < 0 OR (p_type <> 'Closure' AND p_amount = 0) THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Date is required';
  END IF;

  v_before := v_loan.principal_amount;

  IF p_type = 'Repayment' THEN
    IF v_loan.loan_status <> 'Active' THEN
      RAISE EXCEPTION 'Loan is not active';
    END IF;
    IF p_amount >= v_before THEN
      RAISE EXCEPTION 'Repayment must be less than the outstanding principal — close the loan to settle it in full';
    END IF;
    v_after := v_before - p_amount;

  ELSIF p_type = 'TopUp' THEN
    IF v_loan.loan_status <> 'Active' THEN
      RAISE EXCEPTION 'Loan is not active';
    END IF;
    v_after := v_before + p_amount;

  ELSE -- Closure: records what came back when the loan was closed
    IF p_amount > v_before THEN
      RAISE EXCEPTION 'Amount received cannot be more than the outstanding principal';
    END IF;
    v_after := v_before - p_amount;
  END IF;

  IF p_type IN ('Repayment', 'TopUp') THEN
    IF p_loan IS NULL OR (p_loan->>'principal_amount')::NUMERIC IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'The loan changed since this screen was opened — reload and try again';
    END IF;

    -- A principal movement is not a change of terms: keep party confirmations.
    PERFORM set_config('app.skip_confirmation_reset', '1', TRUE);

    UPDATE public.loans SET
      principal_amount        = v_after,
      monthly_interest_amount = (p_loan->>'monthly_interest_amount')::NUMERIC,
      mediator_monthly_share  = (p_loan->>'mediator_monthly_share')::NUMERIC,
      net_monthly_receipt     = (p_loan->>'net_monthly_receipt')::NUMERIC,
      updated_at              = now()
    WHERE loan_id = p_loan_id;

    PERFORM set_config('app.skip_confirmation_reset', '', TRUE);

    -- Re-price only untouched pending payments of THIS loan.
    UPDATE public.payments p SET
      interest_amount     = x.interest_amount,
      mediator_share      = x.mediator_share,
      net_amount_expected = x.net_amount_expected,
      pending_amount      = x.pending_amount,
      updated_at          = now()
    FROM jsonb_to_recordset(COALESCE(p_payments, '[]'::JSONB)) AS x(
      id                  TEXT,
      interest_amount     NUMERIC,
      mediator_share      NUMERIC,
      net_amount_expected NUMERIC,
      pending_amount      NUMERIC
    )
    WHERE p.id = x.id
      AND p.loan_id = p_loan_id
      AND p.payment_status = 'Pending'
      AND p.amount_received = 0
      AND p.deleted_at IS NULL;
  END IF;

  INSERT INTO public.principal_transactions
    (loan_id, txn_type, amount, txn_date, principal_before, principal_after, remarks, created_by)
  VALUES
    (p_loan_id, p_type, p_amount, p_date, v_before, v_after, COALESCE(p_remarks, ''), auth.uid())
  RETURNING * INTO v_txn;

  RETURN v_txn;
END;
$$;

ALTER FUNCTION public.record_principal_txn(TEXT, TEXT, NUMERIC, DATE, TEXT, JSONB, JSONB) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.record_principal_txn(TEXT, TEXT, NUMERIC, DATE, TEXT, JSONB, JSONB) TO authenticated;


-- ── 4. undo_principal_txn() ──────────────────────────────────
--    Only the most recent entry of a loan can be undone. For a Repayment or
--    TopUp the loan goes back to principal_before; p_loan / p_payments carry
--    the restored amounts (same shape as above). A Closure entry is simply
--    removed.

CREATE OR REPLACE FUNCTION public.undo_principal_txn(
  p_txn_id   UUID,
  p_loan     JSONB DEFAULT NULL,
  p_payments JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn  public.principal_transactions%ROWTYPE;
  v_loan public.loans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_txn
    FROM public.principal_transactions
   WHERE id = p_txn_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found';
  END IF;

  SELECT * INTO v_loan
    FROM public.loans
   WHERE loan_id = v_txn.loan_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  IF NOT public.can_manage_loan(v_txn.loan_id) THEN
    RAISE EXCEPTION 'Only the lender or the loan creator can undo principal changes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.principal_transactions t
     WHERE t.loan_id = v_txn.loan_id
       AND t.deleted_at IS NULL
       AND t.id <> v_txn.id
       AND t.created_at >= v_txn.created_at
  ) THEN
    RAISE EXCEPTION 'Only the most recent entry can be undone';
  END IF;

  IF v_txn.txn_type IN ('Repayment', 'TopUp') THEN
    IF v_loan.principal_amount IS DISTINCT FROM v_txn.principal_after THEN
      RAISE EXCEPTION 'The principal was edited after this entry — it can no longer be undone';
    END IF;
    IF p_loan IS NULL OR (p_loan->>'principal_amount')::NUMERIC IS DISTINCT FROM v_txn.principal_before THEN
      RAISE EXCEPTION 'The loan changed since this screen was opened — reload and try again';
    END IF;

    PERFORM set_config('app.skip_confirmation_reset', '1', TRUE);

    UPDATE public.loans SET
      principal_amount        = v_txn.principal_before,
      monthly_interest_amount = (p_loan->>'monthly_interest_amount')::NUMERIC,
      mediator_monthly_share  = (p_loan->>'mediator_monthly_share')::NUMERIC,
      net_monthly_receipt     = (p_loan->>'net_monthly_receipt')::NUMERIC,
      updated_at              = now()
    WHERE loan_id = v_txn.loan_id;

    PERFORM set_config('app.skip_confirmation_reset', '', TRUE);

    UPDATE public.payments p SET
      interest_amount     = x.interest_amount,
      mediator_share      = x.mediator_share,
      net_amount_expected = x.net_amount_expected,
      pending_amount      = x.pending_amount,
      updated_at          = now()
    FROM jsonb_to_recordset(COALESCE(p_payments, '[]'::JSONB)) AS x(
      id                  TEXT,
      interest_amount     NUMERIC,
      mediator_share      NUMERIC,
      net_amount_expected NUMERIC,
      pending_amount      NUMERIC
    )
    WHERE p.id = x.id
      AND p.loan_id = v_txn.loan_id
      AND p.payment_status = 'Pending'
      AND p.amount_received = 0
      AND p.deleted_at IS NULL;
  END IF;

  UPDATE public.principal_transactions
     SET deleted_at = now()
   WHERE id = v_txn.id;
END;
$$;

ALTER FUNCTION public.undo_principal_txn(UUID, JSONB, JSONB) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.undo_principal_txn(UUID, JSONB, JSONB) TO authenticated;


-- ── 5. reset_confirmations_on_edit() ─────────────────────────
--    Same as v2_06, plus: skip when the change comes from the principal
--    functions above (they set a transaction-local flag).

CREATE OR REPLACE FUNCTION public.reset_confirmations_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Principal repayment / top-up — not a change of terms
  IF current_setting('app.skip_confirmation_reset', TRUE) = '1' THEN
    RETURN NEW;
  END IF;

  -- Fully confirmed loans cannot be re-opened by an edit
  IF OLD.confirmation_status = 'Confirmed' THEN
    RETURN NEW;
  END IF;

  -- Reset all non-creator rows to Pending.
  -- IS DISTINCT FROM correctly handles NULL user_id
  -- (NULL != creator_id evaluates to NULL/false without it).
  UPDATE public.loan_party_confirmations
  SET
    status       = 'Pending',
    responded_at = NULL,
    note         = '',
    updated_at   = now()
  WHERE loan_id  = NEW.loan_id
    AND user_id IS DISTINCT FROM NEW.creator_id;

  RETURN NEW;
END;
$$;


-- ── 6. get_deleted_payment_keys() ────────────────────────────
--    (loan_id, month_year) of soft-deleted payments on loans the caller is a
--    party to. RLS hides deleted rows from everyone except the super admin,
--    so without this the app cannot know a month was deliberately deleted
--    and would generate it again.

CREATE OR REPLACE FUNCTION public.get_deleted_payment_keys()
RETURNS TABLE (loan_id TEXT, month_year TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.loan_id, p.month_year
    FROM public.payments p
    JOIN public.loans l ON l.loan_id = p.loan_id
   WHERE p.deleted_at IS NOT NULL
     AND l.deleted_at IS NULL
     AND auth.uid() IS NOT NULL
     AND (
       public.is_super_admin()
       OR l.creator_id = auth.uid()
       OR (
         public.my_phone() != '' AND (
           public.norm_phone(l.lender_phone)      = public.my_phone()
           OR public.norm_phone(l.borrower_phone) = public.my_phone()
           OR (l.loan_type = 'Through Mediator'
               AND public.norm_phone(l.mediator_phone) = public.my_phone())
         )
       )
     );
$$;

ALTER FUNCTION public.get_deleted_payment_keys() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_deleted_payment_keys() TO authenticated;
