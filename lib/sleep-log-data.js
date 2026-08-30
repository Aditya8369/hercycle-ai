/**
 * sleep-log-data.js
 *
 * Pure helper functions and constants for sleep-log tracking on the
 * Daily Wellness Score dashboard.  All date work uses plain YYYY-MM-DD
 * strings or local-timezone Date objects (see lib/date-utils.js) to
 * avoid the UTC-midnight pitfall.
 */

import { toISODate } from './date-utils.js'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const SLEEP_QUALITY_RATINGS = [
  { value: 1, label: 'Terrible', color: '#ef4444' },
  { value: 2, label: 'Poor',     color: '#f97316' },
  { value: 3, label: 'Okay',     color: '#eab308' },
  { value: 4, label: 'Good',     color: '#22c55e' },
  { value: 5, label: 'Excellent', color: '#3b82f6' },
]

export const SLEEP_DISTURBANCES = [
  { key: 'none',          label: 'None' },
  { key: 'noise',         label: 'Noise' },
  { key: 'pain',          label: 'Pain / cramps' },
  { key: 'bathroom',      label: 'Bathroom trips' },
  { key: 'anxiety',       label: 'Anxiety / racing thoughts' },
  { key: 'temperature',   label: 'Temperature discomfort' },
  { key: 'partner',       label: 'Partner disturbance' },
  { key: 'nightmare',     label: 'Nightmares' },
  { key: 'other',         label: 'Other' },
]

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns today's date (or the supplied Date) as a YYYY-MM-DD string
 * in the user's local timezone.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function toDateString(date) {
  return toISODate(date ?? new Date())
}

/* ------------------------------------------------------------------ */
/*  Duration helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Converts an "HH:MM" time string to minutes since midnight.
 * @param {string} timeStr
 * @returns {number}
 */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/**
 * Calculates sleep duration in minutes between a bed-time and wake-time
 * (both "HH:MM" strings in the user's local timezone).  Handles overnight
 * sleep by assuming wake is on the following calendar day when needed.
 *
 * @param {string} bedTime  – "HH:MM"
 * @param {string} wakeTime – "HH:MM"
 * @returns {number} duration in whole minutes
 */
export function calculateSleepDuration(bedTime, wakeTime) {
  const bed = timeToMinutes(bedTime)
  const wake = timeToMinutes(wakeTime)

  if (wake >= bed) return wake - bed
  // Overnight: e.g. 23:00 → 07:00
  return (1440 - bed) + wake
}

/**
 * Formats a duration in minutes as a human-readable string: "8h",
 * "45m", "8h 30m", or "0m".
 *
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if (!minutes) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/* ------------------------------------------------------------------ */
/*  Quality helpers                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_QUALITY = { value: 3, label: 'Okay', color: '#eab308' }

/**
 * Returns the quality-rating object for the given 1-5 value.
 * Falls back to "Okay" for out-of-range inputs.
 *
 * @param {number} quality
 * @returns {{ value: number, label: string, color: string }}
 */
export function getQualityInfo(quality) {
  return SLEEP_QUALITY_RATINGS.find(r => r.value === quality) ?? DEFAULT_QUALITY
}

/* ------------------------------------------------------------------ */
/*  Aggregate helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Calculates average duration, quality, and total entry count for an
 * array of sleep-log entries.
 *
 * @param {Array<{ duration_minutes: number, quality?: number }>} entries
 * @returns {{ avgDuration: number, avgQuality: number, totalEntries: number }}
 */
export function calculateAverages(entries) {
  if (!entries.length) return { avgDuration: 0, avgQuality: 0, totalEntries: 0 }

  const totalDuration = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0)
  const totalQuality = entries.reduce((s, e) => s + (e.quality || 0), 0)

  return {
    avgDuration: Math.round(totalDuration / entries.length),
    avgQuality: +(totalQuality / entries.length).toFixed(1),
    totalEntries: entries.length,
  }
}

/**
 * Computes a 0-100 sleep score blending duration (60 %) and quality (40 %).
 * Duration contribution caps at 100 % of the target; quality is linear 1-5.
 *
 * @param {number} duration   – minutes of sleep
 * @param {number} quality    – 1-5 rating
 * @param {number} targetHours – user's target in hours
 * @returns {number} 0-100
 */
export function calculateSleepScore(duration, quality, targetHours) {
  const targetMin = targetHours * 60
  const durationRatio = Math.min(duration / targetMin, 1)
  const qualityRatio = quality / 5
  return Math.round(durationRatio * 60 + qualityRatio * 40)
}

/* ------------------------------------------------------------------ */
/*  Weekly summary                                                     */
/* ------------------------------------------------------------------ */

/**
 * Builds a 7-day array ending on `endDate`.  Each element has the shape
 * `{ date, entry }` where `entry` is the matching sleep-log entry (or
 * null) from the supplied entries array.
 *
 * @param {Array<{ date: string }>} entries
 * @param {string} endDate – YYYY-MM-DD
 * @returns {Array<{ date: string, entry: object|null }>}
 */
export function buildWeeklySummary(entries, endDate) {
  const end = new Date(endDate)
  const byDate = new Map(entries.map(e => [e.date, e]))
  const days = []

  for (let i = 6; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)
    const dateStr = toISODate(d)
    days.push({ date: dateStr, entry: byDate.get(dateStr) ?? null })
  }

  return days
}

/* ------------------------------------------------------------------ */
/*  Streak                                                             */
/* ------------------------------------------------------------------ */

/**
 * Counts the number of consecutive calendar days (ending at
 * `referenceDate`) present in the supplied date array.  Dates are
 * expected as "YYYY-MM-DD" strings.
 *
 * @param {string[]} dates
 * @param {string}   [referenceDate] – defaults to today
 * @returns {number}
 */
export function calculateSleepStreak(dates, referenceDate) {
  if (!dates.length) return 0

  const set = new Set(dates)
  const ref = referenceDate ? new Date(referenceDate) : new Date()
  let streak = 0
  const cursor = new Date(ref)

  while (set.has(toISODate(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validates sleep-log input and returns an array of human-readable
 * error strings.  An empty array means the input is valid.
 *
 * Expected fields: date, bed_time, wake_time, quality, notes (optional).
 *
 * @param {object} input
 * @returns {string[]}
 */
export function validateSleepLogInput(input) {
  const errors = []

  if (!input.date) errors.push('Date is required')
  if (typeof input.quality !== 'number' || input.quality < 1 || input.quality > 5) {
    errors.push('Quality must be between 1 and 5')
  }
  if (input.notes && input.notes.length > 500) {
    errors.push('Notes must be 500 characters or fewer')
  }

  return errors
}
