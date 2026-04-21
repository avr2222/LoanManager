-- ─────────────────────────────────────────────────────────────────────────────
-- Loan Manager — Supabase Schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Loans ─────────────────────────────────────────────────────────────────────
create table if not exists public.loans (
  loan_id                   text primary key,
  borrower_name             text not null,
  borrower_phone            text not null default '',
  borrower_address          text not null default '',
  loan_type                 text not null default 'Direct',
  mediator_name             text not null default '',
  mediator_phone            text not null default '',
  mediator_commission_pct   numeric not null default 0,
  principal_amount          numeric not null default 0,
  annual_interest_rate      numeric not null default 0,
  monthly_interest_rate     numeric not null default 0,
  date_given                text not null default '',
  monthly_due_day           int not null default 1,
  expected_tenure_months    int not null default 0,
  monthly_interest_amount   numeric not null default 0,
  mediator_monthly_share    numeric not null default 0,
  net_monthly_receipt       numeric not null default 0,
  loan_status               text not null default 'Active',
  remarks                   text not null default '',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Payments ──────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id                    text primary key,
  loan_id               text not null references public.loans(loan_id) on delete cascade,
  borrower_name         text not null default '',
  month_year            text not null default '',
  due_date              text not null default '',
  interest_amount       numeric not null default 0,
  mediator_share        numeric not null default 0,
  net_amount_expected   numeric not null default 0,
  amount_received       numeric not null default 0,
  date_received         text not null default '',
  payment_status        text not null default 'Pending',
  days_overdue          int not null default 0,
  pending_amount        numeric not null default 0,
  remarks               text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_payments_loan_id   on public.payments(loan_id);
create index if not exists idx_loans_status       on public.loans(loan_status);
create index if not exists idx_payments_status    on public.payments(payment_status);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- For a personal single-user app, allow full access with the anon key.
-- If you add authentication later, update these policies to check auth.uid().

alter table public.loans     enable row level security;
alter table public.payments  enable row level security;

create policy "Allow all for anon" on public.loans     for all using (true) with check (true);
create policy "Allow all for anon" on public.payments  for all using (true) with check (true);
