-- ============================================================
-- V2 Migration 01 — Profiles Table
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================

-- ── 1. Add new columns to profiles ───────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name      TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email          TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN     NOT NULL DEFAULT FALSE;

-- ── 2. Backfill email from auth.users ─────────────────────────
UPDATE public.profiles p
SET email = COALESCE(u.email, '')
FROM auth.users u
WHERE p.id = u.id
  AND p.email = '';

-- ── 3. Backfill full_name from display_name (if set) ──────────
--    display_name was the old field phone users could set.
--    Carry it forward into full_name.
UPDATE public.profiles
SET full_name = display_name
WHERE display_name IS NOT NULL
  AND display_name != ''
  AND full_name = '';

-- ── 4. Backfill full_name from auth.users metadata ────────────
--    For users who set full_name during signup (new flow).
UPDATE public.profiles p
SET full_name = COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
WHERE p.id = u.id
  AND p.full_name = ''
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL;

-- ── 5. Unique index on phone (non-empty only) ─────────────────
--    Prevents two users from registering with the same phone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
  ON public.profiles(phone)
  WHERE phone != '';

-- ── 6. Index for fast phone lookups ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles(phone);
