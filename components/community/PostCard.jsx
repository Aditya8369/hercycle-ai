'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';
import { formatDistanceToNow } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { ArrowUp, ArrowDown, MessageSquare, Bookmark } from 'lucide-react';
import fetchWithTimeout from '@/lib/fetch-with-timeout';
import { renderStoredAlias } from '@/lib/alias-display';
import toast from 'react-hot-toast';

export default function PostCard({ post, locale, initialIsBookmarked = false, onBookmarkToggle }) {

  const dateLocale = locale === 'hi' ? hi : enUS;
  const t = useTranslations('Community');
  const [upvotes, setUpvotes] = useState(post.upvotes || 0);
  const [userVote, setUserVote] = useState(0); // 1 = upvote, -1 = downvote, 0 = none
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked || post.isBookmarked || false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const { isSignedIn, getToken } = useAuth();

  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSignedIn) {
      toast.error(t('login_to_save') || 'Please sign in to save posts');
      return;
    }

    if (isBookmarking) return;

    const previousState = isBookmarked;
    const newState = !previousState;

    setIsBookmarked(newState);
    setIsBookmarking(true);

    try {
      const token = await getToken();
      const res = await fetchWithTimeout('/api/forum/bookmarks', {
        method: newState ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ postId: post.id })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setIsBookmarked(previousState);
        toast.error(data?.error || t('bookmark_error') || 'Could not update bookmark');
        return;
      }

      onBookmarkToggle?.(newState);
      toast.success(
        newState
          ? (t('saved_success') || 'Post saved to your bookmarks')
          : (t('removed_success') || 'Post removed from your bookmarks')
      );
    } catch (error) {
      setIsBookmarked(previousState);
      toast.error(t('bookmark_error') || 'Could not update bookmark');
    } finally {
      setIsBookmarking(false);
    }
  };

  const handleVote = async (e, value) => {
    e.preventDefault();
    e.stopPropagation();

    // Optimistic update
    const previousVote = userVote;
    const previousUpvotes = upvotes;

    let newVote = userVote === value ? 0 : value;
    let upvoteChange = 0;

    if (newVote === 0) {
      // Removing vote
      upvoteChange = -previousVote;
    } else {
      // Changing or adding vote
      if (previousVote === 0) {
        upvoteChange = newVote;
      } else {
        upvoteChange = newVote * 2;
      }
    }

    setUpvotes(prev => prev + upvoteChange);
    setUserVote(newVote);

    try {
      const token = await getToken();
      const res = await fetchWithTimeout('/api/forum/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          itemType: 'post',
          itemId: post.id,
          voteValue: value
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // Revert, and say *why*. A shared "failed to vote" gave the same
        // message for "you are voting too fast", "that post was deleted" and
        // "the database is down".
        setUpvotes(previousUpvotes);
        setUserVote(previousVote);
        toast.error(
          data?.error ||
            t('vote_failed') ||
            'Failed to register vote. Please try again.'
        );
        return;
      }

      // The route reports what the database actually did. `resolved: false`
      // means the RPC succeeded but said nothing, so the optimistic guess
      // stands rather than being overwritten with a value we do not have.
      if (data?.resolved && typeof data.currentVote === 'number' && data.currentVote !== newVote) {
        const correction = data.currentVote - newVote;
        setUpvotes(prev => prev + correction);
        setUserVote(data.currentVote);
      }
    } catch (error) {
      // Revert on failure
      setUpvotes(previousUpvotes);
      setUserVote(previousVote);
      toast.error(t('vote_failed') || 'Failed to register vote. Please try again.');
    }
  };

  return (
    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-4 hover:border-pink-300 dark:hover:border-pink-800 transition-colors shadow-sm">
      <div className="flex gap-4">
        {/* Vote Column */}
        <div className="flex flex-col items-center justify-start gap-1 pt-1 relative z-20">
          <button
            onClick={(e) => handleVote(e, 1)}
            className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${userVote === 1 ? 'text-pink-500' : 'text-slate-400'}`}
            aria-label="Upvote"
          >
            <ArrowUp size={20} />
          </button>
          <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{upvotes}</span>
          <button
            onClick={(e) => handleVote(e, -1)}
            className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${userVote === -1 ? 'text-blue-500' : 'text-slate-400'}`}
            aria-label="Downvote"
          >
            <ArrowDown size={20} />
          </button>
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-700 dark:text-slate-300">
              {renderStoredAlias(post.author_alias)}
            </span>
            <span>•</span>
            <time dateTime={post.created_at}>
              {formatDistanceToNow(new Date(post.created_at), {
                addSuffix: true,
                locale: dateLocale
              })}
            </time>
          </div>

          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-2">
            <Link href={`/${locale}/community/post/${post.id}`} className="hover:text-pink-500 focus:outline-none after:absolute after:inset-0 after:content-['']">
              {post.title}
            </Link>
          </h3>

          <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-3 mb-4">
            {post.content}
          </p>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-sm">
              <MessageSquare size={16} />
              <span>{t('reply') || 'Reply'}</span>
            </div>

            <button
              type="button"
              onClick={handleBookmark}
              disabled={isBookmarking}
              className={`relative z-20 flex items-center gap-1.5 text-sm transition-colors ${
                isBookmarked
                  ? 'text-pink-600 dark:text-pink-400 font-medium'
                  : 'text-slate-500 hover:text-pink-500 dark:text-slate-400 dark:hover:text-pink-400'
              }`}
              aria-label={isBookmarked ? (t('remove_saved') || 'Remove bookmark') : (t('save_post') || 'Save post')}
            >
              <Bookmark size={16} className={isBookmarked ? 'fill-current' : ''} aria-hidden="true" />
              <span>{isBookmarked ? (t('saved') || 'Saved') : (t('save_post') || 'Save')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
