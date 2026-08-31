/**
 * Sleep Logs Table — Run in Supabase SQL Editor
 *
 * Creates the sleep_logs table for tracking sleep quality,
 * duration, and related data.
 */

-- Create sleep_logs table
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  bed_time TEXT NOT NULL,
  wake_time TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality >= 1 AND quality <= 5),
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0 AND duration_minutes <= 1440),
  position TEXT,
  disturbances TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT sleep_logs_user_date_unique UNIQUE (user_id, date)
);

-- Enable Row Level Security
ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

-- Foreign key to users
ALTER TABLE public.sleep_logs
DROP CONSTRAINT IF EXISTS sleep_logs_user_id_fkey;

ALTER TABLE public.sleep_logs
ADD CONSTRAINT sleep_logs_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.users(id)
ON DELETE CASCADE;

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_id
ON public.sleep_logs(user_id);

-- Composite index for date range queries
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date
ON public.sleep_logs(user_id, date DESC);

-- RLS Policies
DROP POLICY IF EXISTS "sleep_logs_select_own" ON public.sleep_logs;
CREATE POLICY "sleep_logs_select_own"
ON public.sleep_logs FOR SELECT
USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "sleep_logs_insert_own" ON public.sleep_logs;
CREATE POLICY "sleep_logs_insert_own"
ON public.sleep_logs FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "sleep_logs_update_own" ON public.sleep_logs;
CREATE POLICY "sleep_logs_update_own"
ON public.sleep_logs FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "sleep_logs_delete_own" ON public.sleep_logs;
CREATE POLICY "sleep_logs_delete_own"
ON public.sleep_logs FOR DELETE
USING (auth.uid()::text = user_id);
