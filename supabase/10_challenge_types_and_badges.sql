-- Migration 10: widen challenge_type to the five challenges the app ships, and
-- index the badge table the award path reads on every completion.
--
-- ## Why this file has to exist
--
-- `supabase/migrations_challenges.sql` created the table with three types:
--
--     challenge_type TEXT NOT NULL CHECK (challenge_type IN ('water', 'stretch', 'mood')),
--
-- `supabase/MASTER_PRODUCTION_MIGRATION.sql` later writes the wider list --
-- but inside `CREATE TABLE IF NOT EXISTS public.challenge_progress (...)`. On
-- any environment where the table already exists, that whole statement is a
-- no-op and the constraint is never touched. `CREATE TABLE IF NOT EXISTS`
-- cannot alter a table; it can only decline to create one.
--
-- Meanwhile `lib/challenges-data.js` ships five challenges, and
-- `components/challenges/IronMealChallenge.jsx` and `SleepChallenge.jsx` render
-- and are clickable. They pass the route's zod schema, reach the database, and
-- fail the CHECK -- so two of the five challenges can never be completed, and
-- the failure surfaces as a 500 carrying the raw constraint name.
--
-- Everything here is idempotent: safe to run against a three-type database, a
-- five-type one, or one where a previous run was interrupted.

-- ---------------------------------------------------------------------------
-- 1. Widen the challenge_type constraint.
-- ---------------------------------------------------------------------------
--
-- DROP then ADD rather than a single statement, because a CHECK constraint
-- cannot be altered in place. The constraint is named explicitly rather than
-- left to Postgres's default naming, so the next migration does not have to
-- guess what it is called: a table created by `migrations_challenges.sql` has
-- an auto-generated `challenge_progress_challenge_type_check`, and one created
-- by the master file has the same name only by coincidence of the same column
-- and table names.

ALTER TABLE public.challenge_progress
  DROP CONSTRAINT IF EXISTS challenge_progress_challenge_type_check;

ALTER TABLE public.challenge_progress
  DROP CONSTRAINT IF EXISTS check_challenge_type_supported;

-- The five keys in `lib/challenges-data.js`. Adding a sixth challenge means
-- adding a migration here as well -- which is the point: the schema and the
-- catalogue drifted apart precisely because nothing forced them to move
-- together.
ALTER TABLE public.challenge_progress
  ADD CONSTRAINT check_challenge_type_supported
  CHECK (challenge_type IN ('water', 'stretch', 'mood', 'iron', 'sleep'));

COMMENT ON COLUMN public.challenge_progress.challenge_type IS
  'One of the keys in lib/challenges-data.js CHALLENGES. Widening this list requires a migration -- see supabase/10_challenge_types_and_badges.sql.';

-- ---------------------------------------------------------------------------
-- 2. Guarantee the uniqueness the badge award path relies on.
-- ---------------------------------------------------------------------------
--
-- `user_badges` is declared `UNIQUE(user_id, badge_key)` in both files that
-- create it, so this is normally already present. It is asserted here because
-- the award path is about to depend on it for correctness rather than merely
-- for tidiness: the insert becomes an idempotent upsert with
-- `ON CONFLICT DO NOTHING`, which without the constraint silently degrades
-- into an ordinary insert that duplicates rows under concurrency.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_badges'::regclass
      AND contype = 'u'
      AND conkey = ARRAY(
        SELECT attnum
        FROM pg_attribute
        WHERE attrelid = 'public.user_badges'::regclass
          AND attname IN ('user_id', 'badge_key')
        ORDER BY attnum
      )
  ) THEN
    ALTER TABLE public.user_badges
      ADD CONSTRAINT user_badges_user_id_badge_key_key UNIQUE (user_id, badge_key);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Index the reads the award path performs on every completion.
-- ---------------------------------------------------------------------------
--
-- Awarding a badge reads the user's already-earned keys, and the monthly recap
-- reads the subset for one month. Both filter on `user_id` alone today; the
-- recap previously narrowed with `LIKE '%_' || month_key`, in which `_` is a
-- single-character wildcard rather than a literal underscore -- so the filter
-- matched more keys than it looked like it did, and could not use an index
-- either way. The route now selects an explicit key list, which this index
-- serves.

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id
  ON public.user_badges(user_id);

-- The badge scan walks a bounded window of completed rows per user. The
-- existing `idx_challenge_progress_user_date` covers `(user_id, date)`; this
-- partial index makes the completed-only scan cheaper without duplicating it
-- for the rows that are not completed and are never read by that path.
CREATE INDEX IF NOT EXISTS idx_challenge_progress_completed
  ON public.challenge_progress(user_id, date)
  WHERE completed = TRUE;
