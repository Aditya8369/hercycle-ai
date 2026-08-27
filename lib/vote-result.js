/**
 * vote-result.js — reads what the `handle_vote` RPC actually returned.
 *
 * ## Why this module exists
 *
 * `app/api/forum/vote/route.js` used the RPC payload without checking that
 * there was one:
 *
 *     const status = result.action === 'added' ? 201 : 200;
 *     return NextResponse.json({ message: `Vote ${result.action}`, ... });
 *
 * A Supabase RPC hands back `data: null` whenever the Postgres function yields
 * NULL or is declared `void` — including the "nothing to do" branches of
 * `handle_vote`. `result.action` then threw `TypeError: Cannot read properties
 * of null`, the route's outer `catch` swallowed it, and a *successful* no-op
 * was reported to the client as a **500**.
 *
 * The same call is also shaped inconsistently across PostgREST versions: a
 * function returning `SETOF` arrives as an array, a scalar-returning one as a
 * bare object. Both spellings are handled here so the route does not have to
 * care, and so the behaviour can be tested without a database.
 *
 * The second half of the module is error classification. Every failure used to
 * collapse into `500 "Failed to record vote"`, which reported a caller's own
 * malformed UUID as a server fault and logged a stack trace for each one.
 *
 * The module has no imports, so the route and `scripts/test-vote-result.js`
 * exercise exactly the same code.
 */

/** Outcomes `handle_vote` can report. */
export const VOTE_ACTIONS = Object.freeze({
  ADDED: 'added',
  UPDATED: 'updated',
  REMOVED: 'removed',
  UNCHANGED: 'unchanged',
})

/** Returned when the RPC succeeded but said nothing about what it did. */
export const UNKNOWN_ACTION = 'unknown'

const KNOWN_ACTIONS = new Set(Object.values(VOTE_ACTIONS))

/** The only values a stored vote may take. */
const VALID_VOTES = new Set([1, 0, -1])

/**
 * Unwraps the row PostgREST returned. `SETOF` functions arrive as an array,
 * scalar ones as a bare object, and a `void` or NULL result as `null`.
 *
 * @param {unknown} data
 * @returns {object|null}
 */
function unwrapRow(data) {
  if (Array.isArray(data)) {
    const first = data.find((entry) => entry && typeof entry === 'object')
    return first || null
  }
  if (data && typeof data === 'object') return data
  return null
}

/**
 * Coerces a stored vote to `1`, `0` or `-1`, or `null` when it is not one of
 * those. Postgres may hand a `smallint` back as a string over the wire.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function readVote(value) {
  if (value === null || value === undefined || value === '') return null

  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null

  return VALID_VOTES.has(numeric) ? numeric : null
}

/**
 * Normalises an RPC result into something the route can answer with, whatever
 * the function actually returned.
 *
 * `resolved` is the important field: it is `false` when the database succeeded
 * but told us nothing, which is a legitimate outcome and must not be reported
 * as an error. The route passes it on so a client can decide whether to trust
 * its optimistic update or refetch the true tally.
 *
 * @param {unknown} data the `data` half of a Supabase `rpc()` response
 * @returns {{ action: string, currentVote: number|null, resolved: boolean }}
 */
export function normaliseVoteResult(data) {
  const row = unwrapRow(data)

  if (!row) {
    return { action: UNKNOWN_ACTION, currentVote: null, resolved: false }
  }

  const rawAction = typeof row.action === 'string' ? row.action.trim().toLowerCase() : ''
  const action = KNOWN_ACTIONS.has(rawAction) ? rawAction : UNKNOWN_ACTION

  const currentVote = readVote(
    row.current_vote !== undefined ? row.current_vote : row.currentVote
  )

  return {
    action,
    currentVote,
    resolved: action !== UNKNOWN_ACTION || currentVote !== null,
  }
}

/**
 * The status a successful vote should answer with.
 *
 * Only a genuinely new row is a **201 Created**. A toggle, a switch or a no-op
 * is a **200 OK** — including the case where the function said nothing, which
 * is exactly where the old code threw.
 *
 * @param {string} action from {@link normaliseVoteResult}
 * @returns {number}
 */
export function statusForAction(action) {
  return action === VOTE_ACTIONS.ADDED ? 201 : 200
}

/**
 * A human-readable summary of the outcome, for the response body.
 *
 * @param {{ action: string, resolved: boolean }} result
 * @returns {string}
 */
export function describeVoteAction({ action, resolved } = {}) {
  if (!resolved || action === UNKNOWN_ACTION) return 'Vote recorded'

  switch (action) {
    case VOTE_ACTIONS.ADDED:
      return 'Vote added'
    case VOTE_ACTIONS.UPDATED:
      return 'Vote updated'
    case VOTE_ACTIONS.REMOVED:
      return 'Vote removed'
    default:
      return 'Vote unchanged'
  }
}

/**
 * Postgres / PostgREST error codes this route can distinguish, mapped to the
 * status that honestly describes them.
 *
 * `22P02` is the one that mattered most: an `itemId` that is not a UUID makes
 * Postgres raise it, and the old route reported the caller's own bad input as
 * a 500.
 */
const ERROR_CLASSIFICATIONS = Object.freeze({
  '22P02': { status: 400, error: 'Invalid item reference' },
  '23503': { status: 404, error: 'That post or comment no longer exists' },
  '23505': { status: 409, error: 'That vote has already been recorded' },
  '42883': { status: 503, error: 'Voting is temporarily unavailable' },
  PGRST202: { status: 503, error: 'Voting is temporarily unavailable' },
  '42501': { status: 403, error: 'You are not allowed to vote on this item' },
})

/**
 * Classifies an RPC error.
 *
 * `retryable` distinguishes "come back later" from "this request will never
 * work", so a client can tell a transient outage from its own bad input
 * instead of retrying a malformed id forever.
 *
 * @param {{ code?: string, message?: string }|null|undefined} error
 * @returns {{ status: number, error: string, retryable: boolean }}
 */
export function describeVoteError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''
  const classified = ERROR_CLASSIFICATIONS[code]

  if (classified) {
    return { ...classified, retryable: classified.status >= 500 }
  }

  return { status: 500, error: 'Failed to record vote', retryable: true }
}
