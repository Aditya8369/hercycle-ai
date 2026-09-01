-- Migration 12: one draft per (user, type), not one draft per user
--
-- `supabase/05_user_drafts.sql` made `user_id` the primary key:
--
--   CREATE TABLE IF NOT EXISTS public.user_drafts (
--     user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
--     draft_type TEXT DEFAULT 'forum_post',
--     ...
--   );
--
-- so `draft_type` was a label on a single row rather than part of its identity.
-- `app/api/drafts/route.js` upserted with `{ onConflict: 'user_id' }`, which
-- meant every composer in the app wrote over the same row: one character typed
-- into a comment box destroyed a half-written forum post. `GET` had no type
-- filter at all and returned whichever draft had been written last, and
-- `DELETE` removed every type at once.
--
-- The route validated `draftType` against a three-item allow-list and
-- `MarkdownEditor` took a `draftType` prop, so the application code was already
-- written as though these were separate drafts. This migration makes the schema
-- agree.
--
-- Idempotent — safe to run against an existing database, and safe to run twice.

-- --------------------------------------------------------------------------
-- 1. `draft_type` has to be part of the key, so it cannot be NULL.
-- --------------------------------------------------------------------------

UPDATE public.user_drafts
   SET draft_type = 'forum_post'
 WHERE draft_type IS NULL
    OR draft_type NOT IN ('forum_post', 'comment', 'article');

ALTER TABLE public.user_drafts ALTER COLUMN draft_type SET DEFAULT 'forum_post';
ALTER TABLE public.user_drafts ALTER COLUMN draft_type SET NOT NULL;

-- The allow-list the route has always carried, written down where it is
-- actually enforced. Two copies of a list with nothing keeping them together is
-- how `challenge_type` drifted (see supabase/10_challenge_types_and_badges.sql).
ALTER TABLE public.user_drafts DROP CONSTRAINT IF EXISTS user_drafts_draft_type_check;
ALTER TABLE public.user_drafts
  ADD CONSTRAINT user_drafts_draft_type_check
  CHECK (draft_type IN ('forum_post', 'comment', 'article'));

-- --------------------------------------------------------------------------
-- 2. Bound the free-text columns.
--
-- Both are TEXT and the route checked only `typeof`, on an endpoint designed to
-- be called every second while somebody types.
-- --------------------------------------------------------------------------

UPDATE public.user_drafts SET title   = left(title, 200)     WHERE length(title)   > 200;
UPDATE public.user_drafts SET content = left(content, 20000) WHERE length(content) > 20000;

ALTER TABLE public.user_drafts DROP CONSTRAINT IF EXISTS user_drafts_title_length_check;
ALTER TABLE public.user_drafts
  ADD CONSTRAINT user_drafts_title_length_check
  CHECK (title IS NULL OR length(title) <= 200);

ALTER TABLE public.user_drafts DROP CONSTRAINT IF EXISTS user_drafts_content_length_check;
ALTER TABLE public.user_drafts
  ADD CONSTRAINT user_drafts_content_length_check
  CHECK (content IS NULL OR length(content) <= 20000);

-- An empty category id and no category id are the same thing; store one of them.
UPDATE public.user_drafts SET category_id = NULL WHERE btrim(coalesce(category_id, '')) = '';
ALTER TABLE public.user_drafts ALTER COLUMN category_id DROP DEFAULT;

-- --------------------------------------------------------------------------
-- 3. Replace the primary key with the composite one.
--
-- Done in a DO block so the constraint's real name is discovered rather than
-- assumed: a table created by 05_user_drafts.sql has `user_drafts_pkey`, but a
-- database restored from a dump may not.
-- --------------------------------------------------------------------------

DO $$
DECLARE
  pk_name TEXT;
BEGIN
  SELECT conname INTO pk_name
    FROM pg_constraint
   WHERE conrelid = 'public.user_drafts'::regclass
     AND contype = 'p';

  IF pk_name IS NOT NULL THEN
    -- Already the composite key? Then there is nothing to do.
    IF (
      SELECT count(*)
        FROM pg_constraint c
        JOIN unnest(c.conkey) AS k(attnum) ON TRUE
       WHERE c.conname = pk_name
         AND c.conrelid = 'public.user_drafts'::regclass
    ) = 2 THEN
      RETURN;
    END IF;

    EXECUTE format('ALTER TABLE public.user_drafts DROP CONSTRAINT %I', pk_name);
  END IF;

  EXECUTE 'ALTER TABLE public.user_drafts ADD CONSTRAINT user_drafts_pkey PRIMARY KEY (user_id, draft_type)';
END
$$;

-- The foreign key travelled with the old primary key on some deployments;
-- re-assert it so `ON DELETE CASCADE` still applies to every draft type.
ALTER TABLE public.user_drafts DROP CONSTRAINT IF EXISTS user_drafts_user_id_fkey;
ALTER TABLE public.user_drafts
  ADD CONSTRAINT user_drafts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------------
-- 4. The index the reads use.
--
-- `idx_user_drafts_user` on (user_id) alone is now redundant with the leading
-- column of the composite primary key.
-- --------------------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_user_drafts_user;
CREATE INDEX IF NOT EXISTS user_drafts_user_type_idx
  ON public.user_drafts (user_id, draft_type);
