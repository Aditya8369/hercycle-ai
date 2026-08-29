/**
 * Unit test suite for free-text journal notes in daily cycle logs.
 *
 * Runs with:
 *   node scripts/test-journal-notes.js
 */

import { SENSITIVE_DAILY_LOG_FIELDS } from '../lib/encryption-policy.js'
import { sanitizeText } from '../lib/api-helpers.js'

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

console.log('\n--- Running Free-Text Journal Notes Tests ---')

// 1. Verify encryption policy field inclusion
{
  const includesNotes = SENSITIVE_DAILY_LOG_FIELDS.includes('notes')
  check(includesNotes, true, 'SENSITIVE_DAILY_LOG_FIELDS includes notes')
}

// 2. Note sanitization and whitespace trimming
{
  const rawInput = '   Feeling tired today <script>alert("xss")</script> and had mild cramps.   '
  const sanitized = sanitizeText(rawInput, 1000)
  check(sanitized, 'Feeling tired today  and had mild cramps.', 'Strips script tags and trims outer whitespace')
}

// 3. Note 1,000-character length capping
{
  const longNote = 'A'.repeat(1500)
  const capped = sanitizeText(longNote, 1000)
  check(capped.length, 1000, 'Caps note length to 1000 characters')
}

// 4. Null and undefined note safety
{
  check(sanitizeText(null, 1000), '', 'Null note returns empty string')
  check(sanitizeText(undefined, 1000), '', 'Undefined note returns empty string')
}

// 5. Existing log compatibility
{
  const legacyLog = { date: '2026-08-20', symptoms: ['Cramps'], mood: '😊', flow: 'f2' }
  const noteVal = legacyLog.notes ? sanitizeText(legacyLog.notes, 1000) : null
  check(noteVal, null, 'Legacy log without notes evaluates safely to null')
}

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) {
  process.exit(1)
}
