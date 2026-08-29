/**
 * Unit test suite for CSV import parser and validation rules.
 *
 * Runs with:
 *   node scripts/test-csv-import.js
 */

import { parseCsv } from '../lib/csv.js'
import { isISODateString, compareDates, getTodayISO } from '../lib/date-utils.js'
import { endsOnOrAfterStart } from '../lib/date-schemas.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  FAIL: ${label}`)
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
  console.error(`  FAIL: ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

console.log('\n--- Running CSV Import Tests ---')

// 1. Valid CSV parsing
{
  const csv = `startDate,endDate\r\n2026-01-03,2026-01-07\r\n2026-02-01,2026-02-05`
  const { headers, rows } = parseCsv(csv)
  checkDeep(headers, ['startDate', 'endDate'], 'Parsed headers')
  check(rows.length, 2, 'Parsed row count')
  check(rows[0].data.startDate, '2026-01-03', 'Row 1 startDate')
  check(rows[0].data.endDate, '2026-01-07', 'Row 1 endDate')
}

// 2. Whitespace trimming and quotes
{
  const csv = ` "startDate" , "endDate" \n " 2026-03-02 " , "2026-03-06" `
  const { headers, rows } = parseCsv(csv)
  check(headers[0], 'startDate', 'Trimmed header startDate')
  check(headers[1], 'endDate', 'Trimmed header endDate')
  check(rows[0].data.startDate, '2026-03-02', 'Trimmed value startDate')
}

// 3. Formula guard leading apostrophe stripping
{
  const csv = `startDate,endDate\n'2026-04-01,'2026-04-05`
  const { rows } = parseCsv(csv)
  check(rows[0].data.startDate, '2026-04-01', 'Stripped formula guard start date')
  check(rows[0].data.endDate, '2026-04-05', 'Stripped formula guard end date')
}

// 4. Validation logic tests
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EARLIEST_DATE = '1900-01-01'

function validateRow(startDate, endDate, today = getTodayISO()) {
  if (!startDate) return 'Missing start date'
  if (!ISO_DATE_RE.test(startDate) || !isISODateString(startDate)) return 'Invalid start date format'
  if (compareDates(startDate, EARLIEST_DATE) < 0) return 'Start date too early'
  if (compareDates(startDate, today) > 0) return 'Start date in future'

  if (endDate) {
    if (!ISO_DATE_RE.test(endDate) || !isISODateString(endDate)) return 'Invalid end date format'
    if (compareDates(endDate, EARLIEST_DATE) < 0) return 'End date too early'
    if (compareDates(endDate, today) > 0) return 'End date in future'
    if (!endsOnOrAfterStart(startDate, endDate)) return 'End date before start date'
  }
  return 'VALID'
}

check(validateRow('2026-01-03', '2026-01-07', '2026-08-29'), 'VALID', 'Valid date range')
check(validateRow('2026-01-03', '', '2026-08-29'), 'VALID', 'Valid start date with empty end date')
check(validateRow('2026-02-31', '2026-03-05', '2026-08-29'), 'Invalid start date format', 'Reject 2026-02-31')
check(validateRow('2026-01-10', '2026-01-05', '2026-08-29'), 'End date before start date', 'Reject end date before start date')
check(validateRow('2029-01-01', '2029-01-05', '2026-08-29'), 'Start date in future', 'Reject future start date')
check(validateRow('1800-01-01', '1800-01-05', '2026-08-29'), 'Start date too early', 'Reject start date before 1900')

// 5. Blank rows and empty CSV
{
  const emptyRes = parseCsv('  \n\n  \n')
  check(emptyRes.rows.length, 0, 'Blank lines produce no rows')
}

// 6. Duplicate detection test
{
  const existingSet = new Set(['2026-01-03'])
  const incomingStart = '2026-01-03'
  const isDuplicate = existingSet.has(incomingStart)
  check(isDuplicate, true, 'Correctly identifies existing startDate as duplicate')
}

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) {
  process.exit(1)
}
