import { getAuthUserId } from '@/lib/clerk-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { crudLimiter } from '@/lib/rateLimiter';
import { logger } from '@/lib/logger';
import { jsonSuccess, jsonError } from '@/lib/api-helpers';
import {
  DRAFT_TYPES,
  describeDraftError,
  isDraftType,
  readDraftPayload,
  resolveDraftType,
  toClientDraft,
} from '@/lib/draft-store';

/** Columns the client is allowed to read back. */
const DRAFT_COLUMNS = 'draft_type, title, content, category_id, updated_at';

/**
 * Rate-limits one request.
 *
 * Only `POST` was limited before, which is the wrong way round for an endpoint
 * whose `GET` is called on every composer mount and whose `DELETE` is
 * destructive.
 *
 * @param {Request} request
 * @param {string} method
 * @returns {Promise<Response|null>}
 */
async function checkRateLimit(request, method) {
  try {
    await crudLimiter.check(request);
    return null;
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Drafts ${method}: ${rateLimitError.message}`);
    return jsonError('Too many requests, please slow down.', 429);
  }
}

/**
 * Reads `?type=` from the query string.
 *
 * An unrecognised value is refused rather than folded into the default: asking
 * for a draft type that does not exist and being handed a different type's
 * draft is how the composer ended up restoring somebody else's text.
 *
 * @param {Request} request
 * @returns {{ok: true, draftType: string}|{ok: false, response: Response}}
 */
function readDraftTypeParam(request) {
  const raw = new URL(request.url).searchParams.get('type');
  if (raw === null || raw === '') {
    return { ok: true, draftType: resolveDraftType(undefined) };
  }
  if (!isDraftType(raw)) {
    return {
      ok: false,
      response: jsonError(`Draft type must be one of: ${DRAFT_TYPES.join(', ')}`, 400, 'INVALID_DRAFT_TYPE'),
    };
  }
  return { ok: true, draftType: raw };
}

/**
 * Turns a Supabase error into a client-safe response and logs the real one.
 *
 * @param {object} error
 * @param {string} context
 * @param {string} userId
 * @returns {Response}
 */
function respondToDatabaseError(error, context, userId) {
  const described = describeDraftError(error);
  logger.error(`[Drafts ${context}] ${described.code} for ${userId}: ${error?.message || 'unknown error'}`);
  return jsonError(described.message, described.status, described.code);
}

/**
 * Returns the caller's draft **of one type**.
 *
 * This used to be `.eq('user_id', userId).maybeSingle()` with no type filter at
 * all, so whichever draft had been written last came back regardless of which
 * composer was asking.
 */
export async function GET(request) {
  const limited = await checkRateLimit(request, 'GET');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const type = readDraftTypeParam(request);
    if (!type.ok) return type.response;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_drafts')
      .select(DRAFT_COLUMNS)
      .eq('user_id', userId)
      .eq('draft_type', type.draftType)
      .maybeSingle();

    if (error) {
      return respondToDatabaseError(error, 'GET', userId);
    }

    return jsonSuccess({ draft: toClientDraft(data), draftType: type.draftType });
  } catch (error) {
    logger.error(`GET /api/drafts error: ${error.message || error}`);
    return jsonError('Could not load your draft.', 500);
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
      logger.warn(`Malformed JSON payload in drafts POST: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400);
    }

    const parsed = readDraftPayload(body);
    if (!parsed.ok) {
      return jsonError(parsed.error.message, parsed.error.status, 'INVALID_INPUT', {
        field: parsed.error.field,
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_drafts')
      .upsert(
        { ...parsed.value, user_id: userId, updated_at: new Date().toISOString() },
        // The conflict target is the composite key. On `user_id` alone, every
        // composer wrote over the same row: one character in a comment box
        // destroyed a half-written forum post.
        { onConflict: 'user_id,draft_type' }
      )
      .select(DRAFT_COLUMNS)
      .single();

    if (error) {
      return respondToDatabaseError(error, 'POST', userId);
    }

    return jsonSuccess({ draft: toClientDraft(data) });
  } catch (error) {
    logger.error(`POST /api/drafts error: ${error.message || error}`);
    return jsonError('Could not save your draft.', 500);
  }
}

/**
 * Clears the caller's draft of one type.
 *
 * `?type=` selects which. Without it this clears `forum_post`, the type every
 * existing caller means; it used to clear **every** type at once, so publishing
 * a forum post also threw away an unrelated comment draft.
 */
export async function DELETE(request) {
  const limited = await checkRateLimit(request, 'DELETE');
  if (limited) return limited;

  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return jsonError('Unauthorized', 401);
    }

    const type = readDraftTypeParam(request);
    if (!type.ok) return type.response;

    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('user_drafts')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('draft_type', type.draftType);

    if (error) {
      return respondToDatabaseError(error, 'DELETE', userId);
    }

    // Clearing a draft that was never saved is a no-op, not a failure — the
    // editor calls this on every publish whether or not a cloud draft exists.
    return jsonSuccess({ draftType: type.draftType, cleared: Number(count) || 0 }, 'Draft cleared');
  } catch (error) {
    logger.error(`DELETE /api/drafts error: ${error.message || error}`);
    return jsonError('Could not clear your draft.', 500);
  }
}
