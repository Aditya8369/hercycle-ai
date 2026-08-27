/**
 * Regression suite for lib/vote-result.js.
 *
 * The bug this is part of fixing: `app/api/forum/vote/route.js` used the
 * `handle_vote` RPC payload without checking that there was one.
 *
 *     const status = result.action === 'added' ? 201 : 200;
 *
 * A Supabase RPC hands back `data: null` whenever the Postgres function yields
 * NULL or is declared `void` -- which includes the "nothing to do" branches of
 * `handle_vote`. `result.action` threw `TypeError: Cannot read properties of
 * null`, the outer catch swallowed it, and a *successful* no-op reached the
 * client as a 500.
 *
 * The other half is classification. Every RPC failure collapsed into
 * `500 "Failed to record vote"`, so an `itemId` that was not a UUID -- which
 * makes Postgres raise 22P02 -- was reported as a server fault, with a stack
 * trace logged for each hostile request.
 *
 *   node scripts/test-vote-result.js
 */

import {
  UNKNOWN_ACTION,
  VOTE_ACTIONS,
  describeVoteAction,
  describeVoteError,
  normaliseVoteResult,
  statusForAction,
} from '../lib/vote-result.js'

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

function checkTruthy(value, label) {
  check(Boolean(value), true, label)
}

function checkNoThrow(fn, label) {
  try {
    fn()
    passed += 1
  } catch (err) {
    failed += 1
    console.error(`  ${label}`)
    console.error(`       threw: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// The crash
// ---------------------------------------------------------------------------

console.log('\nan empty RPC result is a success, not a 500')

checkNoThrow(() => normaliseVoteResult(null), 'a null payload does not throw')
checkNoThrow(() => normaliseVoteResult(undefined), 'an undefined payload does not throw')
checkNoThrow(() => normaliseVoteResult([]), 'an empty array does not throw')
checkNoThrow(() => normaliseVoteResult('void'), 'a scalar payload does not throw')

const empty = normaliseVoteResult(null)
check(empty.action, UNKNOWN_ACTION, 'a null payload reports an unknown action rather than crashing')
check(empty.currentVote, null, 'and claims no knowledge of the resulting vote')
check(empty.resolved, false, 'and marks itself unresolved so the client can refetch')
check(statusForAction(empty.action), 200, 'an unresolved outcome still answers 200, not 500')
check(describeVoteAction(empty), 'Vote recorded', 'and describes itself without inventing an action')

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

console.log('\nevery shape PostgREST can return')

const scalarRow = normaliseVoteResult({ action: 'added', current_vote: 1 })
check(scalarRow.action, VOTE_ACTIONS.ADDED, 'a bare object is read')
check(scalarRow.currentVote, 1, 'and its vote value is carried through')
checkTruthy(scalarRow.resolved, 'and it is marked resolved')

const setofRow = normaliseVoteResult([{ action: 'removed', current_vote: 0 }])
check(setofRow.action, VOTE_ACTIONS.REMOVED, 'a SETOF result arrives as an array and is unwrapped')
check(setofRow.currentVote, 0, 'the unwrapped row keeps its vote value')

check(
  normaliseVoteResult([null, { action: 'updated', current_vote: -1 }]).action,
  VOTE_ACTIONS.UPDATED,
  'a leading null entry is skipped rather than taken as the row'
)

check(
  normaliseVoteResult({ action: 'added', currentVote: 1 }).currentVote,
  1,
  'the camelCase spelling of the column is accepted too'
)

check(
  normaliseVoteResult({ action: 'ADDED', current_vote: '1' }).action,
  VOTE_ACTIONS.ADDED,
  'the action is matched case-insensitively'
)
check(
  normaliseVoteResult({ action: '  removed  ', current_vote: '0' }).action,
  VOTE_ACTIONS.REMOVED,
  'and is trimmed'
)
check(
  normaliseVoteResult({ action: 'added', current_vote: '-1' }).currentVote,
  -1,
  'a smallint delivered as a string is coerced'
)

// ---------------------------------------------------------------------------
// Values the database should never produce
// ---------------------------------------------------------------------------

console.log('\nvalues outside the contract are refused, not passed on')

check(
  normaliseVoteResult({ action: 'exploded', current_vote: 1 }).action,
  UNKNOWN_ACTION,
  'an unrecognised action does not leak into the response'
)
checkTruthy(
  normaliseVoteResult({ action: 'exploded', current_vote: 1 }).resolved,
  'but a usable vote value still counts as a resolved outcome'
)
check(
  normaliseVoteResult({ action: 'added', current_vote: 7 }).currentVote,
  null,
  'a vote outside {-1, 0, 1} is discarded rather than echoed'
)
check(
  normaliseVoteResult({ action: 'added', current_vote: 'yes' }).currentVote,
  null,
  'so is a non-numeric vote'
)
check(
  normaliseVoteResult({ action: 'added' }).currentVote,
  null,
  'a missing vote column is null, not undefined'
)

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

console.log('\nstatus mapping')

check(statusForAction(VOTE_ACTIONS.ADDED), 201, 'a genuinely new vote is 201 Created')
check(statusForAction(VOTE_ACTIONS.UPDATED), 200, 'switching a vote is 200 OK')
check(statusForAction(VOTE_ACTIONS.REMOVED), 200, 'withdrawing a vote is 200 OK')
check(statusForAction(VOTE_ACTIONS.UNCHANGED), 200, 'a no-op is 200 OK')
check(statusForAction(UNKNOWN_ACTION), 200, 'an unknown outcome is 200 OK, not an error')

check(describeVoteAction({ action: VOTE_ACTIONS.ADDED, resolved: true }), 'Vote added',
  'each action gets its own message')
check(describeVoteAction({ action: VOTE_ACTIONS.REMOVED, resolved: true }), 'Vote removed',
  'including withdrawal')
check(describeVoteAction({}), 'Vote recorded', 'a missing action falls back to a neutral message')
checkNoThrow(() => describeVoteAction(), 'describing nothing at all does not throw')

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

console.log('\nerror classification')

check(describeVoteError({ code: '22P02' }).status, 400,
  'a non-UUID item id is the caller\'s error, not a server fault')
check(describeVoteError({ code: '22P02' }).retryable, false,
  'and retrying it will never help')
check(describeVoteError({ code: '23503' }).status, 404,
  'voting on a deleted post is a 404')
check(describeVoteError({ code: '23505' }).status, 409,
  'a duplicate vote row is a conflict')
check(describeVoteError({ code: '42501' }).status, 403,
  'an RLS denial is a 403')
check(describeVoteError({ code: '42883' }).status, 503,
  'a missing handle_vote function is an outage, not a bad request')
check(describeVoteError({ code: 'PGRST202' }).status, 503,
  'PostgREST\'s own "function not found" maps the same way')
checkTruthy(describeVoteError({ code: '42883' }).retryable,
  'an outage is described as worth retrying')

check(describeVoteError({ code: 'ZZZZZ' }).status, 500, 'an unrecognised code stays a 500')
check(describeVoteError(null).status, 500, 'so does a missing error object')
check(describeVoteError(undefined).status, 500, 'and an undefined one')
check(describeVoteError({}).status, 500, 'and one with no code')
checkNoThrow(() => describeVoteError({ code: 42 }), 'a non-string code does not throw')

checkTruthy(
  !describeVoteError({ code: '22P02', message: 'invalid input syntax for type uuid: "drop"' })
    .error.includes('drop'),
  'the raw database message is never echoed back to the caller'
)

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
