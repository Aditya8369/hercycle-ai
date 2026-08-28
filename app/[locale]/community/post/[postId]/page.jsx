import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { getTranslations } from 'next-intl/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import CommentSection from '@/components/community/CommentSection';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { ArrowLeft, User } from 'lucide-react';
import { renderStoredAlias } from '@/lib/alias-display';
import { DEFAULT_COMMENT_PAGE_SIZE, buildCommentPage, isForumId } from '@/lib/comment-thread';

import MarkdownRenderer from '@/components/editor/MarkdownRenderer';

export const revalidate = 60;

export default async function PostPage({ params }) {
  const { locale, postId } = await params;
  const dateLocale = locale === 'hi' ? hi : enUS;
  const t = await getTranslations('Community');
  const supabase = getSupabaseAdmin();

  // A `postId` from the URL is untrusted. Handing a non-UUID to a `uuid`
  // column makes Postgres raise 22P02, which is a database error for what is
  // simply a bad link — this is a 404 either way, so answer it as one before
  // the query.
  if (!isForumId(postId)) {
    notFound();
  }

  // Fetch post details
  const { data: post, error: postError } = await supabase
    .from('forum_posts')
    .select(`
      *,
      category:forum_categories(name, slug)
    `)
    .eq('id', postId)
    .single();

  if (postError || !post) {
    notFound();
  }

  // Fetch the first page of comments.
  //
  // This had no `.limit()` at all, so every comment ever written on a post was
  // selected, serialised into the RSC payload and shipped to the browser on
  // first paint. On a support forum, a "how did you manage the diagnosis"
  // thread is exactly the kind of post that accumulates hundreds of replies.
  // `limit + 1` is the look-ahead row that answers `hasMore`; the client pages
  // the rest through GET /api/forum/comments.
  const { data: commentRows } = await supabase
    .from('forum_comments')
    .select('id, post_id, author_alias, content, upvotes, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(DEFAULT_COMMENT_PAGE_SIZE + 1);

  // The reader's own votes are not hydrated here: this page is cached
  // (`revalidate = 60`) and shared between viewers, so a per-viewer field must
  // not be baked into it. The client fills them in from the API instead.
  const commentPage = buildCommentPage(commentRows || [], DEFAULT_COMMENT_PAGE_SIZE);

  return (
    <div className="page">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <Link
          href={`/${locale}/community/${post.category?.slug || ''}`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          {t('back_to_category') || `Back to ${post.category?.name || 'Community'}`}
        </Link>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm mb-8">
          <div className="flex items-center gap-3 mb-4 text-sm text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
              <User size={14} />
              {renderStoredAlias(post.author_alias)}
            </div>
            <span>•</span>
            <time dateTime={post.created_at}>
              {formatDistanceToNow(new Date(post.created_at), {
                addSuffix: true,
                locale: dateLocale
              })}
            </time>
            <span>•</span>
            <span className="text-pink-500 font-medium">
              {post.category?.slug ? (t(`cat_${post.category.slug}_name`) || post.category.name) : post.category?.name}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {post.title}
          </h1>

          <MarkdownRenderer content={post.content} />
        </div>

        <CommentSection
          postId={postId}
          initialComments={commentPage.comments}
          initialHasMore={commentPage.hasMore}
          initialCursor={commentPage.nextCursor}
        />
      </div>
      <Footer />
    </div>
  );
}
