-- Migration 11: calendar event integrity
--
-- `supabase/08_events.sql` created `public.events` with the accepted values for
-- `recurrence_rule` and `category` written down as a trailing comment:
--
--   recurrence_rule TEXT DEFAULT 'none', -- 'none' | 'daily' | 'weekly' | ...
--   category        TEXT DEFAULT 'reminder', -- 'reminder' | 'habit' | ...
--
-- A comment is not a constraint. `app/api/events/route.js` folded anything it
-- did not recognise into the default instead of refusing it, so a client
-- sending the wrong constant produced a stored event that quietly disagreed
-- with what the user picked, and nothing anywhere reported it.
--
-- `end_time` had no relationship to `start_time` at all: an event that ended
-- before it began was a valid row.
--
-- Idempotent — safe to run against a database that already has the table, and
-- safe to run twice. `CREATE TABLE IF NOT EXISTS` cannot add a constraint to an
-- existing table, which is why these are separate ALTER statements.

-- --------------------------------------------------------------------------
-- 1. Normalise any rows that predate the constraints, so the ALTERs can pass.
-- --------------------------------------------------------------------------

UPDATE public.events
   SET recurrence_rule = 'none'
 WHERE recurrence_rule IS NULL
    OR recurrence_rule NOT IN ('none', 'daily', 'weekly', 'monthly', 'yearly');

UPDATE public.events
   SET category = 'reminder'
 WHERE category IS NULL
    OR category NOT IN ('reminder', 'habit', 'donation', 'health');

UPDATE public.events
   SET time_zone = 'UTC'
 WHERE time_zone IS NULL
    OR btrim(time_zone) = '';

-- An end time that is not after the start time carries no information; drop it
-- rather than guess at what was meant.
UPDATE public.events
   SET end_time = NULL
 WHERE end_time IS NOT NULL
   AND end_time <= start_time;

UPDATE public.events
   SET title = left(btrim(title), 120)
 WHERE length(btrim(title)) > 120
    OR title <> btrim(title);

UPDATE public.events
   SET description = left(btrim(coalesce(description, '')), 1000)
 WHERE description IS NULL
    OR length(btrim(description)) > 1000
    OR description <> btrim(description);

-- --------------------------------------------------------------------------
-- 2. The constraints themselves.
-- --------------------------------------------------------------------------

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_recurrence_rule_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_rule_check
  CHECK (recurrence_rule IN ('none', 'daily', 'weekly', 'monthly', 'yearly'));

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_category_check
  CHECK (category IN ('reminder', 'habit', 'donation', 'health'));

-- The interval rule. NULL is still a valid `end_time`; what is refused is an
-- end that does not come after the beginning.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_interval_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_interval_check
  CHECK (end_time IS NULL OR end_time > start_time);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_title_length_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_title_length_check
  CHECK (length(title) BETWEEN 1 AND 120);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_description_length_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_description_length_check
  CHECK (description IS NULL OR length(description) <= 1000);

ALTER TABLE public.events ALTER COLUMN time_zone SET DEFAULT 'UTC';

-- --------------------------------------------------------------------------
-- 3. The index the list query reads.
--
-- `GET /api/events` orders by `start_time` within one `user_id` and is now
-- bounded by a LIMIT; without this index that is a sort over the whole
-- partition on every page load.
-- --------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS events_user_start_idx
  ON public.events (user_id, start_time DESC);
