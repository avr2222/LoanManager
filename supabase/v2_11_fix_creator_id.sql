-- ============================================================
-- V2 Migration 11 — Fix creator_id on loans
-- Combines:
--   1. Trigger: auto-set creator_id = auth.uid() on INSERT
--   2. Backfill: set existing NULL rows to the super-admin user
-- Safe to re-run.
-- ============================================================

-- ── 1. Trigger: always set creator_id on INSERT if not provided ───────────────
CREATE OR REPLACE FUNCTION public.set_loan_creator_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.creator_id IS NULL THEN
    NEW.creator_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_loan_creator ON public.loans;
CREATE TRIGGER trg_set_loan_creator
  BEFORE INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_loan_creator_id();


-- ── 2. Backfill existing NULL rows ────────────────────────────────────────────
UPDATE public.loans
SET creator_id = (
  SELECT id FROM public.profiles
  WHERE is_super_admin = TRUE
  LIMIT 1
)
WHERE creator_id IS NULL;
