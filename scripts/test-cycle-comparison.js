/**
 * Unit test suite for lib/cycle-comparison.js
 *
 * Runs with:
 *   node scripts/test-cycle-comparison.js
 */

import { compareCurrentCycle } from '../lib/cycle-comparison.js'

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

console.log('\n--- Running Cycle Comparison Utility Tests ---')

// 1. Insufficient data (< 4 total cycles)
{
  const cycles = [
    { start_date: '2026-08-01', cycle_length: 28 },
    { start_date: '2026-07-04', cycle_length: 28 },
  ]
  const res = compareCurrentCycle(cycles, [], { today: '2026-08-15' })
  check(res.hasEnoughData, false, 'Insufficient data when only 2 cycles exist')
  check(res.completedCount, 1, 'Completed count is 1')
}

// 2. Sufficient data with 4 cycles (1 active + 3 completed)
{
  const cycles = [
    { start_date: '2026-08-01', cycle_length: 28 }, // Current cycle (Day 15 on Aug 15)
    { start_date: '2026-07-04', cycle_length: 28 }, // Completed 1
    { start_date: '2026-06-06', cycle_length: 28 }, // Completed 2
    { start_date: '2026-05-09', cycle_length: 28 }, // Completed 3
  ]

  const dailyLogs = [
    // Current cycle logs (Aug 1 to Aug 15): 4 symptoms
    { date: '2026-08-02', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-08-10', symptoms: ['Headache', 'Bloating'] },

    // Completed 1 logs (Jul 4 to Aug 1): 4 symptoms
    { date: '2026-07-05', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-07-20', symptoms: ['Headache', 'Bloating'] },

    // Completed 2 logs (Jun 6 to Jul 4): 4 symptoms
    { date: '2026-06-07', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-06-22', symptoms: ['Headache', 'Bloating'] },

    // Completed 3 logs (May 9 to Jun 6): 4 symptoms
    { date: '2026-05-10', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-05-25', symptoms: ['Headache', 'Bloating'] },
  ]

  const res = compareCurrentCycle(cycles, dailyLogs, { today: '2026-08-15' })
  check(res.hasEnoughData, true, 'Sufficient data with 4 cycles')
  check(res.currentCycle.cycleDay, 15, 'Current cycle day is 15')
  check(res.previous3Avg.cycleLength, 28, 'Previous 3 avg cycle length is 28')
  check(res.currentCycle.symptomCount, 4, 'Current symptom count is 4')
  check(res.previous3Avg.symptomCount, 4, 'Previous 3 avg symptom count is 4')
  check(res.comparison.cycleLengthStatus, 'shorter', 'Day 15 vs 28 is shorter')
  check(res.comparison.symptomStatus, 'same', '4 vs 4 symptoms is same')
}

// 3. Longer cycle length status test
{
  const cycles = [
    { start_date: '2026-07-01', cycle_length: 28 }, // Day 35 on Aug 4
    { start_date: '2026-06-03', cycle_length: 28 },
    { start_date: '2026-05-06', cycle_length: 28 },
    { start_date: '2026-04-08', cycle_length: 28 },
  ]

  const res = compareCurrentCycle(cycles, [], { today: '2026-08-04' })
  check(res.hasEnoughData, true, 'Sufficient data')
  check(res.currentCycle.cycleDay, 35, 'Day 35')
  check(res.comparison.cycleLengthDiff, 7, 'Diff is +7 days')
  check(res.comparison.cycleLengthStatus, 'longer', 'Cycle day 35 vs avg 28 is longer')
}

// 4. More symptoms & fewer symptoms test
{
  const cycles = [
    { start_date: '2026-08-01', cycle_length: 28 },
    { start_date: '2026-07-04', cycle_length: 28 },
    { start_date: '2026-06-06', cycle_length: 28 },
    { start_date: '2026-05-09', cycle_length: 28 },
  ]

  // Completed cycles had 2 symptoms each (avg = 2)
  // Current cycle has 5 symptoms
  const logsMore = [
    { date: '2026-08-02', symptoms: ['Cramps', 'Fatigue', 'Acne', 'Bloating', 'Nausea'] },
    { date: '2026-07-05', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-06-07', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-05-10', symptoms: ['Cramps', 'Fatigue'] },
  ]

  const resMore = compareCurrentCycle(cycles, logsMore, { today: '2026-08-15' })
  check(resMore.comparison.symptomStatus, 'more', '5 symptoms vs avg 2 is more')

  // Current cycle has 0 symptoms
  const logsFewer = [
    { date: '2026-07-05', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-06-07', symptoms: ['Cramps', 'Fatigue'] },
    { date: '2026-05-10', symptoms: ['Cramps', 'Fatigue'] },
  ]

  const resFewer = compareCurrentCycle(cycles, logsFewer, { today: '2026-08-15' })
  check(resFewer.comparison.symptomStatus, 'fewer', '0 symptoms vs avg 2 is fewer')
}

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) {
  process.exit(1)
}
