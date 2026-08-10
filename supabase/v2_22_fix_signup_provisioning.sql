-- ============================================================
-- V2 Migration 22 — Fix "Database error saving new user" on signup
-- Safe to re-run. Run in the Supabase SQL Editor.
--
-- Root cause: provisionFromLoans() (auto-creates a placeholder
-- <phone>@user.local login for a loan's borrower/mediator) used to
-- call auth.signUp() without passing phone in user metadata, so the
-- profile it created always had phone=''. That broke the app-side
-- "does this phone already have a profile?" check, causing repeat
-- signup attempts for the same phone on every new loan. When that
-- phone was already claimed by a different profile row, the INSERT
-- in handle_new_user() below hit idx_profiles_phone_unique, threw,
-- and rolled back the whole auth.users insert — surfaced by
-- Supabase as a generic 500 "Database error saving new user".
--
-- The app-side fix (passing phone metadata) is in profilesService.ts.
-- This migration hardens the trigger itself so a phone collision
-- degrades gracefully (profile is created with phone left blank)
-- instead of crashing the signup.
-- ============================================================

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

  -- idx_profiles_phone_unique allows only one profile per non-empty phone.
  -- If this phone is already claimed by a different user, drop it here
  -- rather than letting the INSERT below throw and roll back the signup.
  IF v_phone != '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = v_phone AND id != NEW.id
  ) THEN
    v_phone := '';
  END IF;

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

-- ── Backfill: existing @user.local profiles that ended up with an
--    empty phone because of the bug above. Only fills in the phone
--    when it's not already claimed by a different profile.
UPDATE public.profiles p
SET phone = public.norm_phone(split_part(u.email, '@', 1))
FROM auth.users u
WHERE p.id = u.id
  AND p.phone = ''
  AND u.email LIKE '%@user.local'
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.phone = public.norm_phone(split_part(u.email, '@', 1))
      AND p2.id != p.id
  );
