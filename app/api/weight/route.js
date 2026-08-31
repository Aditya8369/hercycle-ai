import { z } from 'zod'

import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { isoCalendarDate } from '@/lib/date-schemas'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import {
  HISTORY_LIMIT,
  computeBmi,
  describeWeightError,
  isStorableBmi,
  orderForChart,
} from '@/lib/weight-history'

const dateSchema = isoCalendarDate({ label: 'recorded_date' })

const weightEntrySchema = z.object({
  recorded_date: dateSchema,
  weight_kg: z
    .coerce.number({ required_error: 'weight_kg is required', invalid_type_error: 'weight_kg must be a number' })
    .min(20, 'weight_kg must be at least 20 kg')
    .max(350, 'weight_kg cannot exceed 350 kg'),
  height_cm: z
    .coerce.number({ required_error: 'height_cm is required', invalid_type_error: 'height_cm must be a number' })
    .min(100, 'height_cm must be at least 100 cm')
    .max(250, 'height_cm cannot exceed 250 cm'),
  waist_cm: z
    .coerce.number({ invalid_type_error: 'waist_cm must be a number' })
    .min(30, 'waist_cm must be at least 30 cm')
    .max(250, 'waist_cm cannot exceed 250 cm')
    .nullable()
    .optional(),
})

/**
 * Turns a Supabase error into a client-safe response and logs the real one.
 *
 * Both handlers used to `return jsonError(error.message, 500)`, which sent the
 * driver's own sentence to the browser — relation name, constraint name, and on
 * a connection fault the pooler host — and reported a bad request as a server
 * fault while doing it.
 *
 * @param {object} error
 * @param {string} context
 * @param {string} userId
 * @returns {Response}
 */
function respondToDatabaseError(error, context, userId) {
  const described = describeWeightError(error)
  logger.error(`[Weight ${context}] ${described.code} for ${userId}: ${error?.message || 'unknown error'}`)
  return jsonError(described.message, described.status, described.code)
}

async function checkRateLimit(request, method) {
  try {
    await crudLimiter.check(request)
    return null
  } catch (error) {
    logger.warn(`[Rate Limit] Weight ${method}: ${error.message}`)
    return jsonError('Too many requests, please slow down.', 429)
  }
}

export async function GET(request) {
  const rateLimitResponse = await checkRateLimit(request, 'GET')
  if (rateLimitResponse) return rateLimitResponse

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Descending, so the LIMIT keeps the *recent* end of the history.
    //
    // This was `ascending: true`, which makes `LIMIT 365` mean "the first 365
    // days this account ever logged". Past that many entries the window stopped
    // moving: the chart froze, `chartData.at(-1)` reported a weight from over a
    // year ago as "current", and a newly saved measurement was committed but
    // absent from the refetch, with nothing in the UI to explain it. The
    // table's own index is `(user_id, recorded_date DESC)`.
    const { data, error } = await supabaseAdmin
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_date', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (error) {
      return respondToDatabaseError(error, 'GET', userId)
    }

    const window = data || []
    // The chart plots oldest-first. Selecting the newest rows and presenting
    // them chronologically are two separate decisions; conflating them is what
    // produced the bug above.
    const entries = orderForChart(window)

    return jsonSuccess(
      entries,
      window.length >= HISTORY_LIMIT
        ? `Showing your most recent ${HISTORY_LIMIT} measurements.`
        : null
    )
  } catch (error) {
    logger.error('Weight GET failed:', error.message || error)
    return jsonError('Failed to fetch weight history.', 500)
  }
}

export async function POST(request) {
  const rateLimitResponse = await checkRateLimit(request, 'POST')
  if (rateLimitResponse) return rateLimitResponse

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    let json;
    try {
      json = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in weight POST: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400);
    }
    const parsed = weightEntrySchema.safeParse(json)

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map(i => i.message).join('; ')
      logger.warn(`Validation failed for weight POST from user ${userId}: ${errorMessage}`)
      return jsonError(errorMessage || 'Please check the entered values.', 400, 'INVALID_INPUT', parsed.error.flatten())
    }

    const { recorded_date, weight_kg, waist_cm = null, height_cm } = parsed.data

    // One BMI implementation, shared with the form. The route rounded to two
    // decimals and `WeightTracker` rounded to one, so the number the user
    // watched while typing was not the number that came back in the chart
    // header: 62 kg at 165 cm showed 22.8 and stored 22.77.
    const bmi = computeBmi(weight_kg, height_cm)

    // `weight_entries` carries CHECK (bmi >= 5 AND bmi <= 100), and the ranges
    // this route already accepts can land outside it — 20 kg at 250 cm is 3.2.
    // Saying so is better than letting Postgres say it with a constraint name.
    if (bmi === null || !isStorableBmi(bmi)) {
      logger.warn(`Rejected out-of-range BMI for user ${userId}: ${String(bmi)}`)
      return jsonError(
        'That height and weight give a BMI outside the range we can record. Please check both values.',
        400,
        'BMI_OUT_OF_RANGE'
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('weight_entries')
      .upsert(
        {
          user_id: userId,
          recorded_date,
          weight_kg,
          waist_cm,
          height_cm,
          bmi,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,recorded_date' }
      )
      .select()
      .single()

    if (error) {
      return respondToDatabaseError(error, 'POST', userId)
    }

    return jsonSuccess(data)
  } catch (error) {
    logger.error('Weight POST failed:', error.message || error)
    return jsonError('Failed to save the weight entry.', 500)
  }
}
