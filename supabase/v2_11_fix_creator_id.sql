-- ============================================================
-- V2 Migration 11 — Backfill NULL creator_id on loans
-- Root cause: toDbLoan() never included creator_id in the
-- upsert payload. Loans imported via Excel have creator_id = NULL,
-- which fails UPDATE/DELETE RLS (creator_id = auth.uid()).
-- Fix: set creator_id to the super-admin user for all NULL rows.
-- Safe to re-run.
-- ============================================================

UPDATE public.loans
SET creator_id = (
  SELECT id FROM public.profiles
  WHERE is_super_admin = TRUE
  LIMIT 1
)
WHERE creator_id IS NULL;
