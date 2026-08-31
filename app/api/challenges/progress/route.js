import { getAuthUserId, ensureUserExists } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { CHALLENGES, BADGES } from '@/lib/challenges-data'
import { resolveRequestDay } from '@/lib/request-day'
import { calculateCurrentStreak } from '@/lib/challenge-streaks'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import {
  CHALLENGE_TYPES,
  badgeScanFloor,
  describeProgressError,
  planBadgeAwards,
  planIncrement,
  readAwardedKeys,
  summariseCompletions,
} from '@/lib/challenge-progress'

// The accepted types are derived from CHALLENGES rather than repeated here.
// This enum and `lib/challenges-data.js` were two lists holding the same five
// keys with nothing keeping them together -- and a third copy lives in the
// database CHECK constraint, which is how Iron and Sleep came to be clickable
// in the UI and rejected by Postgres. See
// supabase/10_challenge_types_and_badges.sql.
const progressSchema = z.object({
  challenge_type: z.enum(CHALLENGE_TYPES),
  increment: z.number().int().positive().max(2000),
})

export async function POST(request) {
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    console.warn(`[Rate Limit] Challenges progress POST endpoint: ${rateLimitError.message}`)
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to POST /api/challenges/progress')
      return jsonError('Unauthorized', 401)
    }
    await ensureUserExists(userId)

    // Guarded like every other write route in the app. Unwrapped, a malformed
    // body reached the outer catch and came back as
    // `500 Internal Server Error: Unexpected token ... in JSON at position 0`,
    // echoing the parser's message to the caller.
    let json
    try {
      json = await request.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in challenge progress POST: ${parseError.message}`)
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    const result = progressSchema.safeParse(json)
    if (!result.success) {
      logger.warn(`Malformed challenge progress payload from user ${userId}: ${result.error.message}`)
      return jsonError('Bad Request', 400, null, result.error.errors)
    }

    const { challenge_type, increment } = result.data
    const target = CHALLENGES[challenge_type].target
    // The caller's calendar day. Recording against the server's UTC day meant a
    // user in UTC+5:30 logging at 02:00 wrote to yesterday's row — and if that
    // day was already complete, `Math.min(existing + increment, target)`
    // discarded the increment with no feedback at all.
    const today = resolveRequestDay(request)
    const supabaseAdmin = getSupabaseAdmin()

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('challenge_progress')
      .select('progress_value, completed')
      .eq('user_id', userId)
      .eq('date', today)
      .eq('challenge_type', challenge_type)
      .maybeSingle()

    if (fetchError) {
      const clean = describeProgressError(fetchError)
      logger.error(`Database error fetching existing progress for user ${userId}: ${fetchError.message}`)
      return jsonError(clean.message, clean.status, clean.code)
    }

    // `discarded` is reported rather than silently swallowed: capping at the
    // target used to return the capped number with nothing saying the tap had
    // done nothing.
    const plan = planIncrement(existing?.progress_value, increment, target)
    const justCompleted = !existing?.completed && plan.completed

    const { error: upsertError } = await supabaseAdmin
      .from('challenge_progress')
      .upsert(
        {
          user_id: userId,
          date: today,
          challenge_type,
          progress_value: plan.value,
          completed: plan.completed,
          completed_at: justCompleted ? new Date().toISOString() : existing?.completed ? undefined : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date,challenge_type' }
      )

    if (upsertError) {
      const clean = describeProgressError(upsertError)
      // The raw driver message is logged, not returned. It used to be handed
      // straight to the browser -- including the table and constraint names
      // from the CHECK violation that made Iron and Sleep unrecordable.
      logger.error(`Database error upserting challenge progress for user ${userId}: ${upsertError.message}`)
      return jsonError(clean.message, clean.status, clean.code)
    }

    let newlyEarnedBadges = []
    if (justCompleted) {
      newlyEarnedBadges = await checkAndAwardBadges(supabaseAdmin, userId, today)
    }

    logger.info(`Successfully updated ${challenge_type} progress for user ${userId}`)
    return jsonSuccess({
      progress_value: plan.value,
      completed: plan.completed,
      // Non-zero when today's goal was already met and part (or all) of the
      // increment could not be applied.
      discarded: plan.discarded,
      newBadges: newlyEarnedBadges,
    })
  } catch (error) {
    logger.error('Error updating challenge progress:', error.message || error)
    return jsonError(`Internal Server Error: ${error.message || error}`, 500)
  }
}

/**
 * Awards any badges the user has newly earned.
 *
 * Never throws: a badge is a reward for work that has already been recorded, so
 * a failure here must not turn a successful completion into an error response.
 */
async function checkAndAwardBadges(supabaseAdmin, userId, today) {
  try {
    // Bounded. This scan was every completed row the user had ever written, on
    // every completion, forever -- to answer three questions whose thresholds
    // are 1, 3 and 5.
    const { data: recentProgress, error: scanError } = await supabaseAdmin
      .from('challenge_progress')
      .select('challenge_type, completed, date')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('date', badgeScanFloor(today))

    if (scanError) {
      logger.warn(`Could not scan progress for badges for user ${userId}: ${scanError.message}`)
      return []
    }

    const rows = recentProgress || []
    const stats = summariseCompletions(rows, { streak: calculateCurrentStreak(rows, today) })

    const { data: existingBadges, error: badgeReadError } = await supabaseAdmin
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', userId)

    if (badgeReadError) {
      logger.warn(`Could not read badges for user ${userId}: ${badgeReadError.message}`)
      return []
    }

    const planned = planBadgeAwards(BADGES, stats, (existingBadges || []).map((b) => b.badge_key))
    if (planned.length === 0) return []

    // Idempotent, and reads back what was actually created.
    //
    // The previous code issued a plain multi-row `insert` and did not
    // destructure its result, so a `23505` from a concurrent request was not
    // merely unhandled -- it was unobservable. Postgres rejects the *whole*
    // multi-row insert on conflict, so a genuinely new badge in the same batch
    // was lost while the route still reported it as earned, and the UI played
    // the unlock animation for a badge the user did not have.
    const { data: created, error: awardError } = await supabaseAdmin
      .from('user_badges')
      .upsert(
        planned.map((badge_key) => ({ user_id: userId, badge_key })),
        { onConflict: 'user_id,badge_key', ignoreDuplicates: true }
      )
      .select('badge_key')

    if (awardError) {
      logger.warn(`Could not award badges for user ${userId}: ${awardError.message}`)
      return []
    }

    return readAwardedKeys(created, planned)
  } catch (err) {
    logger.warn(`Badge award failed for user ${userId}: ${err.message || err}`)
    return []
  }
}

