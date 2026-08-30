/**
 * /api/sleep-log — CRUD route for sleep quality tracking.
 *
 * GET    — fetch recent sleep entries (last 30 days)
 * POST   — create or update a sleep log entry
 * DELETE — remove a sleep log entry by id
 */

import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import { z } from 'zod'

const sleepLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  bed_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid bed time format'),
  wake_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid wake time format'),
  quality: z.coerce.number().min(1).max(5),
  duration_minutes: z.coerce.number().min(0).max(1440).optional(),
  position: z.string().max(20).nullable().optional(),
  disturbances: z.array(z.string().max(30)).optional(),
  notes: z.string().max(500).nullable().optional(),
})

/* -------------------------------------------------------------------------- */
/*  GET — fetch recent entries                                                 */
/* -------------------------------------------------------------------------- */

export async function GET(request) {
  try {
    await crudLimiter.check(request)
  } catch {
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)

    const url = new URL(request.url)
    const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90)

    const supabaseAdmin = getSupabaseAdmin()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoff = cutoffDate.toISOString().split('T')[0]

    const { data, error } = await supabaseAdmin
      .from('sleep_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', cutoff)
      .order('date', { ascending: false })
      .limit(90)

    if (error) {
      logger.error(`Unable to fetch sleep logs for ${userId}:`, error.message)
      return jsonError(error.message, 500)
    }

    return jsonSuccess(data || [])
  } catch (error) {
    logger.error('Sleep GET failed:', error.message || error)
    return jsonError('Failed to fetch sleep history.', 500)
  }
}

/* -------------------------------------------------------------------------- */
/*  POST — create or upsert a sleep entry                                     */
/* -------------------------------------------------------------------------- */

export async function POST(request) {
  try {
    await crudLimiter.check(request)
  } catch {
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)

    let json
    try {
      json = await request.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in sleep POST: ${parseError.message}`)
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    const parsed = sleepLogSchema.safeParse(json)
    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join('; ')
      logger.warn(`Validation failed for sleep POST from user ${userId}: ${errorMessage}`)
      return jsonError(errorMessage || 'Please check the entered values.', 400, 'INVALID_INPUT', parsed.error.flatten())
    }

    const { date, bed_time, wake_time, quality, duration_minutes, position, disturbances, notes } = parsed.data
    const duration = duration_minutes || (() => {
      const [bH, bM] = bed_time.split(':').map(Number)
      const [wH, wM] = wake_time.split(':').map(Number)
      const bedMin = bH * 60 + bM
      const wakeMin = wH * 60 + wM
      return wakeMin >= bedMin ? wakeMin - bedMin : (1440 - bedMin) + wakeMin
    })()

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('sleep_logs')
      .upsert(
        {
          user_id: userId,
          date,
          bed_time,
          wake_time,
          quality,
          duration_minutes: duration,
          position: position || null,
          disturbances: disturbances || [],
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single()

    if (error) {
      logger.error(`Unable to save sleep log for ${userId}:`, error.message)
      return jsonError(error.message, 500)
    }

    return jsonSuccess(data)
  } catch (error) {
    logger.error('Sleep POST failed:', error.message || error)
    return jsonError('Failed to save the sleep entry.', 500)
  }
}

/* -------------------------------------------------------------------------- */
/*  DELETE — remove a sleep entry                                              */
/* -------------------------------------------------------------------------- */

export async function DELETE(request) {
  try {
    await crudLimiter.check(request)
  } catch {
    return jsonError('Too many requests, please slow down.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)

    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) return jsonError('Entry ID is required.', 400)

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('sleep_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      logger.error(`Unable to delete sleep log for ${userId}:`, error.message)
      return jsonError(error.message, 500)
    }

    return jsonSuccess(null, 'Sleep entry deleted.')
  } catch (error) {
    logger.error('Sleep DELETE failed:', error.message || error)
    return jsonError('Failed to delete the sleep entry.', 500)
  }
}
