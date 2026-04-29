-- ============================================================
-- V2 Migration 08 — RLS Fix: guard empty-phone wildcard
-- Safe to re-run. Run AFTER v2_05_rls.sql.
--
-- Root cause: my_phone() returns '' when a user has no phone in
-- their profile. norm_phone('') also returns ''. So any user
-- without a phone matched every loan whose lender_phone or
-- borrower_phone was blank — revealing admin loans to strangers.
--
-- Fix: add my_phone() != '' guards before all phone comparisons
-- in SELECT, INSERT, and UPDATE policies.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- LOANS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "party_select_loans" ON public.loans;

CREATE POLICY "party_select_loans" ON public.loans
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      creator_id = auth.uid()
      OR (
        public.my_phone() != '' AND (
          public.norm_phone(lender_phone)   = public.my_phone()
          OR public.norm_phone(borrower_phone) = public.my_phone()
          OR (loan_type = 'Through Mediator'
              AND public.norm_phone(mediator_phone) = public.my_phone())
        )
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- PAYMENTS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "party_select_payments" ON public.payments;

CREATE POLICY "party_select_payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR (
          public.my_phone() != '' AND (
            public.norm_phone(lender_phone)   = public.my_phone()
            OR public.norm_phone(borrower_phone) = public.my_phone()
            OR (loan_type = 'Through Mediator'
                AND public.norm_phone(mediator_phone) = public.my_phone())
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "lender_insert_payments" ON public.payments;

CREATE POLICY "lender_insert_payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR (public.my_phone() != ''
            AND public.norm_phone(lender_phone) = public.my_phone())
      )
    )
  );

DROP POLICY IF EXISTS "lender_update_payments" ON public.payments;

CREATE POLICY "lender_update_payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL AND
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR (public.my_phone() != ''
            AND public.norm_phone(lender_phone) = public.my_phone())
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- LOAN PARTY CONFIRMATIONS
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "party_select_confirmations" ON public.loan_party_confirmations;

CREATE POLICY "party_select_confirmations" ON public.loan_party_confirmations
  FOR SELECT TO authenticated
  USING (
    loan_id IN (
      SELECT loan_id FROM public.loans
      WHERE deleted_at IS NULL AND (
        creator_id = auth.uid()
        OR (
          public.my_phone() != '' AND (
            public.norm_phone(lender_phone)   = public.my_phone()
            OR public.norm_phone(borrower_phone) = public.my_phone()
            OR (loan_type = 'Through Mediator'
                AND public.norm_phone(mediator_phone) = public.my_phone())
          )
        )
      )
    )
  );
