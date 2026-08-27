import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { crudLimiter } from '@/lib/rateLimiter'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import {
  buildInsertRecord,
  buildUpdateRecord,
  mergeProfile,
  readProfilePatch,
} from '@/lib/profile-merge'

/**
 * Postgres unique-violation. Raised when two concurrent first-time saves both
 * find no row and both try to insert; the loser retries as an update.
 */
const UNIQUE_VIOLATION = '23505'

/** Columns the client is allowed to read back. */
const PROFILE_COLUMNS =
  'user_id, age, weight_kg, height_cm, cycle_length, known_conditions, cycle_goal, allow_ai_analysis, updated_at'

export async function GET(request) {
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Profile GET endpoint: ${rateLimitError.message}`)
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching user profile:', error)
      return jsonError('Database error', 500)
    }

    return jsonSuccess({ profile: data || {}, ...(data || {}) })
  } catch (err) {
    logger.error('Profile GET error:', err)
    return jsonError('Internal Server Error', 500)
  }
}

/**
 * Applies a partial profile update.
 *
 * This route used to parse the body with a Zod schema carrying `.default(...)`
 * values and then upsert the whole row it built from the result. Because every
 * caller sends a subset, that wrote defaults over columns nobody mentioned:
 *
 *  - `PrivacySettingsModal` posts only `{ allow_ai_analysis }`, so toggling the
 *    AI switch cleared the user's age, weight, height, conditions and goal;
 *  - `HealthProfileSettings` posts no `allow_ai_analysis`, so saving the health
 *    form flipped a stored opt-*out* back to `true` and re-enabled the model
 *    call that `app/api/chat/route.js` gates on that flag.
 *
 * `readProfilePatch` now reports only the columns the body actually mentions,
 * and the write path below touches only those. An absent key cannot reach the
 * database; an explicit `null` still can, because clearing a field is a real
 * instruction and has to remain expressible.
 */
export async function POST(request) {
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Profile POST endpoint: ${rateLimitError.message}`)
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    let body
    try {
      body = await request.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in profile POST: ${parseError.message}`)
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    const { ok, patch, errors, touched } = readProfilePatch(body)
    if (!ok) {
      return jsonError(errors[0], 400, null, errors.length > 1 ? errors : null)
    }

    const supabase = getSupabaseAdmin()
    const saved = await writeProfilePatch(supabase, userId, patch)

    if (!saved.ok) {
      logger.error('Error saving user profile:', saved.error)
      return jsonError('Database error', 500)
    }

    logger.info(`Profile updated for user ${userId} (fields: ${touched.join(', ')})`)

    const profile = saved.profile
    return jsonSuccess({ profile, ...profile, updatedFields: touched })
  } catch (err) {
    logger.error('Profile POST error:', err)
    return jsonError('Internal Server Error', 500)
  }
}

/**
 * Writes `patch` for `userId`, touching no other column.
 *
 * `UPDATE` is attempted first because it names only the patched columns, so a
 * concurrent write to a *different* field cannot be clobbered — which an
 * upsert of a whole row would do. `INSERT` runs only when no row matched, and
 * a unique violation from a racing first-time save falls back to `UPDATE`.
 *
 * @param {object} supabase Supabase admin client
 * @param {string} userId
 * @param {object} patch from `readProfilePatch`
 * @returns {Promise<{ ok: true, profile: object } | { ok: false, error: object }>}
 */
async function writeProfilePatch(supabase, userId, patch) {
  const updated = await supabase
    .from('user_profiles')
    .update(buildUpdateRecord(patch))
    .eq('user_id', userId)
    .select(PROFILE_COLUMNS)

  if (updated.error) {
    return { ok: false, error: updated.error }
  }

  if (Array.isArray(updated.data) && updated.data.length > 0) {
    return { ok: true, profile: updated.data[0] }
  }

  const insertRecord = buildInsertRecord(userId, patch)
  const inserted = await supabase
    .from('user_profiles')
    .insert(insertRecord)
    .select(PROFILE_COLUMNS)

  if (!inserted.error) {
    const row = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data
    return { ok: true, profile: row || insertRecord }
  }

  if (inserted.error.code !== UNIQUE_VIOLATION) {
    return { ok: false, error: inserted.error }
  }

  // Another request created the row between our UPDATE and our INSERT. Re-run
  // the update so the patch still lands, and merge locally if the retry also
  // returns no representation.
  const retried = await supabase
    .from('user_profiles')
    .update(buildUpdateRecord(patch))
    .eq('user_id', userId)
    .select(PROFILE_COLUMNS)

  if (retried.error) {
    return { ok: false, error: retried.error }
  }

  const row = Array.isArray(retried.data) ? retried.data[0] : retried.data
  return { ok: true, profile: mergeProfile(row, patch) }
}
