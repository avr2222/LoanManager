-- ============================================================
-- V2 Migration 04 — Helper Functions
-- Safe to re-run. Run AFTER v2_03_new_tables.sql.
-- ============================================================

-- ── 0. norm_phone() ───────────────────────────────────────────
--    Defined first because all subsequent functions depend on it.
--    Strips non-digits and returns the last 10 digits.
--    Returns '' for NULL or empty input (never errors).

CREATE OR REPLACE FUNCTION public.norm_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g') = ''
    THEN ''
    ELSE RIGHT(REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g'), 10)
  END;
$$;


-- ── 1. my_phone() ─────────────────────────────────────────────
--    Returns the current user's phone from the profiles table.
--    Works for ALL user types (new registration model).
--    Replaces the old user_phone() JWT-based approach for new code.

CREATE OR REPLACE FUNCTION public.my_phone()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(phone, '') FROM public.profiles WHERE id = auth.uid();
$$;


-- ── 2. is_super_admin() ───────────────────────────────────────
--    Returns TRUE if the current user has super admin privileges.
--    Set is_super_admin=TRUE manually in Supabase dashboard for
--    platform owner(s). Never expose this via UI to prevent escalation.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;


-- ── 3. is_admin() — backward-compat alias ────────────────────
--    Old is_admin() checked for non-@user.local email.
--    New is_admin() delegates to is_super_admin flag.
--    Kept for backward compatibility with existing code.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_super_admin();
$$;


-- ── 4. Loan ID Sequence + get_next_loan_id() ─────────────────
--    Uses a PostgreSQL SEQUENCE for atomic, race-condition-free
--    ID generation. The DO block sets the sequence to the current
--    max so re-running never produces duplicate IDs.

CREATE SEQUENCE IF NOT EXISTS public.loan_id_seq;

DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(loan_id FROM 2) AS INT)),
    0
  )
  INTO v_max
  FROM public.loans
  WHERE loan_id ~ '^L[0-9]+$';

  -- setval with is_called=true means nextval() returns v_max+1
  IF v_max >= 1 THEN
    PERFORM setval('public.loan_id_seq', v_max, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_next_loan_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 'L' || LPAD(nextval('public.loan_id_seq')::TEXT, 3, '0');
$$;

-- Alias kept for any older callers
CREATE OR REPLACE FUNCTION public.get_next_loan_ref()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.get_next_loan_id();
$$;


-- ── 5. link_party_to_user() ───────────────────────────────────
--    Called after a user registers (or changes their phone).
--    Finds any loan_party_confirmations rows whose party_phone
--    matches the given phone but have no user_id yet, and links them.

CREATE OR REPLACE FUNCTION public.link_party_to_user(
  p_user_id UUID,
  p_phone   TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.loan_party_confirmations
  SET
    user_id    = p_user_id,
    updated_at = now()
  WHERE party_phone = public.norm_phone(p_phone)
    AND user_id IS NULL
    AND public.norm_phone(p_phone) != '';
$$;


-- ── 6. validate_invitation() ──────────────────────────────────
--    Called on the registration page to validate an invite token.
--    Returns the phone tied to the invite (if any) and whether
--    the invite is still valid. Callable without being logged in.

CREATE OR REPLACE FUNCTION public.validate_invitation(p_token TEXT)
RETURNS TABLE (
  id       UUID,
  phone    TEXT,
  is_valid BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    id,
    phone,
    (used_at IS NULL AND expires_at > now()) AS is_valid
  FROM public.invitations
  WHERE token = p_token;
$$;


-- ── 7. use_invitation() ───────────────────────────────────────
--    Marks an invitation as used after successful registration.
--    Returns TRUE if the invite was valid and successfully consumed.

CREATE OR REPLACE FUNCTION public.use_invitation(
  p_token   TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.invitations
  SET
    used_by = p_user_id,
    used_at = now()
  WHERE token    = p_token
    AND used_at  IS NULL
    AND expires_at > now();

  RETURN FOUND;
END;
$$;


-- ── 8. log_audit() ────────────────────────────────────────────
--    Convenience function for inserting lean audit records.
--    Probabilistic cleanup removed — pg_cron handles that instead.

CREATE OR REPLACE FUNCTION public.log_audit(
  p_table_name   TEXT,
  p_record_id    TEXT,
  p_action       TEXT,
  p_performed_by UUID,
  p_summary      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log (table_name, record_id, action, performed_by, summary)
  VALUES (p_table_name, p_record_id, p_action, p_performed_by::TEXT, p_summary);
END;
$$;
