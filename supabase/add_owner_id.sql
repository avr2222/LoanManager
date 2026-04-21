-- Add owner_id to loans so each loan is tied to the user who created it
-- Run in Supabase SQL Editor AFTER rls_user_isolation.sql

-- Add column (nullable so existing rows are not broken)
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- Set existing loans to the admin's UUID.
-- NOTE: auth.uid() is NULL in the SQL Editor (runs as postgres superuser).
-- Find your UUID first:
--   SELECT id FROM auth.users WHERE email NOT LIKE '%@user.local';
-- Then run:
--   UPDATE loans SET owner_id = '<your-uuid>' WHERE owner_id IS NULL;
-- UPDATE loans SET owner_id = '<your-uuid>' WHERE owner_id IS NULL;

-- Set default for all future inserts
ALTER TABLE loans ALTER COLUMN owner_id SET DEFAULT auth.uid();
