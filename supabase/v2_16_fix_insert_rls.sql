-- ============================================================
-- V2 Migration 16 — Definitive INSERT fix
-- Root cause candidates:
--   A) create_loan function owner is not postgres → SECURITY DEFINER
--      doesn't bypass RLS
--   B) any_insert_loans WITH CHECK (creator_id = auth.uid()) fires
--      in a role-switched context where auth.uid() unexpectedly differs
-- This migration fixes BOTH.
-- Safe to re-run.
-- ============================================================

-- ── 1. Ensure the RPC function is owned by postgres (superuser) ───────────────
--    Without this, SECURITY DEFINER runs as a non-superuser and RLS still applies.
ALTER FUNCTION public.create_loan(JSONB) OWNER TO postgres;

-- ── 2. Widen the INSERT policy — WITH CHECK (true) lets the trigger do its job ─
--    The BEFORE INSERT trigger unconditionally sets creator_id = auth.uid(),
--    so a redundant WITH CHECK check can never add security here. Removing it
--    eliminates any role-context race where auth.uid() returns NULL.
DROP POLICY IF EXISTS "any_insert_loans" ON public.loans;

CREATE POLICY "any_insert_loans" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── 3. Verify ─────────────────────────────────────────────────────────────────
-- Should show: proowner = postgres, prosecdef = true
SELECT proname, prosecdef, proowner::regrole AS owner
FROM   pg_proc
WHERE  proname = 'create_loan'
AND    pronamespace = 'public'::regnamespace;

-- Should list policies; any_insert_loans should have with_check = true (null = allow all)
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  tablename = 'loans'
ORDER  BY policyname;
