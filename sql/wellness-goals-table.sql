-- Wellness Goals table
CREATE TABLE IF NOT EXISTS public.wellness_goals (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    TEXT NOT NULL,
  date       DATE NOT NULL,
  completed  TEXT[] DEFAULT '{}',
  phase      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT wellness_goals_user_date_unique UNIQUE (user_id, date)
);

ALTER TABLE public.wellness_goals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wellness_goals_user_date
  ON public.wellness_goals(user_id, date DESC);

ALTER TABLE public.wellness_goals DROP CONSTRAINT IF EXISTS wellness_goals_user_id_fkey;
ALTER TABLE public.wellness_goals ADD CONSTRAINT wellness_goals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- RLS policies
DROP POLICY IF EXISTS "wellness_goals_select_own" ON public.wellness_goals;
CREATE POLICY "wellness_goals_select_own" ON public.wellness_goals
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "wellness_goals_insert_own" ON public.wellness_goals;
CREATE POLICY "wellness_goals_insert_own" ON public.wellness_goals
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "wellness_goals_update_own" ON public.wellness_goals;
CREATE POLICY "wellness_goals_update_own" ON public.wellness_goals
  FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "wellness_goals_delete_own" ON public.wellness_goals;
CREATE POLICY "wellness_goals_delete_own" ON public.wellness_goals
  FOR DELETE USING (auth.uid()::text = user_id);
