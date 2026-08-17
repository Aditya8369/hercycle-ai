-- Composite index for challenge_progress user_date query path to prevent full table scans and guarantee zero-latency queries.
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_date
ON public.challenge_progress (user_id, date);

-- Performance Composite Indexes for Dashboard, Cycles, and Daily Logs
CREATE INDEX IF NOT EXISTS idx_cycles_user_start_date ON public.cycles(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON public.daily_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_weight_user_recorded ON public.weight_entries(user_id, recorded_date DESC);

