-- ============================================================
-- V2 Migration 05 — RLS Policies
-- Safe to re-run. Run AFTER v2_04_functions.sql.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PROFILES
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_select"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"           ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Allow insert for anon"     ON public.profiles;

-- Any authenticated user can read any profile
-- (needed to resolve party names/phones for loan display)
CREATE POLICY "profiles_select_any" ON public.profiles
  FOR SELECT TO authenticated
  USING (TRUE);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING    (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Inserts handled by handle_new_user trigger only
CREATE POLICY "profiles_insert_trigger" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Protect sensitive columns: revoke direct read of security fields
-- from the authenticated role. is_super_admin() SECURITY DEFINER
-- function still works because it runs as the owner, not as authenticated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'security_question'
  ) THEN
    REVOKE SELECT (security_question) ON public.profiles FROM authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'security_answer'
  ) THEN
    REVOKE SELECT (security_answer) ON public.profiles FROM authenticated;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- LOANS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_all_loans"            ON public.loans;
DROP POLICY IF EXISTS "phone_select_own_loans"     ON public.loans;
DROP POLICY IF EXISTS "phone_insert_own_loans"     ON public.loans;
DROP POLICY IF EXISTS "block_disabled_users_loans" ON public.loans;

-- Super admin sees and manages ALL loans
CREATE POLICY "super_admin_all_loans" ON public.loans
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Any party sees loans they created or where their phone appears
CREATE POLICY "party_select_loans" ON public.loans
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      creator_id = auth.uid()
      OR public.norm_phone(lender_phone)   = public.my_phone()
      OR public.norm_phone(borrower_phone) = public.my_phone()
      OR (loan_type = 'Through Mediator'
          AND public.norm_phone(mediator_phone) = public.my_phone())
    )
  );

-- Any authenticated user can create a loan
CREATE POLICY "any_insert_loans" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- Only creator can update their own loans
CREATE POLICY "creator_update_loans" ON public.loans
  FOR UPDATE TO authenticated
  USING    (creator_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (creator_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- PAYMENTS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_all_payments"            ON public.payments;
DROP POLICY IF EXISTS "phone_select_own_payments"     ON public.payments;
DROP POLICY IF EXISTS "block_disabled_users_payments" ON public.payments;

-- Super admin sees and manages ALL payments
CREATE POLICY "super_admin_all_payments" ON public.payments
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Any party of the loan sees its payments
CREATE POLICY "party_select_payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR public.norm_phone(lender_phone)   = public.my_phone()
        OR public.norm_phone(borrower_phone) = public.my_phone()
        OR (loan_type = 'Through Mediator'
            AND public.norm_phone(mediator_phone) = public.my_phone())
      )
    )
  );

-- Only lender or creator can record / update payments
CREATE POLICY "lender_insert_payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR public.norm_phone(lender_phone) = public.my_phone()
      )
    )
  );

CREATE POLICY "lender_update_payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL AND
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR public.norm_phone(lender_phone) = public.my_phone()
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- LOAN PARTY CONFIRMATIONS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "party_select_confirmations"   ON public.loan_party_confirmations;
DROP POLICY IF EXISTS "own_update_confirmation"      ON public.loan_party_confirmations;
DROP POLICY IF EXISTS "no_direct_insert_confirmations" ON public.loan_party_confirmations;

-- Any party of the loan sees all confirmation rows for that loan
CREATE POLICY "party_select_confirmations" ON public.loan_party_confirmations
  FOR SELECT TO authenticated
  USING (
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR public.norm_phone(lender_phone)   = public.my_phone()
        OR public.norm_phone(borrower_phone) = public.my_phone()
        OR (loan_type = 'Through Mediator'
            AND public.norm_phone(mediator_phone) = public.my_phone())
      )
    )
  );

-- A user can update their own confirmation row, OR the loan creator
-- can update any unregistered party's row (offline confirmation).
-- Guard: never match on empty phone to prevent wildcard collision.
CREATE POLICY "own_update_confirmation" ON public.loan_party_confirmations
  FOR UPDATE TO authenticated
  USING (
    -- Own row: matched by user_id or by phone (non-empty)
    (user_id = auth.uid())
    OR (party_phone != '' AND party_phone = public.my_phone())
    -- Creator offline-confirms an unregistered party
    OR (
      user_id IS NULL
      AND loan_id IN (
        SELECT loan_id FROM public.loans
        WHERE creator_id = auth.uid() AND deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR (party_phone != '' AND party_phone = public.my_phone())
    OR (
      user_id IS NULL
      AND loan_id IN (
        SELECT loan_id FROM public.loans
        WHERE creator_id = auth.uid() AND deleted_at IS NULL
      )
    )
  );

-- Inserts are handled by the create_loan_confirmations trigger (SECURITY DEFINER)
-- No direct client inserts allowed
CREATE POLICY "no_direct_insert_confirmations" ON public.loan_party_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (FALSE);


-- ════════════════════════════════════════════════════════════
-- INVITATIONS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "super_admin_invitations"    ON public.invitations;
DROP POLICY IF EXISTS "creator_select_invitations" ON public.invitations;
DROP POLICY IF EXISTS "create_invitation"          ON public.invitations;
DROP POLICY IF EXISTS "creator_delete_invitation"  ON public.invitations;

-- Super admin sees all invitations
CREATE POLICY "super_admin_invitations" ON public.invitations
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Users see invitations they created
CREATE POLICY "creator_select_invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Users can invite phones that appear in their own loans.
-- phone != '' guard prevents inviting with a blank token that
-- would match any loan with an empty phone field.
CREATE POLICY "create_invitation" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.is_super_admin()
      OR (
        phone != ''
        AND public.norm_phone(phone) IN (
          SELECT public.norm_phone(borrower_phone)
          FROM public.loans
          WHERE creator_id = auth.uid()
            AND deleted_at IS NULL
            AND borrower_phone IS NOT NULL
            AND borrower_phone != ''

          UNION

          SELECT public.norm_phone(mediator_phone)
          FROM public.loans
          WHERE creator_id = auth.uid()
            AND deleted_at IS NULL
            AND loan_type = 'Through Mediator'
            AND mediator_phone IS NOT NULL
            AND mediator_phone != ''

          UNION

          SELECT public.norm_phone(lender_phone)
          FROM public.loans
          WHERE creator_id = auth.uid()
            AND deleted_at IS NULL
            AND lender_phone IS NOT NULL
            AND lender_phone != ''
        )
      )
    )
  );

-- Users can revoke (delete) their own unused invitations
CREATE POLICY "creator_delete_invitation" ON public.invitations
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND used_at IS NULL);


-- ════════════════════════════════════════════════════════════
-- CONTACTS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "owner_all_contacts" ON public.contacts;

CREATE POLICY "owner_all_contacts" ON public.contacts
  FOR ALL TO authenticated
  USING    (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- AUDIT LOG
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "read_audit_log"             ON public.audit_log;
DROP POLICY IF EXISTS "no_direct_insert_audit_log" ON public.audit_log;

-- Users see their own audit entries; super admin sees all.
-- Uses my_phone() (profiles-based) instead of the legacy user_phone() (JWT-based)
-- so new email-registered users are correctly matched.
CREATE POLICY "read_audit_log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR performed_by = auth.uid()::TEXT
    OR (public.my_phone() != '' AND performed_by = public.my_phone())
  );

-- No direct inserts — log_audit() function handles it (SECURITY DEFINER)
CREATE POLICY "no_direct_insert_audit_log" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (FALSE);
