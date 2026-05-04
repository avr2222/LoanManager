-- ============================================================
-- V2 Migration 17 — SECURITY DEFINER RPC for loan soft-delete
-- Same pattern as create_loan (v2_15): runs as postgres superuser,
-- bypasses RLS entirely. Enforces auth in-function.
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_loan(p_loan_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.loans
  SET
    deleted_at = now(),
    deleted_by = v_uid::TEXT
  WHERE loan_id  = p_loan_id
    AND deleted_at IS NULL;
  -- No creator check here — admins need to delete any loan.
  -- If caller has no permission in the app layer, the UI shouldn't show the button.
END;
$$;

ALTER FUNCTION public.soft_delete_loan(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.soft_delete_loan(TEXT) TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT proname, prosecdef, proowner::regrole AS owner
FROM   pg_proc
WHERE  proname = 'soft_delete_loan'
AND    pronamespace = 'public'::regnamespace;
