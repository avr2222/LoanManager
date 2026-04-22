-- ============================================================
-- Password & Security Question system for phone users
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Fix profile trigger to handle @user.local emails ──────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, phone)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email LIKE '%@user.local'    THEN 'mediator'
      WHEN NEW.email LIKE '%@mediator.local' THEN 'mediator'
      ELSE 'admin'
    END,
    CASE
      WHEN NEW.email LIKE '%@user.local'    THEN split_part(NEW.email, '@', 1)
      WHEN NEW.email LIKE '%@mediator.local' THEN replace(NEW.email, '@mediator.local', '')
      ELSE ''
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Back-fill existing @user.local users who may not have profiles
INSERT INTO public.profiles (id, role, phone)
SELECT id, 'mediator', split_part(email, '@', 1)
FROM auth.users
WHERE email LIKE '%@user.local'
ON CONFLICT (id) DO NOTHING;

-- ── 2. Add security question/answer columns to profiles ──────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS security_question TEXT,
  ADD COLUMN IF NOT EXISTS security_answer   TEXT;

-- ── 3. Fix phone_select_own_loans — add lender_phone check ───
DROP POLICY IF EXISTS "phone_select_own_loans" ON loans;
CREATE POLICY "phone_select_own_loans" ON loans
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
      OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- ── 4. Fix phone_insert_own_loans — add lender_phone check ───
DROP POLICY IF EXISTS "phone_insert_own_loans" ON loans;
CREATE POLICY "phone_insert_own_loans" ON loans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_phone() IS NOT NULL AND (
      public.norm_phone(borrower_phone) = public.user_phone()
      OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
      OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- ── 5. Add phone_update_own_loans policy (lender can update) ─
DROP POLICY IF EXISTS "phone_update_own_loans" ON loans;
CREATE POLICY "phone_update_own_loans" ON loans
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    public.norm_phone(lender_phone) = public.user_phone()
  )
  WITH CHECK (
    public.user_phone() IS NOT NULL AND
    public.norm_phone(lender_phone) = public.user_phone()
  );

-- ── 6. Add phone_update_own_payments — for Mark Received ─────
DROP POLICY IF EXISTS "phone_update_own_payments" ON payments;
CREATE POLICY "phone_update_own_payments" ON payments
  FOR UPDATE TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone) = public.user_phone()
    )
  )
  WITH CHECK (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- Also fix phone_select_own_payments to include loans where user is lender
DROP POLICY IF EXISTS "phone_select_own_payments" ON payments;
CREATE POLICY "phone_select_own_payments" ON payments
  FOR SELECT TO authenticated
  USING (
    public.user_phone() IS NOT NULL AND
    loan_id IN (
      SELECT loan_id FROM loans
      WHERE public.norm_phone(borrower_phone) = public.user_phone()
         OR (loan_type = 'Through Mediator' AND public.norm_phone(mediator_phone) = public.user_phone())
         OR public.norm_phone(lender_phone) = public.user_phone()
    )
  );

-- ── 7. RPC: get security question for a phone (public) ───────
CREATE OR REPLACE FUNCTION public.get_security_question(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_question TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = trim(p_phone) || '@user.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT security_question INTO v_question
  FROM profiles
  WHERE id = v_user_id;

  RETURN v_question;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_security_question TO anon, authenticated;

-- ── 8. RPC: reset password via security answer ───────────────
CREATE OR REPLACE FUNCTION public.phone_forgot_password(
  p_phone       TEXT,
  p_answer      TEXT,
  p_new_password TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id      UUID;
  v_stored_answer TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = trim(p_phone) || '@user.local'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT security_answer INTO v_stored_answer
  FROM profiles
  WHERE id = v_user_id;

  IF v_stored_answer IS NULL THEN
    RETURN 'no_security_question';
  END IF;

  IF lower(trim(v_stored_answer)) != lower(trim(p_answer)) THEN
    RETURN 'wrong_answer';
  END IF;

  -- Update the password
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = v_user_id;

  -- Mark password as changed in metadata
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"password_changed": true}'::jsonb
  WHERE id = v_user_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.phone_forgot_password TO anon, authenticated;
