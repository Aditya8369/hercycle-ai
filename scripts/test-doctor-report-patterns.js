/**
 * Unit test suite for Doctor Report Symptom-Phase Pattern inclusion.
 *
 * Runs with:
 *   node scripts/test-doctor-report-patterns.js
 */

import { analyseSymptomPhases, describePattern } from '../lib/symptom-correlation.js'

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

console.log('\n--- Running Doctor Report Symptom-Phase Pattern Integration Tests ---')

// Mock Cycle & Log data
const cycles = [
  { start_date: '2026-06-01', cycle_length: 28 },
  { start_date: '2026-05-04', cycle_length: 28 },
  { start_date: '2026-04-06', cycle_length: 28 },
]

// 1. Empty logs test
{
  const analysis = analyseSymptomPhases([], cycles)
  check(analysis.hasEnoughData, false, 'Empty logs hasEnoughData is false')
  check(analysis.reportable.length, 0, 'Empty logs reportable length is 0')
}

// 2. Sufficient logs with luteal cramps concentration test
{
  const logs = []

  // Add 16 logged days across cycles
  // Menstrual phase days (0-4): no cramps
  logs.push({ date: '2026-05-04', symptoms: ['Fatigue'] })
  logs.push({ date: '2026-05-05', symptoms: ['Fatigue'] })
  logs.push({ date: '2026-05-06', symptoms: [] })
  logs.push({ date: '2026-05-07', symptoms: [] })

  // Follicular phase days (5-13)
  logs.push({ date: '2026-05-10', symptoms: [] })
  logs.push({ date: '2026-05-12', symptoms: [] })
  logs.push({ date: '2026-05-14', symptoms: [] })

  // Ovulation phase days (14-16)
  logs.push({ date: '2026-05-18', symptoms: [] })
  logs.push({ date: '2026-05-20', symptoms: [] })

  // Luteal phase days (17-27): concentrated Cramps
  logs.push({ date: '2026-05-22', symptoms: ['Cramps'] })
  logs.push({ date: '2026-05-24', symptoms: ['Cramps'] })
  logs.push({ date: '2026-05-26', symptoms: ['Cramps'] })
  logs.push({ date: '2026-05-28', symptoms: ['Cramps'] })
  logs.push({ date: '2026-05-30', symptoms: ['Cramps'] })
  logs.push({ date: '2026-05-31', symptoms: ['Cramps'] })

  const analysis = analyseSymptomPhases(logs, cycles)
  check(analysis.hasEnoughData, true, 'Sufficient logs hasEnoughData is true')
  check(analysis.reportable.length > 0, true, 'Reportable patterns found')

  if (analysis.reportable.length > 0) {
    const crampsEntry = analysis.reportable.find((e) => e.symptom === 'cramps')
    check(Boolean(crampsEntry), true, 'Cramps reportable pattern found')
    check(crampsEntry.peakPhase, 'luteal', 'Cramps peak phase is luteal')

    const descEn = describePattern(crampsEntry, (k) => k)
    check(descEn.includes('luteal'), true, 'English pattern description mentions luteal')

    const descHi = describePattern(crampsEntry, (k) => (k === 'luteal' ? 'ल्यूटियल' : k))
    check(descHi.includes('ल्यूटियल'), true, 'Hindi pattern description mentions Hindi phase name')
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) {
  process.exit(1)
}
