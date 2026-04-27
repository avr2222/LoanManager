-- ============================================================
-- V2 Migration 02 — Loans & Payments New Columns
-- Safe to re-run. Run AFTER v2_01_profiles.sql.
-- ============================================================

-- ── 1. Loans — new columns ────────────────────────────────────

ALTER TABLE public.loans
  -- Who created this loan record (lender, borrower, or mediator)
  ADD COLUMN IF NOT EXISTS creator_id          UUID        REFERENCES auth.users(id),
  -- Multi-party confirmation state
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT        NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS confirmed_at        TIMESTAMPTZ DEFAULT NULL,
  -- Principal repayment tracking
  ADD COLUMN IF NOT EXISTS principal_paid      NUMERIC     NOT NULL DEFAULT 0,
  -- Loan closure
  ADD COLUMN IF NOT EXISTS closed_at           TIMESTAMPTZ DEFAULT NULL;

-- ── 2. Backfill creator_id from owner_id ──────────────────────
--    owner_id already exists from add_owner_id.sql migration.
--    creator_id is the same concept in the new model.
UPDATE public.loans
SET creator_id = owner_id
WHERE creator_id IS NULL
  AND owner_id IS NOT NULL;

-- ── 3. Set default for new loans ─────────────────────────────
ALTER TABLE public.loans
  ALTER COLUMN creator_id SET DEFAULT auth.uid();

-- ── 3b. CHECK constraints on text-enum columns ───────────────
ALTER TABLE public.loans
  ADD CONSTRAINT IF NOT EXISTS chk_loan_confirmation_status
    CHECK (confirmation_status IN ('Pending', 'Confirmed', 'Disputed'));

-- ── 4. Indexes for new columns ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loans_creator_id
  ON public.loans(creator_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_loans_confirmation
  ON public.loans(confirmation_status)
  WHERE deleted_at IS NULL;

-- ── 5. Payments — new columns ─────────────────────────────────

ALTER TABLE public.payments
  -- Who recorded this payment (usually the lender)
  ADD COLUMN IF NOT EXISTS recorded_by   UUID    REFERENCES auth.users(id),
  -- Borrower's acknowledgement
  ADD COLUMN IF NOT EXISTS confirmed_by  UUID    REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ DEFAULT NULL,
  -- Distinguish interest payments vs principal repayments
  ADD COLUMN IF NOT EXISTS is_principal  BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 6. Indexes for payments ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by
  ON public.payments(recorded_by)
  WHERE deleted_at IS NULL;
