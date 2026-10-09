-- ============================================================
-- V2 Migration 23 — Security hardening + lender backfill
-- Run in the Supabase SQL Editor AFTER v2_22. Safe to re-run.
--
-- 1. Forgot-password: security answers move out of `profiles`
--    (readable by other users) into `profile_secrets` (no client
--    access), hashed with bcrypt. phone_forgot_password() is rate
--    limited to 5 wrong answers per phone per hour.
-- 2. Profiles are no longer readable by every logged-in user —
--    only your own, super admins, and people you share a loan with.
-- 3. Loans with a blank lender that were created by someone acting
--    as the lender get that creator's name/phone filled in, so they
--    show under My Loans / dashboard. (The app used to stamp the
--    admin's name onto EVERY blank-lender loan at each login; that
--    code is removed.)
-- ============================================================

-- pgcrypto (crypt / gen_salt) lives in the `extensions` schema on Supabase.
SET search_path = public, extensions;


-- ════════════════════════════════════════════════════════════
-- 1. Security answers → profile_secrets (hashed)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profile_secrets (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  security_question    TEXT NOT NULL DEFAULT '',
  security_answer_hash TEXT NOT NULL DEFAULT '',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with no policies: only SECURITY DEFINER functions below can touch it.
ALTER TABLE public.profile_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_secrets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  id           BIGSERIAL PRIMARY KEY,
  phone        TEXT        NOT NULL,
  success      BOOLEAN     NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pw_reset_attempts_phone
  ON public.password_reset_attempts(phone, attempted_at);
ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_attempts FROM anon, authenticated;

-- Move any existing answers over (hashed), then blank them on profiles.
-- Answers were stored lowercased + trimmed; hash the same normalised form.
INSERT INTO public.profile_secrets (user_id, security_question, security_answer_hash)
SELECT
  p.id,
  COALESCE(p.security_question, ''),
  CASE
    WHEN p.security_answer LIKE '$2%' THEN p.security_answer
    ELSE crypt(lower(trim(p.security_answer)), gen_salt('bf'))
  END
FROM public.profiles p
WHERE p.security_answer IS NOT NULL AND p.security_answer <> ''
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles
SET security_question = NULL, security_answer = NULL
WHERE security_question IS NOT NULL OR security_answer IS NOT NULL;

-- Called by the app when a phone user sets password + security question.
CREATE OR REPLACE FUNCTION public.set_security_question(p_question TEXT, p_answer TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF COALESCE(trim(p_answer), '') = '' THEN
    RAISE EXCEPTION 'Answer is required';
  END IF;

  INSERT INTO public.profile_secrets (user_id, security_question, security_answer_hash, updated_at)
  VALUES (auth.uid(), COALESCE(p_question, ''), crypt(lower(trim(p_answer)), gen_salt('bf')), now())
  ON CONFLICT (user_id) DO UPDATE SET
    security_question    = EXCLUDED.security_question,
    security_answer_hash = EXCLUDED.security_answer_hash,
    updated_at           = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_security_question(TEXT, TEXT) TO authenticated;

-- Older cached copies of the app still write security_question/answer straight
-- into profiles. Divert those writes into profile_secrets so nothing plaintext
-- is ever stored on profiles.
CREATE OR REPLACE FUNCTION public.divert_security_answer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF COALESCE(NEW.security_answer, '') <> '' THEN
    INSERT INTO public.profile_secrets (user_id, security_question, security_answer_hash, updated_at)
    VALUES (NEW.id, COALESCE(NEW.security_question, ''), crypt(lower(trim(NEW.security_answer)), gen_salt('bf')), now())
    ON CONFLICT (user_id) DO UPDATE SET
      security_question    = EXCLUDED.security_question,
      security_answer_hash = EXCLUDED.security_answer_hash,
      updated_at           = now();
  END IF;
  NEW.security_question := NULL;
  NEW.security_answer   := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_divert_security_answer ON public.profiles;
CREATE TRIGGER profiles_divert_security_answer
  BEFORE INSERT OR UPDATE OF security_question, security_answer ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.divert_security_answer();

-- Same signature as before (see password_security.sql); now reads profile_secrets.
CREATE OR REPLACE FUNCTION public.get_security_question(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_question TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = public.norm_phone(p_phone) || '@user.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(security_question, '') INTO v_question
  FROM public.profile_secrets
  WHERE user_id = v_user_id;

  RETURN v_question;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_security_question(TEXT) TO anon, authenticated;

-- Same signature and return codes as before, plus 'too_many_attempts'.
CREATE OR REPLACE FUNCTION public.phone_forgot_password(
  p_phone        TEXT,
  p_answer       TEXT,
  p_new_password TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_phone    TEXT := public.norm_phone(p_phone);
  v_user_id  UUID;
  v_hash     TEXT;
  v_failures INT;
BEGIN
  IF v_phone = '' THEN
    RETURN 'not_found';
  END IF;

  IF length(COALESCE(p_new_password, '')) < 8 THEN
    RETURN 'weak_password';
  END IF;

  SELECT count(*) INTO v_failures
  FROM public.password_reset_attempts
  WHERE phone = v_phone
    AND success = FALSE
    AND attempted_at > now() - INTERVAL '1 hour';

  IF v_failures >= 5 THEN
    RETURN 'too_many_attempts';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_phone || '@user.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT NULLIF(security_answer_hash, '') INTO v_hash
  FROM public.profile_secrets
  WHERE user_id = v_user_id;

  IF v_hash IS NULL THEN
    RETURN 'no_security_question';
  END IF;

  IF crypt(lower(trim(COALESCE(p_answer, ''))), v_hash) <> v_hash THEN
    INSERT INTO public.password_reset_attempts (phone, success) VALUES (v_phone, FALSE);
    RETURN 'wrong_answer';
  END IF;

  INSERT INTO public.password_reset_attempts (phone, success) VALUES (v_phone, TRUE);

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"password_changed": true}'::jsonb
  WHERE id = v_user_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.phone_forgot_password(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 2. Profiles: only own / super admin / people you share a loan with
-- ════════════════════════════════════════════════════════════
-- The loans subquery runs under the caller's own loans RLS, so "share a
-- loan with" means "appears on a loan you are allowed to see". Loans
-- policies only reach profiles through SECURITY DEFINER helpers
-- (my_phone, is_super_admin), so this does not recurse.

DROP POLICY IF EXISTS "profiles_select_any"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"         ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile"  ON public.profiles;
DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_related" ON public.profiles;

CREATE POLICY "profiles_select_related" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (
      phone <> ''
      AND EXISTS (
        SELECT 1 FROM public.loans l
        WHERE l.deleted_at IS NULL
          AND profiles.phone IN (
            public.norm_phone(l.lender_phone),
            public.norm_phone(l.borrower_phone),
            public.norm_phone(l.mediator_phone)
          )
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- 3. Fill blank lender from the loan's creator
-- ════════════════════════════════════════════════════════════
-- Only where the creator is not the borrower or mediator on that loan
-- (a blank lender there means "lender unknown", not "me").
-- loan_reset_confirmations is paused so this doesn't reset other
-- parties' confirmations back to Pending.

ALTER TABLE public.loans DISABLE TRIGGER loan_reset_confirmations;

UPDATE public.loans l
SET lender_name  = CASE WHEN COALESCE(l.lender_name, '') = '' THEN p.full_name ELSE l.lender_name END,
    lender_phone = p.phone
FROM public.profiles p
WHERE p.id = l.creator_id
  AND l.deleted_at IS NULL
  AND COALESCE(l.lender_phone, '') = ''
  AND (COALESCE(l.lender_name, '') = '' OR l.lender_name = p.full_name)
  AND p.phone <> ''
  AND p.phone <> public.norm_phone(l.borrower_phone)
  AND p.phone <> public.norm_phone(l.mediator_phone);

ALTER TABLE public.loans ENABLE TRIGGER loan_reset_confirmations;


-- ── Verify ────────────────────────────────────────────────────
-- Should list only profiles_select_related (plus update/insert policies).
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';
