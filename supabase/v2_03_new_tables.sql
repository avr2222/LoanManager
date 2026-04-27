-- ============================================================
-- V2 Migration 03 — New Tables
-- Safe to re-run. Run AFTER v2_02_loans_payments.sql.
-- ============================================================

-- ── 1. Invitations ────────────────────────────────────────────
--    Controls who can register. Super admin can invite anyone.
--    Regular users can invite people from their own loans.

CREATE TABLE IF NOT EXISTS public.invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  phone       TEXT        NOT NULL DEFAULT '',   -- if set, only this phone can use it
  note        TEXT        NOT NULL DEFAULT '',   -- optional note (e.g. "Suresh - borrower")
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ DEFAULT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON public.invitations(token);

CREATE INDEX IF NOT EXISTS idx_invitations_created_by
  ON public.invitations(created_by);

CREATE INDEX IF NOT EXISTS idx_invitations_phone
  ON public.invitations(phone)
  WHERE phone != '';

-- ── 2. Loan Party Confirmations ───────────────────────────────
--    One row per party per loan. Created automatically by trigger
--    when a loan is inserted. Parties confirm or dispute here.

CREATE TABLE IF NOT EXISTS public.loan_party_confirmations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id       TEXT        NOT NULL REFERENCES public.loans(loan_id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  party_role    TEXT        NOT NULL,             -- 'lender' | 'borrower' | 'mediator'
  party_name    TEXT        NOT NULL DEFAULT '',
  party_phone   TEXT        NOT NULL DEFAULT '',  -- normalized 10-digit
  status        TEXT        NOT NULL DEFAULT 'Pending', -- 'Pending' | 'Confirmed' | 'Disputed'
  note          TEXT        NOT NULL DEFAULT '',  -- dispute reason if disputed
  responded_at  TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(loan_id, party_role),
  CONSTRAINT chk_confirmation_party_role
    CHECK (party_role IN ('lender', 'borrower', 'mediator')),
  CONSTRAINT chk_confirmation_status
    CHECK (status IN ('Pending', 'Confirmed', 'Disputed'))
);

ALTER TABLE public.loan_party_confirmations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_confirmations_loan_id
  ON public.loan_party_confirmations(loan_id);

CREATE INDEX IF NOT EXISTS idx_confirmations_user_id
  ON public.loan_party_confirmations(user_id);

CREATE INDEX IF NOT EXISTS idx_confirmations_phone
  ON public.loan_party_confirmations(party_phone);

CREATE INDEX IF NOT EXISTS idx_confirmations_status
  ON public.loan_party_confirmations(status);

-- ── 3. Contacts ───────────────────────────────────────────────
--    Auto-built from loan data. Re-use when creating new loans.
--    One row per unique phone per owner.

CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  phone       TEXT        NOT NULL DEFAULT '',   -- normalized 10-digit
  notes       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(owner_id, phone)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_contacts_owner_id
  ON public.contacts(owner_id);

CREATE INDEX IF NOT EXISTS idx_contacts_phone
  ON public.contacts(owner_id, phone);

-- ── 4. Lean Audit Log — migrate existing table ───────────────
--    Drop JSONB columns (too large), add human-readable summary.
--    Existing audit rows are preserved but old_data/new_data removed.

ALTER TABLE public.audit_log
  DROP COLUMN IF EXISTS old_data,
  DROP COLUMN IF EXISTS new_data,
  ADD COLUMN  IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';

-- ── 5. Audit log — 90-day index for cleanup ──────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at
  ON public.audit_log(performed_at);
