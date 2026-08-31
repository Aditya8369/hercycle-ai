-- forum_bookmarks table for Issue #815
CREATE TABLE IF NOT EXISTS public.forum_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- Index for fast user bookmark queries
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user_id ON public.forum_bookmarks(user_id);
