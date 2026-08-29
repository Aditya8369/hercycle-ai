/**
 * draft-store.js — what a draft is, how big it may be, and which one you get.
 *
 * ## The bug this exists to fix
 *
 * `supabase/05_user_drafts.sql` gave the table one row per account:
 *
 *     CREATE TABLE IF NOT EXISTS public.user_drafts (
 *       user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 *       draft_type TEXT DEFAULT 'forum_post',
 *       ...
 *     );
 *
 * `draft_type` was a label on that single row rather than part of its identity,
 * and the route upserted `{ onConflict: 'user_id' }`. So the code was written as
 * though drafts of different kinds were separate — the route validated
 * `draftType` against a three-item allow-list, `MarkdownEditor` took a
 * `draftType` prop — and the schema could not keep them apart. One character
 * typed into a comment box overwrote a half-written forum post; `GET` ignored
 * the type entirely and returned whichever row was written last; `DELETE`
 * removed every type at once.
 *
 * `MarkdownEditor` had the same collision on the client, with a single
 * `localStorage` key shared by every editor on the site, so the offline
 * fallback lost drafts the same way the cloud store did.
 *
 * ## What this module owns
 *
 * - The draft types, and the fact that they are an *identity*, not a label
 *   ({@link DRAFT_TYPES}, {@link isDraftType}).
 * - The size limits. `title` and `content` are `TEXT` and the route checked only
 *   `typeof`, on an endpoint designed to be called every second while someone
 *   types ({@link MAX_TITLE_LENGTH}, {@link MAX_CONTENT_LENGTH}).
 * - The per-type `localStorage` key ({@link draftStorageKey}).
 * - Postgres error mapping, so the driver's sentence never reaches the browser.
 *
 * Pure: no fetch, no React, no Supabase.
 */

/**
 * The kinds of draft the app autosaves.
 *
 * Matches the allow-list the route already carried, and is now also the CHECK
 * constraint in `supabase/12_user_drafts_per_type.sql` — the two lists having
 * drifted apart is exactly what this whole module is here to prevent.
 */
export const DRAFT_TYPES = Object.freeze(['forum_post', 'comment', 'article'])

/** Used when a caller does not say which kind of draft it means. */
export const DEFAULT_DRAFT_TYPE = 'forum_post'

/**
 * Longest title a draft may hold.
 *
 * The forum's own `title` input caps at 150; the extra room means a draft is
 * never truncated below what the composer will accept.
 */
export const MAX_TITLE_LENGTH = 200

/**
 * Longest body a draft may hold.
 *
 * Roughly 20k characters — several thousand words, far past any forum post, and
 * a bound at all, which is what was missing.
 */
export const MAX_CONTENT_LENGTH = 20000

/** Category ids are UUID-ish strings; this is a sanity bound, not a format check. */
export const MAX_CATEGORY_ID_LENGTH = 100

/** Prefix for the per-type `localStorage` key. */
const STORAGE_KEY_PREFIX = 'hercycle_markdown_draft'

/**
 * True when `value` names a draft type.
 *
 * Uses `includes` on a frozen array rather than an object lookup, so
 * `'constructor'` and `'__proto__'` are not draft types.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDraftType(value) {
  return typeof value === 'string' && DRAFT_TYPES.includes(value)
}

/**
 * A draft type, or the default.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function resolveDraftType(value) {
  return isDraftType(value) ? value : DEFAULT_DRAFT_TYPE
}

/**
 * The `localStorage` key for one draft type.
 *
 * `MarkdownEditor` used the bare `'hercycle_markdown_draft'` for every editor,
 * so the local fallback collided in the same way the table did.
 *
 * @param {unknown} draftType
 * @returns {string}
 */
export function draftStorageKey(draftType) {
  return `${STORAGE_KEY_PREFIX}:${resolveDraftType(draftType)}`
}

/**
 * The pre-namespacing key, so a draft written by the previous version can be
 * migrated on first load rather than silently abandoned.
 */
export const LEGACY_STORAGE_KEY = STORAGE_KEY_PREFIX

/**
 * Reads and bounds an autosave payload.
 *
 * Every field is optional — an autosave fires while the user is still typing,
 * so an empty title with a full body, or the reverse, is the normal case. What
 * is *not* optional is that each field fits.
 *
 * Over-long values are refused rather than truncated: silently storing a
 * shortened body would mean the draft the user gets back is not the draft they
 * wrote, which is worse than being told the save failed.
 *
 * @param {unknown} body the parsed request body
 * @returns {{ok: true, value: {draft_type: string, title: string, content: string, category_id: string|null}}|{ok: false, error: {message: string, field: string, status: number}}}
 */
export function readDraftPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('A JSON object is required', 'body')
  }

  const rawType = body.draftType !== undefined ? body.draftType : body.draft_type
  if (rawType !== undefined && !isDraftType(rawType)) {
    // Previously an unrecognised type was folded into `forum_post`, which means
    // a client bug quietly wrote into somebody else's composer.
    return fail(`Draft type must be one of: ${DRAFT_TYPES.join(', ')}`, 'draftType')
  }
  const draft_type = resolveDraftType(rawType)

  const title = readBoundedText(body.title, MAX_TITLE_LENGTH)
  if (!title.ok) return fail(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`, 'title')

  const content = readBoundedText(body.content, MAX_CONTENT_LENGTH)
  if (!content.ok) return fail(`Draft is too long to autosave (limit ${MAX_CONTENT_LENGTH} characters)`, 'content')

  const rawCategory = body.categoryId !== undefined ? body.categoryId : body.category_id
  const category = readBoundedText(rawCategory, MAX_CATEGORY_ID_LENGTH)
  if (!category.ok) return fail('Category id is too long', 'categoryId')

  return {
    ok: true,
    value: {
      draft_type,
      title: title.value,
      content: content.value,
      // An empty category is stored as NULL rather than '', so "no category
      // chosen" has one representation instead of two.
      category_id: category.value.trim() === '' ? null : category.value.trim(),
    },
  }
}

/**
 * @param {string} message
 * @param {string} field
 * @returns {{ok: false, error: {message: string, field: string, status: number}}}
 */
function fail(message, field) {
  return { ok: false, error: { message, field, status: 400 } }
}

/**
 * Accepts a string within `max`, treating absent and null as empty.
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {{ok: true, value: string}|{ok: false}}
 */
function readBoundedText(value, max) {
  if (value === undefined || value === null) return { ok: true, value: '' }
  if (typeof value !== 'string') return { ok: false }
  if (value.length > max) return { ok: false }
  return { ok: true, value }
}

/**
 * Whether a draft holds nothing worth keeping.
 *
 * Used to skip a write rather than store a row of empty strings on every
 * keystroke that clears the editor.
 *
 * @param {{title?: string, content?: string}} draft
 * @returns {boolean}
 */
export function isDraftEmpty(draft) {
  if (!draft) return true
  const title = typeof draft.title === 'string' ? draft.title.trim() : ''
  const content = typeof draft.content === 'string' ? draft.content.trim() : ''
  return title === '' && content === ''
}

/**
 * Maps a Supabase/Postgres error onto a client-safe response descriptor.
 *
 * @param {{code?: string}|null} error
 * @returns {{message: string, status: number, code: string}}
 */
export function describeDraftError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''

  switch (code) {
    case '22001':
      return { message: 'That draft is too long to autosave.', status: 400, code: 'DRAFT_TOO_LONG' }
    case '23503':
      return { message: 'This account is not set up yet, please reload and try again.', status: 409, code: 'MISSING_USER' }
    case '23505':
      // With `onConflict: 'user_id,draft_type'` this can only mean the composite
      // key has not been applied yet, so the upsert degraded into a plain insert.
      return { message: 'Drafts have not been migrated on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    case '23514':
      return { message: 'That draft type is not available on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    case '42P01':
      return { message: 'Draft autosave is not available on this deployment yet.', status: 503, code: 'MISSING_TABLE' }
    case '42703':
      return { message: 'Drafts have not been migrated on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    case 'PGRST116':
      return { message: 'No draft was found.', status: 404, code: 'DRAFT_NOT_FOUND' }
    default:
      return { message: 'Could not save your draft.', status: 500, code: 'DRAFT_WRITE_FAILED' }
  }
}

/**
 * Trims a stored row down to what the editor needs.
 *
 * @param {object|null} row
 * @returns {{draft_type: string, title: string, content: string, category_id: string|null, updated_at: string|null}|null}
 */
export function toClientDraft(row) {
  if (!row || typeof row !== 'object') return null
  return {
    draft_type: resolveDraftType(row.draft_type),
    title: typeof row.title === 'string' ? row.title : '',
    content: typeof row.content === 'string' ? row.content : '',
    category_id: typeof row.category_id === 'string' && row.category_id !== '' ? row.category_id : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

/**
 * Reads a `GET /api/drafts` response.
 *
 * @param {{ok?: boolean}} response
 * @param {any} json
 * @returns {{ok: true, draft: object|null}|{ok: false, error: string}}
 */
export function readDraftResponse(response, json) {
  if (!response || response.ok !== true || !json || json.success !== true) {
    return { ok: false, error: (json && json.error) || 'Could not load your draft.' }
  }
  const draft = json.data && typeof json.data === 'object' ? json.data.draft : null
  return { ok: true, draft: draft && typeof draft === 'object' ? draft : null }
}

/**
 * Reads a `POST /api/drafts` response.
 *
 * The editor checked `res.ok` alone and reported "Saved to cloud", so a `200`
 * carrying `success: false` was displayed as a successful save.
 *
 * @param {{ok?: boolean}} response
 * @param {any} json
 * @returns {boolean}
 */
export function isDraftSaved(response, json) {
  return Boolean(response && response.ok === true && json && json.success === true)
}
