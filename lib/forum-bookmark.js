import { z } from 'zod'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Validates whether a value is a valid UUID string.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPostId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

const bookmarkPayloadSchema = z.object({
  postId: z.string().uuid('Invalid post id'),
})

/**
 * Validates bookmark request payload body.
 *
 * @param {unknown} body
 * @returns {{ success: true, data: { postId: string } } | { success: false, error: string }}
 */
export function validateBookmarkPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { success: false, error: 'Invalid payload' }
  }

  const result = bookmarkPayloadSchema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message || 'Invalid post id',
    }
  }

  return { success: true, data: result.data }
}

/**
 * Normalises raw bookmark records from database query into a clean array of post IDs or objects.
 *
 * @param {Array} rows
 * @returns {Array<string>}
 */
export function extractBookmarkedPostIds(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map(row => (typeof row === 'string' ? row : row?.post_id))
    .filter(Boolean)
}
