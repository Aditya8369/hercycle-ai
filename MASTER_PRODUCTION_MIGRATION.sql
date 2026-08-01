-- Composite index for challenge_progress user_date query path to prevent full table scans and guarantee zero-latency queries.
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user_date
ON public.challenge_progress (user_id, date);
