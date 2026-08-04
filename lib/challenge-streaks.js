/**
 * challenge-streaks.js — streak arithmetic over completed-challenge rows.
 *
 * Extracted from the two route handlers that had grown their own copies, which
 * had drifted apart: one walked backwards from `new Date()` reading the **UTC**
 * day, the other subtracted two `Date` values. Both are now calendar-day
 * operations over `YYYY-MM-DD` strings via `lib/date-utils`, and both are
 * reachable from a test.
 */

import { addDaysISO, diffInDays } from './date-utils.js'

/**
 * Consecutive days ending at `today` on which at least one challenge was
 * completed.
 *
 * The previous implementation walked a mutable `Date` cursor and compared
 * `cursor.toISOString().slice(0, 10)` against the stored day keys. Rows are
 * written under whichever day the *server* thought it was, so as soon as the
 * user's local day and the UTC day diverged the sequence stopped matching, the
 * loop's `else break` fired, and a genuine multi-week streak reported as 0 or
 * 1 — which also withheld every badge keyed off it.
 *
 * @param {Array<{date: string}>} completedRows rows already filtered to completed
 * @param {string} today `YYYY-MM-DD` in the user's calendar
 * @returns {number}
 */
export function calculateCurrentStreak(completedRows, today) {
  const days = new Set((completedRows || []).map((row) => row?.date))

  let streak = 0
  let cursor = today

  while (cursor && days.has(cursor)) {
    streak += 1
    cursor = addDaysISO(cursor, -1)
  }

  return streak
}

/**
 * The longest run of consecutive completed days anywhere in `rows`.
 *
 * @param {Array<{date: string}>} rows
 * @returns {number}
 */
export function calculateBestStreak(rows) {
  const days = [...new Set((rows || []).map((row) => row?.date).filter(Boolean))].sort()

  let best = 0
  let current = 0
  let previous = null

  for (const day of days) {
    // diffInDays rather than subtracting two `new Date(...)` values: the
    // subtraction happens to be exact for two bare YYYY-MM-DD strings, but
    // stops being so the moment either side arrives as a timestamp.
    current = previous && diffInDays(previous, day) === 1 ? current + 1 : 1
    if (current > best) best = current
    previous = day
  }

  return best
}
