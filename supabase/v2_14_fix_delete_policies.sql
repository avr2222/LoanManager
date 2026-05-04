-- ============================================================
-- V2 Migration 14 — Fix DELETE + replace broken admin_all_loans
-- Root cause: admin_all_loans uses owner_id (old column name),
-- not creator_id. This breaks UPDATE/DELETE for admin and
-- leaves no DELETE policy at all for non-admins.
-- Safe to re-run.
-- ============================================================

-- ── 1. Drop the old broken policy that references owner_id ───────────────────
DROP POLICY IF EXISTS "admin_all_loans"        ON public.loans;
DROP POLICY IF EXISTS "super_admin_all_loans"  ON public.loans;

-- ── 2. Super-admin: full access to every loan ─────────────────────────────────
--    No creator_id check — super admin can see/edit/delete any loan.
CREATE POLICY "super_admin_all_loans" ON public.loans
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── 3. Creator: soft-delete their own loans (UPDATE sets deleted_at) ──────────
--    already exists from v2_12, recreate to be safe
DROP POLICY IF EXISTS "creator_update_loans" ON public.loans;

CREATE POLICY "creator_update_loans" ON public.loans
  FOR UPDATE TO authenticated
  USING    (creator_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (creator_id = auth.uid());

-- ── 4. Verify final policy list ───────────────────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  tablename = 'loans'
ORDER  BY policyname;
