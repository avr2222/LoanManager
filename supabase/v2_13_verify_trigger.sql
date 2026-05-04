-- ============================================================
-- V2 Migration 13 — Verify + re-deploy unconditional creator_id trigger
-- Run this if non-admin users still get 42501 on INSERT.
-- Safe to re-run.
-- ============================================================

-- ── 1. Re-create trigger as truly unconditional ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_loan_creator_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.creator_id := auth.uid();   -- no IF check — always stamp the real user
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_loan_creator ON public.loans;
CREATE TRIGGER trg_set_loan_creator
  BEFORE INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_loan_creator_id();

-- ── 2. Confirm trigger exists ─────────────────────────────────────────────────
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM   information_schema.triggers
WHERE  event_object_table = 'loans';

-- ── 3. Confirm policies ───────────────────────────────────────────────────────
SELECT policyname, cmd, with_check
FROM   pg_policies
WHERE  tablename = 'loans'
ORDER  BY policyname;
