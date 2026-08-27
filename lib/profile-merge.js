/**
 * profile-merge.js — turns a `POST /api/profile` body into a *patch*.
 *
 * ## Why this module exists
 *
 * `app/api/profile/route.js` used to validate the request with a Zod schema
 * whose optional fields carried `.default(...)` values, and then upsert the
 * whole row it built from the parsed result. That combination is a silent
 * data-loss machine: a key the caller never sent does not stay untouched, it
 * is materialised as `null` / `[]` / `true` and written over whatever was
 * stored.
 *
 * Every caller in the app sends a subset, so both directions were broken:
 *
 *  - `PrivacySettingsModal` posts `{ allow_ai_analysis: false }` and nothing
 *    else, so flipping the AI toggle wiped the user's age, weight, height,
 *    conditions and cycle goal.
 *  - `HealthProfileSettings` posts the health fields and no
 *    `allow_ai_analysis`, so the `.default(true)` opted a user who had
 *    explicitly opted *out* back in. `app/api/chat/route.js` gates the model
 *    call on that flag, so the consequence was personal cycle data reaching a
 *    third-party model against a recorded consent decision.
 *
 * The fix is to stop inferring absent fields at all. This module reports
 * exactly which recognised fields a body *mentions*, normalised and range
 * checked; the route writes only those columns. A field nobody mentioned is
 * not in the patch, so it cannot be written.
 *
 * The module has no imports, so it is usable from a Route Handler, a Server
 * Component and a plain Node test script alike.
 */

/** Widest range the UI can produce for each numeric field. */
const NUMERIC_BOUNDS = {
  age: { min: 1, max: 120, integer: true },
  weight_kg: { min: 1, max: 500, integer: false },
  height_cm: { min: 1, max: 300, integer: false },
  cycle_length: { min: 15, max: 60, integer: true },
}

/**
 * ASCII control characters and DEL. Built with `new RegExp` from an escaped
 * string so the source file stays plain ASCII and stays reviewable in a diff.
 */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

/** Longest free-text value accepted, to keep a hostile body bounded. */
export const MAX_TEXT_LENGTH = 120

/** Most conditions a profile may carry. The picker offers far fewer. */
export const MAX_CONDITIONS = 20

/**
 * Every column this endpoint may write. `aliases` exist because the app has
 * historically spelled the same field two ways — `cycleLength` from the
 * profile schema, `cycle_length` from onboarding — and dropping one of them
 * silently is what this module is here to prevent.
 *
 * @type {ReadonlyArray<{ column: string, aliases: string[], kind: string }>}
 */
export const PROFILE_FIELDS = Object.freeze([
  { column: 'age', aliases: ['age'], kind: 'number' },
  { column: 'weight_kg', aliases: ['weight_kg', 'weightKg', 'weight'], kind: 'number' },
  { column: 'height_cm', aliases: ['height_cm', 'heightCm', 'height'], kind: 'number' },
  { column: 'cycle_length', aliases: ['cycle_length', 'cycleLength'], kind: 'number' },
  { column: 'known_conditions', aliases: ['known_conditions', 'knownConditions'], kind: 'stringArray' },
  { column: 'cycle_goal', aliases: ['cycle_goal', 'cycleGoal'], kind: 'text' },
  { column: 'allow_ai_analysis', aliases: ['allow_ai_analysis', 'allowAiAnalysis'], kind: 'boolean' },
])

/**
 * Human-readable field labels for error messages. Keyed by column so the
 * message names the concept the user sees rather than the alias they happened
 * to send.
 */
const FIELD_LABELS = {
  age: 'Age',
  weight_kg: 'Weight',
  height_cm: 'Height',
  cycle_length: 'Cycle length',
  known_conditions: 'Known conditions',
  cycle_goal: 'Cycle goal',
  allow_ai_analysis: 'AI analysis preference',
}

/**
 * True when `value` counts as "the user cleared this field" rather than "the
 * user did not mention it". An explicit `null` or `''` is a real instruction
 * and is kept in the patch as `null`; `undefined` is absence and never
 * reaches a coercer.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isCleared(value) {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

/**
 * Strips tags and control characters from free text and trims it to length.
 * Mirrors `sanitizeText` in `lib/api-helpers.js`; kept local so this module
 * stays dependency-free.
 *
 * @param {string} value
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitizeProfileText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/**
 * Coerces and range-checks one numeric field.
 *
 * Strings are accepted because the profile form posts `<input type="number">`
 * values, which arrive as strings whenever the field was typed rather than
 * stepped.
 *
 * @param {string} column
 * @param {unknown} raw
 * @returns {{ ok: true, value: number|null } | { ok: false, message: string }}
 */
function coerceNumber(column, raw) {
  if (isCleared(raw)) return { ok: true, value: null }

  const bounds = NUMERIC_BOUNDS[column]
  const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim())

  if (!Number.isFinite(numeric)) {
    return { ok: false, message: `${FIELD_LABELS[column]} must be a number` }
  }

  const value = bounds.integer ? Math.round(numeric) : Math.round(numeric * 10) / 10

  if (value < bounds.min || value > bounds.max) {
    return {
      ok: false,
      message: `${FIELD_LABELS[column]} must be between ${bounds.min} and ${bounds.max}`,
    }
  }

  return { ok: true, value }
}

/**
 * Coerces the consent flag. Only real booleans and the two canonical string
 * spellings are accepted — a truthy-string coercion here would turn `"false"`
 * into `true`, which is the exact direction this bug already failed in once.
 *
 * @param {string} column
 * @param {unknown} raw
 * @returns {{ ok: true, value: boolean } | { ok: false, message: string }}
 */
function coerceBoolean(column, raw) {
  if (typeof raw === 'boolean') return { ok: true, value: raw }
  if (raw === 'true') return { ok: true, value: true }
  if (raw === 'false') return { ok: true, value: false }

  return { ok: false, message: `${FIELD_LABELS[column]} must be true or false` }
}

/**
 * Coerces the conditions list: sanitised, de-duplicated case-insensitively,
 * empties dropped, capped. An explicit empty array is a legitimate "clear my
 * conditions" instruction and is preserved.
 *
 * @param {string} column
 * @param {unknown} raw
 * @returns {{ ok: true, value: string[] } | { ok: false, message: string }}
 */
function coerceStringArray(column, raw) {
  if (raw === null) return { ok: true, value: [] }
  if (!Array.isArray(raw)) {
    return { ok: false, message: `${FIELD_LABELS[column]} must be a list` }
  }

  const seen = new Set()
  const value = []

  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const cleaned = sanitizeProfileText(entry, 60)
    if (!cleaned) continue

    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    value.push(cleaned)
    if (value.length >= MAX_CONDITIONS) break
  }

  return { ok: true, value }
}

/**
 * Coerces a free-text field. A cleared value becomes `null` rather than `''`
 * so the column reads the same whichever spelling the client used.
 *
 * @param {string} column
 * @param {unknown} raw
 * @returns {{ ok: true, value: string|null } | { ok: false, message: string }}
 */
function coerceText(column, raw) {
  if (isCleared(raw)) return { ok: true, value: null }
  if (typeof raw !== 'string') {
    return { ok: false, message: `${FIELD_LABELS[column]} must be text` }
  }

  return { ok: true, value: sanitizeProfileText(raw) || null }
}

const COERCERS = {
  number: coerceNumber,
  boolean: coerceBoolean,
  stringArray: coerceStringArray,
  text: coerceText,
}

/**
 * Finds the alias a body actually used for a field, preferring the canonical
 * column name when a body redundantly supplies more than one spelling.
 *
 * @param {object} body
 * @param {{ column: string, aliases: string[] }} field
 * @returns {string|null} the key present in `body`, or `null`
 */
function findAlias(body, field) {
  for (const alias of field.aliases) {
    if (Object.prototype.hasOwnProperty.call(body, alias) && body[alias] !== undefined) {
      return alias
    }
  }
  return null
}

/**
 * Reads a request body into a patch of the columns it mentions.
 *
 * Absence and clearing are deliberately distinct outcomes:
 *
 *  - a key that is missing, or present as `undefined`, does not appear in
 *    `patch` at all, so the route never writes that column;
 *  - a key present as `null` (or `''` for text) appears in `patch` as `null`,
 *    which the route writes — the user asked to clear it.
 *
 * @param {unknown} body parsed JSON request body
 * @returns {{ ok: boolean, patch: object, errors: string[], touched: string[] }}
 */
export function readProfilePatch(body) {
  const patch = {}
  const errors = []
  const touched = []

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, patch, errors: ['Invalid payload'], touched }
  }

  for (const field of PROFILE_FIELDS) {
    const alias = findAlias(body, field)
    if (alias === null) continue

    const result = COERCERS[field.kind](field.column, body[alias])

    if (!result.ok) {
      errors.push(result.message)
      continue
    }

    patch[field.column] = result.value
    touched.push(field.column)
  }

  if (errors.length === 0 && touched.length === 0) {
    errors.push('No recognised profile fields were provided')
  }

  return { ok: errors.length === 0, patch, errors, touched }
}

/**
 * The row to insert when a user has no profile yet. Only the patched columns
 * carry a caller-supplied value; the rest are explicit defaults, which is safe
 * here precisely because there is nothing to overwrite.
 *
 * @param {string} userId
 * @param {object} patch from {@link readProfilePatch}
 * @param {string} [timestamp] ISO timestamp, injectable for tests
 * @returns {object}
 */
export function buildInsertRecord(userId, patch, timestamp = new Date().toISOString()) {
  return {
    user_id: userId,
    age: null,
    weight_kg: null,
    height_cm: null,
    cycle_length: null,
    known_conditions: [],
    cycle_goal: null,
    allow_ai_analysis: true,
    ...patch,
    updated_at: timestamp,
  }
}

/**
 * The column set to send to `UPDATE` for an existing profile: the patch and
 * nothing else, so an untouched column keeps its stored value.
 *
 * @param {object} patch from {@link readProfilePatch}
 * @param {string} [timestamp] ISO timestamp, injectable for tests
 * @returns {object}
 */
export function buildUpdateRecord(patch, timestamp = new Date().toISOString()) {
  return { ...patch, updated_at: timestamp }
}

/**
 * Applies a patch to an existing row in memory. Used to answer the request
 * when the database returns no representation, and by the tests to assert the
 * merge semantics directly.
 *
 * @param {object|null} existing
 * @param {object} patch
 * @returns {object}
 */
export function mergeProfile(existing, patch) {
  return { ...(existing && typeof existing === 'object' ? existing : {}), ...patch }
}
