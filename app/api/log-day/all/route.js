

import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { describeLogError } from '@/lib/log-cursor'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 365

/**
 * Parses a query-string integer, clamped, with a default for anything unusable.
 *
 * @param {string|null} raw
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function toBoundedInt(raw, fallback, min, max) {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

// GET /api/log-day/all?page=0&limit=100 — fetch paginated daily logs for the user
export async function GET(request) {
  // ============ RATE LIMITING ============
  try {
    await crudLimiter.check(request);
  } catch (rateLimitError) {
    console.warn(`[Rate Limit] Log-day/all endpoint: ${rateLimitError.message}`);
    return NextResponse.json(
      { success: false, message: 'Too many requests, please slow down.' },
      { status: 429 }
    );
  }
  // =======================================

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to GET /api/log-day/all');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url)
    // `parseInt('abc')` is NaN, and `Math.max(0, NaN)` is NaN — which reaches
    // `.range(NaN, NaN)` and comes back as a PostgREST parse error. Both are
    // now resolved to their defaults rather than propagated.
    const page  = toBoundedInt(searchParams.get('page'), 0, 0, Number.MAX_SAFE_INTEGER)
    const limit = toBoundedInt(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const from  = page * limit
    const to    = from + limit - 1

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error, count } = await supabaseAdmin
      .from('daily_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(from, to)

    if (error) {
      // `error.message` used to be handed straight to the caller here; on a
      // pooler fault it carries the database hostname.
      const described = describeLogError(error)
      logger.error(`[Log-day/all] ${described.code} for ${userId}: ${error.message}`)
      return NextResponse.json(
        { success: false, error: described.message, code: described.code },
        { status: described.status }
      )
    }

    logger.info(`Successfully fetched daily logs (page=${page}, limit=${limit}) for user ${userId}`);
    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? null,
        totalCount: count ?? null,
        hasMore: count != null ? from + limit < count : (data || []).length === limit,
        nextCursor: count != null && from + limit < count ? page + 1 : null,
      },
    })
  } catch (error) {
    logger.error('Error fetching all logs:', error.message || error);
    return NextResponse.json({ success: false, error: 'Could not read your daily logs.' }, { status: 500 })
  }
}
