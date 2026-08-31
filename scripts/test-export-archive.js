/**
 * Regression suite for lib/export-archive.js.
 *
 * The bugs this is part of fixing, in `app/api/export-data/route.js`:
 *
 *  1. Both reads were unbounded and unordered —
 *     `select('*').eq('user_id', userId)` with no `.limit()` and no `.order()`.
 *     `daily_logs` grows one row per tracked day forever, and without an ORDER
 *     BY two exports of the same account could disagree with each other.
 *
 *  2. The `ReadableStream` had no `pull` and never read `desiredSize`, so
 *     `archiver`'s synchronous output was entirely enqueued inside `start()` —
 *     the whole ZIP in the stream's queue, on top of pretty-printed JSON and
 *     CSV copies of the same rows.
 *
 *  3. The date-column rule ended `normalizedKey.endsWith('at')`, which matches
 *     any column name ending in those two letters: `format`, `repeat`, `heat`,
 *     `flow_stat`. Any such column added later would be silently rewritten in
 *     the user's export.
 *
 *  4. Every export was called `my-hercycle-data.zip`, with nothing inside
 *     saying when it was taken or how much of the account it covered.
 *
 *   node scripts/test-export-archive.js
 */

import {
  ARCHIVE_BASENAME,
  EXPORT_ROW_LIMIT,
  buildArchiveFilename,
  buildManifest,
  contentDisposition,
  describeExportError,
  formatDateFields,
  isDateColumn,
  planArchiveEntries,
} from '../lib/export-archive.js'
import { toCsv } from '../lib/csv.js'
import { formatDateForCSV } from '../lib/utils.js'

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

const GENERATED_AT = new Date('2026-08-29T10:15:00.000Z')

/** Finds one planned entry by name. */
function entry(entries, name) {
  return entries.find((e) => e.name === name)
}

// ---------------------------------------------------------------------------
section('Date columns — the endsWith("at") bug')
// ---------------------------------------------------------------------------

checkTrue(isDateColumn('date'), 'date is a date column')
checkTrue(isDateColumn('start_date'), 'start_date is a date column')
checkTrue(isDateColumn('end_date'), 'end_date is a date column')
checkTrue(isDateColumn('recorded_date'), 'recorded_date is a date column')
checkTrue(isDateColumn('created_at'), 'created_at is a date column')
checkTrue(isDateColumn('updated_at'), 'updated_at is a date column')
checkTrue(isDateColumn('completed_at'), 'completed_at is a date column')
checkTrue(isDateColumn('start_time'), 'start_time is a date column')
checkTrue(isDateColumn('timestamp'), 'timestamp is a date column')
checkTrue(isDateColumn('event_timestamp'), 'event_timestamp is a date column')
checkTrue(isDateColumn('CREATED_AT'), 'the check is case-insensitive')

// The whole point: these end in the letters "at" and are not dates.
checkFalse(isDateColumn('format'), 'format is not a date column')
checkFalse(isDateColumn('repeat'), 'repeat is not a date column')
checkFalse(isDateColumn('heat'), 'heat is not a date column')
checkFalse(isDateColumn('fat'), 'fat is not a date column')
checkFalse(isDateColumn('flow_stat'), 'flow_stat is not a date column')
checkFalse(isDateColumn('threat_level'), 'threat_level is not a date column')

checkFalse(isDateColumn('mood'), 'mood is not a date column')
checkFalse(isDateColumn('symptoms'), 'symptoms is not a date column')
checkFalse(isDateColumn('_at'), 'a bare suffix is not a column name')
checkFalse(isDateColumn('_date'), 'a bare suffix is not a column name')
checkFalse(isDateColumn(''), 'the empty string is not a date column')
checkFalse(isDateColumn(null), 'null is not a date column')
checkFalse(isDateColumn(42), 'a number is not a date column')

// ---------------------------------------------------------------------------
section('Date formatting')
// ---------------------------------------------------------------------------

const logRow = {
  id: 'log-1',
  date: '2026-08-29T00:00:00.000Z',
  created_at: '2026-08-29T10:15:00.000Z',
  mood: '😊',
  symptoms: ['Cramps', 'Fatigue'],
  format: 'markdown',
  notes: null,
}
const formattedLog = formatDateFields(logRow, formatDateForCSV)

check(formattedLog.date, '2026-08-29', 'a date column is normalised')
check(formattedLog.created_at, '2026-08-29', 'a timestamp column is normalised')
check(formattedLog.format, 'markdown', 'a column merely ending in "at" is left alone')
check(formattedLog.mood, '😊', 'a mood is left alone')
check(formattedLog.symptoms, logRow.symptoms, 'an array column is left alone')
check(formattedLog.notes, null, 'a null is left alone')
check(formattedLog.id, 'log-1', 'the id is left alone')

check(formatDateFields(logRow, formatDateForCSV) === logRow, false, 'the input row is not mutated')
check(logRow.date, '2026-08-29T00:00:00.000Z', 'and its own date is untouched')

// A `jsonb` column named like a date would be turned into an empty string by
// `formatDateForCSV`; objects are skipped for that reason.
const jsonbRow = { encrypted_at: { iv: 'x', ct: 'y' }, date: '2026-01-01' }
check(typeof formatDateFields(jsonbRow, formatDateForCSV).encrypted_at, 'object', 'a jsonb column is not flattened')
check(formatDateFields({ created_at: new Date('2026-08-29T00:00:00Z') }, formatDateForCSV).created_at, '2026-08-29', 'a Date instance is still formatted')
check(formatDateFields({ date: '' }, formatDateForCSV).date, '', 'an empty value is left alone')
check(formatDateFields(null, formatDateForCSV), null, 'a null row passes through')

// ---------------------------------------------------------------------------
section('Filenames')
// ---------------------------------------------------------------------------

check(buildArchiveFilename(GENERATED_AT), `${ARCHIVE_BASENAME}-2026-08-29.zip`, 'the filename carries the date')
checkTrue(buildArchiveFilename(GENERATED_AT).endsWith('.zip'), 'and the extension')
checkTrue(buildArchiveFilename(new Date('2026-01-02T00:00:00Z')).includes('2026-01-02'), 'and zero-pads')
checkTrue(buildArchiveFilename(new Date('nope')).length > 0, 'an invalid date still yields a filename')
checkTrue(buildArchiveFilename().includes(ARCHIVE_BASENAME), 'the default is today')

const disposition = contentDisposition(buildArchiveFilename(GENERATED_AT))
checkTrue(disposition.startsWith('attachment;'), 'the download is an attachment')
checkTrue(disposition.includes(`filename="${ARCHIVE_BASENAME}-2026-08-29.zip"`), 'with a quoted filename')
checkTrue(disposition.includes("filename*=UTF-8''"), 'and an RFC 5987 form for non-ASCII clients')

// The name is generated rather than taken from input, but a header built by
// concatenation should still be unable to grow a second header.
const hostile = contentDisposition('evil".zip\r\nSet-Cookie: a=b')
checkFalse(hostile.includes('\r'), 'a CR cannot reach the header')
checkFalse(hostile.includes('\n'), 'an LF cannot reach the header')
checkFalse(hostile.includes('evil".zip'), 'an embedded quote cannot close the filename')

// ---------------------------------------------------------------------------
section('Manifest')
// ---------------------------------------------------------------------------

const manifest = buildManifest({
  generatedAt: GENERATED_AT,
  counts: { cycles: 12, dailyLogs: 340 },
  truncated: { cycles: false, dailyLogs: false },
})
checkTrue(manifest.includes('2026-08-29T10:15:00.000Z'), 'the manifest says when the export was taken')
checkTrue(manifest.includes('12 cycles'), 'and how many cycles it holds')
checkTrue(manifest.includes('340 daily logs'), 'and how many logs')
checkFalse(manifest.includes('capped'), 'with no truncation note when nothing was truncated')
checkTrue(manifest.endsWith('\n'), 'and ends with a newline')

const singular = buildManifest({
  generatedAt: GENERATED_AT,
  counts: { cycles: 1, dailyLogs: 1 },
  truncated: { cycles: false, dailyLogs: false },
})
checkFalse(singular.includes('1 cycles'), 'a single cycle is not pluralised')
checkFalse(singular.includes('1 daily logs'), 'a single log is not pluralised')
checkTrue(singular.includes('1 cycle'), 'and is still counted')

const truncatedManifest = buildManifest({
  generatedAt: GENERATED_AT,
  counts: { cycles: 20, dailyLogs: EXPORT_ROW_LIMIT },
  truncated: { cycles: false, dailyLogs: true },
})
checkTrue(truncatedManifest.includes('capped'), 'a truncated export says so')
checkTrue(truncatedManifest.includes('daily logs'), 'and names which table')
checkFalse(truncatedManifest.includes('cycles and daily logs'), 'and does not name a table that was not truncated')
checkTrue(truncatedManifest.includes(String(EXPORT_ROW_LIMIT)), 'and states the cap')

// The archive is the user's own data; adding an identifier would put one into a
// file people are told to email to a clinician.
checkFalse(manifest.toLowerCase().includes('user_'), 'the manifest carries no user id')

// ---------------------------------------------------------------------------
section('Archive plan')
// ---------------------------------------------------------------------------

const cycles = [
  { id: 'c1', user_id: 'user_1', start_date: '2026-01-01', end_date: '2026-01-28', cycle_length: 28 },
  { id: 'c2', user_id: 'user_1', start_date: '2026-01-29', end_date: '2026-02-25', cycle_length: 28 },
]
const logs = [
  { id: 'l1', user_id: 'user_1', date: '2026-01-02', mood: '😊', symptoms: ['Cramps'], notes: 'ok' },
]

const entries = planArchiveEntries({ cycles, dailyLogs: logs, toCsv, formatDate: formatDateForCSV, generatedAt: GENERATED_AT })

check(entries.length, 5, 'five files go into the archive')
check(entries.map((e) => e.name).join(','), 'README.txt,cycles.json,daily_logs.json,cycles.csv,daily_logs.csv', 'named as expected')
check(new Set(entries.map((e) => e.name)).size, 5, 'with no duplicate names')
checkTrue(entries.every((e) => typeof e.contents === 'string'), 'every entry has string contents')

// JSON is emitted compact. Pretty-printing a few thousand rows adds a large
// fraction to a payload nothing reads by eye, on a route that holds every copy
// in memory at once.
const cyclesJson = entry(entries, 'cycles.json').contents
checkFalse(cyclesJson.includes('\n  '), 'the JSON is not pretty-printed')
check(JSON.parse(cyclesJson).length, 2, 'and still parses to the right number of rows')
check(JSON.parse(cyclesJson)[0].id, 'c1', 'preserving order')

// The JSON copies keep full timestamps; only the CSV copies are normalised.
const jsonWithTimestamp = planArchiveEntries({
  cycles: [{ id: 'c1', start_date: '2026-01-01', created_at: '2026-01-01T09:30:00.000Z' }],
  dailyLogs: [],
  toCsv,
  formatDate: formatDateForCSV,
  generatedAt: GENERATED_AT,
})
check(JSON.parse(entry(jsonWithTimestamp, 'cycles.json').contents)[0].created_at, '2026-01-01T09:30:00.000Z', 'the JSON keeps the full timestamp')
checkTrue(entry(jsonWithTimestamp, 'cycles.csv').contents.includes('2026-01-01'), 'and the CSV carries the normalised date')

// Formula guarding still applies — this is the reason `toCsv` exists.
const hostileNote = planArchiveEntries({
  cycles: [],
  dailyLogs: [{ id: 'l1', date: '2026-01-02', notes: '=HYPERLINK("http://evil","click")' }],
  toCsv,
  formatDate: formatDateForCSV,
  generatedAt: GENERATED_AT,
})
const hostileCsv = entry(hostileNote, 'daily_logs.csv').contents
checkFalse(hostileCsv.includes('"=HYPERLINK'), 'a formula is not left unguarded in the CSV')
checkTrue(hostileCsv.includes("'=HYPERLINK"), 'it is prefixed so the spreadsheet shows it as text')

const emptyPlan = planArchiveEntries({ cycles: [], dailyLogs: [], toCsv, formatDate: formatDateForCSV, generatedAt: GENERATED_AT })
check(emptyPlan.length, 5, 'an empty account still gets a complete archive')
check(entry(emptyPlan, 'cycles.json').contents, '[]', 'with an empty array rather than nothing')
checkTrue(entry(emptyPlan, 'README.txt').contents.includes('0 cycles'), 'and a manifest that says so')

const nullPlan = planArchiveEntries({ cycles: null, dailyLogs: undefined, toCsv, formatDate: formatDateForCSV, generatedAt: GENERATED_AT })
check(entry(nullPlan, 'daily_logs.json').contents, '[]', 'null and undefined row sets do not crash the plan')

// Truncation is detected from the row count reaching the cap.
const atCap = planArchiveEntries({
  cycles: [],
  dailyLogs: Array.from({ length: EXPORT_ROW_LIMIT }, (_, i) => ({ id: `l${i}`, date: '2026-01-02' })),
  toCsv,
  formatDate: formatDateForCSV,
  generatedAt: GENERATED_AT,
})
checkTrue(entry(atCap, 'README.txt').contents.includes('capped'), 'a full page is reported as capped')

// ---------------------------------------------------------------------------
section('Error mapping')
// ---------------------------------------------------------------------------

check(describeExportError({ code: '42P01' }).status, 503, 'a missing table is a 503')
check(describeExportError({ code: '42703' }).status, 503, 'a missing column is a 503')
check(describeExportError({ code: '57014' }).status, 504, 'a statement timeout is a 504')
check(describeExportError({ code: '08006' }).status, 503, 'a connection failure is a 503')
check(describeExportError({ code: 'XX000' }).status, 500, 'an unrecognised code stays a 500')
check(describeExportError(null).status, 500, 'a null error is a 500')

const leaky = {
  code: '08006',
  message: 'could not connect: aws-0-ap-south-1.pooler.supabase.com:6543, relation "public.daily_logs"',
}
const described = describeExportError(leaky)
checkFalse(described.message.includes('pooler.supabase.com'), 'the pooler host does not leak')
checkFalse(described.message.includes('daily_logs'), 'the relation name does not leak')

for (const code of ['42P01', '42703', '57014', '08006', '08003', 'XX000', '']) {
  const result = describeExportError({ code })
  checkTrue(
    typeof result.message === 'string' && result.message.length > 0 &&
      Number.isInteger(result.status) && typeof result.code === 'string' && result.code.length > 0,
    `every branch is fully described (${code || 'empty'})`
  )
}

check(Number.isInteger(EXPORT_ROW_LIMIT) && EXPORT_ROW_LIMIT > 0, true, 'the row cap is a positive integer')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
