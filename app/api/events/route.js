import { getAuthUserId } from '@/lib/clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';
import { jsonSuccess, jsonError } from '@/lib/api-helpers';
import {
  MAX_EVENTS_RETURNED,
  describeEventError,
  isUuid,
  readDeleteResult,
  validateEventInput,
} from '@/lib/event-schedule';

export const dynamic = 'force-dynamic';

/** Columns the client is allowed to read back. */
const EVENT_COLUMNS =
  'id, title, description, start_time, end_time, recurrence_rule, category, time_zone, created_at';

/**
 * Rate-limits one request, returning a response when the caller is over budget.
 *
 * @param {Request} request
 * @param {string} method for the log line
 * @returns {Promise<Response|null>}
 */
async function checkRateLimit(request, method) {
  try {
    await crudLimiter.check(request);
    return null;
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Events ${method}: ${rateLimitError.message}`);
    return jsonError('Too many requests, please slow down.', 429);
  }
}

/**
 * Turns a Supabase error into a client-safe response and logs the real one.
 *
 * Every branch of this route used to answer `500 Failed to <verb> event` for
 * everything, including an `id` that was not a UUID and a row that simply did
 * not exist. Both are client mistakes, and reporting them as server faults hid
 * the difference from the calendar, which then had nothing useful to say.
 *
 * @param {object} error the Supabase error
 * @param {string} context for the log line
 * @param {string} userId
 * @returns {Response}
 */
function respondToDatabaseError(error, context, userId) {
  const described = describeEventError(error);
  logger.error(
    `[Events ${context}] ${described.code} for ${userId}: ${error?.message || 'unknown error'}`
  );
  return jsonError(described.message, described.status, described.code);
}

/**
 * Lists the caller's events, newest first, bounded.
 *
 * The old handler had no `.limit()`, so an account with two years of daily
 * reminders shipped its entire history on every page load to render one month.
 */
export async function GET(request) {
  const limited = await checkRateLimit(request, 'GET');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const supabase = getSupabaseAdmin();
    const { data: events, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(MAX_EVENTS_RETURNED);

    if (error) {
      return respondToDatabaseError(error, 'GET', userId);
    }

    const rows = events || [];
    return jsonSuccess({
      events: rows,
      truncated: rows.length >= MAX_EVENTS_RETURNED,
      limit: MAX_EVENTS_RETURNED,
    });
  } catch (error) {
    logger.error(`[Events GET] Exception: ${error.message || error}`);
    return jsonError('Failed to load your calendar', 500);
  }
}

export async function POST(request) {
  const limited = await checkRateLimit(request, 'POST');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in events POST: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400);
    }

    const parsed = validateEventInput(body);
    if (!parsed.ok) {
      return jsonError(parsed.error.message, parsed.error.status, 'INVALID_INPUT', {
        field: parsed.error.field,
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: event, error } = await supabase
      .from('events')
      .insert([{ ...parsed.value, user_id: userId, created_at: new Date().toISOString() }])
      .select(EVENT_COLUMNS)
      .single();

    if (error) {
      return respondToDatabaseError(error, 'POST', userId);
    }

    return jsonSuccess({ event }, { status: 201 });
  } catch (error) {
    logger.error(`[Events POST] Exception: ${error.message || error}`);
    return jsonError('Failed to create the event', 500);
  }
}

/**
 * Applies a partial update.
 *
 * Two things changed beyond validation. The `id` is checked against the UUID
 * shape before the query, because `events.id` is a `UUID` column and anything
 * else makes Postgres raise `22P02` — previously reported as a 500. And the
 * stored row is read first, so `end_time > start_time` can still be enforced
 * when the payload only carries one of the two.
 */
export async function PUT(request) {
  const limited = await checkRateLimit(request, 'PUT');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in events PUT: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400);
    }

    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return jsonError('Event ID is required', 400, 'MISSING_EVENT_ID');
    }
    if (!isUuid(id)) {
      return jsonError('Event ID is not a valid identifier', 400, 'INVALID_EVENT_ID');
    }

    const supabase = getSupabaseAdmin();

    const { data: current, error: readError } = await supabase
      .from('events')
      .select('start_time, end_time')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (readError) {
      return respondToDatabaseError(readError, 'PUT', userId);
    }
    if (!current) {
      // `.eq('user_id', ...)` already scopes the lookup, so "no row" covers both
      // "deleted" and "someone else's" without telling the caller which.
      return jsonError('Event not found', 404, 'EVENT_NOT_FOUND');
    }

    const parsed = validateEventInput(
      { ...body, __currentStartTime: current.start_time, __currentEndTime: current.end_time },
      { partial: true }
    );
    if (!parsed.ok) {
      return jsonError(parsed.error.message, parsed.error.status, 'INVALID_INPUT', {
        field: parsed.error.field,
      });
    }

    const { data: updated, error } = await supabase
      .from('events')
      .update(parsed.value)
      .eq('id', id)
      .eq('user_id', userId)
      .select(EVENT_COLUMNS)
      .single();

    if (error) {
      return respondToDatabaseError(error, 'PUT', userId);
    }

    return jsonSuccess({ event: updated });
  } catch (error) {
    logger.error(`[Events PUT] Exception: ${error.message || error}`);
    return jsonError('Failed to update the event', 500);
  }
}

export async function DELETE(request) {
  const limited = await checkRateLimit(request, 'DELETE');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        id = typeof body?.id === 'string' ? body.id : '';
      } catch {
        // A DELETE with no body is the normal case; the query string is the
        // documented way to pass the id.
      }
    }

    id = typeof id === 'string' ? id.trim() : '';
    if (!id) {
      return jsonError('Event ID is required', 400, 'MISSING_EVENT_ID');
    }
    if (!isUuid(id)) {
      return jsonError('Event ID is not a valid identifier', 400, 'INVALID_EVENT_ID');
    }

    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('events')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return respondToDatabaseError(error, 'DELETE', userId);
    }

    // Without the count this reported success for a row it had not touched, so
    // deleting an already-deleted event refetched into an unchanged calendar
    // under a green toast.
    const { deleted } = readDeleteResult({ count });
    if (!deleted) {
      return jsonError('Event not found', 404, 'EVENT_NOT_FOUND');
    }

    return jsonSuccess({ id }, 'Event deleted');
  } catch (error) {
    logger.error(`[Events DELETE] Exception: ${error.message || error}`);
    return jsonError('Failed to delete the event', 500);
  }
}
