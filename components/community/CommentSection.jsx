'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { formatDistanceToNow } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { Send, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import fetchWithTimeout from '@/lib/fetch-with-timeout';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase-client';
import { renderStoredAlias } from '@/lib/alias-display';
import {
  mergeComments,
  normaliseComment,
  planVote,
  readCommentPage,
  reconcileVote,
} from '@/lib/comment-thread';

// Create once at module level — stable reference, no new object on every render
const supabase = createClient();

/**
 * One comment row.
 *
 * **This must stay at module scope.** It used to be declared inside
 * `CommentSection`'s render body, which made it a *different function* on every
 * render — and React compares element types by identity, so the whole list was
 * unmounted and remounted each time. `key` cannot help: keys reconcile siblings
 * of the same type, and the type is what changed.
 *
 * `CommentSection` re-renders on every keystroke (the textarea is controlled by
 * state in it), so typing one character into the reply box reset every row's
 * `useState` — the vote arrows un-highlighted and the counts reverted, while
 * the votes stayed recorded server-side. The user was then looking at a screen
 * that disagreed with the database, and clicking the arrow again *removed* the
 * vote she had cast.
 *
 * `memo` is the second half: with a stable type, a keystroke in the composer no
 * longer re-renders every row in a long thread.
 *
 * The vote state now lives in the parent's `comments` array rather than in this
 * component. Per-row `useState` seeded from a prop is what made the reset
 * invisible — the row looked like it owned the truth, and the server owned it.
 */
const CommentItem = React.memo(function CommentItem({ comment, dateLocale, onVote, voteLabels }) {
  const createdAt = comment.created_at ? new Date(comment.created_at) : null;
  const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());

  return (
    <div className="flex gap-3 p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => onVote(comment.id, 1)}
          className={`text-slate-400 hover:text-pink-500 ${comment.userVote === 1 ? 'text-pink-500' : ''}`}
          aria-label={voteLabels.up}
          aria-pressed={comment.userVote === 1}
        >
          <ArrowUp size={16} />
        </button>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{comment.upvotes}</span>
        <button
          type="button"
          onClick={() => onVote(comment.id, -1)}
          className={`text-slate-400 hover:text-blue-500 ${comment.userVote === -1 ? 'text-blue-500' : ''}`}
          aria-label={voteLabels.down}
          aria-pressed={comment.userVote === -1}
        >
          <ArrowDown size={16} />
        </button>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            {renderStoredAlias(comment.author_alias)}
          </span>
          {hasValidDate && (
            <>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-400">
                {formatDistanceToNow(createdAt, { addSuffix: true, locale: dateLocale })}
              </span>
            </>
          )}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );
});

export default function CommentSection({
  postId,
  initialComments = [],
  initialHasMore = false,
  initialCursor = null,
}) {
  const locale = useLocale();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const t = useTranslations('Community');
  const { getToken } = useAuth();

  const [comments, setComments] = useState(() => initialComments.map((row) => normaliseComment(row, row?.userVote)));
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // `useState(initialComments)` captured the prop once and ignored every later
  // value. The post page carries `export const revalidate = 60`, so a
  // revalidated render produced fresh server data that this list never saw.
  useEffect(() => {
    setComments(initialComments.map((row) => normaliseComment(row, row?.userVote)));
    setNextCursor(initialCursor);
    setHasMore(initialHasMore);
  }, [initialComments, initialCursor, initialHasMore]);

  useEffect(() => {
    const channel = supabase.channel(`public:forum_comments:post_id=eq.${postId}`);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forum_comments', filter: `post_id=eq.${postId}` },
        (payload) => {
          // `mergeComments` de-duplicates by id and preserves the reader's own
          // vote, so a realtime echo of a comment she has already voted on does
          // not reset her arrow. Both write paths previously carried their own
          // inline `some(c => c.id === …)` guard — the same check written twice,
          // and neither handled a row with no id.
          setComments((current) => mergeComments(current, normaliseComment(payload.new)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetchWithTimeout('/api/forum/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ postId, content: newComment })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to post comment');
      }

      setNewComment('');
      setComments((current) => mergeComments(current, normaliseComment(data.comment)));
      toast.success(t('comment_posted') || 'Comment posted anonymously!');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ postId, cursor: nextCursor });
      const res = await fetchWithTimeout(`/api/forum/comments?${params.toString()}`);
      const page = readCommentPage(await res.json());

      if (!page.ok) throw new Error('Failed to load more comments');

      setComments((current) => mergeComments(current, page.comments));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      toast.error(t('comments_load_failed') || 'Could not load more comments');
    } finally {
      setIsLoadingMore(false);
    }
  };

  /**
   * `useCallback` so the handler identity is stable across the parent's
   * renders. Without it every memoised row would re-render on each keystroke
   * anyway — for a different reason than the one just fixed, with the same
   * effect.
   */
  const handleVote = useCallback(async (commentId, clickedValue) => {
    let plan = null;

    // The optimistic update is computed from the row's own *current* state
    // inside the updater, not from a value captured when the click happened,
    // so a realtime update landing in between cannot be overwritten with a
    // stale count.
    setComments((current) => current.map((comment) => {
      if (comment.id !== commentId) return comment;
      plan = planVote(comment.userVote, clickedValue);
      return { ...comment, userVote: plan.nextVote, upvotes: comment.upvotes + plan.scoreDelta };
    }));

    if (!plan || plan.scoreDelta === 0) return;
    const applied = plan;

    const revert = () => setComments((current) => current.map((comment) => (
      comment.id === commentId
        ? { ...comment, userVote: applied.previousVote, upvotes: comment.upvotes - applied.scoreDelta }
        : comment
    )));

    try {
      const token = await getToken();
      const res = await fetchWithTimeout('/api/forum/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ itemType: 'comment', itemId: commentId, voteValue: clickedValue })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        revert();
        toast.error(data?.error || t('vote_failed') || 'Vote failed');
        return;
      }

      // Reconcile with what the database reported, when it reported anything.
      // `resolved: false` means the RPC returned no payload, so the optimistic
      // value is the best available — correcting towards a `currentVote` the
      // server never sent would zero a vote that was in fact recorded.
      const settled = reconcileVote(applied.nextVote, data);
      if (settled.corrected) {
        setComments((current) => current.map((comment) => (
          comment.id === commentId
            ? { ...comment, userVote: settled.vote, upvotes: comment.upvotes + settled.scoreDelta }
            : comment
        )));
      }
    } catch (error) {
      revert();
      toast.error(t('vote_failed') || 'Vote failed');
    }
  }, [getToken, t]);

  const voteLabels = useMemo(() => ({
    up: t('upvote_comment') || 'Upvote comment',
    down: t('downvote_comment') || 'Downvote comment',
  }), [t]);

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        {t('comments') || 'Comments'} ({comments.length}{hasMore ? '+' : ''})
      </h3>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="mb-6 relative">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t('write_comment') || 'Share your thoughts anonymously...'}
          aria-label={t('write_comment') || 'Write your comment anonymously'}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 pr-12 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none"
          rows={3}
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={isSubmitting || !newComment.trim()}
          className="absolute bottom-4 right-4 p-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label={t('submit_comment') || 'Submit comment'}
        >
          <Send size={18} />
        </button>
      </form>

      {/* Comments List */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {comments.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            {t('no_comments') || 'No comments yet. Be the first to share!'}
          </div>
        ) : (
          comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              dateLocale={dateLocale}
              onVote={handleVote}
              voteLabels={voteLabels}
            />
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          className="mt-4 w-full py-3 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
        >
          {isLoadingMore && <Loader2 size={16} className="animate-spin" />}
          {t('load_more_comments') || 'Load more comments'}
        </button>
      )}
    </div>
  );
}
