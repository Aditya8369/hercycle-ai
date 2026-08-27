-- Migration 09: give user_profiles a home for the average cycle length.
--
-- app/api/profile/route.js has always validated a `cycleLength` field (range
-- 15-60) and then dropped it: the record it upserted never referenced the
-- value, so the endpoint answered 200 OK and discarded what the user entered.
-- There was no column to write it to.
--
-- The column is nullable with no default: "the user has not told us" and "the
-- user says 28" are different facts, and only the second one should influence a
-- prediction.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS cycle_length SMALLINT;

-- Same bounds the API enforces, so a direct SQL write cannot store a value the
-- application would refuse. Deliberately wider than the "normal" clinical range
-- (21-35): an irregular cycle is exactly the case this app exists to track.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS check_profile_cycle_length_bounds;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT check_profile_cycle_length_bounds
  CHECK (cycle_length IS NULL OR (cycle_length >= 15 AND cycle_length <= 60));

COMMENT ON COLUMN public.user_profiles.cycle_length IS
  'Self-reported average cycle length in days. NULL means not provided; the prediction engine falls back to the logged cycle history.';
