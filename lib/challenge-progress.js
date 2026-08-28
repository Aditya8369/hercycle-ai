/**
 * challenge-progress.js — the decisions behind recording a challenge and
 * awarding a badge.
 *
 * ## The bug this exists to prevent
 *
 * `lib/challenges-data.js` ships five challenges. The database accepted three.
 *
 * `supabase/migrations_challenges.sql` created the table with
 *
 *     challenge_type TEXT NOT NULL CHECK (challenge_type IN ('water', 'stretch', 'mood')),
 *
 * and `MASTER_PRODUCTION_MIGRATION.sql` writes the wider list *inside*
 * `CREATE TABLE IF NOT EXISTS`, which on an existing table is a no-op. So the
 * Iron Meal and Sleep cards rendered, were clickable, passed the route's zod
 * enum — and then failed at the database with a CHECK violation, which the
 * route handed straight back to the browser:
 *
 *     jsonError(upsertError.message, 500)
 *     // "new row for relation \"challenge_progress\" violates check
 *     //  constraint \"challenge_progress_challenge_type_check\""
 *
 * A 500 for a schema-drift bug, leaking the table and constraint names, with
 * nothing the UI could say beyond "something went wrong". `app/api/cycles/route.js`
 * has had `toCleanCycleError` for exactly this class of error (`23514`) since
 * the cycle date constraints landed; the challenges route never got one.
 *
 * ## The other half: badges
 *
 * `user_badges` is `UNIQUE(user_id, badge_key)`. The award path read the earned
 * set, computed what was missing, and inserted:
 *
 *     await supabaseAdmin.from('user_badges').insert(toAward.map(...))
 *     return toAward.map((b) => b.key)
 *
 * The result was not destructured, so the error was not merely unhandled — it
 * was not observable. Two requests completing two different challenges at
 * nearly the same moment both read "first_challenge not yet earned" and both
 * insert it; one wins, the other raises `23505`, and because it is a single
 * multi-row insert the loser's **entire batch** is rejected. Any genuinely new
 * badge in that batch is lost, and the route still reports it in `newBadges`,
 * so the UI plays the unlock animation for a badge the user does not have.
 *
 * `app/api/challenges/monthly-recap/route.js` performs the same insert, from a
 * **GET** handler, so a page refresh is a write.
 *
 * ## What lives here
 *
 * The parts that are decisions rather than I/O: which types exist, what a
 * Postgres error means to a user, how much of an increment actually landed, and
 * which badges a set of stats has earned that are not already held. All of it
 * is reachable from `node scripts/test-challenge-progress.js`.
 */

import { CHALLENGES } from './challenges-data.js'
import { addDaysISO } from './date-utils.js'

/**
 * The accepted challenge types, derived from the catalogue rather than
 * repeated.
 *
 * The route declared its own `z.enum(['water', 'stretch', 'mood', 'iron', 'sleep'])`
 * next to a `CHALLENGES` object holding the same five keys — two lists that had
 * to be edited together and nothing making them. Deriving means adding a
 * challenge updates the schema for free, and the only remaining place to
 * remember is the database migration, which is now called out in
 * `supabase/10_challenge_types_and_badges.sql`.
 */
export const CHALLENGE_TYPES = Object.freeze(Object.keys(CHALLENGES))

/**
 * True when `value` names a challenge the app ships.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isChallengeType(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHALLENGES, value)
}

/**
 * Days of history the badge scan reads.
 *
 * The scan was unbounded — every completed row the user had ever written, on
 * every completion, forever — to answer three questions whose thresholds are 1,
 * 3 and 5, plus a streak that by construction cannot reach further back than
 * the streak itself.
 *
 * A year is the bound rather than a month because `wellness_beginner` and
 * `hydration_hero` are cumulative in intent: a user who logs sporadically
 * should still cross 3 and 5 eventually. Beyond a year the thresholds are long
 * since passed in any realistic usage, and badges are never revoked — once
 * earned, the row exists and the scan does not need to re-derive it.
 */
export const BADGE_SCAN_DAYS = 365

/**
 * The earliest day the badge scan reads.
 *
 * @param {string} today `YYYY-MM-DD`
 * @returns {string} `YYYY-MM-DD`
 */
export function badgeScanFloor(today) {
  return addDaysISO(today, -(BADGE_SCAN_DAYS - 1))
}

/**
 * Postgres error codes this route can actually produce.
 *
 * Named rather than inlined, because `'23514'` in a comparison says nothing
 * about what went wrong at the point where the reader needs to know.
 */
export const PG_ERROR_CODES = Object.freeze({
  CHECK_VIOLATION: '23514',
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  INVALID_TEXT_REPRESENTATION: '22P02',
})

/** Returned when the type is valid to the app but rejected by the database. */
export const SCHEMA_DRIFT_MESSAGE =
  'This challenge is not available yet. The database has not been migrated to accept it — please contact support.'

/**
 * Maps a Postgres error to a clean status and a message a user can act on.
 *
 * Mirrors `toCleanCycleError` in `app/api/cycles/route.js`. The important case
 * is the CHECK violation: the app believes the type is valid (it is in
 * `CHALLENGES`) and the database disagrees, which is a deployment problem, not
 * a user error and not a generic server fault. It is reported as a 503 —
 * "temporarily unavailable, and not because of anything you did" — rather than
 * as a 500 carrying the constraint name.
 *
 * @param {{ code?: string, message?: string }} error
 * @returns {{ message: string, status: number, code: string }}
 */
export function describeProgressError(error) {
  const code = error?.code

  if (code === PG_ERROR_CODES.CHECK_VIOLATION) {
    // The route validates `challenge_type` against CHALLENGES before writing,
    // so a CHECK violation here means the schema is behind the code.
    if (error?.message?.includes('challenge_type')) {
      return { message: SCHEMA_DRIFT_MESSAGE, status: 503, code: 'CHALLENGE_TYPE_UNSUPPORTED' }
    }
    return { message: 'That challenge entry was rejected as invalid.', status: 400, code: 'INVALID_PROGRESS' }
  }

  if (code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    // Two writes for the same (user, day, challenge) raced. The upsert makes
    // this unreachable on the progress row itself, but a badge insert can
    // still hit it, and "you already have this" is not a failure.
    return { message: 'That entry was already recorded.', status: 409, code: 'ALREADY_RECORDED' }
  }

  if (code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return { message: 'Your account is not set up yet. Please reload and try again.', status: 409, code: 'USER_NOT_READY' }
  }

  if (code === PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION) {
    return { message: 'That request contained a value the database could not read.', status: 400, code: 'INVALID_INPUT' }
  }

  // Anything else is a genuine server fault, and its text is not shown to the
  // caller — the raw driver message was previously returned verbatim.
  return { message: 'Could not save your challenge progress.', status: 500, code: 'PROGRESS_WRITE_FAILED' }
}

/**
 * Works out what an increment actually does to a day's progress.
 *
 * `Math.min(existing + increment, target)` capped silently and returned the
 * capped number with no indication that anything had been dropped — the same
 * failure mode `lib/request-day.js` documents for the timezone bug ("the
 * increment is clamped away entirely, the counter does not move, and the streak
 * develops a hole"). Reporting `discarded` lets the route say "you have already
 * hit today's goal" instead of pretending the tap did something.
 *
 * @param {number} existingValue current progress, may be undefined
 * @param {number} increment the requested increase
 * @param {number} target the challenge's goal
 * @returns {{ value: number, applied: number, discarded: number, completed: boolean }}
 */
export function planIncrement(existingValue, increment, target) {
  const current = Number.isFinite(existingValue) && existingValue > 0 ? Math.floor(existingValue) : 0
  const requested = Number.isFinite(increment) && increment > 0 ? Math.floor(increment) : 0
  const goal = Number.isFinite(target) && target > 0 ? Math.floor(target) : 1

  const value = Math.min(current + requested, goal)
  const applied = value - current

  return {
    value,
    applied,
    discarded: requested - applied,
    completed: value >= goal,
  }
}

/**
 * Builds the key a monthly badge is stored under.
 *
 * @param {string} badgeKey
 * @param {string} monthKey `YYYY-MM`
 * @returns {string}
 */
export function monthlyBadgeKey(badgeKey, monthKey) {
  return `${badgeKey}_${monthKey}`
}

/**
 * Decides which badges a set of stats has earned that are not already held.
 *
 * Separated from the write so the write can be idempotent and the decision can
 * be tested. `earnedKeys` is whatever the caller has read; it is *not* trusted
 * to be complete, because between reading it and writing, another request can
 * award the same badge — which is the race this whole module exists to survive.
 *
 * @param {Record<string, {key?: string, check: Function}>} catalogue `BADGES` or `MONTHLY_BADGES`
 * @param {object} stats the values the `check` functions read
 * @param {Iterable<string>} earnedKeys keys the user already holds
 * @param {string} [monthKey] when present, keys are suffixed with it
 * @returns {string[]} badge keys to attempt, in catalogue order
 */
export function planBadgeAwards(catalogue, stats, earnedKeys, monthKey = null) {
  const held = new Set(earnedKeys || [])
  const planned = []

  for (const [name, badge] of Object.entries(catalogue || {})) {
    const baseKey = badge?.key || name
    const storedKey = monthKey ? monthlyBadgeKey(baseKey, monthKey) : baseKey

    if (held.has(storedKey)) continue

    let earned = false
    try {
      earned = Boolean(badge?.check?.(stats))
    } catch {
      // A malformed catalogue entry must not fail the whole request. The
      // badge simply is not awarded.
      earned = false
    }

    if (earned) planned.push(storedKey)
  }

  return planned
}

/**
 * Reads back which of the planned badges were actually persisted.
 *
 * The award insert becomes `upsert(..., { onConflict, ignoreDuplicates: true })
 * .select('badge_key')`, so the returned rows are exactly the ones this request
 * created — a badge another concurrent request won is simply absent. Reporting
 * only those stops the UI playing an unlock animation for a badge that was not
 * awarded here (or, under the old code, was not awarded at all because the
 * whole multi-row insert had been rejected).
 *
 * A `null` payload — which Supabase returns when a write matched nothing —
 * means nothing was created, not "everything was".
 *
 * @param {Array<{badge_key?: string}>|null|undefined} rows the upsert's returned rows
 * @param {string[]} planned the keys that were attempted
 * @returns {string[]}
 */
export function readAwardedKeys(rows, planned) {
  if (!Array.isArray(rows)) return []

  const created = new Set(
    rows.map((row) => (typeof row?.badge_key === 'string' ? row.badge_key : null)).filter(Boolean)
  )

  // Intersect rather than return `created` directly: the caller reports what it
  // asked for and got, and an unexpected row is not something to announce.
  return (planned || []).filter((key) => created.has(key))
}

/**
 * Summarises a completed-row set into the stats the badge checks read.
 *
 * The two routes each built this inline and had already drifted — the daily
 * path counted `allProgress?.length` while the monthly one counted `rows.length`
 * over a different window, and one computed a current streak where the other
 * computed a best streak.
 *
 * @param {Array<{challenge_type?: string, date?: string}>} rows completed rows
 * @param {{ streak?: number, bestStreak?: number }} [streaks]
 * @returns {{ totalCompletions: number, waterCompletions: number, streak: number, bestStreak: number }}
 */
export function summariseCompletions(rows, streaks = {}) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : []

  return {
    totalCompletions: safeRows.length,
    waterCompletions: safeRows.filter((row) => row.challenge_type === 'water').length,
    streak: Number.isFinite(streaks.streak) ? streaks.streak : 0,
    bestStreak: Number.isFinite(streaks.bestStreak) ? streaks.bestStreak : 0,
  }
}

/**
 * Default message shown when a challenge write fails and the server did not
 * supply one.
 */
export const GENERIC_PROGRESS_FAILURE = 'Could not save that just now. Please try again.'

/**
 * Reads a `/api/challenges/progress` response body.
 *
 * All five challenge components carried the same three lines:
 *
 *     const json = await res.json()
 *     if (json.success) onUpdate?.(json.data)
 *
 * — with no `else`. A failure therefore did nothing at all: the tap registered,
 * the request went out, the server said no, and the card sat there unchanged
 * with no error and no explanation. That is how two challenges could be
 * unrecordable for the entire life of a deployment without a single report
 * beyond "the iron one doesn't work".
 *
 * @param {unknown} payload the parsed response body
 * @returns {{ ok: boolean, data: object|null, error: string|null, code: string|null }}
 */
export function readProgressResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, data: null, error: GENERIC_PROGRESS_FAILURE, code: null }
  }

  if (payload.success === true && payload.data && typeof payload.data === 'object') {
    return { ok: true, data: payload.data, error: null, code: null }
  }

  return {
    ok: false,
    data: null,
    error: typeof payload.error === 'string' && payload.error ? payload.error : GENERIC_PROGRESS_FAILURE,
    code: typeof payload.code === 'string' ? payload.code : null,
  }
}

/**
 * Describes the outcome of a progress write for the user.
 *
 * `null` means "nothing worth saying" — the ordinary case where the increment
 * simply landed. The two things worth saying are a failure, and an increment
 * that was silently thrown away because the day's goal was already met.
 *
 * @param {{ ok: boolean, data: object|null, error: string|null }} result
 * @returns {{ tone: 'error'|'info', message: string }|null}
 */
export function describeProgressOutcome(result) {
  if (!result?.ok) {
    return { tone: 'error', message: result?.error || GENERIC_PROGRESS_FAILURE }
  }

  if (Number.isFinite(result.data?.discarded) && result.data.discarded > 0) {
    return { tone: 'info', message: "You've already hit today's goal for this one — nice work!" }
  }

  return null
}
