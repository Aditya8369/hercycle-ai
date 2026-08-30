/**
 * Unit test suite for Medication & Supplement Tracker data model and storage logic.
 *
 * Runs with:
 *   node scripts/test-medication-tracker.js
 */

import { readDailyRecord, writeDailyRecord, RECORD_STATUS } from '../lib/daily-storage.js'

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

/** Mock in-memory storage */
function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

const STORAGE_KEY = 'hercycle_medication_tracker'

function sanitizeItem(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (typeof entry.id !== 'string' || entry.id.trim() === '') return null
  if (typeof entry.name !== 'string' || entry.name.trim() === '') return null

  const validTypes = ['medication', 'supplement']
  const type = validTypes.includes(entry.type) ? entry.type : 'medication'

  const validStatuses = ['taken', 'missed', 'pending']
  const status = validStatuses.includes(entry.status) ? entry.status : 'pending'

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
  const preferredTime =
    typeof entry.preferredTime === 'string' && timeRegex.test(entry.preferredTime)
      ? entry.preferredTime
      : '08:00'

  return {
    id: entry.id.trim().slice(0, 100),
    name: entry.name.trim().slice(0, 100),
    type,
    dosage: typeof entry.dosage === 'string' ? entry.dosage.trim().slice(0, 50) : '',
    preferredTime,
    reminderEnabled: entry.reminderEnabled === true,
    status,
  }
}

function sanitizeRecord(stored) {
  const raw = Array.isArray(stored?.items) ? stored.items : []
  const items = []
  const seenIds = new Set()

  for (const entry of raw) {
    const clean = sanitizeItem(entry)
    if (!clean) continue
    if (seenIds.has(clean.id)) continue

    seenIds.add(clean.id)
    items.push(clean)
    if (items.length >= 30) break
  }

  return items
}

function clearDailyStatus(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({ ...item, status: 'pending' }))
}

console.log('\n--- Running Medication Tracker Storage Tests ---')

// Test 1: Missing record falls back to empty array
{
  const storage = createMockStorage()
  const { value, status } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeRecord,
    fallback: () => [],
    today: '2026-08-29',
    storage,
  })
  check(status, RECORD_STATUS.MISSING, 'Missing record status')
  checkDeep(value, [], 'Missing record returns empty array')
}

// Test 2: Current day record is returned intact
{
  const storage = createMockStorage()
  const payload = {
    items: [
      { id: 'med-1', name: 'Metformin', type: 'medication', dosage: '500 mg', preferredTime: '08:00', reminderEnabled: true, status: 'taken' },
      { id: 'med-2', name: 'Iron', type: 'supplement', dosage: '65 mg', preferredTime: '21:00', reminderEnabled: false, status: 'pending' },
    ],
  }
  writeDailyRecord(STORAGE_KEY, payload, { today: '2026-08-29', storage })

  const { value, status } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeRecord,
    fallback: () => [],
    today: '2026-08-29',
    storage,
  })

  check(status, RECORD_STATUS.CURRENT, 'Current day record status')
  check(value.length, 2, 'Item count')
  check(value[0].status, 'taken', 'Metformin is taken today')
  check(value[1].type, 'supplement', 'Iron is supplement')
}

// Test 3: Rollover to a new day resets item adherence to pending but preserves item definitions
{
  const storage = createMockStorage()
  const payload = {
    items: [
      { id: 'med-1', name: 'Metformin', type: 'medication', dosage: '500 mg', preferredTime: '08:00', reminderEnabled: true, status: 'taken' },
    ],
  }
  // Stored yesterday
  writeDailyRecord(STORAGE_KEY, payload, { today: '2026-08-28', storage })

  // Read today
  const { value, status } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeRecord,
    fallback: () => [],
    onNewDay: (storedItems) => clearDailyStatus(storedItems),
    today: '2026-08-29',
    storage,
  })

  check(status, RECORD_STATUS.ROLLED_OVER, 'Rolled over record status')
  check(value.length, 1, 'Item definition preserved')
  check(value[0].name, 'Metformin', 'Item name preserved')
  check(value[0].status, 'pending', 'Status reset to pending on new day')
}

// Test 4: Corrupt record sanitization
{
  const storage = createMockStorage()
  storage.setItem(STORAGE_KEY, JSON.stringify({
    date: '2026-08-29',
    items: [
      { id: '', name: '  ' }, // Invalid item
      { id: 'ok-1', name: ' Vitamin D ', type: 'invalid_type', dosage: '1000 IU', preferredTime: 'invalid_time' }
    ]
  }))

  const { value, status } = readDailyRecord(STORAGE_KEY, {
    sanitize: sanitizeRecord,
    fallback: () => [],
    today: '2026-08-29',
    storage,
  })

  check(status, RECORD_STATUS.CURRENT, 'Corrupt item handled')
  check(value.length, 1, 'Invalid item filtered out')
  check(value[0].type, 'medication', 'Invalid type defaulted to medication')
  check(value[0].preferredTime, '08:00', 'Invalid time defaulted to 08:00')
}

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`)
if (failed > 0) {
  process.exit(1)
}
