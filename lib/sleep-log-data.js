/**
 * sleep-log-data.js
 *
 * Pure helpers, constants, and validation logic for the Sleep Quality Tracker.
 * Framework-free so it can be unit-tested and shared between client and server.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const SLEEP_QUALITY_RATINGS = [
  { value: 1, label: 'Terrible', icon: '😫', color: '#E53935' },
  { value: 2, label: 'Poor', icon: '😟', color: '#FF7043' },
  { value: 3, label: 'Okay', icon: '😐', color: '#FFB74D' },
  { value: 4, label: 'Good', icon: '😊', color: '#81C784' },
  { value: 5, label: 'Excellent', icon: '😴', color: '#4FC3F7' },
]

export const SLEEP_POSITIONS = [
  'Back', 'Side', 'Stomach', 'Other',
]

export const SLEEP_DISTURBANCES = [
  { key: 'insomnia', label: 'Insomnia', icon: '🥶' },
  { key: 'nightmare', label: 'Nightmares', icon: '😱' },
  { key: 'noise', label: 'Noise', icon: '🔊' },
  { key: 'pain', label: 'Pain/Discomfort', icon: '🤕' },
  { key: 'bathroom', label: 'Bathroom', icon: '🚽' },
  { key: 'anxiety', label: 'Anxiety', icon: '😰' },
  { key: 'temperature', label: 'Temperature', icon: '🌡️' },
  { key: 'none', label: 'None', icon: '✅' },
]

export const SLEEP_GOAL_OPTIONS = [
  { hours: 6, label: '6 hours (Minimum)' },
  { hours: 7, label: '7 hours (Fair)' },
  { hours: 8, label: '8 hours (Recommended)' },
  { hours: 9, label: '9 hours (Generous)' },
]

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Returns a YYYY-MM-DD string for the given date (or today).
 */
export function toDateString(date = new Date()) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculates total sleep duration in minutes from bedTime and wakeTime strings.
 * Both should be in "HH:MM" 24-hour format.
 * Handles overnight sleep (bedTime > wakeTime means cross-midnight).
 *
 * @param {string} bedTime - "HH:MM" format
 * @param {string} wakeTime - "HH:MM" format
 * @returns {number} duration in minutes
 */
export function calculateSleepDuration(bedTime, wakeTime) {
  const [bH, bM] = bedTime.split(':').map(Number)
  const [wH, wM] = wakeTime.split(':').map(Number)
  const bedMinutes = bH * 60 + bM
  const wakeMinutes = wH * 60 + wM

  if (wakeMinutes >= bedMinutes) {
    return wakeMinutes - bedMinutes
  }
  // Overnight: e.g., 23:00 → 07:00 = 480 min
  return (24 * 60 - bedMinutes) + wakeMinutes
}

/**
 * Converts minutes to a human-readable "Xh Ym" string.
 *
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Returns a quality label and color for a given rating (1–5).
 */
export function getQualityInfo(rating) {
  const match = SLEEP_QUALITY_RATINGS.find((r) => r.value === rating)
  return match || SLEEP_QUALITY_RATINGS[2]
}

/**
 * Calculates average sleep duration and quality from an array of log entries.
 *
 * @param {Array<{duration_minutes: number, quality: number}>} logs
 * @returns {{ avgDuration: number, avgQuality: number, totalEntries: number }}
 */
export function calculateAverages(logs) {
  if (!logs || logs.length === 0) {
    return { avgDuration: 0, avgQuality: 0, totalEntries: 0 }
  }

  const totalDuration = logs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0)
  const totalQuality = logs.reduce((sum, l) => sum + (l.quality || 0), 0)

  return {
    avgDuration: Math.round(totalDuration / logs.length),
    avgQuality: Number((totalQuality / logs.length).toFixed(1)),
    totalEntries: logs.length,
  }
}

/**
 * Calculates a sleep score (0–100) based on duration and quality.
 * Duration weight: 60%, Quality weight: 40%.
 *
 * @param {number} durationMinutes
 * @param {number} quality (1–5)
 * @param {number} goalHours (default 8)
 * @returns {number} score 0–100
 */
export function calculateSleepScore(durationMinutes, quality, goalHours = 8) {
  const goalMinutes = goalHours * 60
  const durationRatio = Math.min(durationMinutes / goalMinutes, 1.2)
  const durationScore = Math.min(durationRatio * 75, 100)

  const qualityScore = ((quality - 1) / 4) * 100

  return Math.round(durationScore * 0.6 + qualityScore * 0.4)
}

/**
 * Generates a 7-day summary from sleep logs.
 *
 * @param {Array<{date: string, duration_minutes: number, quality: number}>} logs
 * @param {string} endDate YYYY-MM-DD (defaults to today)
 * @returns {Array<{date: string, dayLabel: string, duration: number, quality: number}>}
 */
export function buildWeeklySummary(logs, endDate) {
  const today = new Date(`${endDate || toDateString()}T00:00:00`)
  const logMap = new Map(logs.map((l) => [l.date, l]))
  const week = []

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const ds = toDateString(d)
    const log = logMap.get(ds)
    week.push({
      date: ds,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      duration: log?.duration_minutes || 0,
      quality: log?.quality || 0,
    })
  }

  return week
}

/**
 * Calculates the current streak of consecutive nights with logged sleep.
 *
 * @param {string[]} loggedDates - Array of YYYY-MM-DD strings
 * @param {string} endDate - YYYY-MM-DD (defaults to today)
 * @returns {number} streak count
 */
export function calculateSleepStreak(loggedDates, endDate) {
  if (!loggedDates || loggedDates.length === 0) return 0

  const dateSet = new Set(loggedDates)
  const end = new Date(`${endDate || toDateString()}T00:00:00`)
  let streak = 0

  for (let i = 0; i < 365; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const ds = toDateString(d)

    if (dateSet.has(ds)) {
      streak++
    } else {
      break
    }
  }

  return streak
}

/**
 * Validates sleep log input. Returns an array of error strings (empty = valid).
 *
 * @param {Object} input
 * @returns {string[]}
 */
export function validateSleepLogInput(input) {
  const errors = []

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push('A valid date is required (YYYY-MM-DD).')
  }

  if (!input.bed_time || !/^\d{2}:\d{2}$/.test(input.bed_time)) {
    errors.push('Bed time is required in HH:MM format.')
  }

  if (!input.wake_time || !/^\d{2}:\d{2}$/.test(input.wake_time)) {
    errors.push('Wake time is required in HH:MM format.')
  }

  const quality = Number(input.quality)
  if (!Number.isFinite(quality) || quality < 1 || quality > 5) {
    errors.push('Quality must be between 1 and 5.')
  }

  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes === 'string' && input.notes.length > 500) {
      errors.push('Notes must be 500 characters or fewer.')
    }
  }

  return errors
}
