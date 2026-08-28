/**
 * Regression suite for lib/feedback-payload.js.
 *
 * The bug this is part of fixing: `POST /api/feedback` interpolated user text
 * straight into a Discord webhook body:
 *
 *     content: `**New ${type} Report from ${userEmail}**\n> ${message}`
 *
 * Three things follow from that single line.
 *
 *  1. Discord parses `@everyone`, `@here` and `<@&roleId>` inside `content`,
 *     so a one-word message pinged the whole server.
 *  2. Nothing handled newlines, so a message could close the quote block and
 *     open a second, fabricated report attributed to somebody else.
 *  3. `content` is capped at 2000 characters. A longer message made Discord
 *     answer 400, the route threw, and the user saw a 500 -- a legitimate long
 *     bug report failed with no usable explanation.
 *
 * The assertions below pin all three, plus the status mapping that stops an
 * upstream Discord failure from being reported as this service's fault.
 *
 *   node scripts/test-feedback-payload.js
 */

import {
  DEFAULT_FEEDBACK_TYPE,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_KEYS,
  MAX_MESSAGE_LENGTH,
  TRUNCATION_MARKER,
  buildDiscordPayload,
  describeWebhookFailure,
  formatReporter,
  isFeedbackType,
  neutraliseMentions,
  sanitizeFeedbackMessage,
} from '../lib/feedback-payload.js'

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

const REPORTER = 'user@example.com'

function payloadFor(message, type = 'bug') {
  return buildDiscordPayload({
    type,
    message,
    reporter: REPORTER,
    submittedAt: '2026-01-01T00:00:00.000Z',
  })
}

// ---------------------------------------------------------------------------
// Mention injection
// ---------------------------------------------------------------------------

console.log('\nmentions cannot notify anyone')

check(neutraliseMentions('@everyone please help'), '[at]everyone please help',
  'a broadcast mention is rewritten rather than left live')
check(neutraliseMentions('@HERE'), '[at]HERE', 'the rewrite is case-insensitive')
check(neutraliseMentions('ping <@123456>'), 'ping [user:123456]', 'a user ping is defused')
check(neutraliseMentions('ping <@!123456>'), 'ping [user:123456]', 'the nickname form of a user ping is defused')
check(neutraliseMentions('ping <@&987>'), 'ping [role:987]', 'a role ping is defused')
check(neutraliseMentions('see <#42>'), 'see [channel:42]', 'a channel link is defused')
check(neutraliseMentions('my email is a@b.com'), 'my email is a@b.com',
  'an ordinary @ in prose is left alone')
check(neutraliseMentions(null), '', 'a non-string neutralises to empty rather than throwing')

const mentionPayload = payloadFor('@everyone the app is broken')
check(mentionPayload.payload.embeds[0].description, '[at]everyone the app is broken',
  'the rewritten text is what reaches the embed')
checkDeep(mentionPayload.payload.allowed_mentions, { parse: [] },
  'every mention class is denied at the payload level as well')
check(mentionPayload.payload.content, '',
  'content stays empty, so no user text is ever in the field Discord scans')

// ---------------------------------------------------------------------------
// Header forgery
// ---------------------------------------------------------------------------

console.log('\nuser text cannot forge a second report')

const forged = payloadFor('real report\n**New Bug Report from admin@hercycle.ai**\n> fake')
checkTruthy(
  forged.payload.embeds[0].description.includes('**New Bug Report from admin@hercycle.ai**'),
  'the forged line survives verbatim inside the description'
)
check(forged.payload.embeds[0].title, 'New Bug Report',
  'but the title comes from the validated category, not from user text')
check(forged.payload.embeds[0].fields[0].value, '`user@example.com`',
  'and the reporter comes from the session, not from the message body')

check(formatReporter('a`b@example.com'), "a'b@example.com",
  'a backtick in an address cannot break out of the inline-code span')
check(formatReporter('@everyone@example.com'), '[at]everyone@example.com',
  'a mention smuggled into an address is defused too')
check(formatReporter(''), 'Unknown user', 'a missing address falls back to a neutral label')
check(formatReporter(undefined), 'Unknown user', 'so does an absent one')
check(formatReporter('a'.repeat(400)).length, 120, 'a hostile address is capped')

// ---------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------

console.log('\nlong messages are capped, not rejected with a 500')

const shortMessage = sanitizeFeedbackMessage('all good')
check(shortMessage.text, 'all good', 'a short message passes through unchanged')
check(shortMessage.truncated, false, 'and is not marked truncated')

const longMessage = sanitizeFeedbackMessage('x'.repeat(MAX_MESSAGE_LENGTH + 500))
check(longMessage.text.length, MAX_MESSAGE_LENGTH, 'an over-long message is cut to the documented cap')
check(longMessage.truncated, true, 'and is reported as truncated')
checkTruthy(longMessage.text.endsWith(TRUNCATION_MARKER), 'the cut is visible to whoever reads the report')

const longPayload = payloadFor('y'.repeat(MAX_MESSAGE_LENGTH + 500))
check(longPayload.truncated, true, 'the builder surfaces truncation to the route')
checkTruthy(
  longPayload.payload.embeds[0].fields.some((f) => f.name === 'Note'),
  'a truncated report says so in the embed'
)
checkTruthy(
  longPayload.payload.embeds[0].description.length < 4096,
  'the description stays inside the Discord embed limit'
)
check(
  MAX_MESSAGE_LENGTH < 2000,
  true,
  'the cap is below the content limit that used to turn long feedback into a 500'
)

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

console.log('\nmessage normalisation')

check(sanitizeFeedbackMessage('  padded  ').text, 'padded', 'surrounding whitespace is trimmed')
check(sanitizeFeedbackMessage('line1\r\nline2').text, 'line1\nline2', 'CRLF is normalised to LF')
check(sanitizeFeedbackMessage('a\n\n\n\n\nb').text, 'a\n\nb', 'runs of blank lines collapse')
check(
  sanitizeFeedbackMessage(`keep\nthis${String.fromCharCode(0)}`).text,
  'keep\nthis',
  'control characters are removed but newlines survive'
)
check(
  sanitizeFeedbackMessage(`tab${String.fromCharCode(9)}separated`).text,
  `tab${String.fromCharCode(9)}separated`,
  'tabs survive, so a pasted stack trace stays readable'
)
check(sanitizeFeedbackMessage(42).text, '', 'a non-string sanitises to empty')
check(sanitizeFeedbackMessage(undefined).truncated, false, 'and is not reported as truncated')

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

console.log('\ncategories')

checkDeep(FEEDBACK_TYPE_KEYS, ['bug', 'feature', 'general'],
  'the accepted categories match what the Help & Support form offers')
checkTruthy(isFeedbackType('bug'), 'a form category is accepted')
check(isFeedbackType('**pwned**'), false, 'markdown is not a category')
check(isFeedbackType('toString'), false, 'an inherited Object property is not a category')
check(isFeedbackType(null), false, 'neither is a non-string')

check(payloadFor('hi', 'feature').payload.embeds[0].title, 'New Feature Request',
  'the title is built from the category table')
check(payloadFor('hi', 'nonsense').payload.embeds[0].title,
  `New ${FEEDBACK_TYPES[DEFAULT_FEEDBACK_TYPE].label}`,
  'an unrecognised category falls back to the default rather than being interpolated')
check(payloadFor('hi', 'bug').payload.embeds[0].color, FEEDBACK_TYPES.bug.colour,
  'each category keeps its own colour')

check(payloadFor('').payload.embeds[0].description, '(no message)',
  'an empty description is replaced, because Discord rejects an empty embed')

// ---------------------------------------------------------------------------
// Upstream failure mapping
// ---------------------------------------------------------------------------

console.log('\nupstream failures are not reported as our 500')

check(describeWebhookFailure(429).status, 503, 'a Discord rate limit becomes a 503, not a 500')
checkTruthy(describeWebhookFailure(429).retryable, 'and is described as worth retrying')
check(describeWebhookFailure(504).status, 504, 'a timeout returns 504 Gateway Timeout')
checkTruthy(describeWebhookFailure(504).retryable, 'a 504 timeout is retryable')
check(describeWebhookFailure(400).status, 502, 'a rejected payload becomes a 502')
check(describeWebhookFailure(400).retryable, false, 'and is not described as worth retrying')
check(describeWebhookFailure(500).status, 502, 'a Discord outage becomes a 502')
check(describeWebhookFailure(null).status, 502, 'so does a request that never completed')
checkTruthy(describeWebhookFailure(null).retryable, 'a timeout is worth retrying')
checkTruthy(
  FEEDBACK_TYPE_KEYS.every((key) => !describeWebhookFailure(500).error.includes(key)),
  'the user-facing message leaks no internal detail'
)

// ---------------------------------------------------------------------------

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
