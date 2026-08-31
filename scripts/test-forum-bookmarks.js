/**
 * Unit test suite for lib/forum-bookmark.js and bookmark validation rules.
 *
 * Runs with:
 *   node scripts/test-forum-bookmarks.js
 */

import {
  extractBookmarkedPostIds,
  isValidPostId,
  validateBookmarkPayload,
} from '../lib/forum-bookmark.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${JSON.stringify(expected)}`)
  console.error(`       actual:   ${JSON.stringify(actual)}`)
}

function checkTrue(actual, label) {
  check(Boolean(actual), true, label)
}

function section(title) {
  console.log(`\n— ${title}`)
}

section('isValidPostId Helper')

const validUuid = '123e4567-e89b-12d3-a456-426614174000'
checkTrue(isValidPostId(validUuid), 'Valid UUID is accepted')
check(isValidPostId('invalid-uuid-string'), false, 'Non-UUID string is rejected')
check(isValidPostId(12345), false, 'Number is rejected')
check(isValidPostId(null), false, 'Null is rejected')
check(isValidPostId(undefined), false, 'Undefined is rejected')

section('validateBookmarkPayload')

const validRes = validateBookmarkPayload({ postId: validUuid })
checkTrue(validRes.success, 'Valid payload passes validation')
check(validRes.success ? validRes.data.postId : null, validUuid, 'Extracted postId matches input')

check(validateBookmarkPayload(null).success, false, 'Null body fails validation')
check(validateBookmarkPayload([]).success, false, 'Array body fails validation')
check(validateBookmarkPayload({}).success, false, 'Empty object body fails validation')
check(validateBookmarkPayload({ postId: 'not-a-uuid' }).success, false, 'Invalid UUID fails validation')

section('extractBookmarkedPostIds')

const mockRows = [
  { post_id: 'uuid-1', created_at: '2026-08-30T10:00:00Z' },
  { post_id: 'uuid-2', created_at: '2026-08-30T11:00:00Z' },
]

const extracted = extractBookmarkedPostIds(mockRows)
check(extracted.length, 2, 'Extracts correct number of IDs')
check(extracted[0], 'uuid-1', 'First ID matches')
check(extracted[1], 'uuid-2', 'Second ID matches')
check(extractBookmarkedPostIds(null).length, 0, 'Handles null rows gracefully')

console.log(`\n========================================`)
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}
