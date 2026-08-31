/**
 * Regression suite for lib/draft-store.js.
 *
 * The bug this is part of fixing: `supabase/05_user_drafts.sql` made `user_id`
 * the primary key, so `draft_type` was a label on a single row rather than part
 * of its identity. `app/api/drafts/route.js` then upserted with
 * `{ onConflict: 'user_id' }`, and every composer in the app wrote over the same
 * row — one character typed into a comment box destroyed a half-written forum
 * post. `GET` had no type filter at all and returned whichever draft was
 * written last; `DELETE` removed every type at once; `MarkdownEditor` had the
 * same collision locally, with a single `localStorage` key for every editor.
 *
 * Separately, the debounced cloud save outlived both `clearDraft` and unmount,
 * so publishing within a second of typing deleted the draft and then wrote it
 * straight back.
 *
 *   node scripts/test-draft-store.js
 */

import {
  DEFAULT_DRAFT_TYPE,
  DRAFT_TYPES,
  LEGACY_STORAGE_KEY,
  MAX_CATEGORY_ID_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_TITLE_LENGTH,
  describeDraftError,
  draftStorageKey,
  isDraftEmpty,
  isDraftSaved,
  isDraftType,
  readDraftPayload,
  readDraftResponse,
  resolveDraftType,
  toClientDraft,
} from '../lib/draft-store.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`FAIL ${label}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`)
}

function checkTrue(value, label) {
  check(value === true, true, label)
}

function checkFalse(value, label) {
  check(value === false, true, label)
}

function section(name) {
  console.log(`\n— ${name}`)
}

// ---------------------------------------------------------------------------
section('Draft types')
// ---------------------------------------------------------------------------

check(DRAFT_TYPES.join(','), 'forum_post,comment,article', 'the types match the route’s old allow-list')
checkTrue(Object.isFrozen(DRAFT_TYPES), 'the type list cannot be mutated at runtime')
check(DEFAULT_DRAFT_TYPE, 'forum_post', 'the default is the forum composer')
checkTrue(DRAFT_TYPES.includes(DEFAULT_DRAFT_TYPE), 'and the default is itself a valid type')

checkTrue(isDraftType('forum_post'), 'forum_post is a type')
checkTrue(isDraftType('comment'), 'comment is a type')
checkTrue(isDraftType('article'), 'article is a type')
checkFalse(isDraftType('blog'), 'an unknown string is not a type')
checkFalse(isDraftType('FORUM_POST'), 'the check is case-sensitive')
checkFalse(isDraftType(''), 'the empty string is not a type')
checkFalse(isDraftType(null), 'null is not a type')
checkFalse(isDraftType(undefined), 'undefined is not a type')
checkFalse(isDraftType(0), 'a number is not a type')

// `includes` on a frozen array rather than an object lookup, so inherited
// property names are not draft types.
checkFalse(isDraftType('toString'), 'toString is not a type')
checkFalse(isDraftType('constructor'), 'constructor is not a type')
checkFalse(isDraftType('__proto__'), '__proto__ is not a type')
checkFalse(isDraftType('hasOwnProperty'), 'hasOwnProperty is not a type')

check(resolveDraftType('comment'), 'comment', 'a valid type resolves to itself')
check(resolveDraftType('blog'), DEFAULT_DRAFT_TYPE, 'an unknown type resolves to the default')
check(resolveDraftType(undefined), DEFAULT_DRAFT_TYPE, 'undefined resolves to the default')

// ---------------------------------------------------------------------------
section('Storage keys — the local half of the collision')
// ---------------------------------------------------------------------------

// `MarkdownEditor` used the bare 'hercycle_markdown_draft' for every editor.
const postKey = draftStorageKey('forum_post')
const commentKey = draftStorageKey('comment')
const articleKey = draftStorageKey('article')

checkTrue(postKey !== commentKey, 'a post and a comment do not share a key')
checkTrue(commentKey !== articleKey, 'a comment and an article do not share a key')
checkTrue(postKey !== articleKey, 'a post and an article do not share a key')
check(new Set([postKey, commentKey, articleKey]).size, 3, 'all three types get distinct keys')

checkTrue(postKey.startsWith(LEGACY_STORAGE_KEY), 'the keys stay under the original namespace')
checkTrue(postKey !== LEGACY_STORAGE_KEY, 'but none of them is the old shared key')
check(draftStorageKey('blog'), postKey, 'an unknown type falls back to the default’s key, not a new one')
check(draftStorageKey(null), postKey, 'null falls back to the default’s key')
check(draftStorageKey('comment'), draftStorageKey('comment'), 'the key is stable across calls')

// ---------------------------------------------------------------------------
section('Payload reading')
// ---------------------------------------------------------------------------

const good = readDraftPayload({
  title: 'Cramps on day 2',
  content: 'Anyone else find heat helps more than ibuprofen?',
  categoryId: '  c-123  ',
  draftType: 'forum_post',
})
checkTrue(good.ok, 'a normal autosave is accepted')
check(good.value.draft_type, 'forum_post', 'the type comes through')
check(good.value.title, 'Cramps on day 2', 'the title comes through')
check(good.value.category_id, 'c-123', 'the category id is trimmed')

// Every field is optional: an autosave fires while the user is still typing.
const partial = readDraftPayload({ content: 'half a th' })
checkTrue(partial.ok, 'a body with no title is accepted')
check(partial.value.title, '', 'and the title is empty, not undefined')
check(partial.value.draft_type, DEFAULT_DRAFT_TYPE, 'with the default type')
check(partial.value.category_id, null, 'and no category')

check(readDraftPayload({ categoryId: '' }).value.category_id, null, 'an empty category becomes null')
check(readDraftPayload({ categoryId: '   ' }).value.category_id, null, 'a whitespace category becomes null')
check(readDraftPayload({ title: null, content: null }).value.content, '', 'explicit nulls read as empty')

// snake_case is accepted alongside camelCase, since the route and the editor
// spell these differently.
check(readDraftPayload({ draft_type: 'comment' }).value.draft_type, 'comment', 'draft_type is accepted')
check(readDraftPayload({ category_id: 'c-9' }).value.category_id, 'c-9', 'category_id is accepted')

// An unknown type is refused rather than folded into the default — folding is
// what let a client bug write into a different composer's draft.
const badType = readDraftPayload({ draftType: 'blog', content: 'x' })
checkFalse(badType.ok, 'an unknown draft type is refused')
check(badType.error.field, 'draftType', 'and the field is named')
check(badType.error.status, 400, 'as a 400')

// The bounds that did not exist. Both columns are TEXT and the route checked
// only `typeof`, on an endpoint called every second while somebody types.
checkTrue(readDraftPayload({ content: 'x'.repeat(MAX_CONTENT_LENGTH) }).ok, 'a draft exactly at the limit is accepted')
checkFalse(readDraftPayload({ content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) }).ok, 'one character over is refused')
check(readDraftPayload({ content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) }).error.field, 'content', 'and names the content')
checkTrue(readDraftPayload({ title: 'x'.repeat(MAX_TITLE_LENGTH) }).ok, 'a title exactly at the limit is accepted')
checkFalse(readDraftPayload({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1) }).ok, 'one character over is refused')
checkFalse(readDraftPayload({ categoryId: 'x'.repeat(MAX_CATEGORY_ID_LENGTH + 1) }).ok, 'an over-long category id is refused')

// Refused, not truncated: a shortened body would mean the draft handed back is
// not the draft that was written.
const over = readDraftPayload({ content: 'x'.repeat(MAX_CONTENT_LENGTH + 1) })
check(over.value, undefined, 'an over-long draft yields no value to write')

checkFalse(readDraftPayload({ title: 42 }).ok, 'a numeric title is refused')
checkFalse(readDraftPayload({ content: { a: 1 } }).ok, 'an object content is refused')
checkFalse(readDraftPayload({ content: ['a'] }).ok, 'an array content is refused')
checkFalse(readDraftPayload(null).ok, 'a null body is refused')
checkFalse(readDraftPayload([]).ok, 'an array body is refused')
checkFalse(readDraftPayload('draft').ok, 'a string body is refused')

// Markdown is stored verbatim: the editor's whole purpose is to hand it back
// character-for-character, including leading whitespace inside code fences.
const markdown = '```js\n  const x = 1\n```\n\n  indented\n'
check(readDraftPayload({ content: markdown }).value.content, markdown, 'markdown is stored byte-for-byte')

// ---------------------------------------------------------------------------
section('Emptiness')
// ---------------------------------------------------------------------------

checkTrue(isDraftEmpty({ title: '', content: '' }), 'empty strings are empty')
checkTrue(isDraftEmpty({ title: '   ', content: '\n\n' }), 'whitespace is empty')
checkTrue(isDraftEmpty({}), 'a bare object is empty')
checkTrue(isDraftEmpty(null), 'null is empty')
checkFalse(isDraftEmpty({ title: 'x', content: '' }), 'a title alone is not empty')
checkFalse(isDraftEmpty({ title: '', content: 'x' }), 'a body alone is not empty')

// ---------------------------------------------------------------------------
section('Client draft shape')
// ---------------------------------------------------------------------------

const client = toClientDraft({
  draft_type: 'comment',
  title: 'Re: cramps',
  content: 'heat pad',
  category_id: 'c-1',
  updated_at: '2026-08-29T10:00:00.000Z',
  user_id: 'user_secret',
})
check(client.draft_type, 'comment', 'the type comes through')
check(client.category_id, 'c-1', 'the category comes through')
check(client.user_id, undefined, 'the user id is not echoed back')

check(toClientDraft({ category_id: '' }).category_id, null, 'an empty category reads as null')
check(toClientDraft({ title: null }).title, '', 'a null title reads as empty')
check(toClientDraft({ draft_type: 'blog' }).draft_type, DEFAULT_DRAFT_TYPE, 'a stored unknown type is normalised')
check(toClientDraft(null), null, 'no row means no draft')
check(toClientDraft('nope'), null, 'a non-object is not a draft')

// ---------------------------------------------------------------------------
section('Database error mapping')
// ---------------------------------------------------------------------------

check(describeDraftError({ code: '22001' }).status, 400, 'an over-long value is a 400')
check(describeDraftError({ code: '23503' }).status, 409, 'a missing parent user is a 409')
check(describeDraftError({ code: '42P01' }).status, 503, 'a missing table is a 503')
check(describeDraftError({ code: '42703' }).status, 503, 'a missing column is a 503')
check(describeDraftError({ code: 'PGRST116' }).status, 404, 'no row is a 404')
check(describeDraftError({ code: 'XX000' }).status, 500, 'an unrecognised code stays a 500')
check(describeDraftError(null).status, 500, 'a null error is a 500')

// A 23505 with the new conflict target can only mean the composite key has not
// been applied, so the upsert degraded into a plain insert. That is a
// deployment problem, not a user error.
check(describeDraftError({ code: '23505' }).status, 503, 'a unique violation reads as un-migrated, not as a user error')
check(describeDraftError({ code: '23505' }).code, 'SCHEMA_DRIFT', 'and is labelled as drift')
check(describeDraftError({ code: '23514' }).status, 503, 'a CHECK violation on draft_type is also drift')

const leaky = {
  code: 'XX000',
  message: 'relation "public.user_drafts" constraint "user_drafts_pkey" on db.abcdefgh.supabase.co:6543',
}
const described = describeDraftError(leaky)
checkFalse(described.message.includes('user_drafts'), 'the relation name does not leak')
checkFalse(described.message.includes('user_drafts_pkey'), 'the constraint name does not leak')
checkFalse(described.message.includes('supabase.co'), 'the pooler host does not leak')

for (const code of ['22001', '23503', '23505', '23514', '42P01', '42703', 'PGRST116', 'XX000', '']) {
  const result = describeDraftError({ code })
  checkTrue(
    typeof result.message === 'string' && result.message.length > 0 &&
      Number.isInteger(result.status) && typeof result.code === 'string' && result.code.length > 0,
    `every branch is fully described (${code || 'empty'})`
  )
}

// ---------------------------------------------------------------------------
section('Response readers')
// ---------------------------------------------------------------------------

const loaded = readDraftResponse({ ok: true }, { success: true, data: { draft: { title: 'x', content: 'y' } } })
checkTrue(loaded.ok, 'a successful load reads')
check(loaded.draft.title, 'x', 'and carries the draft')

check(readDraftResponse({ ok: true }, { success: true, data: { draft: null } }).draft, null, 'no draft is null, not undefined')
check(readDraftResponse({ ok: true }, { success: true, data: {} }).draft, null, 'a missing draft key is null')
check(readDraftResponse({ ok: true }, { success: true }).draft, null, 'a missing data key is null')
checkFalse(readDraftResponse({ ok: false }, { success: false, error: 'nope' }).ok, 'a non-2xx is a failure')
check(readDraftResponse({ ok: false }, { success: false, error: 'nope' }).error, 'nope', 'and carries the message')
checkFalse(readDraftResponse({ ok: true }, { success: false }).ok, 'success:false on a 200 is a failure')
checkFalse(readDraftResponse(null, {}).ok, 'a null response is a failure')
checkTrue(readDraftResponse({ ok: false }, null).error.length > 0, 'a failure always has something to show')

// The editor checked `res.ok` alone and displayed "Saved to Cloud" for a 200
// that carried success: false.
checkTrue(isDraftSaved({ ok: true }, { success: true }), 'a real success is a save')
checkFalse(isDraftSaved({ ok: true }, { success: false }), 'success:false on a 200 is not a save')
checkFalse(isDraftSaved({ ok: false }, { success: true }), 'a non-2xx is not a save')
checkFalse(isDraftSaved({ ok: true }, null), 'an unparseable body is not a save')
checkFalse(isDraftSaved(null, { success: true }), 'a missing response is not a save')

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
