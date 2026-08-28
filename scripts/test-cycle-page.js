/**
 * Regression suite for lib/cycle-page.js.
 *
 * The bug this is part of fixing: `GET /api/cycles` ended with
 *
 *     return NextResponse.json(paginatedResult, { status: 200 })
 *
 * in a file that never imported `NextResponse`. Every read of the cycle list
 * threw `ReferenceError: NextResponse is not defined`, was swallowed by the
 * outer catch, and came back as a 500 -- which the client read as
 * `data.success === false` and skipped without a word, falling through to the
 * IndexedDB mirror.
 *
 * The import alone was not the fix. The handler had been migrated to
 * `formatPaginatedResponse`, whose `{ success, data: [...] }` does not carry
 * the `data.cycles` key the client reads; with the import in place,
 * `decryptRecords(undefined)` returns `[]`, and `cacheRecords('cycles', [])`
 * calls `replaceAll`, which *clears the store*. The naive fix would have
 * turned a stale-cache bug into a cache wipe on every dashboard load.
 *
 * And the cursor was the raw `${start_date}_${id}`, split on `_` and
 * interpolated into a PostgREST `or` filter, so a cursor containing filter
 * syntax produced a 400 that the route reported to the user as an empty
 * history.
 *
 *   node scripts/test-cycle-page.js
 */

import {
  DEFAULT_CYCLE_PAGE_SIZE,
  MAX_CYCLE_PAGE_SIZE,
  buildCycleCursorFilter,
  buildCyclePage,
  decodeCycleCursor,
  emptyCyclePage,
  encodeCycleCursor,
  hasUsableCyclePayload,
  isCycleId,
  normaliseCycleLimit,
  parseCycleQuery,
} from '../lib/cycle-page.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
}

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${b}\n  actual:   ${a}`)
}

const UUID_A = '3f2a1b4c-5d6e-4f70-8901-a2b3c4d5e6f7'
const UUID_B = '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a'
const UUID_UPPER = '3F2A1B4C-5D6E-4F70-8901-A2B3C4D5E6F7'

function cycle(startDate, id, extra = {}) {
  return { id, start_date: startDate, end_date: null, cycle_length: 28, ...extra }
}

// ---------------------------------------------------------------------------
// isCycleId
// ---------------------------------------------------------------------------

check(isCycleId(UUID_A), true, 'isCycleId accepts a canonical uuid')
check(isCycleId(UUID_UPPER), true, 'isCycleId accepts an uppercase uuid')
check(isCycleId(''), false, 'isCycleId rejects the empty string')
check(isCycleId(null), false, 'isCycleId rejects null')
check(isCycleId(undefined), false, 'isCycleId rejects undefined')
check(isCycleId(42), false, 'isCycleId rejects a number')
check(isCycleId('not-a-uuid'), false, 'isCycleId rejects a plain word')
check(isCycleId(UUID_A.slice(0, -1)), false, 'isCycleId rejects a truncated uuid')
check(isCycleId(`${UUID_A}0`), false, 'isCycleId rejects an over-long uuid')
check(isCycleId(UUID_A.replace('-', '')), false, 'isCycleId rejects a uuid missing a hyphen')
check(isCycleId(`${UUID_A},user_id.neq.x`), false, 'isCycleId rejects filter syntax appended to a uuid')
check(isCycleId('3f2a1b4c-5d6e-4f70-8901-a2b3c4d5e6g7'), false, 'isCycleId rejects a non-hex character')

// ---------------------------------------------------------------------------
// Cursor round trip
// ---------------------------------------------------------------------------

const cursor = encodeCycleCursor(cycle('2026-07-21', UUID_A))
check(typeof cursor, 'string', 'encodeCycleCursor returns a string for a valid row')
check(cursor.includes('2026-07-21'), false, 'the encoded cursor does not read as a date in the address bar')
checkDeep(
  decodeCycleCursor(cursor),
  { startDate: '2026-07-21', id: UUID_A },
  'a cursor round-trips losslessly'
)

check(
  encodeCycleCursor(cycle('2026-01-01', UUID_A)) !== encodeCycleCursor(cycle('2026-01-01', UUID_B)),
  true,
  'two rows sharing a start date produce different cursors'
)

// The id tie-break is the whole reason the cursor is a pair. Two cycles can
// share a start date -- a duplicate write, a correction, a seeded account --
// and a cursor on the date alone would skip one or repeat the other.
checkDeep(
  decodeCycleCursor(encodeCycleCursor(cycle('2026-01-01', UUID_B))),
  { startDate: '2026-01-01', id: UUID_B },
  'the id half survives the round trip when the dates collide'
)

// ---------------------------------------------------------------------------
// encodeCycleCursor: rows that cannot anchor a page
// ---------------------------------------------------------------------------

check(encodeCycleCursor(null), null, 'encodeCycleCursor rejects null')
check(encodeCycleCursor(undefined), null, 'encodeCycleCursor rejects undefined')
check(encodeCycleCursor({}), null, 'encodeCycleCursor rejects an empty object')
check(encodeCycleCursor(cycle(null, UUID_A)), null, 'encodeCycleCursor rejects a null start_date')
check(encodeCycleCursor(cycle('2026-07-21', null)), null, 'encodeCycleCursor rejects a null id')
check(encodeCycleCursor(cycle('21-07-2026', UUID_A)), null, 'encodeCycleCursor rejects a non-ISO start_date')
check(encodeCycleCursor(cycle('2026-02-31', UUID_A)), null, 'encodeCycleCursor rejects a date that is not a real day')
check(encodeCycleCursor(cycle('2026-13-01', UUID_A)), null, 'encodeCycleCursor rejects month 13')
check(encodeCycleCursor(cycle('2026-07-21T00:00:00Z', UUID_A)), null, 'encodeCycleCursor rejects a timestamp')
check(encodeCycleCursor(cycle('2026-07-21', 'abc')), null, 'encodeCycleCursor rejects a non-uuid id')

// ---------------------------------------------------------------------------
// decodeCycleCursor: every way an unusable cursor must degrade
//
// Each of these must return null -- read by the route as "no cursor", which
// serves the first page. That is the correct degradation: a stale bookmark
// shows the newest cycles. The old code's answer was a 200 with an empty list,
// which told the user she had no cycles at all.
// ---------------------------------------------------------------------------

check(decodeCycleCursor(null), null, 'decodeCycleCursor rejects null')
check(decodeCycleCursor(undefined), null, 'decodeCycleCursor rejects undefined')
check(decodeCycleCursor(''), null, 'decodeCycleCursor rejects the empty string')
check(decodeCycleCursor(12345), null, 'decodeCycleCursor rejects a number')
check(decodeCycleCursor({}), null, 'decodeCycleCursor rejects an object')
check(decodeCycleCursor('!!!not base64!!!'), null, 'decodeCycleCursor rejects malformed base64')

const encode = (raw) => Buffer.from(raw, 'utf8').toString('base64')

check(decodeCycleCursor(encode('2026-07-21')), null, 'decodeCycleCursor rejects a cursor with no separator')
check(decodeCycleCursor(encode('|' + UUID_A)), null, 'decodeCycleCursor rejects a leading separator')
check(decodeCycleCursor(encode('2026-07-21|')), null, 'decodeCycleCursor rejects a trailing separator')
check(decodeCycleCursor(encode('2026-02-31|' + UUID_A)), null, 'decodeCycleCursor rejects a date that is not a real day')
check(decodeCycleCursor(encode('2026-07-21|abc')), null, 'decodeCycleCursor rejects a non-uuid id')
check(decodeCycleCursor(encode('2026-07-21|')), null, 'decodeCycleCursor rejects an empty id')

// The filter-syntax cases. Under the old `cursor.split('_')` these reached the
// PostgREST `or` string verbatim.
check(
  decodeCycleCursor(encode(`2026-07-21|${UUID_A},user_id.neq.someone-else`)),
  null,
  'decodeCycleCursor rejects a comma-injected id'
)
check(
  decodeCycleCursor(encode('2026-07-21,and(cycle_length.gt.0)|' + UUID_A)),
  null,
  'decodeCycleCursor rejects a comma-injected date'
)
check(
  decodeCycleCursor(encode(`2026-07-21|${UUID_A})`)),
  null,
  'decodeCycleCursor rejects an id carrying a closing parenthesis'
)
check(
  decodeCycleCursor(encode(`2026-07-21|${UUID_A}|extra`)),
  null,
  'decodeCycleCursor rejects a cursor with a second separator'
)

// The literal shape of the old cursor must not be honoured either -- an
// in-flight client holding one degrades to the first page rather than to an
// empty history.
check(
  decodeCycleCursor(`2026-07-21_${UUID_A}`),
  null,
  'decodeCycleCursor rejects the previous raw `date_id` cursor form'
)

// ---------------------------------------------------------------------------
// normaliseCycleLimit
// ---------------------------------------------------------------------------

check(normaliseCycleLimit(undefined), DEFAULT_CYCLE_PAGE_SIZE, 'a missing limit uses the default')
check(normaliseCycleLimit(null), DEFAULT_CYCLE_PAGE_SIZE, 'a null limit uses the default')
check(normaliseCycleLimit(''), DEFAULT_CYCLE_PAGE_SIZE, 'an empty limit uses the default')
check(normaliseCycleLimit('abc'), DEFAULT_CYCLE_PAGE_SIZE, 'a non-numeric limit uses the default')
check(normaliseCycleLimit('NaN'), DEFAULT_CYCLE_PAGE_SIZE, 'the string NaN uses the default')
check(normaliseCycleLimit(Infinity), DEFAULT_CYCLE_PAGE_SIZE, 'Infinity uses the default')
check(normaliseCycleLimit('20'), 20, 'a numeric string is accepted')
check(normaliseCycleLimit(20), 20, 'a number is accepted')
check(normaliseCycleLimit('20.9'), 20, 'a fractional limit is floored')
check(normaliseCycleLimit(0), 1, 'zero is raised to one')
check(normaliseCycleLimit(-5), 1, 'a negative limit is raised to one')
check(normaliseCycleLimit(1e9), MAX_CYCLE_PAGE_SIZE, 'an enormous limit is clamped to the ceiling')
check(normaliseCycleLimit(MAX_CYCLE_PAGE_SIZE), MAX_CYCLE_PAGE_SIZE, 'the ceiling itself is accepted')

// ---------------------------------------------------------------------------
// parseCycleQuery
// ---------------------------------------------------------------------------

const validCursor = encodeCycleCursor(cycle('2026-06-01', UUID_B))

checkDeep(
  parseCycleQuery(new URLSearchParams('')),
  { limit: DEFAULT_CYCLE_PAGE_SIZE, cursor: null },
  'an empty query yields the default page and no cursor'
)
checkDeep(
  parseCycleQuery(new URLSearchParams(`limit=5&cursor=${encodeURIComponent(validCursor)}`)),
  { limit: 5, cursor: { startDate: '2026-06-01', id: UUID_B } },
  'a limit and a cursor are both read'
)
checkDeep(
  parseCycleQuery(new URLSearchParams('cursor=garbage')),
  { limit: DEFAULT_CYCLE_PAGE_SIZE, cursor: null },
  'an unusable cursor degrades to the first page rather than to an error'
)
checkDeep(
  parseCycleQuery({ limit: '3', cursor: validCursor }),
  { limit: 3, cursor: { startDate: '2026-06-01', id: UUID_B } },
  'parseCycleQuery also accepts a plain object, for tests and server components'
)
checkDeep(
  parseCycleQuery(undefined),
  { limit: DEFAULT_CYCLE_PAGE_SIZE, cursor: null },
  'parseCycleQuery survives being handed nothing at all'
)

// ---------------------------------------------------------------------------
// buildCycleCursorFilter
// ---------------------------------------------------------------------------

const filter = buildCycleCursorFilter({ startDate: '2026-07-21', id: UUID_A })
check(
  filter,
  `start_date.lt."2026-07-21",and(start_date.eq."2026-07-21",id.lt."${UUID_A}")`,
  'the keyset filter expresses the tuple comparison'
)
check(filter.includes('start_date.lt'), true, 'the filter pages strictly backwards')
check(filter.includes('id.lt'), true, 'the filter carries the id tie-break')

// ---------------------------------------------------------------------------
// buildCyclePage
// ---------------------------------------------------------------------------

const rows = [
  cycle('2026-07-21', UUID_A),
  cycle('2026-06-20', UUID_B),
  cycle('2026-05-19', '11111111-2222-4333-8444-555555555555'),
]

const fullPage = buildCyclePage(rows, 3, 3)
check(fullPage.cycles.length, 3, 'a page exactly the size of the limit keeps every row')
check(fullPage.pagination.hasMore, false, 'a page exactly the size of the limit is the last page')
check(fullPage.pagination.nextCursor, null, 'the last page carries no next cursor')
check(fullPage.pagination.totalCount, 3, 'the total count is passed through')
check(fullPage.pagination.limit, 3, 'the requested limit is echoed back')

const trimmedPage = buildCyclePage(rows, 2, 9)
check(trimmedPage.cycles.length, 2, 'the extra look-ahead row is trimmed off')
check(trimmedPage.pagination.hasMore, true, 'the extra row is what answers hasMore')
check(trimmedPage.cycles[1].id, UUID_B, 'the trimmed page ends on the last row the client asked for')
checkDeep(
  decodeCycleCursor(trimmedPage.pagination.nextCursor),
  { startDate: '2026-06-20', id: UUID_B },
  'the next cursor anchors on the last returned row, not on the look-ahead row'
)

// The look-ahead row must never be visible to the client -- it is the row that
// would otherwise be served twice, once as the tail of this page and once as
// the head of the next.
check(
  trimmedPage.cycles.some((row) => row.id === '11111111-2222-4333-8444-555555555555'),
  false,
  'the look-ahead row does not reach the client'
)

checkDeep(buildCyclePage([], 12, 0).cycles, [], 'an empty result is an empty array, not null')
check(buildCyclePage([], 12, 0).pagination.hasMore, false, 'an empty result has no more pages')
check(buildCyclePage(null, 12, 0).cycles.length, 0, 'a null row set does not throw')
check(buildCyclePage(undefined, 12, 0).cycles.length, 0, 'an undefined row set does not throw')
check(buildCyclePage([null, undefined], 12, 0).cycles.length, 0, 'null rows are filtered out')
check(buildCyclePage(rows, 2, null).pagination.totalCount, null, 'an unknown total count is reported as null')
check(buildCyclePage(rows, 2, undefined).pagination.totalCount, null, 'an undefined total count is reported as null')

// A last row that cannot anchor a cursor must not produce a broken one. The
// client would page forever against a cursor the decoder then rejects.
const unanchorable = buildCyclePage(
  [cycle('2026-07-21', UUID_A), cycle('2026-06-20', 'not-a-uuid'), cycle('2026-05-19', UUID_B)],
  2,
  9
)
check(unanchorable.pagination.hasMore, true, 'hasMore is still reported when the last row cannot anchor')
check(unanchorable.pagination.nextCursor, null, 'an unanchorable last row yields no cursor rather than a broken one')

// ---------------------------------------------------------------------------
// emptyCyclePage -- the shape invariant that is the second half of this bug
// ---------------------------------------------------------------------------

const empty = emptyCyclePage()
checkDeep(Object.keys(empty).sort(), ['cycles', 'pagination'], 'the fallback page has the same top-level keys as a real one')
checkDeep(
  Object.keys(empty.pagination).sort(),
  Object.keys(fullPage.pagination).sort(),
  'the fallback pagination block has the same keys as a real one'
)
check(Array.isArray(empty.cycles), true, 'the fallback page carries an array under `cycles`')
check(empty.cycles.length, 0, 'the fallback page is empty')
check(empty.pagination.hasMore, false, 'the fallback page reports no further pages')

// ---------------------------------------------------------------------------
// hasUsableCyclePayload -- the guard that stops the offline mirror being wiped
// ---------------------------------------------------------------------------

check(
  hasUsableCyclePayload({ success: true, data: { cycles: [], pagination: {} } }),
  true,
  'an empty cycle array is a usable refresh -- a cleared account must clear the mirror'
)
check(
  hasUsableCyclePayload({ success: true, data: { cycles: rows, pagination: {} } }),
  true,
  'a populated cycle array is a usable refresh'
)

// This is the exact payload `formatPaginatedResponse` produced, and the exact
// reason the naive one-line fix would have wiped the mirror.
check(
  hasUsableCyclePayload({ success: true, data: rows, pagination: {} }),
  false,
  'a bare array under `data` is refused -- the shape that would have cleared the store'
)
check(
  hasUsableCyclePayload({ success: false, error: 'Failed to fetch cycles: NextResponse is not defined' }),
  false,
  'the 500 this bug produced is refused'
)
check(hasUsableCyclePayload({ success: true, data: null }), false, 'a null data block is refused')
check(hasUsableCyclePayload({ success: true }), false, 'a missing data block is refused')
check(hasUsableCyclePayload({ success: true, data: {} }), false, 'a data block with no cycles key is refused')
check(
  hasUsableCyclePayload({ success: true, data: { cycles: null } }),
  false,
  'a null cycles key is refused'
)
check(
  hasUsableCyclePayload({ success: true, data: { cycles: 'many' } }),
  false,
  'a non-array cycles key is refused'
)
check(hasUsableCyclePayload(null), false, 'a null payload is refused')
check(hasUsableCyclePayload(undefined), false, 'an undefined payload is refused')
check(hasUsableCyclePayload('nope'), false, 'a string payload is refused')

// ---------------------------------------------------------------------------
// End-to-end: walking a history one page at a time
//
// The property that matters is that paging visits every row exactly once. The
// old cursor could not guarantee it -- two rows sharing a start date were
// either skipped or repeated, because the cursor did not carry the id.
// ---------------------------------------------------------------------------

const history = [
  cycle('2026-07-21', 'aaaaaaaa-0000-4000-8000-000000000001'),
  cycle('2026-07-21', 'aaaaaaaa-0000-4000-8000-000000000000'), // same day, lower id
  cycle('2026-06-20', 'bbbbbbbb-0000-4000-8000-000000000001'),
  cycle('2026-05-19', 'cccccccc-0000-4000-8000-000000000001'),
  cycle('2026-04-18', 'dddddddd-0000-4000-8000-000000000001'),
]

/** Applies the keyset predicate the filter expresses, in memory. */
function rowsAfter(all, anchor) {
  if (!anchor) return all
  return all.filter((row) =>
    row.start_date < anchor.startDate ||
    (row.start_date === anchor.startDate && row.id < anchor.id)
  )
}

const seen = []
let anchor = null
let guard = 0

for (;;) {
  guard += 1
  if (guard > 20) break // a runaway loop is itself a failure

  const available = rowsAfter(history, anchor)
  const page = buildCyclePage(available.slice(0, 2 + 1), 2, history.length)
  for (const row of page.cycles) seen.push(row.id)

  if (!page.pagination.hasMore) break
  anchor = decodeCycleCursor(page.pagination.nextCursor)
  check(anchor !== null, true, 'each next cursor decodes back to a usable anchor')
}

check(seen.length, history.length, 'paging visits every cycle')
check(new Set(seen).size, history.length, 'paging visits no cycle twice')
checkDeep(seen, history.map((row) => row.id), 'paging preserves the newest-first ordering, id-tie-broken')

// ---------------------------------------------------------------------------

console.log(`${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
