-- ============================================================
-- V2 Migration 10 — Deduplicate payments + unique constraint
-- Root cause: generateMonthlyPayment creates a new UUID each
-- app load. bulkUpsert conflicts on id (never matches), so
-- a new row is inserted every time.
-- Fix: remove duplicate rows, then add UNIQUE(loan_id, month_year)
-- so future upserts on this key are idempotent.
-- Safe to re-run.
-- ============================================================

-- Step 1: soft-delete duplicate rows, keeping earliest created_at per (loan_id, month_year)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY loan_id, month_year
      ORDER BY created_at ASC
    ) AS rn
  FROM public.payments
  WHERE deleted_at IS NULL
)
UPDATE public.payments
SET deleted_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: add unique constraint (only on non-deleted rows via partial index)
DROP INDEX IF EXISTS uq_payment_loan_month;
CREATE UNIQUE INDEX uq_payment_loan_month
  ON public.payments (loan_id, month_year)
  WHERE deleted_at IS NULL;
