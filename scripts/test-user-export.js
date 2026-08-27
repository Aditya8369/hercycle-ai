/**
 * Regression suite for lib/user-export.js.
 *
 * The bug this is part of fixing: `GET /api/user/export` fetched a user's whole
 * profile, whole cycle history and whole daily-log table, buffered all of it
 * into one response, and had no rate limit in front of it -- unlike the two
 * sibling exports, `/api/export-data` and `/api/privacy/export`, which both
 * open with `crudLimiter.check(request)`.
 *
 * `daily_logs` grows one row per tracked day per user, forever, so the body
 * size was a function of how long somebody had been using the app.
 *
 * The response shape was wrong in a quieter way too: errors came back as
 * `{ success: false, error }` but success came back as a bare
 * `{ profile, cycles, logs }`. A client checking `data.success` -- the
 * convention everywhere else in this codebase -- read a successful export as a
 * failure. Meanwhile the Settings page and the privacy modals write the body
 * straight to a downloaded `.json` file, so the bare keys have to survive.
 *
 * The paging assertions below matter because getting them wrong is worse than
 * not paging at all: an off-by-one in the offset silently drops or duplicates
 * rows in what the user is told is a complete copy of their health data.
 *
 *   node scripts/test-user-export.js
 */

import {
  collectFullExport,
  DEFAULT_EXPORT_LIMIT,
  MAX_EXPORT_LIMIT,
  NO_STORE_HEADERS,
  buildExportPayload,
  decodeExportCursor,
  encodeExportCursor,
  hasMorePages,
  mergeExportPage,
  nextPageUrl,
  pageRange,
  resolveExportPaging,
} from '../lib/user-export.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ${label}`)
  console.error(`       expected: ${JSON.stringify(expected)}`)
  console.error(`       actual:   ${JSON.stringify(actual)}`)
}

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

function checkTruthy(value, label) {
  check(Boolean(value), true, label)
}

const rows = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }))

// ---------------------------------------------------------------------------
// Page size
// ---------------------------------------------------------------------------

console.log('\npage size is bounded whatever the caller asks for')

check(resolveExportPaging(new URLSearchParams()).limit, DEFAULT_EXPORT_LIMIT,
  'no limit parameter falls back to the default page size')
check(resolveExportPaging(new URLSearchParams('limit=50')).limit, 50,
  'a reasonable limit is honoured')
check(resolveExportPaging(new URLSearchParams('limit=99999')).limit, MAX_EXPORT_LIMIT,
  'an unreasonable limit is clamped rather than refused')
check(resolveExportPaging(new URLSearchParams('limit=0')).limit, DEFAULT_EXPORT_LIMIT,
  'a zero limit falls back rather than returning an empty page forever')
check(resolveExportPaging(new URLSearchParams('limit=-5')).limit, DEFAULT_EXPORT_LIMIT,
  'a negative limit falls back')
check(resolveExportPaging(new URLSearchParams('limit=abc')).limit, DEFAULT_EXPORT_LIMIT,
  'a non-numeric limit falls back')
check(resolveExportPaging(undefined).limit, DEFAULT_EXPORT_LIMIT,
  'no search params at all still resolves a page size')

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

console.log('\ncursors round-trip and fail safe')

check(decodeExportCursor(encodeExportCursor(500)), 500, 'an offset survives a round trip')
check(decodeExportCursor(encodeExportCursor(1)), 1, 'including the smallest real offset')
check(encodeExportCursor(0), null, 'there is no cursor for the first page')
check(encodeExportCursor(-1), null, 'nor for a negative offset')
check(encodeExportCursor(Number.NaN), null, 'nor for a non-finite one')

check(decodeExportCursor('not-base64'), 0, 'a hand-written cursor resolves to the first page')
check(decodeExportCursor(''), 0, 'so does an empty one')
check(decodeExportCursor(null), 0, 'so does a missing one')
check(decodeExportCursor(Buffer.from('{}', 'utf8').toString('base64url')), 0,
  'so does a well-formed cursor carrying no offset')
check(decodeExportCursor(Buffer.from('{"o":-9}', 'utf8').toString('base64url')), 0,
  'a negative offset inside a cursor is refused')
checkTruthy(
  encodeURIComponent(encodeExportCursor(500)) === encodeExportCursor(500),
  'the cursor needs no escaping, so it survives a query string untouched'
)
check(decodeExportCursor('500'), 0, 'a bare number is not mistaken for one of our cursors')
check(decodeExportCursor('r'), 0, 'nor is a prefix with no offset')

const paging = resolveExportPaging(
  new URLSearchParams(`limit=100&cycleCursor=${encodeExportCursor(100)}&logCursor=${encodeExportCursor(700)}`)
)
check(paging.cycleOffset, 100, 'cycles carry their own offset')
check(paging.logOffset, 700, 'logs carry a separate one, because the two tables are wildly different sizes')

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

console.log('\nrow ranges are inclusive and never overlap')

checkDeep(pageRange(0, 500), { from: 0, to: 499 }, 'the first page is 0..499 for a 500-row limit')
checkDeep(pageRange(500, 500), { from: 500, to: 999 }, 'the second page starts exactly where the first ended')
checkDeep(pageRange(0, 1), { from: 0, to: 0 }, 'a single-row page is one row, not zero')
checkDeep(pageRange(-10, 500), { from: 0, to: 499 }, 'a negative offset is clamped to the start')

const first = pageRange(0, 250)
const second = pageRange(250, 250)
check(second.from, first.to + 1, 'consecutive pages neither skip nor repeat a row')

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

console.log('\nthe envelope satisfies both the API convention and the downloaded file')

const page = buildExportPayload({
  profile: { user_id: 'u1', age: 29 },
  cycles: rows(3, 'c'),
  logs: rows(3, 'l'),
  limit: 500,
})

check(page.success, true, 'a successful export finally says so')
checkTruthy(page.data, 'the standard data envelope is present')
checkTruthy(Array.isArray(page.cycles), 'and the bare cycles key the download relies on survives')
checkTruthy(Array.isArray(page.logs), 'and the bare logs key')
check(page.profile.age, 29, 'and the bare profile key')
checkDeep(page.data.cycles, page.cycles, 'the two spellings describe the same rows')

check(buildExportPayload({ profile: null, cycles: null, logs: null, limit: 500 }).profile.user_id, undefined,
  'a missing profile becomes an empty object rather than null')
checkDeep(buildExportPayload({ limit: 500 }).cycles, [], 'missing rows become an empty array')
check(buildExportPayload({ limit: 500 }).success, true, 'an empty export is still a success')

// ---------------------------------------------------------------------------
// hasMore
// ---------------------------------------------------------------------------

console.log('\nhasMore is derived from the page, not guessed')

check(hasMorePages(rows(500, 'x'), 500), true, 'a full page means there may be more')
check(hasMorePages(rows(499, 'x'), 500), false, 'a short page is definitively the last')
check(hasMorePages([], 500), false, 'an empty page is the last')
check(hasMorePages(null, 500), false, 'a missing page is not more')

const fullPage = buildExportPayload({ profile: {}, cycles: rows(10, 'c'), logs: rows(4, 'l'), limit: 10 })
check(fullPage.pagination.cycles.hasMore, true, 'a full cycles page reports more cycles')
check(fullPage.pagination.logs.hasMore, false, 'while a short logs page reports no more logs')
check(fullPage.pagination.hasMore, true, 'the export as a whole is incomplete if either table has more')
checkTruthy(fullPage.pagination.cycles.nextCursor, 'the incomplete table gets a cursor')
check(fullPage.pagination.logs.nextCursor, null, 'the finished table does not')

const lastPage = buildExportPayload({ profile: {}, cycles: rows(2, 'c'), logs: rows(2, 'l'), limit: 10 })
check(lastPage.pagination.hasMore, false, 'a final page says the export is complete')
check(nextPageUrl('/api/user/export', lastPage.pagination), null, 'and offers no next URL')

// ---------------------------------------------------------------------------
// Client loop
// ---------------------------------------------------------------------------

console.log('\na client can reassemble the whole export')

const nextUrl = nextPageUrl('/api/user/export', fullPage.pagination)
checkTruthy(nextUrl.startsWith('/api/user/export?'), 'the next URL targets the same endpoint')
checkTruthy(nextUrl.includes('cycleCursor='), 'and carries the cursor for the unfinished table')
checkTruthy(
  nextUrl.includes('logCursor='),
  'and one for the finished table too -- omitting it would restart that table at offset 0 and repeat its rows'
)
check(
  new URLSearchParams(nextUrl.split('?')[1]).get('limit'),
  '10',
  'and preserves the page size, so the caller is not silently re-sized'
)

// Walk a 25-row history in pages of 10 and assert nothing is lost or repeated.
const allCycles = rows(25, 'c')
const allLogs = rows(7, 'l')
const LIMIT = 10

let accumulated = null
let cycleOffset = 0
let logOffset = 0
let pages = 0

for (;;) {
  const window = pageRange(cycleOffset, LIMIT)
  const logWindow = pageRange(logOffset, LIMIT)

  const body = buildExportPayload({
    profile: { user_id: 'u1' },
    cycles: allCycles.slice(window.from, window.to + 1),
    logs: allLogs.slice(logWindow.from, logWindow.to + 1),
    limit: LIMIT,
    cycleOffset,
    logOffset,
  })

  accumulated = mergeExportPage(accumulated, body)
  pages += 1

  if (!body.pagination.hasMore || pages > 10) break

  cycleOffset = decodeExportCursor(body.pagination.resume.cycleCursor)
  logOffset = decodeExportCursor(body.pagination.resume.logCursor)
}

check(pages, 3, 'a 25-row history in pages of 10 takes exactly three requests')
check(accumulated.cycles.length, 25, 'every cycle is collected')
check(accumulated.logs.length, 7, 'every log is collected, even though logs finished first')
check(new Set(accumulated.cycles.map((c) => c.id)).size, 25, 'no cycle is duplicated across pages')
check(new Set(accumulated.logs.map((l) => l.id)).size, 7, 'no log is duplicated')
checkDeep(accumulated.cycles.map((c) => c.id), allCycles.map((c) => c.id), 'and the order is preserved')
check(accumulated.profile.user_id, 'u1', 'the profile is taken from the first page')

check(
  mergeExportPage({ profile: { user_id: 'first' }, cycles: [], logs: [] }, { profile: { user_id: 'later' } })
    .profile.user_id,
  'first',
  'a later page repeating the profile does not overwrite it'
)

// ---------------------------------------------------------------------------
// The download loop
// ---------------------------------------------------------------------------

console.log('\nthe download loop saves a whole export, never a truncated one')

/** A fake endpoint serving `total` cycles and `logTotal` logs in pages of `limit`. */
function fakeEndpoint({ total, logTotal, limit }) {
  const cycleRows = rows(total, 'c')
  const logRows = rows(logTotal, 'l')
  let requests = 0

  return {
    get requests() {
      return requests
    },
    async fetch(url) {
      requests += 1
      const query = new URLSearchParams(url.split('?')[1] || '')
      const cycleOffset = decodeExportCursor(query.get('cycleCursor'))
      const logOffset = decodeExportCursor(query.get('logCursor'))
      const cw = pageRange(cycleOffset, limit)
      const lw = pageRange(logOffset, limit)

      return {
        ok: true,
        status: 200,
        json: async () =>
          buildExportPayload({
            profile: { user_id: 'u1' },
            cycles: cycleRows.slice(cw.from, cw.to + 1),
            logs: logRows.slice(lw.from, lw.to + 1),
            limit,
            cycleOffset,
            logOffset,
          }),
      }
    },
  }
}

const endpoint = fakeEndpoint({ total: 25, logTotal: 7, limit: 10 })
const collected = await collectFullExport((url) => endpoint.fetch(url))

check(collected.cycles.length, 25, 'the loop collects every cycle across pages')
check(collected.logs.length, 7, 'and every log')
check(new Set(collected.cycles.map((c) => c.id)).size, 25, 'with no duplicates')
check(collected.profile.user_id, 'u1', 'and the profile from the first page')
check(collected.complete, true, 'and reports the export as complete')
check(endpoint.requests, 3, 'in exactly the number of requests the page size implies')

const single = fakeEndpoint({ total: 4, logTotal: 2, limit: 10 })
const smallExport = await collectFullExport((url) => single.fetch(url))
check(single.requests, 1, 'a small export still takes one request')
check(smallExport.complete, true, 'and is complete')

const capped = fakeEndpoint({ total: 1000, logTotal: 0, limit: 10 })
const partial = await collectFullExport((url) => capped.fetch(url), { maxPages: 3 })
check(partial.complete, false, 'hitting the page ceiling is reported, not hidden')
check(partial.cycles.length, 30, 'and the caller still gets what was fetched')

let threw = null
try {
  await collectFullExport(async () => ({ ok: false, status: 429 }))
} catch (err) {
  threw = err
}
checkTruthy(threw, 'a failed page rejects rather than saving a half-written export')
checkTruthy(threw.message.includes('429'), 'and the status is carried into the message')

// ---------------------------------------------------------------------------
// Cache policy
// ---------------------------------------------------------------------------

console.log('\npersonal health data is never stored')

checkTruthy(NO_STORE_HEADERS['Cache-Control'].includes('no-store'), 'no-store is set')
checkTruthy(NO_STORE_HEADERS['Cache-Control'].includes('must-revalidate'), 'and must-revalidate')
check(NO_STORE_HEADERS.Pragma, 'no-cache', 'the HTTP/1.0 header is set for older intermediaries')
check(NO_STORE_HEADERS.Expires, '0', 'and an already-expired Expires')
checkTruthy(Object.isFrozen(NO_STORE_HEADERS), 'the header set cannot be mutated by a caller')

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
