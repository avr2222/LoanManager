-- ============================================================
-- V2 Migration 06 — Triggers & pg_cron
-- Safe to re-run. Run AFTER v2_05_rls.sql.
-- ============================================================

-- ── 1. handle_new_user() ─────────────────────────────────────
--    Updated for new registration model.
--    New users register with real email + phone in metadata.
--    Old @user.local and @mediator.local still supported during transition.
--    Also auto-links any existing loan_party_confirmations for their phone.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone     TEXT;
  v_full_name TEXT;
BEGIN
  v_phone     := public.norm_phone(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.profiles (id, full_name, phone, email, role)
  VALUES (
    NEW.id,
    v_full_name,
    v_phone,
    COALESCE(NEW.email, ''),
    CASE
      WHEN NEW.email LIKE '%@user.local'     THEN 'mediator'
      WHEN NEW.email LIKE '%@mediator.local' THEN 'mediator'
      ELSE 'user'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name  = CASE WHEN EXCLUDED.full_name  != '' THEN EXCLUDED.full_name  ELSE public.profiles.full_name  END,
    phone      = CASE WHEN EXCLUDED.phone      != '' THEN EXCLUDED.phone      ELSE public.profiles.phone      END,
    email      = CASE WHEN EXCLUDED.email      != '' THEN EXCLUDED.email      ELSE public.profiles.email      END,
    updated_at = now();

  -- Auto-link existing confirmation rows for this phone
  IF v_phone != '' THEN
    PERFORM public.link_party_to_user(NEW.id, v_phone);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. create_loan_confirmations() ───────────────────────────
--    Fires AFTER a loan is inserted.
--    Creates one loan_party_confirmations row per non-empty party.
--    Creator's own row is auto-confirmed.
--    Looks up user_id by phone if the party is already registered.

CREATE OR REPLACE FUNCTION public.create_loan_confirmations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lender_uid     UUID;
  v_borrower_uid   UUID;
  v_mediator_uid   UUID;
  v_lender_phone   TEXT;
  v_borrower_phone TEXT;
  v_mediator_phone TEXT;
BEGIN
  v_lender_phone   := public.norm_phone(NEW.lender_phone);
  v_borrower_phone := public.norm_phone(NEW.borrower_phone);
  v_mediator_phone := public.norm_phone(NEW.mediator_phone);

  -- Lookup registered user IDs for each party phone
  IF v_lender_phone != '' THEN
    SELECT id INTO v_lender_uid
      FROM public.profiles WHERE phone = v_lender_phone LIMIT 1;
  END IF;

  IF v_borrower_phone != '' THEN
    SELECT id INTO v_borrower_uid
      FROM public.profiles WHERE phone = v_borrower_phone LIMIT 1;
  END IF;

  IF v_mediator_phone != '' THEN
    SELECT id INTO v_mediator_uid
      FROM public.profiles WHERE phone = v_mediator_phone LIMIT 1;
  END IF;

  -- Lender confirmation row
  IF v_lender_phone != '' THEN
    INSERT INTO public.loan_party_confirmations
      (loan_id, user_id, party_role, party_name, party_phone, status, responded_at)
    VALUES (
      NEW.loan_id,
      v_lender_uid,
      'lender',
      COALESCE(NEW.lender_name, ''),
      v_lender_phone,
      CASE WHEN v_lender_uid = NEW.creator_id THEN 'Confirmed' ELSE 'Pending' END,
      CASE WHEN v_lender_uid = NEW.creator_id THEN now() ELSE NULL END
    )
    ON CONFLICT (loan_id, party_role) DO NOTHING;
  END IF;

  -- Borrower confirmation row
  IF v_borrower_phone != '' THEN
    INSERT INTO public.loan_party_confirmations
      (loan_id, user_id, party_role, party_name, party_phone, status, responded_at)
    VALUES (
      NEW.loan_id,
      v_borrower_uid,
      'borrower',
      COALESCE(NEW.borrower_name, ''),
      v_borrower_phone,
      CASE WHEN v_borrower_uid = NEW.creator_id THEN 'Confirmed' ELSE 'Pending' END,
      CASE WHEN v_borrower_uid = NEW.creator_id THEN now() ELSE NULL END
    )
    ON CONFLICT (loan_id, party_role) DO NOTHING;
  END IF;

  -- Mediator confirmation row (only for Through Mediator loans)
  IF NEW.loan_type = 'Through Mediator' AND v_mediator_phone != '' THEN
    INSERT INTO public.loan_party_confirmations
      (loan_id, user_id, party_role, party_name, party_phone, status, responded_at)
    VALUES (
      NEW.loan_id,
      v_mediator_uid,
      'mediator',
      COALESCE(NEW.mediator_name, ''),
      v_mediator_phone,
      CASE WHEN v_mediator_uid = NEW.creator_id THEN 'Confirmed' ELSE 'Pending' END,
      CASE WHEN v_mediator_uid = NEW.creator_id THEN now() ELSE NULL END
    )
    ON CONFLICT (loan_id, party_role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_create_confirmations ON public.loans;
CREATE TRIGGER loan_create_confirmations
  AFTER INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.create_loan_confirmations();


-- ── 3. update_loan_confirmation_status() ─────────────────────
--    Fires AFTER a confirmation row is inserted or updated.
--    Rolls up all party statuses into loans.confirmation_status.
--    'Confirmed' only when ALL parties confirmed.
--    'Disputed' as soon as ANY party disputes.

CREATE OR REPLACE FUNCTION public.update_loan_confirmation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_confirmed BOOLEAN;
  v_any_disputed  BOOLEAN;
BEGIN
  SELECT
    BOOL_AND(status = 'Confirmed'),
    BOOL_OR(status  = 'Disputed')
  INTO v_all_confirmed, v_any_disputed
  FROM public.loan_party_confirmations
  WHERE loan_id = NEW.loan_id;

  IF v_any_disputed THEN
    UPDATE public.loans
    SET confirmation_status = 'Disputed',
        confirmed_at        = NULL,
        updated_at          = now()
    WHERE loan_id = NEW.loan_id;

  ELSIF v_all_confirmed THEN
    UPDATE public.loans
    SET confirmation_status = 'Confirmed',
        confirmed_at        = now(),
        updated_at          = now()
    WHERE loan_id = NEW.loan_id;

  ELSE
    UPDATE public.loans
    SET confirmation_status = 'Pending',
        confirmed_at        = NULL,
        updated_at          = now()
    WHERE loan_id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS confirmation_status_rollup ON public.loan_party_confirmations;
CREATE TRIGGER confirmation_status_rollup
  AFTER INSERT OR UPDATE ON public.loan_party_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.update_loan_confirmation_status();


-- ── 4. reset_confirmations_on_edit() ─────────────────────────
--    Fires AFTER a loan is updated when material terms change.
--    Resets all non-creator confirmation rows back to Pending.
--    Uses IS DISTINCT FROM so NULL user_id rows are correctly included.

CREATE OR REPLACE FUNCTION public.reset_confirmations_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fully confirmed loans cannot be re-opened by an edit
  IF OLD.confirmation_status = 'Confirmed' THEN
    RETURN NEW;
  END IF;

  -- Reset all non-creator rows to Pending.
  -- IS DISTINCT FROM correctly handles NULL user_id
  -- (NULL != creator_id evaluates to NULL/false without it).
  UPDATE public.loan_party_confirmations
  SET
    status       = 'Pending',
    responded_at = NULL,
    note         = '',
    updated_at   = now()
  WHERE loan_id  = NEW.loan_id
    AND user_id IS DISTINCT FROM NEW.creator_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loan_reset_confirmations ON public.loans;
CREATE TRIGGER loan_reset_confirmations
  AFTER UPDATE ON public.loans
  FOR EACH ROW
  -- Only fire when real loan terms change, not when confirmation_status
  -- is updated by the rollup trigger (avoids infinite trigger loops)
  WHEN (
    OLD.principal_amount       IS DISTINCT FROM NEW.principal_amount OR
    OLD.annual_interest_rate   IS DISTINCT FROM NEW.annual_interest_rate OR
    OLD.date_given             IS DISTINCT FROM NEW.date_given OR
    OLD.expected_tenure_months IS DISTINCT FROM NEW.expected_tenure_months OR
    OLD.lender_phone           IS DISTINCT FROM NEW.lender_phone OR
    OLD.borrower_phone         IS DISTINCT FROM NEW.borrower_phone OR
    OLD.mediator_phone         IS DISTINCT FROM NEW.mediator_phone OR
    OLD.loan_type              IS DISTINCT FROM NEW.loan_type
  )
  EXECUTE FUNCTION public.reset_confirmations_on_edit();


-- ── 5. auto_build_contacts() ─────────────────────────────────
--    Fires AFTER a loan is inserted.
--    Auto-adds borrower, mediator, and lender as contacts of the creator.
--    NULL phone guards prevent errors when phone columns are not set.

CREATE OR REPLACE FUNCTION public.auto_build_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_phone TEXT;
  v_norm_phone    TEXT;
BEGIN
  SELECT COALESCE(phone, '') INTO v_creator_phone
  FROM public.profiles WHERE id = NEW.creator_id;

  -- Add lender as contact (skip if lender IS the creator or phone is empty/null)
  IF NEW.lender_phone IS NOT NULL AND NEW.lender_phone != '' THEN
    v_norm_phone := public.norm_phone(NEW.lender_phone);
    IF v_norm_phone != '' AND v_norm_phone != v_creator_phone THEN
      INSERT INTO public.contacts (owner_id, name, phone)
      VALUES (NEW.creator_id, COALESCE(NEW.lender_name, ''), v_norm_phone)
      ON CONFLICT (owner_id, phone)
      DO UPDATE SET name = EXCLUDED.name, updated_at = now();
    END IF;
  END IF;

  -- Add borrower as contact
  IF NEW.borrower_phone IS NOT NULL AND NEW.borrower_phone != '' THEN
    v_norm_phone := public.norm_phone(NEW.borrower_phone);
    IF v_norm_phone != '' AND v_norm_phone != v_creator_phone THEN
      INSERT INTO public.contacts (owner_id, name, phone)
      VALUES (NEW.creator_id, COALESCE(NEW.borrower_name, ''), v_norm_phone)
      ON CONFLICT (owner_id, phone)
      DO UPDATE SET name = EXCLUDED.name, updated_at = now();
    END IF;
  END IF;

  -- Add mediator as contact
  IF NEW.loan_type = 'Through Mediator'
     AND NEW.mediator_phone IS NOT NULL
     AND NEW.mediator_phone != '' THEN
    v_norm_phone := public.norm_phone(NEW.mediator_phone);
    IF v_norm_phone != '' AND v_norm_phone != v_creator_phone THEN
      INSERT INTO public.contacts (owner_id, name, phone)
      VALUES (NEW.creator_id, COALESCE(NEW.mediator_name, ''), v_norm_phone)
      ON CONFLICT (owner_id, phone)
      DO UPDATE SET name = EXCLUDED.name, updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loans_auto_contacts ON public.loans;
CREATE TRIGGER loans_auto_contacts
  AFTER INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.auto_build_contacts();


-- ── 6. Lean audit trigger ─────────────────────────────────────
--    Replaces the old handle_audit_and_soft_delete() trigger.
--    No JSONB — just a human-readable summary line.
--
--    Split into two triggers (INSERT and UPDATE) so the UPDATE
--    trigger can use a WHEN clause to skip confirmation-status-only
--    changes (which are high-frequency and generate audit noise).

CREATE OR REPLACE FUNCTION public.handle_audit_lean()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action       TEXT;
  v_record_id    TEXT;
  v_performed_by TEXT;
  v_summary      TEXT;
BEGIN
  v_performed_by := COALESCE(
    auth.uid()::TEXT,
    public.my_phone()
  );

  IF TG_TABLE_NAME = 'loans' THEN
    v_record_id := NEW.loan_id;
  ELSE
    v_record_id := NEW.id::TEXT;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    IF TG_TABLE_NAME = 'loans' THEN
      v_summary := format('Loan %s created — ₹%s at %s%% p.a.',
        NEW.loan_id, NEW.principal_amount, NEW.annual_interest_rate);
    ELSE
      v_summary := format('Payment ₹%s recorded for %s',
        NEW.amount_received, NEW.month_year);
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action      := 'deleted';
      NEW.deleted_by := v_performed_by;
      v_summary     := format('%s %s soft-deleted', TG_TABLE_NAME, v_record_id);

    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_action      := 'restored';
      NEW.deleted_by := NULL;
      v_summary     := format('%s %s restored', TG_TABLE_NAME, v_record_id);

    ELSE
      v_action := 'updated';
      IF TG_TABLE_NAME = 'loans' THEN
        v_summary := format('Loan %s updated', NEW.loan_id);
      ELSE
        v_summary := format('Payment for %s updated to ₹%s (%s)',
          NEW.month_year, NEW.amount_received, NEW.payment_status);
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, performed_by, summary)
  VALUES (TG_TABLE_NAME, v_record_id, v_action, v_performed_by, v_summary);

  RETURN NEW;
END;
$$;

-- DROP both old and new trigger names to ensure clean state
DROP TRIGGER IF EXISTS loans_audit        ON public.loans;
DROP TRIGGER IF EXISTS loans_audit_insert ON public.loans;
DROP TRIGGER IF EXISTS loans_audit_update ON public.loans;
DROP TRIGGER IF EXISTS payments_audit     ON public.payments;

-- INSERT: always audit new loans
CREATE TRIGGER loans_audit_insert
  BEFORE INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_lean();

-- UPDATE: only audit material term/status changes, not confirmation rollups.
-- This prevents ~3 spurious "Loan updated" entries per loan confirmation.
CREATE TRIGGER loans_audit_update
  BEFORE UPDATE ON public.loans
  FOR EACH ROW
  WHEN (
    OLD.principal_amount     IS DISTINCT FROM NEW.principal_amount OR
    OLD.annual_interest_rate IS DISTINCT FROM NEW.annual_interest_rate OR
    OLD.date_given           IS DISTINCT FROM NEW.date_given OR
    OLD.loan_status          IS DISTINCT FROM NEW.loan_status OR
    OLD.deleted_at           IS DISTINCT FROM NEW.deleted_at OR
    OLD.borrower_name        IS DISTINCT FROM NEW.borrower_name OR
    OLD.borrower_phone       IS DISTINCT FROM NEW.borrower_phone OR
    OLD.lender_name          IS DISTINCT FROM NEW.lender_name OR
    OLD.lender_phone         IS DISTINCT FROM NEW.lender_phone OR
    OLD.mediator_name        IS DISTINCT FROM NEW.mediator_name OR
    OLD.mediator_phone       IS DISTINCT FROM NEW.mediator_phone OR
    OLD.remarks              IS DISTINCT FROM NEW.remarks
  )
  EXECUTE FUNCTION public.handle_audit_lean();

CREATE TRIGGER payments_audit
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_lean();


-- ── 7. pg_cron — 90-day audit log cleanup ────────────────────
--    Runs daily at 2am. Deletes audit records older than 90 days.
--    Enable pg_cron first: Supabase Dashboard → Database → Extensions.
--    Unschedule before re-scheduling to prevent duplicate cron jobs
--    on re-runs of this migration.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('cleanup-old-audit-logs')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-audit-logs'
);

SELECT cron.schedule(
  'cleanup-old-audit-logs',
  '0 2 * * *',
  $$DELETE FROM public.audit_log WHERE performed_at < now() - INTERVAL '90 days';$$
);
