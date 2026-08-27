/**
 * user-export.js — paging, envelope and cache policy for `GET /api/user/export`.
 *
 * ## Why this module exists
 *
 * The export route fetched a user's whole profile, whole cycle history and
 * whole daily-log table, materialised all of it in memory, serialised it to
 * JSON and buffered it into one response:
 *
 *     const { data: logs } = await supabase.from('daily_logs').select('*').eq('user_id', userId)
 *     return NextResponse.json({ profile: profile || {}, cycles: cycles || [], logs: logs || [] })
 *
 * `daily_logs` grows one row per tracked day per user, forever. A long-standing
 * account therefore produces a multi-megabyte body from a function with a fixed
 * memory budget, and there was no rate limit in front of it — unlike the two
 * sibling exports, `/api/export-data` and `/api/privacy/export`, which both
 * open with `crudLimiter.check(request)`.
 *
 * The response shape was wrong in a second, quieter way: errors came back as
 * `{ success: false, error }` but success came back as a bare
 * `{ profile, cycles, logs }`. A client that checks `data.success` — which is
 * what every other consumer in this codebase does — read a successful export
 * as a failure.
 *
 * This module owns the parts of the fix that must behave identically in the
 * route and in `scripts/test-user-export.js`: how a page is resolved, how a
 * cursor round-trips, what the envelope looks like, and which headers a
 * response full of personal health data has to carry.
 */

/** Rows per page when the caller does not ask for a specific size. */
export const DEFAULT_EXPORT_LIMIT = 500

/**
 * Hard ceiling on a single page. A caller asking for more is clamped rather
 * than refused: the request is reasonable, the size is not.
 */
export const MAX_EXPORT_LIMIT = 2000

/**
 * Headers for any response carrying cycle dates, symptoms or moods.
 *
 * `lib/security-headers.mjs` already lists `/api/user/export` in
 * `SENSITIVE_API_PREFIXES`, but that applies at the edge. Setting them on the
 * response too means the policy survives a direct hit that bypasses the
 * middleware, and makes the intent visible at the route.
 */
export const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
})

/** PostgREST's "no rows returned" code, raised by `.single()` on an empty set. */
export const NO_ROWS_CODE = 'PGRST116'

/**
 * Prefix marking a value as one of our cursors rather than a bare number a
 * caller happened to type into the query string.
 */
const CURSOR_PREFIX = 'r'

/**
 * Encodes a page offset into a cursor.
 *
 * Deliberately not base64: this module runs in the browser as well as in the
 * route (the download loop below uses it), and `Buffer` is not available
 * there. A prefixed decimal is URL-safe as-is, needs no polyfill, and stays
 * opaque enough that a client has no reason to construct one by hand.
 *
 * @param {number} offset row offset of the next page
 * @returns {string|null} `null` when there is no next page
 */
export function encodeExportCursor(offset) {
  if (!Number.isFinite(offset) || offset <= 0) return null

  return `${CURSOR_PREFIX}${Math.floor(offset)}`
}

/**
 * Decodes a cursor back into an offset.
 *
 * A malformed, truncated or hand-written cursor resolves to `0` rather than
 * throwing: the worst outcome is that the caller is served the first page
 * again, which is recoverable, while a 500 in the middle of an export is not.
 *
 * @param {unknown} cursor
 * @returns {number} offset, never negative
 */
export function decodeExportCursor(cursor) {
  if (typeof cursor !== 'string') return 0

  const trimmed = cursor.trim()
  if (!trimmed.startsWith(CURSOR_PREFIX)) return 0

  const offset = Number(trimmed.slice(CURSOR_PREFIX.length))
  return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
}

/**
 * Resolves the page a request is asking for.
 *
 * Cycles and logs page independently, because they are wildly different sizes:
 * a user with three years of history has ~36 cycles and ~1000 daily logs, and
 * forcing them onto a shared cursor would make the caller re-request the
 * cycles on every page.
 *
 * @param {URLSearchParams} searchParams
 * @returns {{ limit: number, cycleOffset: number, logOffset: number }}
 */
export function resolveExportPaging(searchParams) {
  const raw = searchParams?.get ? searchParams.get('limit') : null
  const parsed = Number.parseInt(raw, 10)

  let limit = DEFAULT_EXPORT_LIMIT
  if (Number.isFinite(parsed) && parsed > 0) {
    limit = Math.min(parsed, MAX_EXPORT_LIMIT)
  }

  return {
    limit,
    cycleOffset: decodeExportCursor(searchParams?.get ? searchParams.get('cycleCursor') : null),
    logOffset: decodeExportCursor(searchParams?.get ? searchParams.get('logCursor') : null),
  }
}

/**
 * The inclusive row range for a page, in the form Supabase's `.range()` wants.
 *
 * @param {number} offset
 * @param {number} limit
 * @returns {{ from: number, to: number }}
 */
export function pageRange(offset, limit) {
  const from = Math.max(0, Math.floor(offset))
  return { from, to: from + Math.max(1, Math.floor(limit)) - 1 }
}

/**
 * True when a full page came back, which is the only signal that there may be
 * more. A short page is definitively the last one.
 *
 * @param {unknown[]} rows
 * @param {number} limit
 * @returns {boolean}
 */
export function hasMorePages(rows, limit) {
  return Array.isArray(rows) && rows.length >= limit
}

/**
 * Builds the response body.
 *
 * The bare `profile` / `cycles` / `logs` keys are kept at the top level
 * deliberately: the Settings page and the privacy modals write this response
 * straight to a `.json` file the user downloads, so removing them would change
 * what lands on disk. `success` and `data` are added alongside, so a client
 * checking `data.success` — the convention everywhere else in this codebase —
 * finally sees a truthful value.
 *
 * @param {{ profile: object|null, cycles: unknown[], logs: unknown[], limit: number, cycleOffset: number, logOffset: number }} input
 * @returns {object}
 */
export function buildExportPayload({
  profile,
  cycles,
  logs,
  limit,
  cycleOffset = 0,
  logOffset = 0,
} = {}) {
  const cycleRows = Array.isArray(cycles) ? cycles : []
  const logRows = Array.isArray(logs) ? logs : []

  const moreCycles = hasMorePages(cycleRows, limit)
  const moreLogs = hasMorePages(logRows, limit)

  const payload = {
    profile: profile || {},
    cycles: cycleRows,
    logs: logRows,
    pagination: {
      limit,
      hasMore: moreCycles || moreLogs,
      cycles: {
        returned: cycleRows.length,
        hasMore: moreCycles,
        nextCursor: moreCycles ? encodeExportCursor(cycleOffset + cycleRows.length) : null,
      },
      logs: {
        returned: logRows.length,
        hasMore: moreLogs,
        nextCursor: moreLogs ? encodeExportCursor(logOffset + logRows.length) : null,
      },
      // Where each table should resume, whether or not it has more rows.
      //
      // A finished table still needs a position: omitting its cursor from the
      // next request would restart it at offset 0 and hand the caller the same
      // rows a second time, in what the user is told is one copy of their
      // data. Sending the end offset instead yields an empty page, which is
      // what "done" should look like.
      resume: {
        cycleCursor: encodeExportCursor(cycleOffset + cycleRows.length),
        logCursor: encodeExportCursor(logOffset + logRows.length),
      },
    },
  }

  return { success: true, data: payload, ...payload }
}

/**
 * Builds the URL a client should request for the next page, or `null` when the
 * export is complete. Kept here so the loop in the UI and the loop in the tests
 * cannot drift apart.
 *
 * @param {string} basePath e.g. `/api/user/export`
 * @param {object} pagination the `pagination` block from a previous response
 * @returns {string|null}
 */
export function nextPageUrl(basePath, pagination) {
  if (!pagination || !pagination.hasMore) return null

  const params = new URLSearchParams()
  params.set('limit', String(pagination.limit))

  // Both cursors, always -- see the note on `resume` in buildExportPayload.
  if (pagination.resume?.cycleCursor) params.set('cycleCursor', pagination.resume.cycleCursor)
  if (pagination.resume?.logCursor) params.set('logCursor', pagination.resume.logCursor)

  return `${basePath}?${params.toString()}`
}

/**
 * Merges a page into an accumulating export, so a client can assemble the full
 * document from however many pages the server chose to split it into.
 *
 * The profile is taken from the first page only — it is a single row, and a
 * later page repeating it must not overwrite what the caller already has.
 *
 * @param {{ profile: object, cycles: unknown[], logs: unknown[] }|null} accumulated
 * @param {{ profile?: object, cycles?: unknown[], logs?: unknown[] }} page
 * @returns {{ profile: object, cycles: unknown[], logs: unknown[] }}
 */
export function mergeExportPage(accumulated, page) {
  if (!accumulated) {
    return {
      profile: page?.profile || {},
      cycles: Array.isArray(page?.cycles) ? [...page.cycles] : [],
      logs: Array.isArray(page?.logs) ? [...page.logs] : [],
    }
  }

  return {
    profile: accumulated.profile,
    cycles: accumulated.cycles.concat(Array.isArray(page?.cycles) ? page.cycles : []),
    logs: accumulated.logs.concat(Array.isArray(page?.logs) ? page.logs : []),
  }
}

/**
 * Walks every page of the export and returns one assembled document.
 *
 * Lives here rather than in each of the three UI call sites -- the Settings
 * page, `PrivacyModal` and `PrivacySettingsModal` all download this export, and
 * each of them previously issued a single request and saved whatever came back.
 * With the endpoint now paged, a client that does not loop would silently save
 * a truncated copy of the user's health data and call it complete, which is a
 * worse failure than the unbounded response it replaced.
 *
 * @param {(url: string) => Promise<Response>} fetchPage issues one request
 * @param {{ basePath?: string, maxPages?: number }} [options]
 * @returns {Promise<{ profile: object, cycles: unknown[], logs: unknown[], pages: number, complete: boolean }>}
 */
export async function collectFullExport(fetchPage, { basePath = '/api/user/export', maxPages = 200 } = {}) {
  let url = basePath
  let accumulated = null
  let pages = 0
  let complete = false

  while (url && pages < maxPages) {
    const response = await fetchPage(url)

    if (!response || !response.ok) {
      const status = response ? response.status : 'no response'
      throw new Error(`Export request failed (${status})`)
    }

    const body = await response.json()
    accumulated = mergeExportPage(accumulated, body)
    pages += 1

    url = nextPageUrl(basePath, body?.pagination)
    if (!url) complete = true
  }

  return {
    profile: accumulated?.profile || {},
    cycles: accumulated?.cycles || [],
    logs: accumulated?.logs || [],
    pages,
    // False only when the page ceiling was hit, so a caller can warn rather
    // than present a partial export as a whole one.
    complete,
  }
}
