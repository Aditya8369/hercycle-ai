-- =========================================================================
-- Database Performance Optimization: Composite B-tree Indexes
-- Issue: Add composite index migration for cycles, daily logs, and weights
-- =========================================================================

-- 1. Index for querying and sorting user cycles by start date descending
CREATE INDEX IF NOT EXISTS idx_cycles_user_start_date 
ON cycles(user_id, start_date DESC);

-- 2. Index for querying and sorting daily logs by date descending
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date 
ON daily_logs(user_id, date DESC);

-- 3. Index for querying and sorting weight entries by recorded date descending
CREATE INDEX IF NOT EXISTS idx_weight_user_recorded 
ON weight_entries(user_id, recorded_date DESC);
