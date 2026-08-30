import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import {
  extractBookmarkedPostIds,
  isValidPostId,
  validateBookmarkPayload,
} from '@/lib/forum-bookmark'

/**
 * GET /api/forum/bookmarks
 *
 * Retrieves the authenticated user's bookmarked forum posts and bookmarked IDs.
 * Strictly private to the owning user.
 */
export async function GET(req) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await crudLimiter.check(req)
    } catch (rateLimitError) {
      logger.warn(`[Rate Limit] Forum bookmarks GET: ${rateLimitError.message}`)
      return NextResponse.json(
        { error: 'Too many requests, please slow down.' },
        { status: 429 }
      )
    }

    const { searchParams } = new URL(req.url)
    const idsOnly = searchParams.get('idsOnly') === '1' || searchParams.get('ids') === '1'

    const supabase = getSupabaseAdmin()

    const { data: bookmarkRows, error: bookmarkError } = await supabase
      .from('forum_bookmarks')
      .select('post_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (bookmarkError) {
      logger.error(`Database error reading bookmarks for user ${userId}:`, bookmarkError.message)
      return NextResponse.json({ success: false, error: 'Failed to load bookmarks' }, { status: 500 })
    }

    const bookmarkedPostIds = extractBookmarkedPostIds(bookmarkRows || [])

    if (idsOnly || bookmarkedPostIds.length === 0) {
      return NextResponse.json({
        success: true,
        posts: [],
        bookmarkedPostIds,
      })
    }

    // Fetch details for the bookmarked posts
    const { data: posts, error: postsError } = await supabase
      .from('forum_posts')
      .select('id, category_id, author_alias, title, content, upvotes, created_at')
      .in('id', bookmarkedPostIds)

    if (postsError) {
      logger.error(`Database error loading saved posts for user ${userId}:`, postsError.message)
      return NextResponse.json({ success: false, error: 'Failed to load saved posts' }, { status: 500 })
    }

    // Sort posts in the same order as bookmarks (newest saved first)
    const postMap = new Map((posts || []).map(p => [p.id, p]))
    const sortedPosts = bookmarkedPostIds
      .map(id => postMap.get(id))
      .filter(Boolean)

    return NextResponse.json({
      success: true,
      posts: sortedPosts,
      bookmarkedPostIds,
    })
  } catch (error) {
    logger.error('Forum bookmarks GET error:', error.message || error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forum/bookmarks
 *
 * Saves a forum post for the authenticated user.
 */
export async function POST(req) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await crudLimiter.check(req)
    } catch (rateLimitError) {
      logger.warn(`[Rate Limit] Forum bookmarks POST: ${rateLimitError.message}`)
      return NextResponse.json(
        { error: 'Too many requests, please slow down.' },
        { status: 429 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch (parseError) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON payload' }, { status: 400 })
    }

    const validation = validateBookmarkPayload(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { postId } = validation.data
    const supabase = getSupabaseAdmin()

    // 1. Verify post exists
    const { data: post, error: postError } = await supabase
      .from('forum_posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle()

    if (postError) {
      logger.error(`Database error checking post ${postId}:`, postError.message)
      return NextResponse.json({ error: 'Failed to verify post' }, { status: 500 })
    }

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // 2. Insert bookmark (or upsert on conflict)
    const { error: insertError } = await supabase
      .from('forum_bookmarks')
      .upsert(
        { user_id: userId, post_id: postId, created_at: new Date().toISOString() },
        { onConflict: 'user_id,post_id' }
      )

    if (insertError) {
      logger.error(`Database error bookmarking post ${postId} for user ${userId}:`, insertError.message)
      return NextResponse.json({ error: 'Failed to bookmark post' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      isBookmarked: true,
      message: 'Post bookmarked',
    }, { status: 200 })
  } catch (error) {
    logger.error('Forum bookmarks POST error:', error.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/forum/bookmarks
 *
 * Removes a saved forum post for the authenticated user.
 */
export async function DELETE(req) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await crudLimiter.check(req)
    } catch (rateLimitError) {
      logger.warn(`[Rate Limit] Forum bookmarks DELETE: ${rateLimitError.message}`)
      return NextResponse.json(
        { error: 'Too many requests, please slow down.' },
        { status: 429 }
      )
    }

    let postId
    const { searchParams } = new URL(req.url)
    const queryPostId = searchParams.get('postId')

    if (queryPostId && isValidPostId(queryPostId)) {
      postId = queryPostId
    } else {
      try {
        const body = await req.json()
        const validation = validateBookmarkPayload(body)
        if (validation.success) {
          postId = validation.data.postId
        }
      } catch {
        // Fallthrough to validation error
      }
    }

    if (!postId || !isValidPostId(postId)) {
      return NextResponse.json({ error: 'Invalid post id' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { error: deleteError } = await supabase
      .from('forum_bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('post_id', postId)

    if (deleteError) {
      logger.error(`Database error removing bookmark ${postId} for user ${userId}:`, deleteError.message)
      return NextResponse.json({ error: 'Failed to remove bookmark' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      isBookmarked: false,
      message: 'Bookmark removed',
    }, { status: 200 })
  } catch (error) {
    logger.error('Forum bookmarks DELETE error:', error.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
