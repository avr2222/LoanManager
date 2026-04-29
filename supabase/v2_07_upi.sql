-- ============================================================
-- V2 Migration 07 — UPI ID
-- Safe to re-run. Run AFTER v2_06_triggers.sql.
-- ============================================================

-- ── 1. Add upi_id column to profiles ─────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upi_id TEXT NOT NULL DEFAULT '';

-- ── 2. RPC: get_upi_id_by_phone ───────────────────────────────
--    SECURITY DEFINER so borrowers can fetch their lender/
--    mediator UPI ID even if RLS restricts cross-user reads.
--    Returns '' if no profile found or UPI not set.

CREATE OR REPLACE FUNCTION public.get_upi_id_by_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(upi_id, '')
  FROM public.profiles
  WHERE phone = public.norm_phone(p_phone)
  LIMIT 1;
$$;
