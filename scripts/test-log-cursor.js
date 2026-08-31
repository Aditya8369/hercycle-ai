/**
 * Regression suite for lib/log-cursor.js.
 *
 * The bugs this is part of fixing, all of them reachable from a URL and all of
 * them answered with a 500:
 *
 *  1. `?date=hello` went straight into `.eq('date', dateParam)`. `daily_logs.date`
 *     is a DATE, so Postgres raised 22007 and the route returned its message
 *     verbatim: `invalid input syntax for type date: "hello"`.
 *
 *  2. `?cursor=100%` — `lib/api-helpers.js` called `decodeURIComponent` on a
 *     value `URLSearchParams.get()` had already decoded, so a literal `%` threw
 *     `URIError: URI malformed` into the route's outer catch.
 *
 *  3. A cursor with a comma in it rewrote the PostgREST filter:
 *
 *         query.or(`date.lt.${cursorDate},and(date.eq.${cursorDate},id.lt.${cursorId})`)
 *
 *     Neither half was validated. `.eq('user_id', userId)` is ANDed with that,
 *     so it was not a cross-account read — but every malformed cursor was a 500
 *     carrying the query parser's own message.
 *
 *  4. `hasMore = data.length === limit`, so a last page that happened to be
 *     exactly full advertised a next page that came back empty.
 *
 *   node scripts/test-log-cursor.js
 */

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildKeysetFilter,
  buildPage,
  decodeLogCursor,
  describeLogError,
  encodeLogCursor,
  fetchSizeFor,
  isUuid,
  resolveLogDate,
  resolveLogPaging,
} from '../lib/log-cursor.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`)
}

function checkTrue(value, label) {
  check(value === true, true, label)
}

function checkFalse(value, label) {
  check(value === false, true, label)
}

function section(name) {
  console.log(`\n— ${name}`)
}

const UUID_A = '3f7c1b2e-9a44-4a1e-8b2d-0c6f5d3e2a11'
const UUID_B = '8b1d4c0a-2e55-4f3c-9a7e-1d2c3b4a5f60'

/** A stored row. */
function row(date, id = UUID_A) {
  return { id, date, mood: '😊', symptoms: ['Cramps'] }
}

/** A query string. */
function params(query) {
  return new URL(`https://example.test/api/log-day?${query}`).searchParams
}

// ---------------------------------------------------------------------------
section('Date lookups — the ?date=hello 500')
// ---------------------------------------------------------------------------

checkTrue(resolveLogDate('2026-08-29').ok, 'a real day is accepted')
check(resolveLogDate('2026-08-29').date, '2026-08-29', 'and comes back unchanged')
checkTrue(resolveLogDate('2028-02-29').ok, '29 February in a leap year is a real day')

checkFalse(resolveLogDate('hello').ok, 'free text is refused')
check(resolveLogDate('hello').error.status, 400, 'as a 400, not a 500')
check(resolveLogDate('hello').error.field, 'date', 'and the field is named')

// The shape is right and the day is not real; the column would have raised the
// same 22007 the regex-only checks let through.
checkFalse(resolveLogDate('2026-02-31').ok, '31 February is refused')
checkFalse(resolveLogDate('2026-02-30').ok, '30 February is refused')
checkFalse(resolveLogDate('2026-13-01').ok, 'month 13 is refused')
checkFalse(resolveLogDate('2026-00-10').ok, 'month 0 is refused')
checkFalse(resolveLogDate('2026-01-32').ok, 'day 32 is refused')
checkFalse(resolveLogDate('2027-02-29').ok, '29 February in a common year is refused')
checkFalse(resolveLogDate('2026-8-9').ok, 'an unpadded date is refused')
checkFalse(resolveLogDate('29-08-2026').ok, 'a reversed date is refused')
checkFalse(resolveLogDate('2026-08-29T00:00:00Z').ok, 'a timestamp is not a calendar day')
checkFalse(resolveLogDate('').ok, 'the empty string is refused')
checkFalse(resolveLogDate(null).ok, 'null is refused')
checkFalse(resolveLogDate(20260829).ok, 'a number is refused')

// ---------------------------------------------------------------------------
section('Cursors — round trip')
// ---------------------------------------------------------------------------

const cursor = encodeLogCursor(row('2026-08-29'))
check(cursor, `2026-08-29_${UUID_A}`, 'the cursor keeps the existing wire format')

const decoded = decodeLogCursor(cursor)
checkTrue(decoded.ok, 'and reads back')
check(decoded.date, '2026-08-29', 'with its date')
check(decoded.id, UUID_A, 'and its id')

check(encodeLogCursor({ date: '2026-08-29' }), null, 'a row with no id yields no cursor')
check(encodeLogCursor({ id: UUID_A }), null, 'a row with no date yields no cursor')
check(encodeLogCursor({ date: '2026-02-31', id: UUID_A }), null, 'an impossible date yields no cursor')
check(encodeLogCursor({ date: '2026-08-29', id: 'nope' }), null, 'a non-UUID id yields no cursor')
check(encodeLogCursor(null), null, 'a null row yields no cursor')

// Neither half can contain the separator, so the split is unambiguous.
checkFalse(UUID_A.includes('_'), 'a UUID contains no underscore')
checkFalse('2026-08-29'.includes('_'), 'an ISO date contains no underscore')

// ---------------------------------------------------------------------------
section('Cursors — everything that used to reach the query')
// ---------------------------------------------------------------------------

checkFalse(decodeLogCursor('').ok, 'the empty cursor is refused')
checkFalse(decodeLogCursor('   ').ok, 'a whitespace cursor is refused')
checkFalse(decodeLogCursor(null).ok, 'null is refused')
checkFalse(decodeLogCursor(42).ok, 'a number is refused')
checkFalse(decodeLogCursor('2026-08-29').ok, 'a cursor with no id half is refused')
checkFalse(decodeLogCursor(`_${UUID_A}`).ok, 'a cursor with no date half is refused')
checkFalse(decodeLogCursor('2026-08-29_').ok, 'a trailing separator is refused')
checkFalse(decodeLogCursor(`2026-02-31_${UUID_A}`).ok, 'an impossible date is refused')
checkFalse(decodeLogCursor('2026-08-29_not-a-uuid').ok, 'a non-UUID id is refused')

// The filter-injection shapes. None of these can now reach `buildKeysetFilter`.
const hostile = [
  `2026-08-29,user_id.neq.x_${UUID_A}`,
  `2026-08-29)_${UUID_A}`,
  `2026-08-29_${UUID_A},id.not.is.null`,
  `2026-08-29_${UUID_A})`,
  `*_*`,
  `2026-08-29_${UUID_A}%00`,
  `2026-08-29 or 1=1_${UUID_A}`,
]
for (const value of hostile) {
  checkFalse(decodeLogCursor(value).ok, `a filter-injection cursor is refused: ${value.slice(0, 34)}…`)
}

// And the filter built from a *decoded* cursor cannot carry anything else.
const filter = buildKeysetFilter(decodeLogCursor(cursor))
check(filter, `date.lt.2026-08-29,and(date.eq.2026-08-29,id.lt.${UUID_A})`, 'the filter has the expected shape')
check(filter.split(',').length, 3, 'and exactly the commas it is supposed to have')
checkFalse(filter.includes('user_id'), 'nothing can smuggle a user_id term into it')

// ---------------------------------------------------------------------------
section('Paging — the URIError')
// ---------------------------------------------------------------------------

// `URLSearchParams.get()` has already decoded this; a second decode threw.
check(params('cursor=100%25').get('cursor'), '100%', 'URLSearchParams decodes once')
let threw = false
try {
  decodeURIComponent(params('cursor=100%25').get('cursor'))
} catch {
  threw = true
}
checkTrue(threw, 'and decoding that result a second time throws URIError')

// resolveLogPaging does not decode again, so it refuses cleanly instead.
const percent = resolveLogPaging(params('cursor=100%25'))
checkFalse(percent.ok, 'a cursor with a stray percent is refused')
check(percent.error.status, 400, 'as a 400, not a 500')
checkFalse(percent.error.message.includes('URI'), 'and the runtime error text does not reach the caller')

const noCursor = resolveLogPaging(params(''))
checkTrue(noCursor.ok, 'no cursor is fine')
check(noCursor.cursor, null, 'and yields no cursor')
check(noCursor.limit, DEFAULT_PAGE_SIZE, 'with the default page size')

check(resolveLogPaging(params('limit=10')).limit, 10, 'an explicit limit is honoured')
check(resolveLogPaging(params('limit=9999')).limit, MAX_PAGE_SIZE, 'an over-large limit is clamped')
check(resolveLogPaging(params('limit=0')).limit, DEFAULT_PAGE_SIZE, 'zero falls back to the default')
check(resolveLogPaging(params('limit=-5')).limit, DEFAULT_PAGE_SIZE, 'a negative limit falls back')
check(resolveLogPaging(params('limit=abc')).limit, DEFAULT_PAGE_SIZE, 'a non-numeric limit falls back')
// `parseInt('1e9', 10)` stops at the 'e' and yields 1 — a small page, not NaN,
// and never a value that could reach `.limit(NaN)`.
check(resolveLogPaging(params('limit=1e9')).limit, 1, 'exponent notation reads as its leading digits, not NaN')
checkTrue(Number.isInteger(resolveLogPaging(params('limit=1e9')).limit), 'and is always an integer')
check(resolveLogPaging(params('limit=')).limit, DEFAULT_PAGE_SIZE, 'an empty limit falls back')

const withCursor = resolveLogPaging(params(`cursor=${encodeURIComponent(cursor)}&limit=5`))
checkTrue(withCursor.ok, 'a valid encoded cursor round-trips through the query string')
check(withCursor.cursor.id, UUID_A, 'and carries its id')
check(withCursor.limit, 5, 'alongside the limit')

// ---------------------------------------------------------------------------
section('Pages — the hasMore lie')
// ---------------------------------------------------------------------------

check(fetchSizeFor(30), 31, 'the query asks for one row beyond the page')

// The exact case the old code got wrong: a final page that is exactly `limit`.
const exactlyFull = buildPage([row('2026-08-03'), row('2026-08-02', UUID_B)], 2)
check(exactlyFull.items.length, 2, 'a full page returns its rows')
checkFalse(exactlyFull.hasMore, 'and does not claim a page that does not exist')
check(exactlyFull.nextCursor, null, 'so there is no cursor to follow')

const trulyMore = buildPage([row('2026-08-03'), row('2026-08-02', UUID_B), row('2026-08-01')], 2)
check(trulyMore.items.length, 2, 'an over-fetched page is trimmed to the limit')
checkTrue(trulyMore.hasMore, 'and does report more')
check(trulyMore.nextCursor, `2026-08-02_${UUID_B}`, 'with a cursor built from the last returned row, not the extra one')

const partial = buildPage([row('2026-08-03')], 5)
check(partial.items.length, 1, 'a short page returns what it has')
checkFalse(partial.hasMore, 'and reports no more')

const empty = buildPage([], 30)
check(empty.items.length, 0, 'an empty result is an empty page')
checkFalse(empty.hasMore, 'with no more')
check(empty.nextCursor, null, 'and no cursor')
check(buildPage(null, 30).items.length, 0, 'a null result set does not crash')

// If the last row cannot produce a cursor, `hasMore` must not be true — a true
// hasMore with a null cursor is a dead end for the client.
const uncursorable = buildPage([row('2026-08-03'), { id: 'broken', date: 'broken' }, row('2026-08-01')], 2)
checkFalse(uncursorable.hasMore, 'hasMore is false when no cursor can be built')
check(uncursorable.nextCursor, null, 'and the cursor is null')

// ---------------------------------------------------------------------------
section('UUIDs')
// ---------------------------------------------------------------------------

checkTrue(isUuid(UUID_A), 'a v4 UUID is a UUID')
checkFalse(isUuid('3f7c1b2e9a444a1e8b2d0c6f5d3e2a11'), 'an unhyphenated string is not')
checkFalse(isUuid('zzzzzzzz-9a44-4a1e-8b2d-0c6f5d3e2a11'), 'non-hex is not')
checkFalse(isUuid(`${UUID_A} or 1=1`), 'a UUID with a payload appended is not')
checkFalse(isUuid(''), 'the empty string is not')
checkFalse(isUuid(null), 'null is not')

// ---------------------------------------------------------------------------
section('Database error mapping')
// ---------------------------------------------------------------------------

check(describeLogError({ code: '22007' }).status, 400, 'a bad date is a 400')
check(describeLogError({ code: '22P02' }).status, 400, 'a bad UUID is a 400')
check(describeLogError({ code: 'PGRST100' }).status, 400, 'a PostgREST parse error is a 400')
check(describeLogError({ code: 'PGRST116' }).status, 404, 'no row is a 404')
check(describeLogError({ code: '22001' }).status, 400, 'an over-long value is a 400')
check(describeLogError({ code: '23503' }).status, 409, 'a missing parent user is a 409')
check(describeLogError({ code: '23505' }).status, 409, 'a unique violation is a 409')
check(describeLogError({ code: '42P01' }).status, 503, 'a missing table is a 503')
check(describeLogError({ code: '42703' }).status, 503, 'a missing column is a 503')
check(describeLogError({ code: '57014' }).status, 504, 'a statement timeout is a 504')
check(describeLogError({ code: '08006' }).status, 503, 'a connection failure is a 503')
check(describeLogError({ code: 'XX000' }).status, 500, 'an unrecognised code stays a 500')
check(describeLogError(null).status, 500, 'a null error is a 500')

// The exact strings that used to reach the browser.
const dateLeak = describeLogError({ code: '22007', message: 'invalid input syntax for type date: "hello"' })
checkFalse(dateLeak.message.includes('invalid input syntax'), 'the parser wording does not leak')
checkFalse(dateLeak.message.includes('hello'), 'the offending value is not echoed back')

const poolerLeak = describeLogError({
  code: '08006',
  message: 'could not connect: aws-0-ap-south-1.pooler.supabase.com:6543 (10.0.1.14), user "postgres.abcdefgh"',
})
checkFalse(poolerLeak.message.includes('pooler.supabase.com'), 'the pooler host does not leak')
checkFalse(poolerLeak.message.includes('10.0.1.14'), 'the internal IP does not leak')
checkFalse(poolerLeak.message.includes('postgres.'), 'the database user does not leak')

const relationLeak = describeLogError({ code: '42P01', message: 'relation "public.daily_logs" does not exist' })
checkFalse(relationLeak.message.includes('daily_logs'), 'the relation name does not leak')

for (const code of ['22007', '22008', '22P02', 'PGRST100', 'PGRST116', '22001', '23503', '23505', '42P01', '42703', '57014', '08003', '08006', 'XX000', '']) {
  const result = describeLogError({ code })
  checkTrue(
    typeof result.message === 'string' && result.message.length > 0 &&
      Number.isInteger(result.status) && typeof result.code === 'string' && result.code.length > 0,
    `every branch is fully described (${code || 'empty'})`
  )
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
