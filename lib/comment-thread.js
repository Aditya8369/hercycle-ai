/**
 * comment-thread.js — the list and vote logic behind a community thread.
 *
 * ## The bug this exists to prevent
 *
 * `components/community/CommentSection.jsx` declared its list row **inside**
 * the parent's render body:
 *
 *     export default function CommentSection({ postId, initialComments = [] }) {
 *       const [newComment, setNewComment] = useState('');
 *       ...
 *       const CommentItem = ({ comment }) => {        // <- new identity every render
 *         const [upvotes, setUpvotes] = useState(comment.upvotes || 0);
 *         const [userVote, setUserVote] = useState(0);
 *         ...
 *       };
 *
 *       return ... comments.map(c => <CommentItem key={c.id} comment={c} />)
 *     }
 *
 * React compares element types by identity. `CommentItem` is a *different
 * function* on every render, so React unmounts the whole list and mounts a
 * fresh one. `key` cannot help — keys reconcile siblings of the same type, and
 * the type is what changed.
 *
 * `CommentSection` re-renders on every keystroke, because the textarea is
 * controlled by state in that same component. So:
 *
 *   - upvote a comment — the arrow highlights, the count goes to 4;
 *   - type one character into the reply box;
 *   - every row remounts, `useState(0)` runs again, the arrow un-highlights and
 *     the count drops back to 3.
 *
 * The vote *was* recorded server-side, so the user is now looking at a screen
 * that disagrees with the database and is being invited to vote again — and
 * clicking again sends `voteValue: 1` a second time, which the RPC reads as a
 * toggle-off and **removes the vote she cast**. Nothing on screen says so.
 *
 * The component-level fix is to hoist `CommentItem` to module scope. What lives
 * here is everything around it that was equally untested: the vote transition
 * arithmetic (three branches, written inline in a click handler), the merge
 * rules for an optimistic insert racing a realtime one, and the keyset paging
 * the thread needs because it was server-rendered with no `.limit()` at all.
 *
 * No imports, so this is usable from Route Handlers, Server Components, Client
 * Components and plain Node scripts alike.
 */

/** Comments served with the post, and per page after that. */
export const DEFAULT_COMMENT_PAGE_SIZE = 20

/**
 * Hard ceiling on page size.
 *
 * The post page previously selected *every* comment on a post with no limit and
 * serialised them into the RSC payload on first paint. On a support forum, a
 * "how did you manage the diagnosis" thread is exactly the kind of post that
 * accumulates hundreds of replies.
 */
export const MAX_COMMENT_PAGE_SIZE = 50

/** Separator inside the decoded cursor. Neither half can contain it. */
const CURSOR_SEPARATOR = '|'

/** A canonical UUID. `forum_comments.id` and `post_id` are both `uuid`. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * True when `value` is a usable forum id.
 *
 * A `postId` arrives from the URL, so it is untrusted; handing a non-UUID to a
 * `uuid` column makes Postgres raise 22P02, which surfaces as a 500 for what is
 * really a 400. `lib/vote-result.js` documents the same trap on the vote route.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isForumId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Base64 that works in both the browser and Node. */
function toBase64(raw) {
  if (typeof btoa === 'function') return btoa(encodeURIComponent(raw))
  return Buffer.from(raw, 'utf8').toString('base64')
}

/** The inverse, returning `null` rather than throwing on malformed input. */
function fromBase64(encoded) {
  try {
    if (typeof atob === 'function') return decodeURIComponent(atob(encoded))
    return Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return null
  }
}

/**
 * Encodes a keyset cursor from the last comment of a page.
 *
 * `(created_at, id)`, not `created_at` alone: a seed script or a burst of
 * replies can write several rows in the same millisecond, and a cursor on the
 * timestamp alone would skip or repeat them.
 *
 * @param {{ created_at?: string, id?: string }} row
 * @returns {string|null}
 */
export function encodeCommentCursor(row) {
  if (!row || typeof row.created_at !== 'string' || !row.created_at) return null
  if (!isForumId(row.id)) return null
  if (Number.isNaN(new Date(row.created_at).getTime())) return null

  return toBase64(`${row.created_at}${CURSOR_SEPARATOR}${row.id}`)
}

/**
 * Decodes and validates a keyset cursor.
 *
 * Every failure returns `null`, which the route reads as "no cursor" and serves
 * the first page. A stale or hand-edited cursor should show the newest comments,
 * not an error and not an empty thread.
 *
 * @param {unknown} cursor
 * @returns {{ createdAt: string, id: string }|null}
 */
export function decodeCommentCursor(cursor) {
  if (typeof cursor !== 'string' || cursor === '') return null

  const decoded = fromBase64(cursor)
  if (decoded === null) return null

  // Split on the *first* separator: an ISO timestamp cannot contain `|` and
  // neither can a UUID, so a second one means the token is malformed.
  const at = decoded.indexOf(CURSOR_SEPARATOR)
  if (at <= 0 || at === decoded.length - 1) return null

  const createdAt = decoded.slice(0, at)
  const id = decoded.slice(at + 1)

  if (Number.isNaN(new Date(createdAt).getTime())) return null
  if (!isForumId(id)) return null

  return { createdAt, id }
}

/**
 * Clamps a requested page size.
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function normaliseCommentLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_COMMENT_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_COMMENT_PAGE_SIZE
  return Math.min(MAX_COMMENT_PAGE_SIZE, Math.max(1, Math.floor(parsed)))
}

/**
 * Turns raw request parameters into a validated query description.
 *
 * `postId` is `null` when it is not a usable id, which the route answers as a
 * 400 — rather than passing it to a `uuid` column and reporting Postgres's
 * 22P02 as a server fault.
 *
 * @param {URLSearchParams|Record<string, unknown>} params
 * @returns {{ postId: string|null, limit: number, cursor: {createdAt: string, id: string}|null }}
 */
export function parseCommentQuery(params) {
  const read = (key) => (typeof params?.get === 'function' ? params.get(key) : params?.[key])
  const rawPostId = read('postId')

  return {
    postId: isForumId(rawPostId) ? rawPostId : null,
    limit: normaliseCommentLimit(read('limit')),
    cursor: decodeCommentCursor(read('cursor')),
  }
}

/**
 * Builds the keyset predicate for the comment *after* the cursor, newest first.
 *
 * The condition is a tuple comparison — "written earlier, or at the same
 * instant with a smaller id" — which a single `.lt()` cannot express. Both
 * values have already been validated by `decodeCommentCursor`, and both are
 * quoted so PostgREST reads them as literals rather than as filter syntax.
 *
 * @param {{createdAt: string, id: string}} cursor
 * @returns {string}
 */
export function buildCommentCursorFilter(cursor) {
  const { createdAt, id } = cursor
  return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt."${id}")`
}

/**
 * Normalises a comment row for the client.
 *
 * `userVote` is the field this whole exercise turns on: the component
 * initialised it to `0` unconditionally, so after a reload every arrow rendered
 * neutral no matter what the reader had already done, and the first click on an
 * already-upvoted comment *removed* the upvote while the optimistic UI added
 * one — leaving the display two off until something forced a refetch.
 *
 * @param {object} row a `forum_comments` row
 * @param {number} [userVote] the caller's existing vote, if known
 * @returns {object}
 */
export function normaliseComment(row, userVote = 0) {
  return {
    id: row?.id ?? null,
    post_id: row?.post_id ?? null,
    author_alias: row?.author_alias ?? null,
    content: typeof row?.content === 'string' ? row.content : '',
    upvotes: Number.isFinite(row?.upvotes) ? row.upvotes : 0,
    created_at: row?.created_at ?? null,
    userVote: userVote === 1 || userVote === -1 ? userVote : 0,
  }
}

/**
 * Builds the response payload for a page of comments.
 *
 * The route asks for `limit + 1` rows; the extra one answers "is there more?"
 * without a second `count(*)` over the same range, and is trimmed here before
 * it reaches the client.
 *
 * @param {object[]} rows up to `limit + 1` rows, newest first
 * @param {number} limit the page size that was requested
 * @param {Record<string, number>} [votesById] the caller's votes, keyed by comment id
 * @returns {{ comments: object[], hasMore: boolean, nextCursor: string|null }}
 */
export function buildCommentPage(rows, limit, votesById = {}) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : []
  const hasMore = safeRows.length > limit
  const page = hasMore ? safeRows.slice(0, limit) : safeRows

  return {
    comments: page.map((row) => normaliseComment(row, votesById[row?.id])),
    hasMore,
    // No cursor on the last page: handing one back would make the client issue
    // a request guaranteed to return nothing.
    nextCursor: hasMore ? encodeCommentCursor(page[page.length - 1]) : null,
  }
}

/**
 * Orders comments newest first, breaking ties on id.
 *
 * The same ordering the server uses, applied client-side after a merge so an
 * optimistic insert and a realtime insert cannot end up in different places
 * depending on which arrived first.
 *
 * @param {object[]} comments
 * @returns {object[]} a new array; the input is not mutated
 */
export function sortCommentsNewestFirst(comments) {
  return [...(comments || [])].filter(Boolean).sort((a, b) => {
    const left = String(a?.created_at || '')
    const right = String(b?.created_at || '')
    if (left !== right) return left < right ? 1 : -1
    // Same instant: fall back to the id, so the order is total and stable.
    return String(b?.id || '').localeCompare(String(a?.id || ''))
  })
}

/**
 * Merges incoming comments into the thread, de-duplicating by id.
 *
 * Both write paths race each other: `handleSubmit` appends the row the POST
 * returned, and the realtime `INSERT` subscription appends the same row a
 * moment later. Each side previously guarded with its own inline
 * `current.some(c => c.id === …)`, which is the same check written twice — and
 * neither guarded against an incoming row with **no id**, which passes
 * `some(c => c.id === undefined)` only if some other id-less row is already
 * present, so the first duplicate slips through and then every subsequent one
 * is silently dropped.
 *
 * Existing entries win over incoming ones for locally-owned fields (`userVote`),
 * so a realtime echo of a comment the reader has already voted on does not
 * reset her arrow.
 *
 * @param {object[]} existing
 * @param {object|object[]} incoming
 * @returns {object[]} a new array; the input is not mutated
 */
export function mergeComments(existing, incoming) {
  const list = Array.isArray(existing) ? existing.filter(Boolean) : []
  const additions = (Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean)

  const byId = new Map()
  for (const comment of list) {
    if (comment.id === null || comment.id === undefined) continue
    byId.set(comment.id, comment)
  }

  for (const candidate of additions) {
    // A row with no id cannot be reconciled, de-duplicated or deleted -- and an
    // id-less row is exactly what produced duplicate React keys before.
    if (candidate.id === null || candidate.id === undefined) continue

    const current = byId.get(candidate.id)
    byId.set(candidate.id, current
      // Server fields refresh; the reader's own vote is local state the server
      // knows nothing about on a realtime echo, so it is preserved.
      ? { ...current, ...candidate, userVote: current.userVote ?? candidate.userVote ?? 0 }
      : candidate)
  }

  return sortCommentsNewestFirst([...byId.values()])
}

/**
 * Plans the effect of clicking a vote arrow.
 *
 * The component computed this inline:
 *
 *     let upvoteChange = newVote === 0
 *       ? -previousVote
 *       : (previousVote === 0 ? newVote : newVote * 2);
 *
 * Three branches, correct as written, in a click handler, reachable by no test,
 * and duplicated in spirit by `PostCard`. It is also more complicated than the
 * problem: the score delta is simply the difference between the two vote
 * states, so `nextVote - currentVote` covers all five transitions at once —
 * including "click the same arrow again", which is a toggle off.
 *
 * `previousVote` is returned alongside so a failed request can be reverted by
 * restoring a value rather than by re-deriving one -- the component previously
 * captured `previousVote`/`previousUpvotes` in the closure, which is correct
 * only while no other update lands in between.
 *
 * @param {number} currentVote -1, 0 or 1
 * @param {number} clickedValue 1 or -1
 * @returns {{ previousVote: number, nextVote: number, scoreDelta: number }}
 */
export function planVote(currentVote, clickedValue) {
  const current = currentVote === 1 || currentVote === -1 ? currentVote : 0

  // Anything that is not a real arrow is a no-op rather than a state the
  // server would reject.
  if (clickedValue !== 1 && clickedValue !== -1) {
    return { previousVote: current, nextVote: current, scoreDelta: 0 }
  }

  const nextVote = current === clickedValue ? 0 : clickedValue
  return { previousVote: current, nextVote, scoreDelta: nextVote - current }
}

/**
 * Reconciles an optimistic vote against what the database reported.
 *
 * The vote route answers `resolved: false` when the RPC succeeded but said
 * nothing about what it did, in which case the optimistic value is the best
 * available and must be left alone — correcting towards a `currentVote` the
 * server never sent would silently zero a vote that was recorded.
 *
 * @param {number} optimisticVote the vote the UI already applied
 * @param {{ resolved?: boolean, currentVote?: unknown }} serverResult
 * @returns {{ vote: number, scoreDelta: number, corrected: boolean }}
 */
export function reconcileVote(optimisticVote, serverResult) {
  const optimistic = optimisticVote === 1 || optimisticVote === -1 ? optimisticVote : 0

  if (!serverResult?.resolved) {
    return { vote: optimistic, scoreDelta: 0, corrected: false }
  }

  const reported = serverResult.currentVote
  if (reported !== 1 && reported !== -1 && reported !== 0) {
    return { vote: optimistic, scoreDelta: 0, corrected: false }
  }

  return {
    vote: reported,
    scoreDelta: reported - optimistic,
    corrected: reported !== optimistic,
  }
}

/**
 * Reads a comment page out of a `/api/forum/comments` response body.
 *
 * @param {unknown} payload
 * @returns {{ ok: boolean, comments: object[], hasMore: boolean, nextCursor: string|null }}
 */
export function readCommentPage(payload) {
  const empty = { ok: false, comments: [], hasMore: false, nextCursor: null }
  if (!payload || typeof payload !== 'object') return empty
  if (payload.success !== true || !Array.isArray(payload.data?.comments)) return empty

  return {
    ok: true,
    comments: payload.data.comments,
    hasMore: Boolean(payload.data.hasMore),
    nextCursor: typeof payload.data.nextCursor === 'string' ? payload.data.nextCursor : null,
  }
}
