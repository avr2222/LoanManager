-- ============================================================
-- Soft Delete + Audit Log
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ── 1. Add soft-delete columns to loans & payments ───────────
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  TEXT        DEFAULT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  TEXT        DEFAULT NULL;

-- ── 2. Create audit_log table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,                        -- 'loans' | 'payments'
  record_id    TEXT        NOT NULL,                        -- loan_id or payment id
  action       TEXT        NOT NULL,                        -- 'created' | 'updated' | 'deleted' | 'restored'
  performed_by TEXT,                                        -- phone or email of actor
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_data     JSONB,                                       -- snapshot before change
  new_data     JSONB                                        -- snapshot after change
);

-- ── 3. RLS on audit_log ───────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admin (no phone → user_phone() is NULL) can read all logs
-- Phone users can read only their own log entries
DROP POLICY IF EXISTS "read_audit_log" ON audit_log;
CREATE POLICY "read_audit_log" ON audit_log
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NULL              -- admin sees all
    OR performed_by = public.user_phone()    -- phone users see own
  );

-- No direct inserts from clients — the trigger handles it
DROP POLICY IF EXISTS "no_direct_insert_audit_log" ON audit_log;

-- ── 4. Trigger function ───────────────────────────────────────
--    BEFORE INSERT OR UPDATE on loans / payments:
--    • Sets deleted_by automatically when deleted_at is set
--    • Inserts a row into audit_log for every create / update / delete / restore
CREATE OR REPLACE FUNCTION public.handle_audit_and_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action       TEXT;
  v_record_id    TEXT;
  v_performed_by TEXT;
BEGIN
  -- Resolve the actor: phone user or admin (email)
  v_performed_by := COALESCE(
    public.user_phone(),
    (SELECT email FROM auth.users WHERE id = auth.uid())
  );

  -- Record ID differs between tables
  IF TG_TABLE_NAME = 'loans' THEN
    v_record_id := NEW.loan_id;
  ELSE
    v_record_id := NEW.id::TEXT;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- Soft delete — stamp who did it
      v_action       := 'deleted';
      NEW.deleted_by := v_performed_by;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      -- Restore
      v_action       := 'restored';
      NEW.deleted_by := NULL;
    ELSE
      v_action := 'updated';
    END IF;
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, performed_by, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_action,
    v_performed_by,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

-- ── 5. Attach trigger to loans ────────────────────────────────
DROP TRIGGER IF EXISTS loans_audit ON loans;
CREATE TRIGGER loans_audit
  BEFORE INSERT OR UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_and_soft_delete();

-- ── 6. Attach trigger to payments ────────────────────────────
DROP TRIGGER IF EXISTS payments_audit ON payments;
CREATE TRIGGER payments_audit
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_and_soft_delete();

-- ── 7. Index for fast deleted-record queries ──────────────────
CREATE INDEX IF NOT EXISTS idx_loans_deleted_at    ON loans    (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_record    ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor     ON audit_log (performed_by, performed_at DESC);
