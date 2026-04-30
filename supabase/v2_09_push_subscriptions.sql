-- ============================================================
-- V2 Migration 09 — Push Subscriptions table
-- Stores Web Push API subscription objects per user.
-- Safe to re-run (idempotent).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscriptions
DROP POLICY IF EXISTS "user_manage_own_push" ON public.push_subscriptions;
CREATE POLICY "user_manage_own_push" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
