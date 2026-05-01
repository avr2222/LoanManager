-- ============================================================
-- Diagnostic — run in Supabase SQL Editor to find the root cause
-- of RLS 42501 on loan INSERT.
-- ============================================================

-- 1. Check which user(s) have is_super_admin = TRUE
SELECT id, full_name, phone, is_super_admin
FROM public.profiles
WHERE is_super_admin = TRUE;

-- 2. If the above returns NO rows, set your profile as super admin.
--    Replace <YOUR_AUTH_USER_ID> with your UUID from auth.users:
--      SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
-- UPDATE public.profiles
-- SET is_super_admin = TRUE
-- WHERE id = '<YOUR_AUTH_USER_ID>';

-- 3. Check loans with NULL creator_id (these will fail DELETE/UPDATE)
SELECT loan_id, lender_name, borrower_name, creator_id
FROM public.loans
WHERE creator_id IS NULL
  AND deleted_at IS NULL;

-- 4. Backfill NULL creator_id rows to the super-admin user
-- (also done by v2_11, but run this if v2_11 was never run)
UPDATE public.loans
SET creator_id = (
  SELECT id FROM public.profiles WHERE is_super_admin = TRUE LIMIT 1
)
WHERE creator_id IS NULL;

-- 5. Verify the BEFORE INSERT trigger exists (from v2_11)
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.loans'::regclass
  AND tgname = 'trg_set_loan_creator';
