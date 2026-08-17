-- Migration: Automated retention cleanup for read partner nudges
-- Fixes #<issue number>
--
-- Context: the partner_nudges table (defined in 03_enhance_partner_schema.sql /
-- MASTER_PRODUCTION_MIGRATION.sql) was not yet created in this environment's
-- live database when this migration was written. This file assumes the table
-- already exists; run 03_enhance_partner_schema.sql or the partner_nudges
-- block of MASTER_PRODUCTION_MIGRATION.sql first if it does not.
--
-- Note: the original issue described this in terms of a `notifications`
-- table with a `read` boolean and `created_at`-based expiry. No such table
-- exists in this codebase — the actual UI-facing "notifications" feed
-- (components/layout/NotificationSettings.jsx) is built client-side from
-- partner_nudges rows, using a `read_at` TIMESTAMPTZ column (not a boolean),
-- with expiry measured from `read_at`, not `created_at`. This migration
-- targets the real table and column.

-- Requires the pg_cron extension to be enabled on this Supabase project
-- (Database → Extensions → pg_cron).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Runs every hour, deleting nudges that have been read for more than
-- 24 hours. Nudges that are still unread (read_at IS NULL) are never
-- touched by this job, regardless of age.
SELECT cron.schedule(
  'cleanup-read-partner-nudges',
  '0 * * * *',
  $$
  DELETE FROM public.partner_nudges
  WHERE read_at IS NOT NULL
  AND read_at < NOW() - INTERVAL '24 hours';
  $$
);