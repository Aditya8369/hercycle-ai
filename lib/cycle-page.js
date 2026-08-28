/**
 * cycle-page.js — the read contract for `GET /api/cycles`.
 *
 * ## The bug this exists to prevent
 *
 * The cycles read handler ended with
 *
 *     return NextResponse.json(paginatedResult, { status: 200 })
 *
 * in a file that never imported `NextResponse`. Every read of the cycle list —
 * the record the dashboard, the calendar, the prediction and the PCOD risk
 * view all hang off — threw `ReferenceError: NextResponse is not defined`, was
 * swallowed by the outer `catch`, and came back as a 500.
 *
 * The client did not surface that. `OfflineContext.fetchCycles` reads
 * `data.success`, finds `false`, skips the refresh block without throwing, and
 * falls through to the IndexedDB mirror — so a user with a warm cache saw stale
 * cycles indefinitely and a user on a new device saw an empty account.
 *
 * And the one-line fix — importing `NextResponse` — would have made it worse.
 * The handler had been migrated to `formatPaginatedResponse`, which produces
 *
 *     { success, data: [ ...rows ], pagination: { … } }
 *
 * while the client reads `data.data.cycles`. With the import in place
 * `data.success` becomes `true`, `data.data.cycles` is `undefined`,
 * `decryptRecords(undefined)` returns `[]` by design, and that `[]` reaches
 * `cacheRecords('cycles', [])` → `replaceAll` → **the offline mirror is
 * cleared**. A stale-cache bug would have become a cache-wipe on every load.
 *
 * The two branches of the same handler also disagreed about the shape: the
 * database-error path returned `{ cycles, nextPeriodDate, confidence,
 * averageCycleLength }` nested under `data`, the success path returned a bare
 * array. Whichever was right, they could not both be.
 *
 * ## What lives here
 *
 * The parts of that read which are decisions about untrusted input and about
 * response shape, rather than I/O: cursor encoding, cursor validation, and the
 * envelope both branches must produce. The route applies them; this module
 * decides them, and `scripts/test-cycle-page.js` exercises them without a
 * database.
 *
 * ## Why the cursor is validated rather than interpolated
 *
 * The previous cursor was the raw string `${start_date}_${id}`, split on `_`
 * and dropped straight into a PostgREST filter:
 *
 *     query.or(`start_date.lt.${cursorDate},and(start_date.eq.${cursorDate},id.lt.${cursorId})`)
 *
 * `,`, `(`, `)` and `.` are all filter syntax. A cursor containing any of them
 * produced a malformed filter, PostgREST answered 400, and the route's
 * `error && error.code !== 'PGRST116'` branch returned **200 with an empty
 * list** — a hand-edited or stale cursor told the user she had no cycles.
 *
 * `lib/forum-query.js` already refuses to allow that shape on the forum side.
 * This is the same discipline applied to the other paged endpoint: decode,
 * validate both halves against what they are (a real calendar day, a UUID),
 * and treat anything unusable as "start from the beginning" rather than as an
 * empty result.
 *
 * No imports beyond `date-utils`, so this is usable from Route Handlers,
 * Server Components and plain Node scripts alike.
 */

import { isISODateString } from './date-utils.js'

/** Page size when the caller does not ask for one. */
export const DEFAULT_CYCLE_PAGE_SIZE = 12

/**
 * Hard ceiling on page size.
 *
 * Cycles carry `encrypted_data`, so a row is not small. Without a ceiling,
 * `?limit=100000` is a way to make the server serialise — and the client
 * decrypt — an entire history on every request.
 */
export const MAX_CYCLE_PAGE_SIZE = 100

/** Separator inside the decoded cursor. Neither half can contain it. */
const CURSOR_SEPARATOR = '|'

/**
 * A canonical UUID. `cycles.id` is `uuid`, so anything else is either a typo or
 * an attempt to reach the filter string, and Postgres would raise 22P02 for it
 * either way.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * True when `value` is a usable `cycles.id`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCycleId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Base64-encodes a string in whichever runtime this is called from.
 *
 * `btoa` is byte-oriented and throws on anything outside Latin-1, so the
 * payload is percent-encoded first. Node gets `Buffer`. The encoding is not a
 * security boundary — it exists so the value reads as an opaque token rather
 * than as an invitation to hand-edit a timestamp in the address bar — and the
 * decoder validates the contents regardless.
 *
 * @param {string} raw
 * @returns {string}
 */
function toBase64(raw) {
  if (typeof btoa === 'function') return btoa(encodeURIComponent(raw))
  return Buffer.from(raw, 'utf8').toString('base64')
}

/**
 * The inverse of `toBase64`. Returns `null` rather than throwing on malformed
 * input, because the caller's response to "this cursor is broken" is to start
 * from the beginning, not to fail the request.
 *
 * @param {string} encoded
 * @returns {string|null}
 */
function fromBase64(encoded) {
  try {
    if (typeof atob === 'function') return decodeURIComponent(atob(encoded))
    return Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return null
  }
}

/**
 * Encodes a keyset cursor from the last row of a page.
 *
 * `(start_date, id)` rather than `start_date` alone: two cycles can share a
 * start date (a duplicate write, a correction, a seeded account), and a cursor
 * on the date alone would either skip the second row or repeat the first
 * across a page boundary.
 *
 * @param {{ start_date?: string, id?: string }} row
 * @returns {string|null} `null` when the row cannot anchor a cursor
 */
export function encodeCycleCursor(row) {
  if (!row) return null
  if (!isISODateString(row.start_date)) return null
  if (!isCycleId(row.id)) return null

  return toBase64(`${row.start_date}${CURSOR_SEPARATOR}${row.id}`)
}

/**
 * Decodes and validates a keyset cursor.
 *
 * Every failure mode — malformed base64, a missing separator, a date that is
 * not a real calendar day, an id that is not a UUID — returns `null`. The
 * route reads `null` as "no cursor", which serves the first page. That is the
 * right degradation: a stale bookmark should show the newest cycles, not an
 * empty history and not a 500.
 *
 * @param {unknown} cursor
 * @returns {{ startDate: string, id: string }|null}
 */
export function decodeCycleCursor(cursor) {
  if (typeof cursor !== 'string' || cursor === '') return null

  const decoded = fromBase64(cursor)
  if (decoded === null) return null

  // Split on the first separator. A `YYYY-MM-DD` date can never contain `|`
  // and neither can a UUID, so a second one means the token is malformed.
  const at = decoded.indexOf(CURSOR_SEPARATOR)
  if (at <= 0 || at === decoded.length - 1) return null

  const startDate = decoded.slice(0, at)
  const id = decoded.slice(at + 1)

  // Both halves are validated for what they *are*, not merely for being
  // non-empty. This is the check whose absence let filter syntax through.
  if (!isISODateString(startDate)) return null
  if (!isCycleId(id)) return null

  return { startDate, id }
}

/**
 * Clamps a requested page size.
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function normaliseCycleLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_CYCLE_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_CYCLE_PAGE_SIZE
  return Math.min(MAX_CYCLE_PAGE_SIZE, Math.max(1, Math.floor(parsed)))
}

/**
 * Turns raw request parameters into a validated query description.
 *
 * @param {URLSearchParams|Record<string, unknown>} params
 * @returns {{ limit: number, cursor: {startDate: string, id: string}|null }}
 */
export function parseCycleQuery(params) {
  const read = (key) => (typeof params?.get === 'function' ? params.get(key) : params?.[key])

  return {
    limit: normaliseCycleLimit(read('limit')),
    cursor: decodeCycleCursor(read('cursor')),
  }
}

/**
 * Builds the keyset predicate for the row *after* the cursor, newest first.
 *
 * The condition is a tuple comparison — "an earlier start date, or the same
 * date with a smaller id" — which a single `.lt()` cannot express:
 *
 *     (start_date, id) < (cursor.startDate, cursor.id)
 *
 * Both values are quoted so PostgREST reads them as literals, and both have
 * already been validated by `decodeCycleCursor`, so nothing that could be read
 * as filter syntax can reach this string. The quoting is defence in depth, not
 * the primary control.
 *
 * @param {{startDate: string, id: string}} cursor
 * @returns {string}
 */
export function buildCycleCursorFilter(cursor) {
  const { startDate, id } = cursor
  return `start_date.lt."${startDate}",and(start_date.eq."${startDate}",id.lt."${id}")`
}

/**
 * Builds the payload for a page of cycles.
 *
 * ## Why the shape is `{ cycles, pagination }` and not a bare array
 *
 * `OfflineContext.fetchCycles` reads `data.data.cycles`, and the handler's own
 * error branch already returned `{ cycles, … }` nested under `data`. Keeping
 * the array under a named key means the success path and the fallback path
 * agree, and means a future field (a prediction, a count) can be added without
 * changing the type of `data` out from under the client again.
 *
 * The route asks the database for `limit + 1` rows: the extra row is how
 * "is there more?" is answered without a second `count(*)`, which on a table
 * indexed for `(user_id, start_date)` costs a second scan of the same range.
 * The extra row is trimmed here before it reaches the client.
 *
 * @param {object[]} rows up to `limit + 1` rows, newest first
 * @param {number} limit the page size that was requested
 * @param {number|null} [totalCount] total cycles for this user, when known
 * @returns {{ cycles: object[], pagination: { limit: number, hasMore: boolean, nextCursor: string|null, totalCount: number|null } }}
 */
export function buildCyclePage(rows, limit, totalCount = null) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : []
  const hasMore = safeRows.length > limit
  const cycles = hasMore ? safeRows.slice(0, limit) : safeRows

  return {
    cycles,
    pagination: {
      limit,
      hasMore,
      // No next cursor on the last page: handing one back would make the
      // client issue a request guaranteed to return nothing.
      nextCursor: hasMore ? encodeCycleCursor(cycles[cycles.length - 1]) : null,
      totalCount: Number.isFinite(totalCount) ? totalCount : null,
    },
  }
}

/**
 * The payload served when the cycle list cannot be read.
 *
 * Returned with a 200 deliberately: an empty history and an unreadable history
 * look the same to the dashboard, and the offline mirror is the fallback for
 * both. What matters is that the *shape* matches `buildCyclePage`, so the
 * client's `data.data.cycles` access is valid on every branch — the invariant
 * whose absence is the second half of this bug.
 *
 * @returns {ReturnType<typeof buildCyclePage>}
 */
export function emptyCyclePage() {
  return buildCyclePage([], DEFAULT_CYCLE_PAGE_SIZE, 0)
}

/**
 * True when a payload can safely refresh the offline mirror.
 *
 * `cacheRecords` calls `replaceAll`, which clears the store before it writes.
 * Handing it the result of a shape mismatch — `undefined`, which
 * `decryptRecords` turns into `[]` — therefore *deletes* the user's local
 * cycle history rather than leaving it alone. This is the guard that makes
 * that impossible: the mirror is only replaced when the server actually sent
 * an array of cycles.
 *
 * A genuinely empty array is still a valid refresh — an account with no cycles
 * should not keep showing rows from a previous sign-in — so the check is on
 * the presence of the array, not on its length.
 *
 * @param {unknown} payload the parsed `{ success, data }` response body
 * @returns {boolean}
 */
export function hasUsableCyclePayload(payload) {
  return Boolean(payload?.success) && Array.isArray(payload?.data?.cycles)
}
