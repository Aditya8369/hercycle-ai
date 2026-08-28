import { getAuthUserId, ensureUserExists } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { CHALLENGES, MONTHLY_BADGES, getMonthKey } from '@/lib/challenges-data'
import { resolveRequestDay, startOfMonthISO } from '@/lib/request-day'
import { parseDateValue } from '@/lib/date-utils'
import { calculateBestStreak } from '@/lib/challenge-streaks'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import {
  describeProgressError,
  monthlyBadgeKey,
  planBadgeAwards,
  readAwardedKeys,
  summariseCompletions,
} from '@/lib/challenge-progress'

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

    // Anchor the month to the caller's calendar day.
    //
    // `new Date(y, m, 1).toISOString().slice(0, 10)` built local midnight on
    // the 1st and then read its **UTC** day. East of UTC that instant is still
    // the last day of the *previous* month, so the recap silently widened its
    // window to include a day belonging to the month before.
    const today = resolveRequestDay(request)
    const monthKey = getMonthKey(parseDateValue(today) || new Date())
    const firstOfMonth = startOfMonthISO(today)
    const supabaseAdmin = getSupabaseAdmin()

    const { data: monthRows, error } = await supabaseAdmin
      .from('challenge_progress')
      .select('challenge_type, date, completed')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', firstOfMonth)

    if (error) {
      const clean = describeProgressError(error)
      logger.error(`Database error fetching monthly recap for user ${userId}: ${error.message}`)
      return jsonError(clean.message, clean.status, clean.code)
    }

    const rows = monthRows || []
    const points = rows.reduce((sum, r) => sum + (CHALLENGES[r.challenge_type]?.points || 0), 0)
    const activeDays = new Set(rows.map((r) => r.date)).size
    const stats = summariseCompletions(rows, { bestStreak: calculateBestStreak(rows) })

    // The month's badge keys are enumerated and selected by exact value.
    //
    // This was `.like('badge_key', `%_${monthKey}`)`, in which `_` is a SQL
    // single-character *wildcard*, not a literal underscore -- so the filter
    // matched any key ending in any character followed by the month, which is
    // both wider than intended and unable to use an index. Asking for the four
    // keys that actually exist is narrower, exact, and indexable.
    const monthlyKeys = Object.keys(MONTHLY_BADGES).map((key) => monthlyBadgeKey(key, monthKey))

    const { data: existingBadges, error: badgeReadError } = await supabaseAdmin
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', userId)
      .in('badge_key', monthlyKeys)

    if (badgeReadError) {
      logger.warn(`Could not read monthly badges for user ${userId}: ${badgeReadError.message}`)
    }

    const earnedThisMonth = (existingBadges || []).map((b) => b.badge_key)
    const planned = planBadgeAwards(MONTHLY_BADGES, stats, earnedThisMonth, monthKey)

    let awarded = []
    if (planned.length > 0) {
      // Idempotent, and read back. The previous plain `insert` ignored its
      // result entirely, so a `23505` from a concurrent refresh -- and this is
      // a GET handler, so a refresh *is* a write -- rejected the whole batch
      // while the response still listed every planned badge as earned.
      const { data: created, error: awardError } = await supabaseAdmin
        .from('user_badges')
        .upsert(
          planned.map((badge_key) => ({ user_id: userId, badge_key })),
          { onConflict: 'user_id,badge_key', ignoreDuplicates: true }
        )
        .select('badge_key')

      if (awardError) {
        logger.warn(`Could not award monthly badges for user ${userId}: ${awardError.message}`)
      } else {
        awarded = readAwardedKeys(created, planned)
      }
    }

    logger.info(`Fetched monthly recap for user ${userId}, month ${monthKey}`)
    return jsonSuccess({
      monthKey,
      points,
      activeDays,
      totalCompletions: rows.length,
      // Only badges that are actually held: the ones already on the account
      // plus the ones this request persisted.
      badges: [...new Set([...earnedThisMonth, ...awarded])],
      newBadges: awarded,
    })
  } catch (err) {
    logger.error('Error fetching monthly recap:', err.message || err)
    return jsonError(`Internal Server Error: ${err.message || err}`, 500)
  }
}

