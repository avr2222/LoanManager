-- ============================================================
-- V2 Migration 12 — Ensure non-admin loan INSERT/UPDATE policies
-- Root cause: any_insert_loans policy missing → phone users
-- (borrowers/mediators) get 42501 when trying to add a loan.
-- Safe to re-run.
-- ============================================================

-- ── INSERT: any authenticated user may create a loan ─────────────────────────
--    The BEFORE INSERT trigger (v2_11) always sets creator_id = auth.uid()
--    so this WITH CHECK will always pass for any logged-in user.
DROP POLICY IF EXISTS "any_insert_loans"     ON public.loans;
DROP POLICY IF EXISTS "phone_insert_own_loans" ON public.loans;

CREATE POLICY "any_insert_loans" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());


-- ── UPDATE: creator or super-admin may update a loan ─────────────────────────
DROP POLICY IF EXISTS "creator_update_loans" ON public.loans;

CREATE POLICY "creator_update_loans" ON public.loans
  FOR UPDATE TO authenticated
  USING    (creator_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (creator_id = auth.uid());


-- ── Verify: list all active policies on loans ────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  tablename = 'loans'
ORDER  BY policyname;
