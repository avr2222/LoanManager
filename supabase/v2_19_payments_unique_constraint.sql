-- ============================================================
-- V2 Migration 19 — Ensure partial unique index for payments dedup
-- Replaces an earlier version that incorrectly hard-deleted
-- soft-deleted rows. All data is preserved.
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================

-- Ensure partial unique index exists (same as v2_10, but idempotent).
-- This enforces uniqueness only among active (non-deleted) payments.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_loan_month
  ON public.payments(loan_id, month_year)
  WHERE deleted_at IS NULL;
