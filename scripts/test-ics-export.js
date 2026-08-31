/**
 * Automated test suite for lib/ics-export.js (GitHub Issue #814).
 *
 * Exercises iCalendar generation, RFC 5545 compliance, date formatting,
 * text escaping, CRLF line endings, and edge cases for prediction exports.
 *
 *   node scripts/test-ics-export.js
 */

import {
  escapeIcsText,
  formatIcsDate,
  formatIcsTimestamp,
  generatePredictionIcs,
  parsePredictionDate,
} from '../lib/ics-export.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${JSON.stringify(expected)}`)
  console.error(`       actual:   ${JSON.stringify(actual)}`)
}

function checkTrue(actual, label) {
  check(Boolean(actual), true, label)
}

function section(title) {
  console.log(`\n— ${title}`)
}

section('Date & Escaping Helpers')

check(formatIcsDate(new Date(2026, 6, 15)), '20260715', 'formatIcsDate formats local date to YYYYMMDD')
check(formatIcsDate(null), null, 'formatIcsDate handles null date')

const parsedIso = parsePredictionDate('2026-07-15')
check(parsedIso ? parsedIso.getFullYear() : null, 2026, 'parsePredictionDate parses ISO string year')
check(parsedIso ? parsedIso.getMonth() : null, 6, 'parsePredictionDate parses ISO string month')
check(parsedIso ? parsedIso.getDate() : null, 15, 'parsePredictionDate parses ISO string date')

const parsedFormatted = parsePredictionDate('Jul 15, 2026')
check(parsedFormatted ? parsedFormatted.getFullYear() : null, 2026, 'parsePredictionDate parses "Jul 15, 2026" year')
check(parsedFormatted ? parsedFormatted.getDate() : null, 15, 'parsePredictionDate parses "Jul 15, 2026" date')

check(parsePredictionDate('—'), null, 'parsePredictionDate handles placeholder dash')
check(parsePredictionDate(null), null, 'parsePredictionDate handles null')

check(escapeIcsText('Hello; World, Test\nNew line\\Path'), 'Hello\\; World\\, Test\\nNew line\\\\Path', 'escapeIcsText escapes semicolons, commas, newlines, and backslashes')

section('ICS Structure & RFC 5545 Compliance')

const mockCycleData = {
  nextPeriodDate: '2026-07-15',
  confidence: '85%',
  averageCycleLength: 28,
  hasEnoughRecentData: true,
  cycles: [{ start_date: '2026-06-17', end_date: '2026-06-21' }],
}

const icsOutput = generatePredictionIcs(mockCycleData, {
  uidSuffix: 'static-test-uid',
  now: new Date('2026-08-30T17:00:00Z'),
})

checkTrue(icsOutput !== null, 'generatePredictionIcs returns non-null string for valid data')
checkTrue(icsOutput.includes('BEGIN:VCALENDAR'), 'Contains BEGIN:VCALENDAR')
checkTrue(icsOutput.includes('END:VCALENDAR'), 'Contains END:VCALENDAR')
checkTrue(icsOutput.includes('VERSION:2.0'), 'Contains VERSION:2.0')
checkTrue(icsOutput.includes('PRODID:-//HerCycle//Cycle Predictions//EN'), 'Contains PRODID header')
checkTrue(icsOutput.includes('BEGIN:VEVENT'), 'Contains VEVENT blocks')

// Verify CRLF line endings
checkTrue(icsOutput.includes('\r\n'), 'Uses CRLF line endings per RFC 5545')
checkTrue(!/[^\r]\n/.test(icsOutput), 'Contains no bare LF line endings')

section('Event Details & Dates')

checkTrue(icsOutput.includes('DTSTART;VALUE=DATE:20260715'), 'Period DTSTART matches nextPeriodDate')
checkTrue(icsOutput.includes('DTEND;VALUE=DATE:20260720'), 'Period DTEND is 5 days after start (exclusive)')
checkTrue(icsOutput.includes('SUMMARY:Predicted Period - HerCycle'), 'Contains period event summary')
checkTrue(icsOutput.includes('Confidence: 85%'), 'Description includes confidence')

// Ovulation event (16 days prior to 2026-07-15 is 2026-06-29)
checkTrue(icsOutput.includes('DTSTART;VALUE=DATE:20260629'), 'Ovulation DTSTART is 16 days prior')
checkTrue(icsOutput.includes('DTEND;VALUE=DATE:20260704'), 'Ovulation DTEND is 11 days prior (5 day window)')
checkTrue(icsOutput.includes('SUMMARY:Predicted Ovulation Window - HerCycle'), 'Contains ovulation event summary')

section('Edge Cases & Fallbacks')

check(generatePredictionIcs(null), null, 'Returns null when cycleData is null')
check(generatePredictionIcs({ hasEnoughRecentData: false }), null, 'Returns null when data is stale')
check(generatePredictionIcs({ nextPeriodDate: '—' }), null, 'Returns null when nextPeriodDate is invalid')

const customIcs = generatePredictionIcs(mockCycleData, {
  periodEventSummary: 'अनुमानित माहवारी - HerCycle',
  periodEventDescription: 'HerCycle AI विश्लेषण (विश्वास: 85%)',
})

checkTrue(customIcs.includes('SUMMARY:अनुमानित माहवारी - HerCycle'), 'Supports localized summary')
checkTrue(customIcs.includes('DESCRIPTION:HerCycle AI विश्लेषण (विश्वास: 85%)'), 'Supports localized description')

console.log(`\n========================================`)
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}
