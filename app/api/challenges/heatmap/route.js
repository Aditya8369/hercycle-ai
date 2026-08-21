import { getAuthUserId, ensureUserExists } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { resolveRequestDay } from '@/lib/request-day'
import { addDaysISO } from '@/lib/date-utils'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'

// GET /api/challenges/heatmap — completion counts per day for the last 30 days
export async function GET(request) {
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)
    await ensureUserExists(userId)

    const supabaseAdmin = getSupabaseAdmin()
    // The window is anchored to the caller's calendar day so the 30 cells the
    // client renders are exactly the 30 days the server queried. Deriving the
    // bound in UTC left the most recent cell empty for users far from UTC,
    // because the client was asking about a day the query had excluded.
    const today = resolveRequestDay(request)
    const startDate = addDaysISO(today, -29)

    const { data: rows, error } = await supabaseAdmin
      .from('challenge_progress')
      .select('date, completed')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', startDate)

    if (error) {
      logger.error(`Database error fetching heatmap for user ${userId}:`, error.message)
      return jsonError(error.message, 500)
    }

    const counts = {}
    for (const row of rows || []) {
      counts[row.date] = (counts[row.date] || 0) + 1
    }

    logger.info(`Fetched heatmap data for user ${userId}`)
    // `endDate` is returned alongside `startDate` so the client renders the
    // exact window that was queried instead of re-deriving it from its own
    // clock and drifting by a day.
    return jsonSuccess({ counts, startDate, endDate: today })
  } catch (err) {
    logger.error('Error fetching heatmap:', err.message || err)
    return jsonError(`Internal Server Error: ${err.message || err}`, 500)
  }
}