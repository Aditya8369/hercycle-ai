/**
 * Regression suite for lib/daily-storage.js.
 *
 * The bug this is part of fixing: `HydrationTracker` and `SelfCareChecklist`
 * both store a `{ date, ... }` record, and both resolved "today" exactly once,
 * inside a mount effect.
 *
 *     useEffect(() => {
 *       setSettings(loadSettings())
 *       setCount(loadCount())
 *       setMounted(true)
 *     }, [])
 *
 * The self-care page is a dashboard people leave open. Past midnight the ring
 * still showed yesterday's glasses and the checklist still showed yesterday's
 * ticks, so the new day began already "complete" -- and the next interaction
 * called the save path, which stamps *today's* date onto yesterday's numbers
 * and makes the stale state permanent. `NotificationPreferences` reads
 * `hercycle_water_intake` directly to decide whether to nudge, so it saw a full
 * glass count for a day in which the user had drunk nothing.
 *
 * The second half is validation on read. The hydration settings modal clamps
 * carefully on save, and the reload path threw that away:
 *
 *     if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
 *
 * A stored `cupCapacity: 0` reached `Math.round(dailyGoal / cupCapacity)`; a
 * stored `dailyGoal: 0` made the ring's `strokeDashoffset` NaN, which renders
 * as no ring at all.
 *
 *   node scripts/test-daily-storage.js
 */

import {
  RECORD_STATUS,
  clampNumber,
  isStale,
  msUntilNextLocalMidnight,
  readDailyRecord,
  safeParseJson,
  writeDailyRecord,
} from '../lib/daily-storage.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ${label}`)
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
  console.error(`  ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

function checkTruthy(value, label) {
  check(Boolean(value), true, label)
}

/** An in-memory stand-in for `localStorage`, with an optional failure mode. */
function fakeStorage(initial = {}, { throwOn = null } = {}) {
  const data = { ...initial }
  return {
    getItem(key) {
      if (throwOn === 'get') throw new Error('storage blocked')
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    setItem(key, value) {
      if (throwOn === 'set') throw new Error('quota exceeded')
      data[key] = String(value)
    },
    raw: data,
  }
}

const TODAY = '2026-08-27'
const YESTERDAY = '2026-08-26'
const KEY = 'hercycle_water_intake'

const countOptions = (storage, today = TODAY) => ({
  storage,
  today,
  sanitize: (stored) => clampNumber(stored.count, { min: 0, max: 16, fallback: 0, integer: true }),
  fallback: () => 0,
  onNewDay: () => 0,
})

// ---------------------------------------------------------------------------
// The rollover
// ---------------------------------------------------------------------------

console.log('\nyesterday\'s progress never shows as today\'s')

const sameDay = readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: JSON.stringify({ date: TODAY, count: 5 }) })))
check(sameDay.value, 5, 'a record from today is restored as-is')
check(sameDay.status, RECORD_STATUS.CURRENT, 'and reported as current')

const priorDay = readDailyRecord(
  KEY,
  countOptions(fakeStorage({ [KEY]: JSON.stringify({ date: YESTERDAY, count: 8 }) }))
)
check(priorDay.value, 0, "yesterday's glasses do not carry into today")
check(priorDay.status, RECORD_STATUS.ROLLED_OVER, 'and the rollover is reported, not silent')
check(priorDay.storedDate, YESTERDAY, 'the day it came from is still available to the caller')

const undatedRecord = readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: JSON.stringify({ count: 8 }) })))
check(undatedRecord.value, 0, 'a record with no date cannot claim to be today')
check(undatedRecord.status, RECORD_STATUS.ROLLED_OVER, 'and is treated as a rollover')

const nonsenseDate = readDailyRecord(
  KEY,
  countOptions(fakeStorage({ [KEY]: JSON.stringify({ date: 'yesterday', count: 8 }) }))
)
check(nonsenseDate.value, 0, 'so is a record whose date is not a calendar day')

const impossibleDate = readDailyRecord(
  KEY,
  countOptions(fakeStorage({ [KEY]: JSON.stringify({ date: '2026-02-31', count: 8 }) }))
)
check(impossibleDate.value, 0, 'and one whose date does not exist')

// A checklist rolls forward differently: it keeps the tasks and clears the ticks.
const tasksKey = 'hercycle_selfcare_checklist'
const storedTasks = [
  { id: 'default-drink-water', isDefault: true, labelKey: 'k1', completed: true },
  { id: 'custom-1', label: 'Journal', isDefault: false, completed: true },
]

const rolledTasks = readDailyRecord(tasksKey, {
  storage: fakeStorage({ [tasksKey]: JSON.stringify({ date: YESTERDAY, tasks: storedTasks }) }),
  today: TODAY,
  sanitize: (stored) => stored.tasks,
  fallback: () => [],
  onNewDay: (tasks) => tasks.map((t) => ({ ...t, completed: false })),
})

check(rolledTasks.value.length, 2, 'a new day keeps the tasks')
check(rolledTasks.value.every((t) => t.completed === false), true, 'but clears every tick')
check(
  rolledTasks.value.find((t) => t.id === 'custom-1').label,
  'Journal',
  'including a custom task the user added'
)

// ---------------------------------------------------------------------------
// Corrupt and missing state
// ---------------------------------------------------------------------------

console.log('\ncorrupt state degrades to a usable default')

check(readDailyRecord(KEY, countOptions(fakeStorage())).status, RECORD_STATUS.MISSING,
  'nothing stored is reported as missing')
check(readDailyRecord(KEY, countOptions(fakeStorage())).value, 0, 'and falls back')

check(readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: 'not json' }))).status, RECORD_STATUS.CORRUPT,
  'unparseable JSON is reported as corrupt')
check(readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: '[]' }))).status, RECORD_STATUS.CORRUPT,
  'an array where an object belongs is corrupt')
check(readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: 'null' }))).status, RECORD_STATUS.CORRUPT,
  'a stored null is corrupt')
check(readDailyRecord(KEY, countOptions(fakeStorage({ [KEY]: '"five"' }))).status, RECORD_STATUS.CORRUPT,
  'a stored scalar is corrupt')

check(
  readDailyRecord(KEY, {
    ...countOptions(fakeStorage({ [KEY]: JSON.stringify({ date: TODAY, count: 3 }) })),
    sanitize: () => undefined,
  }).status,
  RECORD_STATUS.CORRUPT,
  'a sanitiser returning undefined rejects the record'
)

check(
  readDailyRecord(KEY, countOptions(fakeStorage({}, { throwOn: 'get' }))).value,
  0,
  'storage that throws on read -- a browser blocking site data -- still yields a usable value'
)
check(readDailyRecord(KEY, countOptions(null)).value, 0, 'so does having no storage at all')

check(safeParseJson('not json'), undefined, 'safeParseJson does not throw on garbage')
check(safeParseJson(''), undefined, 'nor on an empty string')
check(safeParseJson(null), undefined, 'nor on null')
checkDeep(safeParseJson('{"a":1}'), { a: 1 }, 'and still parses valid JSON')

// ---------------------------------------------------------------------------
// Value clamping
// ---------------------------------------------------------------------------

console.log('\nstored values are clamped on read, not only on save')

const goal = { min: 500, max: 5000, fallback: 2000, integer: true }
const capacity = { min: 50, max: 1000, fallback: 250, integer: true }

check(clampNumber(2500, goal), 2500, 'a value inside the range is kept')
check(clampNumber('2500', goal), 2500, 'a numeric string is coerced')
check(clampNumber(99999, goal), 5000, 'a value above the range is clamped')
check(clampNumber(10, goal), 500, 'a value below the range is clamped')

check(clampNumber(0, capacity), 50, 'a zero capacity is clamped -- this is the division by zero')
checkTruthy(Number.isFinite(2000 / clampNumber(0, capacity)), 'so the glass count stays finite')
check(clampNumber(0, goal), 500, 'a zero goal is clamped')
checkTruthy(Number.isFinite(500 / clampNumber(0, goal)), 'so the percentage stays finite')

check(clampNumber(null, goal), 2000, 'null falls back rather than coercing to 0')
check(clampNumber('', goal), 2000, 'an empty string falls back')
check(clampNumber([], goal), 2000, 'an empty array falls back')
check(clampNumber(true, goal), 2000, 'a boolean falls back')
check(clampNumber(undefined, goal), 2000, 'undefined falls back')
check(clampNumber(Number.NaN, goal), 2000, 'NaN falls back')
check(clampNumber(Number.POSITIVE_INFINITY, goal), 2000, 'Infinity falls back')
check(clampNumber(250.6, capacity), 251, 'an integer field is rounded')
check(clampNumber(250.6, { ...capacity, integer: false }), 250.6, 'a non-integer field is not')

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

console.log('\nwrites stamp the day resolved now, not one captured at mount')

const writeStore = fakeStorage()
check(writeDailyRecord(KEY, { count: 4 }, { today: TODAY, storage: writeStore }), true, 'a write reports success')
checkDeep(JSON.parse(writeStore.raw[KEY]), { count: 4, date: TODAY }, 'and stamps the current day')

check(
  writeDailyRecord(KEY, { count: 4, date: YESTERDAY }, { today: TODAY, storage: writeStore }),
  true,
  'a payload carrying its own date is accepted'
)
check(JSON.parse(writeStore.raw[KEY]).date, TODAY, 'but the resolved day wins over it')

check(
  writeDailyRecord(KEY, { count: 4 }, { today: TODAY, storage: fakeStorage({}, { throwOn: 'set' }) }),
  false,
  'a quota failure is reported rather than thrown out of a click handler'
)
check(writeDailyRecord(KEY, { count: 4 }, { today: TODAY, storage: null }), false,
  'and so is having no storage')

const roundTrip = fakeStorage()
writeDailyRecord(KEY, { count: 6 }, { today: TODAY, storage: roundTrip })
check(readDailyRecord(KEY, countOptions(roundTrip)).value, 6, 'a write round-trips through a read')
check(readDailyRecord(KEY, countOptions(roundTrip, '2026-08-28')).value, 0,
  'and the same record read on the next day rolls over')

check(isStale({ storedDate: YESTERDAY }, TODAY), true, 'a record from another day is stale')
check(isStale({ storedDate: TODAY }, TODAY), false, "today's record is not")
check(isStale({ storedDate: null }, TODAY), true, 'an undated record is stale')
check(isStale(null, TODAY), true, 'so is a missing one')

// ---------------------------------------------------------------------------
// Midnight scheduling
// ---------------------------------------------------------------------------

console.log('\nthe midnight timer targets local midnight')

const noon = new Date(2026, 7, 27, 12, 0, 0)
check(msUntilNextLocalMidnight(noon), 12 * 60 * 60 * 1000, 'noon is twelve hours from midnight')

const lateNight = new Date(2026, 7, 27, 23, 59, 30)
check(msUntilNextLocalMidnight(lateNight), 30 * 1000, 'half a minute before midnight is thirty seconds')

const justAfter = new Date(2026, 7, 27, 0, 0, 1)
check(
  msUntilNextLocalMidnight(justAfter),
  24 * 60 * 60 * 1000 - 1000,
  'just after midnight is almost a full day away'
)

checkTruthy(msUntilNextLocalMidnight(new Date(2026, 7, 27, 0, 0, 0)) > 0,
  'exactly midnight still schedules a positive delay rather than spinning')
checkTruthy(msUntilNextLocalMidnight(new Date()) <= 24 * 60 * 60 * 1000,
  'the delay never exceeds a day, whatever the clock says')
checkTruthy(msUntilNextLocalMidnight(new Date()) > 0, 'and is always positive')

// The delay is computed against a constructed local midnight rather than as
// "24h minus elapsed", so a 23- or 25-hour DST day does not drift the boundary.
const dstDay = new Date(2026, 2, 29, 12, 0, 0)
const expected = new Date(2026, 2, 30, 0, 0, 0, 0).getTime() - dstDay.getTime()
check(msUntilNextLocalMidnight(dstDay), expected, 'a DST transition day targets the real local midnight')

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
