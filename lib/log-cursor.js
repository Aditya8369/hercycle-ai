/**
 * log-cursor.js — the keyset cursor and the error vocabulary for
 * `GET /api/log-day`.
 *
 * ## The bugs this exists to fix
 *
 * Three kinds of ordinary bad input reached this endpoint and came back as a
 * `500` quoting either Postgres, PostgREST or the JavaScript runtime.
 *
 * **`?date=hello`.** The parameter went straight into the query:
 *
 *     .eq('date', dateParam)
 *
 * `daily_logs.date` is a `DATE`, so Postgres raised `22007` and the route
 * returned `error.message` verbatim: *invalid input syntax for type date:
 * "hello"*. Every write endpoint validates its dates through `isoCalendarDate`
 * in `lib/date-schemas.js`; this read path never got one, so `2026-02-31` —
 * right shape, not a real day — took the same route.
 *
 * **`?cursor=100%`.** `lib/api-helpers.js` decoded a value that
 * `URLSearchParams.get()` had already decoded, so a literal `%` that is not a
 * valid escape threw `URIError: URI malformed` into the outer catch.
 *
 * **A cursor with a comma in it.** Both halves were interpolated into a
 * PostgREST filter expression without validation:
 *
 *     query.or(`date.lt.${cursorDate},and(date.eq.${cursorDate},id.lt.${cursorId})`)
 *
 * `.eq('user_id', userId)` is ANDed with that, so it was not a cross-account
 * read — but it was unvalidated client input reaching a query language, and
 * every malformed cursor was a 500 carrying the parser's own message.
 *
 * ## The approach
 *
 * A cursor is **opaque and validated**. {@link decodeLogCursor} either returns
 * two values that are provably a real calendar date and a real UUID, or it
 * returns nothing — so {@link buildKeysetFilter} can only ever be handed parts
 * that cannot change the shape of the filter. Anything else is a `400` before a
 * query is issued.
 *
 * Pure: no fetch, no Supabase, no React.
 */

import { isISODateString } from './date-utils.js'

/** Rows per page when the caller does not ask for a size. */
export const DEFAULT_PAGE_SIZE = 30

/** Hard ceiling on a page. A caller asking for more is clamped, not refused. */
export const MAX_PAGE_SIZE = 100

/**
 * Separator between the two halves of a cursor.
 *
 * `_` is what the existing cursors use — `${item.date}_${item.id}` — and
 * neither an ISO date nor a UUID can contain one, so a cursor splits
 * unambiguously. Kept as-is so a page token issued by the previous version is
 * still readable.
 */
const CURSOR_SEPARATOR = '_'

/** Matches a canonical RFC 4122 UUID, which is what `daily_logs.id` is. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Builds the cursor for a row.
 *
 * @param {{date?: string, id?: string}} row
 * @returns {string|null} `null` when the row cannot produce a usable cursor
 */
export function encodeLogCursor(row) {
  if (!row || !isISODateString(row.date) || !isUuid(row.id)) return null
  return `${row.date}${CURSOR_SEPARATOR}${row.id}`
}

/**
 * Reads a cursor, or reports that it is unusable.
 *
 * Both halves are validated against their column types before anything is
 * built from them. That is the whole guarantee this module offers: nothing
 * reaches {@link buildKeysetFilter} that has not been proved to be a calendar
 * date and a UUID.
 *
 * @param {unknown} value
 * @returns {{ok: true, date: string, id: string}|{ok: false, reason: string}}
 */
export function decodeLogCursor(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, reason: 'empty' }
  }

  const trimmed = value.trim()
  const separator = trimmed.indexOf(CURSOR_SEPARATOR)
  if (separator <= 0 || separator === trimmed.length - 1) {
    return { ok: false, reason: 'malformed' }
  }

  const date = trimmed.slice(0, separator)
  const id = trimmed.slice(separator + 1)

  // A real calendar day, not merely the right shape: `isISODateString` rejects
  // 2026-02-31, which the column would reject too — as a 500.
  if (!isISODateString(date)) return { ok: false, reason: 'date' }
  if (!isUuid(id)) return { ok: false, reason: 'id' }

  return { ok: true, date, id }
}

/**
 * True when `value` is a canonical UUID.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/**
 * The PostgREST `or` expression for "strictly after this cursor", under
 * `ORDER BY date DESC, id DESC`.
 *
 * Takes a **decoded** cursor rather than a string, so it is not possible to
 * call it with something that has not been through {@link decodeLogCursor}.
 *
 * The `id` tiebreaker is kept even though `daily_logs` has
 * `UNIQUE (user_id, date)` and so cannot have two rows for one user on one day:
 * the ordering has to stay total if that constraint is ever relaxed, and a
 * validated UUID costs nothing.
 *
 * @param {{date: string, id: string}} cursor
 * @returns {string}
 */
export function buildKeysetFilter(cursor) {
  return `date.lt.${cursor.date},and(date.eq.${cursor.date},id.lt.${cursor.id})`
}

/**
 * Resolves paging from a query string.
 *
 * Replaces `getPaginationParams` for this route. The difference that matters:
 * the cursor is **not** decoded a second time. `URLSearchParams.get()` has
 * already percent-decoded it, so `decodeURIComponent` on the result threw
 * `URIError` for any literal `%` and silently corrupted a legitimate `%25`.
 *
 * @param {URLSearchParams} searchParams
 * @returns {{ok: true, limit: number, cursor: {date: string, id: string}|null}|{ok: false, error: {message: string, field: string, status: number}}}
 */
export function resolveLogPaging(searchParams) {
  const rawLimit = searchParams.get('limit')
  let limit = Number.parseInt(rawLimit, 10)
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = DEFAULT_PAGE_SIZE
  } else if (limit > MAX_PAGE_SIZE) {
    limit = MAX_PAGE_SIZE
  }

  const rawCursor = searchParams.get('cursor')
  if (rawCursor === null || rawCursor === '') {
    return { ok: true, limit, cursor: null }
  }

  const cursor = decodeLogCursor(rawCursor)
  if (!cursor.ok) {
    return {
      ok: false,
      error: { message: 'That page link is not valid. Please start from the first page.', field: 'cursor', status: 400 },
    }
  }

  return { ok: true, limit, cursor: { date: cursor.date, id: cursor.id } }
}

/**
 * Validates a `?date=` lookup.
 *
 * @param {unknown} value
 * @returns {{ok: true, date: string}|{ok: false, error: {message: string, field: string, status: number}}}
 */
export function resolveLogDate(value) {
  if (typeof value !== 'string' || !isISODateString(value)) {
    return {
      ok: false,
      error: { message: 'date must be a real calendar day in YYYY-MM-DD form', field: 'date', status: 400 },
    }
  }
  return { ok: true, date: value }
}

/**
 * Turns an over-fetched result set into one page.
 *
 * The route asked for exactly `limit` rows and reported
 * `hasMore = data.length === limit`, so a last page that happened to be exactly
 * full advertised a `nextCursor` that returned nothing. Fetching one extra row
 * and discarding it is how you actually know.
 *
 * @param {object[]} rows `limit + 1` rows at most
 * @param {number} limit
 * @returns {{items: object[], hasMore: boolean, nextCursor: string|null}}
 */
export function buildPage(rows, limit) {
  const all = Array.isArray(rows) ? rows : []
  const hasMore = all.length > limit
  const items = hasMore ? all.slice(0, limit) : all
  const nextCursor = hasMore ? encodeLogCursor(items[items.length - 1]) : null

  return { items, hasMore: hasMore && nextCursor !== null, nextCursor }
}

/**
 * How many rows to ask the database for, to answer `hasMore` honestly.
 *
 * @param {number} limit
 * @returns {number}
 */
export function fetchSizeFor(limit) {
  return limit + 1
}

/**
 * Maps a Supabase/Postgres error onto a client-safe response descriptor.
 *
 * Four separate places in these two routes returned `error.message` to the
 * caller, one of them interpolated into a sentence:
 *
 *     `Failed to log day: ${error.message}`
 *
 * On a pooler fault that carries the database hostname; on a type error it
 * carries the column type and the offending value.
 *
 * @param {{code?: string}|null} error
 * @returns {{message: string, status: number, code: string}}
 */
export function describeLogError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''

  switch (code) {
    case '22007':
    case '22008':
      return { message: 'That is not a valid date.', status: 400, code: 'INVALID_DATE' }
    case '22P02':
      return { message: 'That page link is not valid.', status: 400, code: 'INVALID_CURSOR' }
    case 'PGRST100':
      // PostgREST could not parse the query string it was handed.
      return { message: 'That page link is not valid.', status: 400, code: 'INVALID_CURSOR' }
    case 'PGRST116':
      return { message: 'No log was found for that day.', status: 404, code: 'LOG_NOT_FOUND' }
    case '22001':
      return { message: 'One of those entries is too long to save.', status: 400, code: 'VALUE_TOO_LONG' }
    case '23503':
      return { message: 'This account is not set up yet, please reload and try again.', status: 409, code: 'MISSING_USER' }
    case '23505':
      return { message: 'A log for that day is already being saved.', status: 409, code: 'DUPLICATE_LOG' }
    case '42P01':
      return { message: 'Daily logging is not available on this deployment yet.', status: 503, code: 'MISSING_TABLE' }
    case '42703':
      return { message: 'Daily logging has not been migrated on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    case '57014':
      return { message: 'That request took too long. Please try again.', status: 504, code: 'QUERY_TIMEOUT' }
    case '08003':
    case '08006':
      return { message: 'Could not reach the database. Please try again.', status: 503, code: 'BACKEND_UNAVAILABLE' }
    default:
      return { message: 'Could not read your daily logs.', status: 500, code: 'LOG_READ_FAILED' }
  }
}
