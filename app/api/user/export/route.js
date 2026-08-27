import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import {
  NO_STORE_HEADERS,
  buildExportPayload,
  pageRange,
  resolveExportPaging,
} from '@/lib/user-export'

// This response is assembled per request from one user's rows. Caching a
// rendered version of it, at any layer, would be a mistake.
export const dynamic = 'force-dynamic'

/**
 * Returns one page of a user's exportable data.
 *
 * Previously this fetched the whole profile, the whole cycle history and the
 * whole `daily_logs` table in one go, with no rate limit in front of it — three
 * unbounded scans per call, from an endpoint any refresh loop could hammer.
 * `daily_logs` grows one row per tracked day forever, so a long-standing
 * account produced a multi-megabyte body from a function with a fixed memory
 * budget.
 *
 * Cycles and logs page independently: three years of history is roughly 36
 * cycles and 1000 logs, and a shared cursor would make a caller re-request the
 * cycles on every page.
 */
export async function GET(request) {
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] User export endpoint: ${rateLimitError.message}`)
    return NextResponse.json(
      { success: false, error: 'Too many export requests, please slow down.' },
      { status: 429, headers: NO_STORE_HEADERS }
    )
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const { limit, cycleOffset, logOffset } = resolveExportPaging(
      new URL(request.url).searchParams
    )

    const supabase = getSupabaseAdmin()

    // `.single()` raises PGRST116 for every brand-new account, which the old
    // code had to special-case. `.maybeSingle()` returns null without an error,
    // so a genuine database fault is the only thing left in `error`.
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (profileError) {
      logger.error('Error fetching user profile for export:', profileError)
      return databaseError()
    }

    const cycleWindow = pageRange(cycleOffset, limit)
    const { data: cycles, error: cyclesError } = await supabase
      .from('cycles')
      .select('*')
      // Deterministic ordering is what makes offset paging correct; without it
      // Postgres may return the same row on two pages and skip another.
      .eq('user_id', userId)
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .range(cycleWindow.from, cycleWindow.to)

    if (cyclesError) {
      logger.error('Error fetching user cycles for export:', cyclesError)
      return databaseError()
    }

    const logWindow = pageRange(logOffset, limit)
    const { data: logs, error: logsError } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(logWindow.from, logWindow.to)

    if (logsError) {
      logger.error('Error fetching user logs for export:', logsError)
      return databaseError()
    }

    const payload = buildExportPayload({
      profile,
      cycles,
      logs,
      limit,
      cycleOffset,
      logOffset,
    })

    logger.info(
      `Export page served for user ${userId} (cycles: ${payload.cycles.length}, logs: ${payload.logs.length})`
    )

    return NextResponse.json(payload, { status: 200, headers: NO_STORE_HEADERS })
  } catch (err) {
    logger.error('Data Export GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}

/**
 * A database fault, reported without echoing the driver's message — which can
 * name columns and constraints the caller has no business seeing.
 *
 * @returns {NextResponse}
 */
function databaseError() {
  return NextResponse.json(
    { success: false, error: 'Database error' },
    { status: 500, headers: NO_STORE_HEADERS }
  )
}
