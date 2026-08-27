/**
 * Regression suite for lib/profile-merge.js.
 *
 * The bug this is part of fixing: `POST /api/profile` validated the body with
 * a Zod schema whose optional fields carried `.default(...)` values, then
 * upserted the whole row it built from the parsed result. Because no caller in
 * the app sends every field, each save silently overwrote the columns it left
 * out.
 *
 * Two user-visible regressions came out of that, and both are asserted below:
 *
 *  1. `PrivacySettingsModal` posts `{ allow_ai_analysis: false }` and nothing
 *     else. The old route then wrote `age: null, weight_kg: null,
 *     height_cm: null, known_conditions: [], cycle_goal: null` — flipping the
 *     AI toggle erased the health profile, with a success toast on top.
 *
 *  2. `HealthProfileSettings` posts the health fields and no
 *     `allow_ai_analysis`. The `.default(true)` turned a recorded opt-*out*
 *     back into an opt-in, and `app/api/chat/route.js` gates the Gemini call on
 *     exactly that flag.
 *
 * The distinction the whole module turns on is absence vs. clearing: a key
 * nobody sent must not appear in the patch, while an explicit `null` must,
 * because "clear my weight" has to stay expressible.
 *
 *   node scripts/test-profile-merge.js
 */

import {
  MAX_CONDITIONS,
  PROFILE_FIELDS,
  buildInsertRecord,
  buildUpdateRecord,
  mergeProfile,
  readProfilePatch,
  sanitizeProfileText,
} from '../lib/profile-merge.js'

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

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

function checkTruthy(value, label) {
  check(Boolean(value), true, label)
}

// ---------------------------------------------------------------------------
// The two regressions that motivated the change
// ---------------------------------------------------------------------------

console.log('\nprivacy toggle must not touch the health profile')

const privacyOnly = readProfilePatch({ allow_ai_analysis: false })

checkTruthy(privacyOnly.ok, 'a single-field privacy payload is accepted')
checkDeep(privacyOnly.touched, ['allow_ai_analysis'], 'only the consent flag is reported as touched')
checkDeep(
  Object.keys(privacyOnly.patch),
  ['allow_ai_analysis'],
  'the patch names no column the caller did not send'
)
check(privacyOnly.patch.age, undefined, 'age is absent from the patch, not null')
check(privacyOnly.patch.known_conditions, undefined, 'known_conditions is absent, not an empty array')
check(privacyOnly.patch.cycle_goal, undefined, 'cycle_goal is absent, not null')

const storedProfile = {
  user_id: 'user_1',
  age: 29,
  weight_kg: 61.5,
  height_cm: 165,
  cycle_length: 30,
  known_conditions: ['PCOS'],
  cycle_goal: 'Understand my cycle',
  allow_ai_analysis: true,
}

const afterToggle = mergeProfile(storedProfile, privacyOnly.patch)
check(afterToggle.age, 29, 'age survives the privacy toggle')
check(afterToggle.weight_kg, 61.5, 'weight survives the privacy toggle')
check(afterToggle.height_cm, 165, 'height survives the privacy toggle')
check(afterToggle.cycle_length, 30, 'cycle length survives the privacy toggle')
checkDeep(afterToggle.known_conditions, ['PCOS'], 'conditions survive the privacy toggle')
check(afterToggle.cycle_goal, 'Understand my cycle', 'cycle goal survives the privacy toggle')
check(afterToggle.allow_ai_analysis, false, 'the flag the user actually changed is applied')

console.log('\nsaving the health form must not re-enable AI analysis')

const optedOut = { ...storedProfile, allow_ai_analysis: false }
const healthOnly = readProfilePatch({
  age: 30,
  weight_kg: 62,
  height_cm: 165,
  known_conditions: ['PCOS', 'Thyroid'],
  cycle_goal: 'Track symptoms',
})

checkTruthy(healthOnly.ok, 'the health-form payload is accepted')
check(
  Object.prototype.hasOwnProperty.call(healthOnly.patch, 'allow_ai_analysis'),
  false,
  'an omitted consent flag never enters the patch'
)
check(
  mergeProfile(optedOut, healthOnly.patch).allow_ai_analysis,
  false,
  'a stored opt-out is still an opt-out after a health-profile save'
)
check(mergeProfile(optedOut, healthOnly.patch).age, 30, 'the health fields the form did send are applied')

// ---------------------------------------------------------------------------
// Absence vs. clearing
// ---------------------------------------------------------------------------

console.log('\nabsence and clearing are different instructions')

const cleared = readProfilePatch({ weight_kg: null, cycle_goal: '' })
checkTruthy(cleared.ok, 'an explicit clear is a valid request')
check(cleared.patch.weight_kg, null, 'an explicit null clears the column')
check(cleared.patch.cycle_goal, null, 'an empty string clears a text column')
check(mergeProfile(storedProfile, cleared.patch).weight_kg, null, 'the clear reaches the merged row')
check(mergeProfile(storedProfile, cleared.patch).age, 29, 'clearing one field leaves the others alone')

const undefinedKeys = readProfilePatch({ age: 31, weight_kg: undefined })
check(
  Object.prototype.hasOwnProperty.call(undefinedKeys.patch, 'weight_kg'),
  false,
  'a key present as undefined counts as absent, not as a clear'
)

const emptyBody = readProfilePatch({})
check(emptyBody.ok, false, 'a body with no recognised field is rejected')
check(
  emptyBody.errors[0],
  'No recognised profile fields were provided',
  'the rejection says why rather than writing a row of defaults'
)

const unknownOnly = readProfilePatch({ nickname: 'ada', favouriteColour: 'green' })
check(unknownOnly.ok, false, 'unknown keys alone do not constitute an update')
checkDeep(unknownOnly.patch, {}, 'unknown keys are never forwarded to the database')

// ---------------------------------------------------------------------------
// Field coercion and bounds
// ---------------------------------------------------------------------------

console.log('\nfield coercion')

check(readProfilePatch({ age: '30' }).patch.age, 30, 'a numeric string from a number input is coerced')
check(readProfilePatch({ age: 30.6 }).patch.age, 31, 'age is rounded to a whole year')
check(readProfilePatch({ weight_kg: '61.47' }).patch.weight_kg, 61.5, 'weight keeps one decimal place')

check(readProfilePatch({ age: 0 }).ok, false, 'age below the floor is rejected')
check(readProfilePatch({ age: 121 }).ok, false, 'age above the ceiling is rejected')
check(readProfilePatch({ height_cm: 301 }).ok, false, 'height above the ceiling is rejected')
check(readProfilePatch({ weight_kg: 'heavy' }).ok, false, 'a non-numeric weight is rejected')
check(
  readProfilePatch({ age: 900 }).errors[0],
  'Age must be between 1 and 120',
  'the bounds error names the field and the range'
)

check(readProfilePatch({ allow_ai_analysis: 'false' }).patch.allow_ai_analysis, false,
  'the string "false" is read as false, not as a truthy string')
check(readProfilePatch({ allow_ai_analysis: 'true' }).patch.allow_ai_analysis, true,
  'the string "true" is read as true')
check(readProfilePatch({ allow_ai_analysis: 0 }).ok, false,
  'a numeric consent value is rejected rather than guessed at')
check(readProfilePatch({ allow_ai_analysis: null }).ok, false,
  'consent cannot be cleared into an ambiguous state')

console.log('\ncycle length is no longer discarded')

check(readProfilePatch({ cycleLength: 31 }).patch.cycle_length, 31,
  'the camelCase spelling the profile schema accepted maps to the column')
check(readProfilePatch({ cycle_length: 31 }).patch.cycle_length, 31,
  'the snake_case spelling onboarding uses maps to the same column')
check(readProfilePatch({ cycle_length: 14 }).ok, false, 'a cycle length below 15 days is rejected')
check(readProfilePatch({ cycle_length: 61 }).ok, false, 'a cycle length above 60 days is rejected')
check(readProfilePatch({ cycleLength: 45, cycle_length: 28 }).patch.cycle_length, 28,
  'when both spellings are sent the canonical column name wins')

console.log('\nconditions list')

const conditions = readProfilePatch({ known_conditions: ['PCOS', 'pcos', '  ', 'Thyroid', 42] })
checkDeep(conditions.patch.known_conditions, ['PCOS', 'Thyroid'],
  'the list is de-duplicated case-insensitively, with blanks and non-strings dropped')

const manyConditions = readProfilePatch({
  known_conditions: Array.from({ length: MAX_CONDITIONS + 10 }, (_, i) => `Condition ${i}`),
})
check(manyConditions.patch.known_conditions.length, MAX_CONDITIONS,
  'the list is capped so a hostile body cannot grow the row without bound')

check(readProfilePatch({ known_conditions: [] }).patch.known_conditions.length, 0,
  'an explicit empty list clears the conditions')
check(readProfilePatch({ known_conditions: 'PCOS' }).ok, false,
  'a bare string is rejected rather than silently wrapped')

console.log('\ntext sanitisation')

check(sanitizeProfileText('<b>Regular cycle</b>'), 'Regular cycle', 'tags are stripped from free text')
check(sanitizeProfileText('<script>alert(1)</script>ok'), 'alert(1)ok',
  'the tags go and the text between them survives as plain text -- there is no script without a tag')
check(sanitizeProfileText('<scr<script>ipt>alert(1)'), 'alert(1)',
  'a nested construct that reassembles into a tag after one pass is removed by the next one')
check(sanitizeProfileText('</script >x'), 'x',
  'an end tag with trailing whitespace is removed, which a naive end-tag pattern misses')
check(sanitizeProfileText('a < b > c'), 'a c', 'anything between stray angle brackets goes with them')
checkTruthy(
  !sanitizeProfileText('<img src=x onerror=alert(1)>').includes('<'),
  'no angle bracket survives, whatever the input'
)
check(sanitizeProfileText(`a${String.fromCharCode(9)}b`), 'a b', 'control characters collapse to a space')
check(sanitizeProfileText('a'.repeat(500)).length, 120, 'free text is capped at the documented length')
check(sanitizeProfileText(42), '', 'a non-string sanitises to empty rather than throwing')

// ---------------------------------------------------------------------------
// Record builders
// ---------------------------------------------------------------------------

console.log('\nrecord builders')

const updateRecord = buildUpdateRecord({ allow_ai_analysis: false }, '2026-01-01T00:00:00.000Z')
checkDeep(
  Object.keys(updateRecord).sort(),
  ['allow_ai_analysis', 'updated_at'],
  'an UPDATE names only the patched columns plus the timestamp'
)

const insertRecord = buildInsertRecord('user_1', { allow_ai_analysis: false }, '2026-01-01T00:00:00.000Z')
check(insertRecord.user_id, 'user_1', 'an INSERT carries the owner')
check(insertRecord.allow_ai_analysis, false, 'the patch wins over the insert default')
check(insertRecord.age, null, 'an unpatched column is explicitly null on a first insert')
checkDeep(insertRecord.known_conditions, [], 'a first insert starts with an empty conditions list')
check(insertRecord.cycle_length, null, 'a first insert leaves cycle length unknown rather than assuming 28')

check(mergeProfile(null, { age: 30 }).age, 30, 'merging onto a missing row still yields the patch')
check(mergeProfile('not a row', { age: 30 }).age, 30, 'a non-object existing row is treated as empty')

// ---------------------------------------------------------------------------
// Field table integrity
// ---------------------------------------------------------------------------

console.log('\nfield table')

const columns = PROFILE_FIELDS.map((f) => f.column)
check(new Set(columns).size, columns.length, 'every field maps to a distinct column')

const allAliases = PROFILE_FIELDS.flatMap((f) => f.aliases)
check(new Set(allAliases).size, allAliases.length, 'no alias is claimed by two fields')

checkTruthy(
  PROFILE_FIELDS.every((f) => f.aliases[0] === f.column),
  'the canonical column name is the first alias, so it wins a tie'
)

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
