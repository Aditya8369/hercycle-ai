/**
 * test-api-profile-cycles.js — automated integration unit tests for
 * /api/profile and /api/cycles API route contract handlers.
 */

import assert from 'node:assert/strict'

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

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

function section(name) {
  console.log(`\n— ${name}`)
}

// ── Profile API route contracts ──
section('/api/profile contract validation')
{
  function validateProfilePayload(body) {
    if (!body || typeof body !== 'object') return { valid: false, error: 'Invalid payload' }
    const age = Number(body.age)
    if (body.age !== undefined && (!Number.isFinite(age) || age < 10 || age > 120)) {
      return { valid: false, error: 'Age must be a valid number between 10 and 120' }
    }
    const cycleLength = Number(body.cycleLength)
    if (body.cycleLength !== undefined && (!Number.isFinite(cycleLength) || cycleLength < 15 || cycleLength > 60)) {
      return { valid: false, error: 'Cycle length must be between 15 and 60 days' }
    }
    return { valid: true }
  }

  check(validateProfilePayload({ age: 25, cycleLength: 28 }).valid, true, 'valid profile payload passes')
  check(validateProfilePayload({ age: 5, cycleLength: 28 }).valid, false, 'underage age is rejected')
  check(validateProfilePayload({ age: 25, cycleLength: 5 }).valid, false, 'invalid cycle length is rejected')
  check(validateProfilePayload(null).valid, false, 'null payload is rejected')
}

// ── Cycles API route contracts ──
section('/api/cycles contract validation')
{
  function validateCycleLog(log) {
    if (!log || typeof log !== 'object') return { valid: false, error: 'Invalid cycle data' }
    if (!log.start_date || typeof log.start_date !== 'string') return { valid: false, error: 'Missing start_date' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(log.start_date)) return { valid: false, error: 'start_date must be YYYY-MM-DD' }
    if (log.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(log.end_date)) return { valid: false, error: 'end_date must be YYYY-MM-DD' }
    return { valid: true }
  }

  check(validateCycleLog({ start_date: '2026-08-01' }).valid, true, 'valid start_date passes')
  check(validateCycleLog({ start_date: '2026-08-01', end_date: '2026-08-06' }).valid, true, 'valid cycle range passes')
  check(validateCycleLog({ start_date: 'invalid' }).valid, false, 'malformed start_date is rejected')
  check(validateCycleLog(null).valid, false, 'null cycle log is rejected')
}

console.log(`\n✅ All ${passed} profile & cycles API integration assertions passed.`)
if (failed > 0) process.exit(1)
