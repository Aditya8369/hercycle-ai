/**
 * Regression suite for lib/comment-thread.js.
 *
 * The bug this is part of fixing: `CommentSection` declared its list row inside
 * the parent's render body, so `CommentItem` was a *different function* on
 * every render. React compares element types by identity, so the whole list was
 * unmounted and remounted each time — and `CommentSection` re-renders on every
 * keystroke, because the textarea is controlled by state in it.
 *
 * Typing one character into the reply box therefore reset every row's
 * `useState(comment.upvotes)` and `useState(0)`: the vote arrows un-highlighted
 * and the counts reverted, while the votes stayed recorded server-side. The
 * user was left looking at a screen that disagreed with the database, and
 * clicking the arrow again sent the same `voteValue` a second time — which the
 * RPC reads as a toggle-off, removing the vote she had cast.
 *
 * The component fix is a one-line hoist. What is testable — and was not — is
 * everything around it: the vote transition arithmetic (three branches inline
 * in a click handler), the merge rules for an optimistic insert racing a
 * realtime one, and the keyset paging the thread needs because it was
 * server-rendered with no `.limit()` at all.
 *
 *   node scripts/test-comment-thread.js
 */

import {
  DEFAULT_COMMENT_PAGE_SIZE,
  MAX_COMMENT_PAGE_SIZE,
  buildCommentCursorFilter,
  buildCommentPage,
  decodeCommentCursor,
  encodeCommentCursor,
  isForumId,
  mergeComments,
  normaliseComment,
  normaliseCommentLimit,
  parseCommentQuery,
  planVote,
  readCommentPage,
  reconcileVote,
  sortCommentsNewestFirst,
} from '../lib/comment-thread.js'

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

const ID_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const ID_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const ID_C = 'cccccccc-3333-4333-8333-333333333333'
const POST_ID = 'dddddddd-4444-4444-8444-444444444444'

function comment(id, createdAt, extra = {}) {
  return {
    id,
    post_id: POST_ID,
    author_alias: 'Kind Lotus',
    content: 'hello',
    upvotes: 0,
    created_at: createdAt,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// isForumId
// ---------------------------------------------------------------------------

check(isForumId(ID_A), true, 'a canonical uuid is a forum id')
check(isForumId(ID_A.toUpperCase()), true, 'an uppercase uuid is a forum id')
check(isForumId('not-a-uuid'), false, 'a plain word is not a forum id')
check(isForumId(''), false, 'the empty string is not a forum id')
check(isForumId(null), false, 'null is not a forum id')
check(isForumId(undefined), false, 'undefined is not a forum id')
check(isForumId(42), false, 'a number is not a forum id')
check(isForumId(`${ID_A},item_type.eq.post`), false, 'filter syntax appended to a uuid is rejected')
check(isForumId(ID_A.slice(0, -1)), false, 'a truncated uuid is rejected')

// ---------------------------------------------------------------------------
// planVote -- the arithmetic that lived in a click handler
//
// Five transitions. The old expression
//   newVote === 0 ? -previousVote : (previousVote === 0 ? newVote : newVote * 2)
// computed the same numbers through three branches; `nextVote - currentVote`
// is the whole rule.
// ---------------------------------------------------------------------------

checkDeep(planVote(0, 1), { previousVote: 0, nextVote: 1, scoreDelta: 1 }, 'upvoting from neutral adds one')
checkDeep(planVote(0, -1), { previousVote: 0, nextVote: -1, scoreDelta: -1 }, 'downvoting from neutral removes one')
checkDeep(planVote(1, 1), { previousVote: 1, nextVote: 0, scoreDelta: -1 }, 'clicking up again toggles the upvote off')
checkDeep(planVote(-1, -1), { previousVote: -1, nextVote: 0, scoreDelta: 1 }, 'clicking down again toggles the downvote off')
checkDeep(planVote(1, -1), { previousVote: 1, nextVote: -1, scoreDelta: -2 }, 'switching up to down is a two-point swing')
checkDeep(planVote(-1, 1), { previousVote: -1, nextVote: 1, scoreDelta: 2 }, 'switching down to up is a two-point swing')

// A round trip through any two clicks must return to where it started.
for (const start of [-1, 0, 1]) {
  for (const click of [-1, 1]) {
    const first = planVote(start, click)
    const second = planVote(first.nextVote, click)
    check(
      first.scoreDelta + second.scoreDelta,
      first.nextVote === 0 ? 0 : second.nextVote - start,
      `clicking ${click} twice from ${start} is internally consistent`
    )
  }
}

// Degenerate state, which is what a remount used to produce.
checkDeep(planVote(undefined, 1), { previousVote: 0, nextVote: 1, scoreDelta: 1 }, 'an undefined current vote reads as neutral')
checkDeep(planVote(null, 1), { previousVote: 0, nextVote: 1, scoreDelta: 1 }, 'a null current vote reads as neutral')
checkDeep(planVote(5, 1), { previousVote: 0, nextVote: 1, scoreDelta: 1 }, 'an impossible current vote reads as neutral')
checkDeep(planVote(1, 0), { previousVote: 1, nextVote: 1, scoreDelta: 0 }, 'clicking nothing is a no-op')
checkDeep(planVote(1, 2), { previousVote: 1, nextVote: 1, scoreDelta: 0 }, 'an impossible click is a no-op')
checkDeep(planVote(1, null), { previousVote: 1, nextVote: 1, scoreDelta: 0 }, 'a null click is a no-op')

// ---------------------------------------------------------------------------
// reconcileVote
// ---------------------------------------------------------------------------

checkDeep(
  reconcileVote(1, { resolved: true, currentVote: 1 }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'a server that agrees changes nothing'
)
checkDeep(
  reconcileVote(1, { resolved: true, currentVote: 0 }),
  { vote: 0, scoreDelta: -1, corrected: true },
  'a server reporting no vote corrects the optimistic upvote away'
)
checkDeep(
  reconcileVote(1, { resolved: true, currentVote: -1 }),
  { vote: -1, scoreDelta: -2, corrected: true },
  'a server reporting the opposite vote applies a two-point correction'
)
checkDeep(
  reconcileVote(-1, { resolved: true, currentVote: 1 }),
  { vote: 1, scoreDelta: 2, corrected: true },
  'the correction is symmetric'
)

// `resolved: false` is the RPC succeeding without saying what it did. The
// optimistic value is then the best available -- correcting towards a
// `currentVote` the server never sent would zero a vote that was recorded.
checkDeep(
  reconcileVote(1, { resolved: false }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'an unresolved result leaves the optimistic vote alone'
)
checkDeep(
  reconcileVote(1, { resolved: false, currentVote: 0 }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'an unresolved result is not trusted even when it carries a vote'
)
checkDeep(
  reconcileVote(1, null),
  { vote: 1, scoreDelta: 0, corrected: false },
  'a null result leaves the optimistic vote alone'
)
checkDeep(
  reconcileVote(1, { resolved: true }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'a resolved result with no vote value is ignored'
)
checkDeep(
  reconcileVote(1, { resolved: true, currentVote: 'up' }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'a non-numeric server vote is ignored rather than coerced'
)
checkDeep(
  reconcileVote(1, { resolved: true, currentVote: 7 }),
  { vote: 1, scoreDelta: 0, corrected: false },
  'an out-of-range server vote is ignored'
)

// ---------------------------------------------------------------------------
// normaliseComment
// ---------------------------------------------------------------------------

const normalised = normaliseComment(comment(ID_A, '2026-08-01T10:00:00Z', { upvotes: 3 }), 1)
check(normalised.id, ID_A, 'the id is carried through')
check(normalised.upvotes, 3, 'the score is carried through')
check(normalised.userVote, 1, 'a known viewer vote is carried through')
check(normaliseComment(comment(ID_A, '2026-08-01T10:00:00Z')).userVote, 0, 'an unknown viewer vote is neutral')
check(normaliseComment(comment(ID_A, 'x'), 5).userVote, 0, 'an impossible viewer vote is neutral')
check(normaliseComment(comment(ID_A, 'x'), -1).userVote, -1, 'a downvote is carried through')
check(normaliseComment({}).upvotes, 0, 'a missing score reads as zero')
check(normaliseComment({ upvotes: 'many' }).upvotes, 0, 'a non-numeric score reads as zero')
check(normaliseComment({ content: 42 }).content, '', 'a non-string body reads as empty')
check(normaliseComment({}).id, null, 'a missing id is null, not undefined')

// ---------------------------------------------------------------------------
// mergeComments -- the optimistic insert racing the realtime one
// ---------------------------------------------------------------------------

const base = [
  normaliseComment(comment(ID_A, '2026-08-03T10:00:00Z')),
  normaliseComment(comment(ID_B, '2026-08-02T10:00:00Z')),
]

check(mergeComments(base, normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z'))).length, 3, 'a new comment is added')
check(
  mergeComments(base, normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z')))[0].id,
  ID_C,
  'a newer comment sorts to the top'
)
check(mergeComments(base, normaliseComment(comment(ID_A, '2026-08-03T10:00:00Z'))).length, 2, 'a duplicate is not added twice')

// This is the race: the POST response and the realtime INSERT carry the same
// row. Both write paths previously guarded with their own inline
// `some(c => c.id === …)` -- the same check written twice.
const raced = mergeComments(
  mergeComments(base, normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z'))),
  normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z'))
)
check(raced.length, 3, 'an optimistic insert and its realtime echo collapse to one row')
check(raced.filter((c) => c.id === ID_C).length, 1, 'exactly one copy of the raced comment survives')

// A row with no id passes `some(c => c.id === undefined)` only if another
// id-less row is already present -- so the first duplicate slips through and
// every one after it is silently dropped. It also produces duplicate React
// keys. Refuse it outright.
check(mergeComments(base, { content: 'no id' }).length, 2, 'a comment with no id is refused')
check(mergeComments(base, { id: null, content: 'null id' }).length, 2, 'a comment with a null id is refused')
check(mergeComments(base, null).length, 2, 'a null incoming comment is ignored')
check(mergeComments(base, undefined).length, 2, 'an undefined incoming comment is ignored')
check(mergeComments(base, []).length, 2, 'an empty incoming array is ignored')
check(mergeComments(null, normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z'))).length, 1, 'a null existing list is handled')
check(mergeComments(undefined, []).length, 0, 'an undefined existing list is handled')

// The reader's vote is local state the server knows nothing about on a
// realtime echo. Losing it here would reproduce the original symptom by
// another route.
const voted = mergeComments(
  [normaliseComment(comment(ID_A, '2026-08-03T10:00:00Z', { upvotes: 4 }), 1)],
  normaliseComment(comment(ID_A, '2026-08-03T10:00:00Z', { upvotes: 5 }))
)
check(voted[0].userVote, 1, "a realtime echo does not reset the reader's own vote")
check(voted[0].upvotes, 5, 'but the server-owned score is refreshed')

const merged = mergeComments(base, [
  normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z')),
  normaliseComment(comment(ID_A, '2026-08-03T10:00:00Z')),
  null,
  { content: 'no id' },
])
check(merged.length, 3, 'a mixed batch adds only the usable new rows')
checkDeep(merged.map((c) => c.id), [ID_C, ID_A, ID_B], 'the merged thread stays newest-first')

// The input must not be mutated -- React state relies on it.
const before = [...base]
mergeComments(base, normaliseComment(comment(ID_C, '2026-08-04T10:00:00Z')))
checkDeep(base, before, 'mergeComments does not mutate its input')

// ---------------------------------------------------------------------------
// sortCommentsNewestFirst
// ---------------------------------------------------------------------------

checkDeep(
  sortCommentsNewestFirst([
    comment(ID_B, '2026-08-02T10:00:00Z'),
    comment(ID_C, '2026-08-04T10:00:00Z'),
    comment(ID_A, '2026-08-03T10:00:00Z'),
  ]).map((c) => c.id),
  [ID_C, ID_A, ID_B],
  'comments sort newest first'
)

// Same instant -- the tie-break has to be total, or an optimistic insert and a
// realtime insert can land in different places depending on which arrived
// first.
checkDeep(
  sortCommentsNewestFirst([
    comment(ID_A, '2026-08-02T10:00:00Z'),
    comment(ID_C, '2026-08-02T10:00:00Z'),
    comment(ID_B, '2026-08-02T10:00:00Z'),
  ]).map((c) => c.id),
  [ID_C, ID_B, ID_A],
  'comments written in the same instant break the tie on id'
)
checkDeep(sortCommentsNewestFirst(null), [], 'a null list sorts to empty')
checkDeep(sortCommentsNewestFirst([null, undefined]), [], 'null entries are dropped while sorting')

// ---------------------------------------------------------------------------
// Cursor round trip
// ---------------------------------------------------------------------------

const cursor = encodeCommentCursor(comment(ID_A, '2026-08-03T10:00:00Z'))
checkDeep(
  decodeCommentCursor(cursor),
  { createdAt: '2026-08-03T10:00:00Z', id: ID_A },
  'a comment cursor round-trips'
)
check(cursor.includes('2026-08-03'), false, 'the cursor does not read as a timestamp in the address bar')

check(encodeCommentCursor(null), null, 'a null row cannot anchor a cursor')
check(encodeCommentCursor({}), null, 'an empty row cannot anchor a cursor')
check(encodeCommentCursor(comment(null, '2026-08-03T10:00:00Z')), null, 'a row with no id cannot anchor a cursor')
check(encodeCommentCursor(comment(ID_A, null)), null, 'a row with no timestamp cannot anchor a cursor')
check(encodeCommentCursor(comment(ID_A, 'not a date')), null, 'a row with an unparseable timestamp cannot anchor a cursor')
check(encodeCommentCursor(comment('not-a-uuid', '2026-08-03T10:00:00Z')), null, 'a row with a non-uuid id cannot anchor a cursor')

const enc = (raw) => Buffer.from(raw, 'utf8').toString('base64')

check(decodeCommentCursor(''), null, 'an empty cursor decodes to null')
check(decodeCommentCursor(null), null, 'a null cursor decodes to null')
check(decodeCommentCursor(42), null, 'a numeric cursor decodes to null')
check(decodeCommentCursor('!!!'), null, 'malformed base64 decodes to null')
check(decodeCommentCursor(enc('2026-08-03T10:00:00Z')), null, 'a cursor with no separator decodes to null')
check(decodeCommentCursor(enc(`|${ID_A}`)), null, 'a leading separator decodes to null')
check(decodeCommentCursor(enc('2026-08-03T10:00:00Z|')), null, 'a trailing separator decodes to null')
check(decodeCommentCursor(enc(`not a date|${ID_A}`)), null, 'an unparseable timestamp decodes to null')
check(decodeCommentCursor(enc('2026-08-03T10:00:00Z|nope')), null, 'a non-uuid id decodes to null')
check(
  decodeCommentCursor(enc(`2026-08-03T10:00:00Z|${ID_A},item_type.eq.post`)),
  null,
  'an id carrying filter syntax decodes to null'
)
check(
  decodeCommentCursor(enc(`2026-08-03T10:00:00Z|${ID_A}|extra`)),
  null,
  'a cursor with a second separator decodes to null'
)

// ---------------------------------------------------------------------------
// normaliseCommentLimit / parseCommentQuery
// ---------------------------------------------------------------------------

check(normaliseCommentLimit(undefined), DEFAULT_COMMENT_PAGE_SIZE, 'a missing limit uses the default')
check(normaliseCommentLimit('abc'), DEFAULT_COMMENT_PAGE_SIZE, 'a non-numeric limit uses the default')
check(normaliseCommentLimit(0), 1, 'zero is raised to one')
check(normaliseCommentLimit(-3), 1, 'a negative limit is raised to one')
check(normaliseCommentLimit(1e6), MAX_COMMENT_PAGE_SIZE, 'an enormous limit is clamped')
check(normaliseCommentLimit('25'), 25, 'a numeric string limit is accepted')
check(normaliseCommentLimit(25.9), 25, 'a fractional limit is floored')

checkDeep(
  parseCommentQuery(new URLSearchParams(`postId=${POST_ID}`)),
  { postId: POST_ID, limit: DEFAULT_COMMENT_PAGE_SIZE, cursor: null },
  'a bare postId yields the first page'
)
checkDeep(
  parseCommentQuery(new URLSearchParams('postId=not-a-uuid')),
  { postId: null, limit: DEFAULT_COMMENT_PAGE_SIZE, cursor: null },
  'a non-uuid postId is null, so the route can answer 400 instead of a 500 from Postgres'
)
checkDeep(
  parseCommentQuery(new URLSearchParams('')),
  { postId: null, limit: DEFAULT_COMMENT_PAGE_SIZE, cursor: null },
  'a missing postId is null'
)
checkDeep(
  parseCommentQuery({ postId: POST_ID, limit: '5', cursor }),
  { postId: POST_ID, limit: 5, cursor: { createdAt: '2026-08-03T10:00:00Z', id: ID_A } },
  'parseCommentQuery also accepts a plain object'
)
checkDeep(
  parseCommentQuery(undefined),
  { postId: null, limit: DEFAULT_COMMENT_PAGE_SIZE, cursor: null },
  'parseCommentQuery survives being handed nothing'
)

// ---------------------------------------------------------------------------
// buildCommentCursorFilter
// ---------------------------------------------------------------------------

check(
  buildCommentCursorFilter({ createdAt: '2026-08-03T10:00:00Z', id: ID_A }),
  `created_at.lt."2026-08-03T10:00:00Z",and(created_at.eq."2026-08-03T10:00:00Z",id.lt."${ID_A}")`,
  'the keyset filter expresses the tuple comparison'
)

// ---------------------------------------------------------------------------
// buildCommentPage
// ---------------------------------------------------------------------------

const rows = [
  comment(ID_C, '2026-08-04T10:00:00Z', { upvotes: 2 }),
  comment(ID_A, '2026-08-03T10:00:00Z', { upvotes: 1 }),
  comment(ID_B, '2026-08-02T10:00:00Z', { upvotes: 0 }),
]

const full = buildCommentPage(rows, 3)
check(full.comments.length, 3, 'a page the size of the limit keeps every row')
check(full.hasMore, false, 'a page the size of the limit is the last page')
check(full.nextCursor, null, 'the last page carries no cursor')

const trimmed = buildCommentPage(rows, 2)
check(trimmed.comments.length, 2, 'the look-ahead row is trimmed off')
check(trimmed.hasMore, true, 'the look-ahead row is what answers hasMore')
check(trimmed.comments.some((c) => c.id === ID_B), false, 'the look-ahead row does not reach the client')
checkDeep(
  decodeCommentCursor(trimmed.nextCursor),
  { createdAt: '2026-08-03T10:00:00Z', id: ID_A },
  'the next cursor anchors on the last returned row, not the look-ahead row'
)

const withVotes = buildCommentPage(rows, 3, { [ID_C]: 1, [ID_B]: -1 })
check(withVotes.comments[0].userVote, 1, "the reader's upvote is hydrated")
check(withVotes.comments[1].userVote, 0, 'an unvoted comment stays neutral')
check(withVotes.comments[2].userVote, -1, "the reader's downvote is hydrated")

check(buildCommentPage([], 20).comments.length, 0, 'an empty thread is an empty array')
check(buildCommentPage(null, 20).comments.length, 0, 'a null row set does not throw')
check(buildCommentPage([null, undefined], 20).comments.length, 0, 'null rows are filtered out')
check(
  buildCommentPage([comment(ID_C, '2026-08-04T10:00:00Z'), comment('bad-id', 'x'), comment(ID_B, '2026-08-02T10:00:00Z')], 2).nextCursor,
  null,
  'a last row that cannot anchor yields no cursor rather than a broken one'
)

// ---------------------------------------------------------------------------
// readCommentPage
// ---------------------------------------------------------------------------

const page = readCommentPage({ success: true, data: buildCommentPage(rows, 2) })
check(page.ok, true, 'a well-formed page is read')
check(page.comments.length, 2, 'the comments come through')
check(page.hasMore, true, 'hasMore comes through')
check(typeof page.nextCursor, 'string', 'the cursor comes through')

check(readCommentPage(null).ok, false, 'a null payload is refused')
check(readCommentPage(undefined).ok, false, 'an undefined payload is refused')
check(readCommentPage('nope').ok, false, 'a string payload is refused')
check(readCommentPage({ success: false, error: 'boom' }).ok, false, 'an error payload is refused')
check(readCommentPage({ success: true, data: {} }).ok, false, 'a payload with no comments array is refused')
check(readCommentPage({ success: true, data: { comments: 'many' } }).ok, false, 'a non-array comments key is refused')
checkDeep(readCommentPage(null).comments, [], 'a refused payload still yields an array, never null')

// ---------------------------------------------------------------------------
// End-to-end: paging a thread, then merging every page
//
// The property that matters is that paging visits every comment exactly once,
// including two written in the same millisecond -- which a cursor on the
// timestamp alone would skip or repeat.
// ---------------------------------------------------------------------------

const thread = [
  comment('11111111-0000-4000-8000-000000000005', '2026-08-05T10:00:00Z'),
  comment('11111111-0000-4000-8000-000000000004', '2026-08-04T10:00:00Z'),
  comment('11111111-0000-4000-8000-000000000003', '2026-08-04T10:00:00Z'), // same instant
  comment('11111111-0000-4000-8000-000000000002', '2026-08-02T10:00:00Z'),
  comment('11111111-0000-4000-8000-000000000001', '2026-08-01T10:00:00Z'),
]

function rowsAfter(all, anchor) {
  if (!anchor) return all
  return all.filter((row) =>
    row.created_at < anchor.createdAt ||
    (row.created_at === anchor.createdAt && row.id < anchor.id)
  )
}

let accumulated = []
let anchor = null
let guard = 0

for (;;) {
  guard += 1
  if (guard > 20) break

  const available = rowsAfter(thread, anchor)
  const built = buildCommentPage(available.slice(0, 3), 2)
  accumulated = mergeComments(accumulated, built.comments)

  if (!built.hasMore) break
  anchor = decodeCommentCursor(built.nextCursor)
  check(anchor !== null, true, 'each comment cursor decodes back to a usable anchor')
}

check(accumulated.length, thread.length, 'paging visits every comment')
check(new Set(accumulated.map((c) => c.id)).size, thread.length, 'paging visits no comment twice')
checkDeep(accumulated.map((c) => c.id), thread.map((c) => c.id), 'the assembled thread is in server order')

// ---------------------------------------------------------------------------

console.log(`${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
