/**
 * Regression suite for lib/challenge-progress.js.
 *
 * The bug this is part of fixing: `lib/challenges-data.js` ships five
 * challenges and the database accepted three.
 *
 *   supabase/migrations_challenges.sql:
 *     challenge_type TEXT NOT NULL CHECK (challenge_type IN ('water', 'stretch', 'mood')),
 *
 * `MASTER_PRODUCTION_MIGRATION.sql` writes the wider list inside
 * `CREATE TABLE IF NOT EXISTS`, which on an existing table is a no-op --
 * `CREATE TABLE IF NOT EXISTS` cannot alter a table, only decline to create
 * one. So the Iron Meal and Sleep cards rendered, were clickable, passed the
 * route's zod enum, and failed at the CHECK constraint. The route returned
 * `jsonError(upsertError.message, 500)`, handing the browser the raw
 * `violates check constraint "challenge_progress_challenge_type_check"`.
 *
 * The badge half: `user_badges` is `UNIQUE(user_id, badge_key)`, and the award
 * path issued a plain multi-row `insert` without destructuring its result --
 * so a `23505` from a concurrent request was not merely unhandled, it was
 * unobservable. Postgres rejects the whole multi-row insert on conflict, so a
 * genuinely new badge in the same batch was lost while the route still
 * reported it as earned.
 *
 *   node scripts/test-challenge-progress.js
 */

import {
  BADGE_SCAN_DAYS,
  CHALLENGE_TYPES,
  PG_ERROR_CODES,
  SCHEMA_DRIFT_MESSAGE,
  badgeScanFloor,
  describeProgressError,
  isChallengeType,
  monthlyBadgeKey,
  planBadgeAwards,
  planIncrement,
  readAwardedKeys,
  summariseCompletions,
  GENERIC_PROGRESS_FAILURE,
  describeProgressOutcome,
  readProgressResponse,
} from '../lib/challenge-progress.js'
import { BADGES, CHALLENGES, MONTHLY_BADGES } from '../lib/challenges-data.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
}

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${b}\n  actual:   ${a}`)
}

// ---------------------------------------------------------------------------
// CHALLENGE_TYPES -- derived, not repeated
//
// The route declared its own `z.enum([...])` next to a CHALLENGES object
// holding the same five keys, with nothing keeping them together. Deriving is
// what stops a sixth challenge from being added to one list and not the other.
// ---------------------------------------------------------------------------

checkDeep(
  [...CHALLENGE_TYPES].sort(),
  Object.keys(CHALLENGES).sort(),
  'the accepted types are exactly the shipped challenges'
)
check(CHALLENGE_TYPES.includes('iron'), true, 'iron is an accepted type')
check(CHALLENGE_TYPES.includes('sleep'), true, 'sleep is an accepted type')
check(CHALLENGE_TYPES.length, 5, 'five challenges ship today')

for (const type of CHALLENGE_TYPES) {
  check(isChallengeType(type), true, `"${type}" is recognised`)
  check(Number.isFinite(CHALLENGES[type].target), true, `"${type}" has a numeric target`)
}

check(isChallengeType('yoga'), false, 'an unknown type is rejected')
check(isChallengeType(''), false, 'the empty string is rejected')
check(isChallengeType(null), false, 'null is rejected')
check(isChallengeType(undefined), false, 'undefined is rejected')
check(isChallengeType(42), false, 'a number is rejected')
// `hasOwnProperty` rather than `in`, so the prototype chain is not a way in.
check(isChallengeType('toString'), false, 'an inherited property name is rejected')
check(isChallengeType('constructor'), false, '"constructor" is rejected')
check(isChallengeType('__proto__'), false, '"__proto__" is rejected')

// ---------------------------------------------------------------------------
// describeProgressError
// ---------------------------------------------------------------------------

// The headline case: the app believes the type is valid (it is in CHALLENGES)
// and the database disagrees. That is a deployment problem, not a user error
// and not a generic server fault.
const drift = describeProgressError({
  code: PG_ERROR_CODES.CHECK_VIOLATION,
  message: 'new row for relation "challenge_progress" violates check constraint "challenge_progress_challenge_type_check"',
})
check(drift.status, 503, 'a challenge_type CHECK violation is a 503, not a 500')
check(drift.message, SCHEMA_DRIFT_MESSAGE, 'it says the database has not been migrated')
check(drift.code, 'CHALLENGE_TYPE_UNSUPPORTED', 'it carries a code the UI can branch on')
check(drift.message.includes('challenge_progress'), false, 'the table name does not reach the client')
check(drift.message.includes('check constraint'), false, 'the constraint name does not reach the client')

const otherCheck = describeProgressError({ code: PG_ERROR_CODES.CHECK_VIOLATION, message: 'violates check constraint "progress_value_positive"' })
check(otherCheck.status, 400, 'a different CHECK violation is a 400')
check(otherCheck.code, 'INVALID_PROGRESS', 'a different CHECK violation has its own code')

check(describeProgressError({ code: PG_ERROR_CODES.UNIQUE_VIOLATION }).status, 409, 'a unique violation is a 409')
check(describeProgressError({ code: PG_ERROR_CODES.FOREIGN_KEY_VIOLATION }).status, 409, 'a missing user row is a 409')
check(describeProgressError({ code: PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION }).status, 400, 'an unreadable value is a 400')

const unknown = describeProgressError({ code: 'XX000', message: 'connection to server at "db.internal" (10.0.0.4), port 5432 failed' })
check(unknown.status, 500, 'an unrecognised error is a 500')
check(unknown.message.includes('db.internal'), false, 'the driver message does not reach the client')
check(unknown.message.includes('10.0.0.4'), false, 'internal addressing does not reach the client')

check(describeProgressError(null).status, 500, 'a null error is a 500')
check(describeProgressError(undefined).status, 500, 'an undefined error is a 500')
check(describeProgressError({}).status, 500, 'an error with no code is a 500')
check(describeProgressError({ code: PG_ERROR_CODES.CHECK_VIOLATION }).status, 400, 'a CHECK violation with no message is the generic 400')

// Every branch must produce all three fields; a partially-built descriptor
// would render as `undefined` in a response.
for (const code of [...Object.values(PG_ERROR_CODES), 'XX000', undefined]) {
  const described = describeProgressError({ code, message: 'challenge_type' })
  check(typeof described.message === 'string' && described.message.length > 0, true, `${code}: has a message`)
  check(Number.isInteger(described.status), true, `${code}: has a status`)
  check(typeof described.code === 'string' && described.code.length > 0, true, `${code}: has a code`)
}

// ---------------------------------------------------------------------------
// planIncrement -- the silent clamp
// ---------------------------------------------------------------------------

checkDeep(
  planIncrement(0, 250, 2000),
  { value: 250, applied: 250, discarded: 0, completed: false },
  'a first increment applies in full'
)
checkDeep(
  planIncrement(1750, 250, 2000),
  { value: 2000, applied: 250, discarded: 0, completed: true },
  'an increment that exactly reaches the target completes it'
)
checkDeep(
  planIncrement(1900, 250, 2000),
  { value: 2000, applied: 100, discarded: 150, completed: true },
  'an increment past the target reports what was discarded'
)
checkDeep(
  planIncrement(2000, 250, 2000),
  { value: 2000, applied: 0, discarded: 250, completed: true },
  'an increment on an already-complete day applies nothing and says so'
)
checkDeep(
  planIncrement(0, 1, 1),
  { value: 1, applied: 1, discarded: 0, completed: true },
  'a one-tap challenge completes on the first tap'
)
checkDeep(
  planIncrement(1, 1, 1),
  { value: 1, applied: 0, discarded: 1, completed: true },
  'a second tap on a one-tap challenge is discarded'
)

// Degenerate stored state -- a row written before a target changed, or a NULL
// that arrived as undefined.
checkDeep(planIncrement(undefined, 250, 2000), { value: 250, applied: 250, discarded: 0, completed: false }, 'an undefined existing value reads as zero')
checkDeep(planIncrement(null, 250, 2000), { value: 250, applied: 250, discarded: 0, completed: false }, 'a null existing value reads as zero')
checkDeep(planIncrement(-50, 250, 2000), { value: 250, applied: 250, discarded: 0, completed: false }, 'a negative existing value reads as zero')
checkDeep(planIncrement(NaN, 250, 2000), { value: 250, applied: 250, discarded: 0, completed: false }, 'NaN reads as zero')
checkDeep(planIncrement(100.7, 100, 2000), { value: 200, applied: 100, discarded: 0, completed: false }, 'a fractional existing value is floored')
checkDeep(planIncrement(0, 0, 2000), { value: 0, applied: 0, discarded: 0, completed: false }, 'a zero increment does nothing')
checkDeep(planIncrement(0, -5, 2000), { value: 0, applied: 0, discarded: 0, completed: false }, 'a negative increment does nothing')
checkDeep(planIncrement(0, 250, 0), { value: 1, applied: 1, discarded: 249, completed: true }, 'a zero target degrades to one rather than dividing the day away')

// `applied + discarded` is always the requested amount -- nothing may vanish
// unaccounted for, which is the whole point of reporting `discarded`.
for (const [existing, increment, target] of [[0, 250, 2000], [1900, 250, 2000], [2000, 1, 2000], [500, 2000, 2000]]) {
  const plan = planIncrement(existing, increment, target)
  check(plan.applied + plan.discarded, increment, `applied + discarded accounts for the whole increment (${existing}+${increment}/${target})`)
  check(plan.value <= target, true, `the value never exceeds the target (${existing}+${increment}/${target})`)
}

// ---------------------------------------------------------------------------
// badgeScanFloor
// ---------------------------------------------------------------------------

check(BADGE_SCAN_DAYS, 365, 'the badge scan reads a year')
check(badgeScanFloor('2026-08-28'), '2025-08-29', 'the floor is a year back, inclusive of today')
check(badgeScanFloor('2026-01-01'), '2025-01-02', 'the floor crosses a year boundary')
check(badgeScanFloor('2026-03-01') < '2026-03-01', true, 'the floor is always in the past')

// ---------------------------------------------------------------------------
// summariseCompletions
// ---------------------------------------------------------------------------

const completions = [
  { challenge_type: 'water', date: '2026-08-28' },
  { challenge_type: 'water', date: '2026-08-27' },
  { challenge_type: 'iron', date: '2026-08-27' },
  { challenge_type: 'sleep', date: '2026-08-26' },
]

checkDeep(
  summariseCompletions(completions, { streak: 3 }),
  { totalCompletions: 4, waterCompletions: 2, streak: 3, bestStreak: 0 },
  'completions are summarised for the badge checks'
)
checkDeep(
  summariseCompletions(completions, { bestStreak: 5 }),
  { totalCompletions: 4, waterCompletions: 2, streak: 0, bestStreak: 5 },
  'the monthly recap supplies a best streak instead'
)
checkDeep(
  summariseCompletions(null),
  { totalCompletions: 0, waterCompletions: 0, streak: 0, bestStreak: 0 },
  'a null row set summarises to zeroes'
)
checkDeep(
  summariseCompletions([null, undefined, { challenge_type: 'water' }]),
  { totalCompletions: 1, waterCompletions: 1, streak: 0, bestStreak: 0 },
  'null rows are dropped before counting'
)
check(summariseCompletions([], { streak: 'seven' }).streak, 0, 'a non-numeric streak reads as zero')

// ---------------------------------------------------------------------------
// planBadgeAwards
// ---------------------------------------------------------------------------

checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 0, waterCompletions: 0, streak: 0 }, []),
  [],
  'no completions earn nothing'
)
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 1, waterCompletions: 0, streak: 1 }, []),
  ['first_challenge'],
  'the first completion earns the first badge'
)
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 3, waterCompletions: 0, streak: 1 }, []),
  ['first_challenge', 'wellness_beginner'],
  'three completions earn two badges at once'
)
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 8, waterCompletions: 5, streak: 7 }, []),
  ['first_challenge', 'hydration_hero', 'wellness_beginner', 'streak_7'],
  'a full sweep earns every badge, in catalogue order'
)

// Already-held badges are not re-awarded.
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 3, waterCompletions: 0, streak: 1 }, ['first_challenge']),
  ['wellness_beginner'],
  'a held badge is skipped'
)
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 8, waterCompletions: 5, streak: 7 }, Object.keys(BADGES)),
  [],
  'holding everything plans nothing'
)
checkDeep(
  planBadgeAwards(BADGES, { totalCompletions: 3, waterCompletions: 0, streak: 1 }, null),
  ['first_challenge', 'wellness_beginner'],
  'a null earned set is treated as empty'
)

// Monthly badges carry a month suffix.
checkDeep(
  planBadgeAwards(MONTHLY_BADGES, { totalCompletions: 20, waterCompletions: 15, bestStreak: 7 }, [], '2026-08'),
  ['hydration_hero_2026-08', 'wellness_champion_2026-08', 'streak_keeper_2026-08'],
  'monthly badges are keyed by month'
)
checkDeep(
  planBadgeAwards(MONTHLY_BADGES, { totalCompletions: 20, waterCompletions: 15, bestStreak: 7 }, ['hydration_hero_2026-08'], '2026-08'),
  ['wellness_champion_2026-08', 'streak_keeper_2026-08'],
  'a badge held for this month is skipped'
)
checkDeep(
  planBadgeAwards(MONTHLY_BADGES, { totalCompletions: 20, waterCompletions: 15, bestStreak: 7 }, ['hydration_hero_2026-07'], '2026-08'),
  ['hydration_hero_2026-08', 'wellness_champion_2026-08', 'streak_keeper_2026-08'],
  'the same badge held for a *different* month does not block this one'
)

// The daily `hydration_hero` and the monthly one are different keys and must
// not shadow each other.
check(monthlyBadgeKey('hydration_hero', '2026-08'), 'hydration_hero_2026-08', 'monthly keys are suffixed')
checkDeep(
  planBadgeAwards(MONTHLY_BADGES, { totalCompletions: 20, waterCompletions: 15, bestStreak: 7 }, ['hydration_hero'], '2026-08'),
  ['hydration_hero_2026-08', 'wellness_champion_2026-08', 'streak_keeper_2026-08'],
  'holding the daily hydration badge does not block the monthly one'
)

// A malformed catalogue entry must not fail the request -- a badge is a reward
// for work that has already been recorded.
checkDeep(
  planBadgeAwards({ broken: { key: 'broken', check: () => { throw new Error('boom') } } }, {}, []),
  [],
  'a throwing badge check is skipped, not propagated'
)
checkDeep(planBadgeAwards({ noCheck: { key: 'noCheck' } }, {}, []), [], 'a badge with no check is skipped')
checkDeep(planBadgeAwards(null, {}, []), [], 'a null catalogue plans nothing')
checkDeep(planBadgeAwards(undefined, {}, []), [], 'an undefined catalogue plans nothing')

// ---------------------------------------------------------------------------
// readAwardedKeys -- reporting only what was actually persisted
// ---------------------------------------------------------------------------

checkDeep(
  readAwardedKeys([{ badge_key: 'first_challenge' }], ['first_challenge']),
  ['first_challenge'],
  'a badge that was created is reported'
)

// The race. Two requests plan the same badge; the upsert ignores duplicates, so
// the loser gets no row back for it -- and must not tell the UI to celebrate.
checkDeep(
  readAwardedKeys([{ badge_key: 'wellness_beginner' }], ['first_challenge', 'wellness_beginner']),
  ['wellness_beginner'],
  'a badge another request won is not reported, while a genuinely new one still is'
)
checkDeep(
  readAwardedKeys([], ['first_challenge']),
  [],
  'losing every badge in the batch reports nothing'
)
checkDeep(
  readAwardedKeys(null, ['first_challenge']),
  [],
  'a null result reports nothing -- not "everything succeeded"'
)
checkDeep(readAwardedKeys(undefined, ['first_challenge']), [], 'an undefined result reports nothing')
checkDeep(readAwardedKeys([{ badge_key: 'first_challenge' }], null), [], 'a null plan reports nothing')
checkDeep(readAwardedKeys([{}, { badge_key: null }], ['first_challenge']), [], 'rows with no key are ignored')
checkDeep(
  readAwardedKeys([{ badge_key: 'unexpected' }], ['first_challenge']),
  [],
  'a row that was not planned is not announced'
)
checkDeep(
  readAwardedKeys(
    [{ badge_key: 'first_challenge' }, { badge_key: 'wellness_beginner' }],
    ['first_challenge', 'wellness_beginner']
  ),
  ['first_challenge', 'wellness_beginner'],
  'a fully-successful batch reports every badge'
)

// ---------------------------------------------------------------------------
// readProgressResponse / describeProgressOutcome -- the silent client
//
// All five challenge components carried `if (json.success) onUpdate(...)` with
// no `else`, so a rejected write did nothing at all. That is how a challenge
// the database refused outright stayed broken with no visible error.
// ---------------------------------------------------------------------------

const okResult = readProgressResponse({ success: true, data: { progress_value: 250, completed: false, discarded: 0 } })
check(okResult.ok, true, 'a successful write is read as successful')
check(okResult.data.progress_value, 250, 'the new progress value comes through')
check(okResult.error, null, 'a success carries no error')
check(describeProgressOutcome(okResult), null, 'an ordinary success says nothing to the user')

const driftResult = readProgressResponse({ success: false, error: SCHEMA_DRIFT_MESSAGE, code: 'CHALLENGE_TYPE_UNSUPPORTED' })
check(driftResult.ok, false, 'a rejected write is read as failed')
check(driftResult.code, 'CHALLENGE_TYPE_UNSUPPORTED', 'the error code comes through')
check(describeProgressOutcome(driftResult).tone, 'error', 'a rejected write is shown as an error')
check(describeProgressOutcome(driftResult).message, SCHEMA_DRIFT_MESSAGE, "the server's message is what the user sees")

const cappedResult = readProgressResponse({ success: true, data: { progress_value: 2000, completed: true, discarded: 250 } })
check(cappedResult.ok, true, 'a capped write still succeeded')
check(describeProgressOutcome(cappedResult).tone, 'info', 'a discarded increment is worth saying, but is not an error')

check(readProgressResponse(null).ok, false, 'a null payload is a failure')
check(readProgressResponse(undefined).ok, false, 'an undefined payload is a failure')
check(readProgressResponse('nope').ok, false, 'a string payload is a failure')
check(readProgressResponse({ success: true }).ok, false, 'a success with no data is a failure')
check(readProgressResponse({ success: true, data: null }).ok, false, 'a success with null data is a failure')
check(readProgressResponse({}).error, GENERIC_PROGRESS_FAILURE, 'a shapeless payload gets the generic message')
check(readProgressResponse({ success: false }).error, GENERIC_PROGRESS_FAILURE, 'an error with no message gets the generic message')
check(readProgressResponse({ success: false, error: '' }).error, GENERIC_PROGRESS_FAILURE, 'an empty error message gets the generic message')
check(describeProgressOutcome(null).tone, 'error', 'a missing result is treated as a failure')
check(
  describeProgressOutcome({ ok: true, data: { discarded: 'lots' } }),
  null,
  'a non-numeric discarded count says nothing rather than claiming a cap'
)
check(
  describeProgressOutcome({ ok: true, data: { discarded: -5 } }),
  null,
  'a negative discarded count says nothing'
)

// ---------------------------------------------------------------------------
// End-to-end: two concurrent completions crossing the same threshold
//
// This is the exact scenario from the issue. Both requests read the same
// (empty) earned set and plan the same badge. With `ignoreDuplicates`, one
// creates the row and the other does not -- and only the winner may report it.
// Under the old plain multi-row insert, the loser's *entire batch* was
// rejected while the route still listed every planned badge as earned.
// ---------------------------------------------------------------------------

const sharedEarned = []
const statsA = { totalCompletions: 3, waterCompletions: 0, streak: 1 }
const statsB = { totalCompletions: 3, waterCompletions: 0, streak: 1 }

const plannedA = planBadgeAwards(BADGES, statsA, sharedEarned)
const plannedB = planBadgeAwards(BADGES, statsB, sharedEarned)

checkDeep(plannedA, plannedB, 'both concurrent requests plan the same badges')

// Request A commits first and gets both rows back.
const awardedA = readAwardedKeys(plannedA.map((badge_key) => ({ badge_key })), plannedA)
// Request B's upsert conflicts on both, so it receives no rows.
const awardedB = readAwardedKeys([], plannedB)

checkDeep(awardedA, ['first_challenge', 'wellness_beginner'], 'the winner reports both badges')
checkDeep(awardedB, [], 'the loser reports none, rather than duplicating the celebration')
check(
  new Set([...awardedA, ...awardedB]).size,
  plannedA.length,
  'across both requests each badge is announced exactly once'
)

// ---------------------------------------------------------------------------

console.log(`${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
