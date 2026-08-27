/**
 * daily-storage.js — reads and writes `localStorage` records that belong to a
 * calendar day.
 *
 * ## Why this module exists
 *
 * `HydrationTracker` and `SelfCareChecklist` both store a `{ date, ... }`
 * record and both got two things wrong, in the same way, for the same reason:
 * the day was resolved once, inside a mount effect, and never again.
 *
 *     useEffect(() => {
 *       setSettings(loadSettings())
 *       setCount(loadCount())      // reads getTodayISO() exactly once
 *       setMounted(true)
 *     }, [])
 *
 * **1. The daily rollover never fired while the page was open.** The self-care
 * page is a dashboard people leave open. Past midnight the hydration ring still
 * showed yesterday's glasses and the checklist still showed yesterday's ticks,
 * so the new day began already "complete". Worse, the next interaction called
 * the save path, which stamps *today's* date onto yesterday's numbers and makes
 * the stale state permanent. `NotificationPreferences` reads
 * `hercycle_water_intake` to decide whether to nudge, so it saw a full glass
 * count for a day in which the user had drunk nothing.
 *
 * **2. Restored state was trusted unconditionally.**
 *
 *     if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
 *
 * The hydration settings *modal* validates carefully — `clamp(Number(...) ||
 * default, 500, 5000)` — and then the reload path spreads the stored object
 * straight over the defaults and throws that work away. A stored
 * `cupCapacity: 0` reaches `Math.round(dailyGoal / cupCapacity)`; a stored
 * `dailyGoal: 0` makes `percentage` `NaN`, `strokeDashoffset` `NaN`, and the
 * progress ring disappears. `loadTasks` had the mirror problem: any array was
 * accepted, so an entry with no `id` produced duplicate React keys and a task
 * that could never be deleted.
 *
 * The fix for both is the same, so it lives in one place: validate on **read**,
 * not only on save, and make the day a value that is resolved per read rather
 * than captured once.
 *
 * `storage` and `today` are injectable so every branch here is testable in
 * plain Node — see `scripts/test-daily-storage.js`.
 */

import { getTodayISO, isISODateString } from './date-utils.js'

/** How a record was resolved, so a caller can react to a rollover if it wants. */
export const RECORD_STATUS = Object.freeze({
  /** The stored record is for today and passed validation. */
  CURRENT: 'current',
  /** A record existed for a different day and was rolled over. */
  ROLLED_OVER: 'rolled-over',
  /** Nothing was stored. */
  MISSING: 'missing',
  /** Something was stored but could not be used. */
  CORRUPT: 'corrupt',
})

/** Milliseconds in a day, used to schedule the rollover. */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * `localStorage`, or `null` where there isn't one (SSR, a locked-down browser,
 * a Node test). Every function here tolerates `null`, so a caller never has to
 * branch on it.
 *
 * @returns {Storage|null}
 */
export function defaultStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    // Accessing localStorage throws outright when site data is blocked.
    return null
  }
}

/**
 * Milliseconds from `now` until the next **local** midnight.
 *
 * Deliberately not `24h - elapsed`: on a DST boundary a local day is 23 or 25
 * hours long, and a fixed-length timer would fire an hour early or late for
 * the rest of the day. Constructing tomorrow's local midnight and subtracting
 * gets both right.
 *
 * A minimum of one second is returned so a timer scheduled exactly at midnight
 * cannot spin.
 *
 * @param {Date} [now]
 * @returns {number}
 */
export function msUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  const delta = nextMidnight.getTime() - now.getTime()

  if (!Number.isFinite(delta) || delta <= 0) return 1000

  return Math.min(delta, MS_PER_DAY)
}

/**
 * Parses stored JSON without throwing.
 *
 * @param {string|null} raw
 * @returns {unknown|undefined} `undefined` when the value is absent or unusable
 */
export function safeParseJson(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined

  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Coerces `value` to a finite number inside `[min, max]`, falling back when it
 * is not usable.
 *
 * Written to reject rather than coerce the dangerous cases: `null`, `''`, `[]`
 * and `true` all become numbers under `Number()`, and `0` for a divisor is
 * exactly the value that produced `Infinity` and `NaN` in the hydration ring.
 *
 * @param {unknown} value
 * @param {{ min: number, max: number, fallback: number, integer?: boolean }} bounds
 * @returns {number}
 */
export function clampNumber(value, { min, max, fallback, integer = false }) {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN

  if (!Number.isFinite(numeric)) return fallback

  const bounded = Math.min(max, Math.max(min, numeric))
  return integer ? Math.round(bounded) : bounded
}

/**
 * Reads a day-scoped record.
 *
 * @param {string} key storage key
 * @param {object} options
 * @param {(value: unknown) => unknown} options.sanitize turns a stored payload into a usable value; return `undefined` to reject it
 * @param {() => unknown} options.fallback value to use when there is nothing usable
 * @param {(value: unknown) => unknown} [options.onNewDay] transform applied when the stored record belongs to another day; defaults to `fallback`
 * @param {string} [options.today] the caller's local day; resolved per call, never captured
 * @param {Storage|null} [options.storage]
 * @returns {{ value: unknown, status: string, storedDate: string|null }}
 */
export function readDailyRecord(key, options = {}) {
  const {
    sanitize = (value) => value,
    fallback = () => null,
    onNewDay,
    today = getTodayISO(),
    storage = defaultStorage(),
  } = options

  const rollForward = typeof onNewDay === 'function' ? onNewDay : () => fallback()

  let raw = null
  try {
    raw = storage ? storage.getItem(key) : null
  } catch {
    return { value: fallback(), status: RECORD_STATUS.MISSING, storedDate: null }
  }

  if (raw === null || raw === undefined) {
    return { value: fallback(), status: RECORD_STATUS.MISSING, storedDate: null }
  }

  const parsed = safeParseJson(raw)
  if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: fallback(), status: RECORD_STATUS.CORRUPT, storedDate: null }
  }

  const storedDate = isISODateString(parsed.date) ? parsed.date : null

  const sanitized = sanitize(parsed)
  if (sanitized === undefined) {
    return { value: fallback(), status: RECORD_STATUS.CORRUPT, storedDate }
  }

  // A record with no usable date cannot be shown to belong to today, and
  // showing yesterday's progress as today's is the failure this module exists
  // to prevent. Treat it as a rollover.
  if (storedDate === null || storedDate !== today) {
    return {
      value: rollForward(sanitized),
      status: RECORD_STATUS.ROLLED_OVER,
      storedDate,
    }
  }

  return { value: sanitized, status: RECORD_STATUS.CURRENT, storedDate }
}

/**
 * Writes a day-scoped record, stamping it with the day resolved *now* rather
 * than one captured at mount.
 *
 * @param {string} key
 * @param {object} payload merged into the stored record
 * @param {{ today?: string, storage?: Storage|null }} [options]
 * @returns {boolean} whether the write landed
 */
export function writeDailyRecord(key, payload, { today = getTodayISO(), storage = defaultStorage() } = {}) {
  if (!storage) return false

  try {
    storage.setItem(key, JSON.stringify({ ...payload, date: today }))
    return true
  } catch {
    // Quota exceeded, or storage disabled mid-session. A tracker losing its
    // local state is not worth throwing out of a click handler.
    return false
  }
}

/**
 * True when a stored record belongs to a day other than `today`.
 *
 * @param {{ storedDate: string|null }} record from {@link readDailyRecord}
 * @param {string} today
 * @returns {boolean}
 */
export function isStale(record, today) {
  return !record || record.storedDate === null || record.storedDate !== today
}
