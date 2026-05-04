-- ============================================================
-- V2 Migration 11 — Fix creator_id on loans
-- Combines:
--   1. Trigger: force creator_id = auth.uid() on every INSERT
--   2. Backfill: set existing NULL rows to the super-admin user
-- Safe to re-run.
-- ============================================================

-- ── 1. Trigger: always force creator_id = auth.uid() on INSERT ────────────────
--    Unconditional — even if the app sends a value, the DB
--    always stamps the real authenticated user.  This means
--    WITH CHECK (creator_id = auth.uid()) can never fail.
CREATE OR REPLACE FUNCTION public.set_loan_creator_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.creator_id := auth.uid();
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


-- ── 3. Verify ─────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                    AS total_loans,
  COUNT(*) FILTER (WHERE creator_id IS NULL)  AS still_null
FROM public.loans;
