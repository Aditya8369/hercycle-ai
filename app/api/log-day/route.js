import { NextResponse } from 'next/server'
import { getAuthUserId, ensureUserExists } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { eventBus } from '@/lib/events'
import { isoCalendarDate } from '@/lib/date-schemas'
import { sanitizeSymptomList, sanitizeText } from '@/lib/api-helpers'
import {
  MAX_PAGE_SIZE,
  buildKeysetFilter,
  buildPage,
  describeLogError,
  fetchSizeFor,
  resolveLogDate,
  resolveLogPaging,
} from '@/lib/log-cursor'
import { pcodRiskCache } from '@/lib/cache'

/**
 * Turns a Supabase error into a client-safe response and logs the real one.
 *
 * Four places in this file used to return `error.message`, one of them
 * interpolated into a sentence — so a bad `?date=` came back as
 * `invalid input syntax for type date: "hello"` with a 500 on it, and a pooler
 * fault came back with the database hostname.
 *
 * @param {object} error
 * @param {string} context
 * @param {string} userId
 * @returns {Response}
 */
function respondToDatabaseError(error, context, userId) {
  const described = describeLogError(error)
  logger.error(`[Log-day ${context}] ${described.code} for ${userId}: ${error?.message || 'unknown error'}`)
  return NextResponse.json(
    { success: false, message: described.message, code: described.code },
    { status: described.status }
  )
}

/**
 * Re-sanitises a stored row on the way out, so rows written before this
 * endpoint enforced sanitisation cannot still surface raw markup.
 *
 * @param {object} row
 * @returns {object}
 */
function sanitizeLogRow(row) {
  return {
    ...row,
    symptoms: sanitizeSymptomList(row.symptoms),
    mood: row.mood ? sanitizeText(row.mood) : row.mood,
    flow: row.flow ? sanitizeText(row.flow) : row.flow,
    cervical_discharge: row.cervical_discharge ? sanitizeText(row.cervical_discharge) : row.cervical_discharge,
    notes: row.notes ? sanitizeText(row.notes, 1000) : row.notes,
  }
}

const logPostSchema = z.object({
  date: isoCalendarDate({ label: 'date' }),
  symptoms: z.array(z.string()).optional(),
  mood: z.string().nullable().optional(),
  flow: z.string().nullable().optional(),
  cervical_discharge: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  encrypted_data: z.any().optional()
})

// GET /api/log-day — fetch a single day's log (via ?date=...) or paginated lists of daily logs
export async function GET(request) {
  // ============ RATE LIMITING ============
  try {
    await crudLimiter.check(request);
  } catch (rateLimitError) {
    console.warn(`[Rate Limit] Log-day GET endpoint: ${rateLimitError.message}`);
    return NextResponse.json(
      { success: false, message: 'Too many requests, please slow down.' },
      { status: 429 }
    );
  }
  // =======================================

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to GET /api/log-day');
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await ensureUserExists(userId)

    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date')

    const supabaseAdmin = getSupabaseAdmin()

    // If a specific date is requested, retain single-item lookup behavior.
    //
    // `dateParam` used to go straight into `.eq('date', ...)`. `daily_logs.date`
    // is a DATE, so `?date=hello` raised Postgres 22007 and the route returned
    // its message verbatim under a 500. `isISODateString` also rejects
    // 2026-02-31 — the right shape, but not a real day — which the column would
    // have rejected the same way.
    if (dateParam !== null) {
      const parsedDate = resolveLogDate(dateParam)
      if (!parsedDate.ok) {
        logger.warn(`Rejected daily-log lookup for user ${userId}: bad date parameter`)
        return NextResponse.json(
          { success: false, message: parsedDate.error.message, code: 'INVALID_INPUT' },
          { status: parsedDate.error.status }
        )
      }

      const { data, error } = await supabaseAdmin
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('date', parsedDate.date)
        .maybeSingle()

      if (error) {
        return respondToDatabaseError(error, 'GET', userId)
      }

      logger.info(`Successfully fetched daily log for user ${userId}`);
      return NextResponse.json({ success: true, data: data ? sanitizeLogRow(data) : null })
    }

    // Otherwise, support paginated multi-record fetching via Issue #590 requirements.
    //
    // The cursor is decoded and validated here rather than interpolated into a
    // PostgREST filter unparsed: both halves are proved to be a real calendar
    // date and a real UUID before `buildKeysetFilter` ever sees them.
    const paging = resolveLogPaging(url.searchParams)
    if (!paging.ok) {
      logger.warn(`Rejected daily-log page for user ${userId}: bad cursor`)
      return NextResponse.json(
        { success: false, message: paging.error.message, code: 'INVALID_CURSOR' },
        { status: paging.error.status }
      )
    }

    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('daily_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError) {
      logger.error(`Error counting daily logs for user ${userId}:`, countError.message);
    }

    let query = supabaseAdmin
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      // One row beyond the page, so `hasMore` is a fact rather than a guess:
      // `data.length === limit` made a last page that happened to be exactly
      // full advertise a next page that came back empty.
      .limit(fetchSizeFor(paging.limit))

    if (paging.cursor) {
      query = query.or(buildKeysetFilter(paging.cursor))
    }

    const { data: logs, error } = await query

    if (error) {
      return respondToDatabaseError(error, 'GET', userId)
    }

    const page = buildPage(logs || [], paging.limit)
    logger.info(`Successfully fetched ${page.items.length} daily logs for user ${userId}`);

    return NextResponse.json(
      {
        success: true,
        data: page.items.map(sanitizeLogRow),
        pagination: {
          totalCount: totalCount ?? page.items.length,
          limit: paging.limit,
          maxLimit: MAX_PAGE_SIZE,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Error fetching day log:', error.message || error);
    return NextResponse.json({ success: false, message: 'Could not read your daily logs.' }, { status: 500 })
  }
}

// POST /api/log-day — upsert a day's log
export async function POST(request) {
  // ============ RATE LIMITING ============
  try {
    await crudLimiter.check(request);
  } catch (rateLimitError) {
    console.warn(`[Rate Limit] Log-day POST endpoint: ${rateLimitError.message}`);
    return NextResponse.json(
      { success: false, message: 'Too many requests, please slow down.' },
      { status: 429 }
    );
  }
  // =======================================

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to POST /api/log-day');
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    await ensureUserExists(userId)

    let json;
    try {
      json = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in log-day POST: ${parseError.message}`);
      return NextResponse.json({ success: false, message: 'Bad Request: Invalid JSON payload' }, { status: 400 });
    }
    const result = logPostSchema.safeParse(json)
    if (!result.success) {
      logger.warn(`Malformed daily log upsert payload from user ${userId}: ${result.error.message}`);
      return NextResponse.json({ success: false, message: 'Bad Request', details: result.error.errors }, { status: 400 })
    }

    const { date, symptoms, mood, flow, cervical_discharge, notes, encrypted_data } = result.data

    // Sanitize every free-text field before it ever reaches the database:
    // strip HTML/script tags, trim whitespace, and cap custom-symptom
    // length (50 chars) and count (20 items) to prevent stored XSS/injection.
    const sanitizedSymptoms = sanitizeSymptomList(symptoms)
    const sanitizedMood = mood ? sanitizeText(mood) : null
    const sanitizedFlow = flow ? sanitizeText(flow) : null
    const sanitizedCervicalDischarge = cervical_discharge ? sanitizeText(cervical_discharge) : null
    const sanitizedNotes = notes ? sanitizeText(notes, 1000) : null

    const supabaseAdmin = getSupabaseAdmin()

    // Build the upsert payload — only include encrypted_data when the
    // client actually sent it, so this route works whether or not the
    // daily_logs table has been migrated to add the E2EE column yet.
    const upsertPayload = {
      user_id: userId,
      date,
      symptoms: sanitizedSymptoms,
      mood: sanitizedMood,
      flow: sanitizedFlow,
      cervical_discharge: sanitizedCervicalDischarge,
      notes: sanitizedNotes,
      updated_at: new Date().toISOString()
    }
    if (encrypted_data !== undefined && encrypted_data !== null) {
      upsertPayload.encrypted_data = encrypted_data
    }

    const { error } = await supabaseAdmin
      .from('daily_logs')
      .upsert(upsertPayload, { onConflict: 'user_id,date' })

    if (error) {
      return respondToDatabaseError(error, 'POST', userId)
    }

    logger.info(`Successfully upserted daily log for user ${userId}`);

    // Daily logs (symptoms) feed into the PCOD risk calculation alongside
    // cycles, so a new log must invalidate the cache the same way cycle updates
    // already do — otherwise a freshly-logged symptom is invisible to the risk
    // score for up to the cache's 120s TTL.
    //
    // This was four paths to the same invalidation: two direct calls (one of
    // them on a bare `userId`, a key nothing ever writes), an
    // `invalidatePattern` fallback that repeated a third, and the event whose
    // handler does it again. `invalidatePattern` is a *prefix* match, so
    // `pcod-risk:user_12` also cleared `pcod-risk:user_123`.
    //
    // One exact key, and the event — which exists so other subscribers can react
    // to a log, not as a second cache path.
    pcodRiskCache.invalidate(`pcod-risk:${userId}`);
    eventBus.emit('daily_logs:updated', { userId });

    return NextResponse.json({ success: true, message: 'Day logged successfully!' })
  } catch (error) {
    logger.error('Error logging day:', error.message || error);
    return NextResponse.json({ success: false, message: 'Could not save your daily log.' }, { status: 500 })
  }
}
