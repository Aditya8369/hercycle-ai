/**
 * Regression suite for lib/chat-fallback.js.
 *
 * Three bugs are covered here, all in the same response path.
 *
 * 1. `app/api/chat/route.js` closed with a `catch` that read `json?.message`,
 *    where `json` was declared with `let` *inside* the `try` it was catching
 *    for. Optional chaining does not rescue an undeclared binding, so every
 *    trip through that handler threw `ReferenceError: json is not defined` and
 *    the fallback could never run.
 *
 * 2. The intent matcher used `String.prototype.includes`, so `includes('hi')`
 *    matched "thigh", "which" and "this" -- any question that did not happen to
 *    name a symptom was answered with the greeting.
 *
 * 3. The route was migrated to the standard `jsonSuccess` envelope, which
 *    nests the reply under `data`, and none of the three callers were updated.
 *    `data.response` was `undefined`, so `ChatAssistant` rendered `{msg.text}`
 *    as an **empty bubble** on every assistant turn.
 *
 *   node scripts/test-chat-fallback.js
 */

import {
  CHAT_INTENTS,
  DEFAULT_INTENT,
  MAX_HISTORY_TURNS,
  MAX_HISTORY_TURN_CHARS,
  SOURCE_FALLBACK,
  SOURCE_MODEL,
  buildFallbackReply,
  classifyChatIntent,
  normaliseChatHistory,
  normaliseChatLanguage,
  readChatResponse,
} from '../lib/chat-fallback.js'

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

// ---------------------------------------------------------------------------
// normaliseChatLanguage
// ---------------------------------------------------------------------------

check(normaliseChatLanguage('hi'), 'hi', 'the ISO code selects Hindi')
check(normaliseChatLanguage('हि'), 'hi', 'the Devanagari abbreviation the switcher stores selects Hindi')
check(normaliseChatLanguage('हिंदी'), 'hi', 'the full Devanagari name selects Hindi')
check(normaliseChatLanguage('hi-IN'), 'hi', 'a region-tagged code selects Hindi')
check(normaliseChatLanguage('HI'), 'hi', 'language matching is case-insensitive')
check(normaliseChatLanguage(' hi '), 'hi', 'surrounding whitespace is tolerated')
check(normaliseChatLanguage('en'), 'en', 'English is English')
check(normaliseChatLanguage('en-GB'), 'en', 'a region-tagged English code is English')
check(normaliseChatLanguage('fr'), 'en', 'an unsupported language falls back to English')
check(normaliseChatLanguage(''), 'en', 'an empty language falls back to English')
check(normaliseChatLanguage(null), 'en', 'a null language falls back to English')
check(normaliseChatLanguage(undefined), 'en', 'a missing language falls back to English')
check(normaliseChatLanguage(42), 'en', 'a non-string language falls back to English')
check(normaliseChatLanguage({}), 'en', 'an object language falls back to English')

// ---------------------------------------------------------------------------
// classifyChatIntent -- the substring false positives this rewrite exists for
//
// Every one of these was answered "Hello! I am your HerCycle health
// assistant." by the old `query.includes('hi')` branch.
// ---------------------------------------------------------------------------

check(classifyChatIntent('is this normal'), 'general', '"this" is not a greeting')
check(classifyChatIntent('my thighs ache'), 'pain', '"thighs" is not a greeting -- and "ache" is pain')
check(classifyChatIntent('which vitamins should I take'), 'general', '"which" is not a greeting')
check(classifyChatIntent('I have felt this way for a while'), 'general', '"while" is not a greeting')
check(classifyChatIntent('should I take a shower'), 'general', '"shower" is not a greeting')
check(classifyChatIntent('my chin is breaking out'), 'general', '"chin" is not a greeting')
check(classifyChatIntent('anything else I should watch for'), 'general', '"thing" is not a greeting')

// The greeting still works when it is actually a greeting.
check(classifyChatIntent('hi'), 'greeting', 'a bare "hi" is a greeting')
check(classifyChatIntent('Hi there!'), 'greeting', 'a greeting with punctuation is a greeting')
check(classifyChatIntent('hello'), 'greeting', '"hello" is a greeting')
check(classifyChatIntent('hey'), 'greeting', '"hey" is a greeting')
check(classifyChatIntent('HEY'), 'greeting', 'greeting matching is case-insensitive')
check(classifyChatIntent('namaste'), 'greeting', '"namaste" is a greeting')

// Priority: a greeting that also names a symptom is a symptom question. Under
// the old chain this happened to work, but only because of the order the `if`s
// were written in -- ordering that was load-bearing and undocumented.
check(classifyChatIntent('hi, I have terrible cramps'), 'pain', 'a symptom outranks an opening greeting')
check(classifyChatIntent('hello! what should I eat'), 'nutrition', 'nutrition outranks an opening greeting')
check(classifyChatIntent('hey, do I have pcod?'), 'pcod', 'pcod outranks an opening greeting')

// Each intent, matched on its own terms.
check(classifyChatIntent('what should I eat today'), 'nutrition', '"eat" is nutrition')
check(classifyChatIntent('any good snacks?'), 'nutrition', '"snacks" is nutrition')
check(classifyChatIntent('diet advice please'), 'nutrition', '"diet" is nutrition')
check(classifyChatIntent('my cramps are unbearable'), 'pain', '"cramps" is pain')
check(classifyChatIntent('everything hurts'), 'pain', '"hurts" is pain')
check(classifyChatIntent('lower back pain'), 'pain', '"pain" is pain')
check(classifyChatIntent('could this be PCOS?'), 'pcod', '"PCOS" is pcod')
check(classifyChatIntent('polycystic ovaries'), 'pcod', '"polycystic" is pcod')
check(classifyChatIntent('when is my next period'), 'prediction', '"next period" is prediction')
check(classifyChatIntent('when will it start'), 'prediction', '"when" is prediction')

// Substring-only occurrences must not match. `update` contains `date`;
// `predicted` must not be reached through `dict`; `eaten` is not `eat`.
check(classifyChatIntent('should I update the app'), 'general', '"update" does not match a prediction term')
check(classifyChatIntent('I have not eaten anything'), 'general', '"eaten" is not the term "eat"')
check(classifyChatIntent('my back is achy'), 'general', '"achy" is not the term "ache"')
check(classifyChatIntent('champagne'), 'general', '"champagne" does not match "pain"')
check(classifyChatIntent('spain'), 'general', '"spain" does not match "pain"')
check(classifyChatIntent('hurtful comments'), 'general', '"hurtful" is not the term "hurt"')

// Degenerate input. This path runs when everything else has already failed, so
// it must never throw.
check(classifyChatIntent(''), DEFAULT_INTENT, 'an empty message is the general intent')
check(classifyChatIntent('   '), DEFAULT_INTENT, 'a whitespace message is the general intent')
check(classifyChatIntent(null), DEFAULT_INTENT, 'a null message is the general intent')
check(classifyChatIntent(undefined), DEFAULT_INTENT, 'an undefined message is the general intent')
check(classifyChatIntent(12345), DEFAULT_INTENT, 'a numeric message is the general intent')
check(classifyChatIntent({}), DEFAULT_INTENT, 'an object message is the general intent')
check(classifyChatIntent([]), DEFAULT_INTENT, 'an array message is the general intent')
check(classifyChatIntent('x'.repeat(50000)), DEFAULT_INTENT, 'an enormous message does not throw')
check(
  classifyChatIntent(`${'x'.repeat(5000)} cramps`),
  DEFAULT_INTENT,
  'matching stops at the scan cap rather than walking an unbounded string'
)

// Hindi. Under the English-only keyword list none of these could match, so a
// user typing in Hindi always received the general reply.
check(classifyChatIntent('मुझे बहुत दर्द हो रहा है'), 'pain', 'the Hindi word for pain is matched')
check(classifyChatIntent('मुझे क्या खाना चाहिए'), 'nutrition', 'the Hindi word for food is matched')
check(classifyChatIntent('नमस्ते'), 'greeting', 'the Hindi greeting is matched')
check(classifyChatIntent('अगली माहवारी कब है'), 'prediction', 'the Hindi prediction question is matched')

// ---------------------------------------------------------------------------
// buildFallbackReply
// ---------------------------------------------------------------------------

const pain = buildFallbackReply('my cramps are bad', 'en')
check(pain.intent, 'pain', 'the reply reports which intent answered')
check(pain.language, 'en', 'the reply reports which language answered')
check(pain.text.includes('heating pad'), true, 'the English pain reply is the cramp-relief text')

const painHi = buildFallbackReply('my cramps are bad', 'hi')
check(painHi.language, 'hi', 'the Hindi language is honoured')
check(painHi.text.includes('हीटिंग पैड'), true, 'the Hindi pain reply is the Hindi cramp-relief text')
check(painHi.text !== pain.text, true, 'the two languages produce different text')

check(
  buildFallbackReply('what should I eat', 'en').text.includes('iron-rich'),
  true,
  'the nutrition reply is the iron-rich text'
)
check(
  buildFallbackReply('do I have pcod', 'en').text.includes('hormonal condition'),
  true,
  'the pcod reply is the hormonal-condition text'
)
check(
  buildFallbackReply('anything at all', 'en').text.includes('menstrual health'),
  true,
  'the general reply is the support text'
)

// Prediction is the one context-dependent intent.
const known = buildFallbackReply('when is my next period', 'en', { nextPeriodDate: 'Aug 14, 2026' })
check(known.text.includes('Aug 14, 2026'), true, 'a known prediction date is quoted back')
check(known.intent, 'prediction', 'a known prediction is still the prediction intent')

const unknown = buildFallbackReply('when is my next period', 'en', {})
check(unknown.text.includes('Keep tracking'), true, 'an unknown prediction asks the user to keep tracking')
check(
  buildFallbackReply('when is my next period', 'en', { nextPeriodDate: '   ' }).text.includes('Keep tracking'),
  true,
  'a blank prediction date counts as unknown'
)
check(
  buildFallbackReply('when is my next period', 'en', { nextPeriodDate: 42 }).text.includes('Keep tracking'),
  true,
  'a non-string prediction date counts as unknown'
)
check(
  buildFallbackReply('when is my next period', 'en', null).text.includes('Keep tracking'),
  true,
  'a null context counts as unknown'
)
check(
  buildFallbackReply('when is my next period', 'hi', { nextPeriodDate: 'Aug 14, 2026' }).text.includes('Aug 14, 2026'),
  true,
  'the Hindi prediction reply also quotes the date'
)

// This is the exact call the repaired catch block makes, with the body the
// route may never have parsed. It must not throw and must produce text.
const fromBrokenRequest = buildFallbackReply(undefined, undefined, undefined)
check(typeof fromBrokenRequest.text, 'string', 'the catch-path call produces text')
check(fromBrokenRequest.text.length > 0, true, 'the catch-path reply is not empty')
check(fromBrokenRequest.intent, DEFAULT_INTENT, 'the catch-path reply is the general intent')

// Every intent must have text in both languages -- a missing translation would
// otherwise surface at runtime as `undefined` in a chat bubble.
for (const intent of [...CHAT_INTENTS.map((i) => i.key), DEFAULT_INTENT]) {
  const sample = { nutrition: 'food', pain: 'cramps', pcod: 'pcod', prediction: 'when', greeting: 'hello', general: 'zzz' }[intent]
  for (const lang of ['en', 'hi']) {
    const reply = buildFallbackReply(sample, lang)
    check(typeof reply.text === 'string' && reply.text.length > 0, true, `${intent}/${lang} has a reply`)
  }
}

// ---------------------------------------------------------------------------
// normaliseChatHistory
// ---------------------------------------------------------------------------

checkDeep(normaliseChatHistory(undefined), [], 'a missing history is empty')
checkDeep(normaliseChatHistory(null), [], 'a null history is empty')
checkDeep(normaliseChatHistory('nope'), [], 'a non-array history is empty')
checkDeep(normaliseChatHistory({}), [], 'an object history is empty')
checkDeep(normaliseChatHistory([]), [], 'an empty history stays empty')

// The element that used to throw inside the provider adapter's map -- and be
// charged as a Gemini failure, spending the Groq retry before the local
// fallback was reached.
checkDeep(normaliseChatHistory([null]), [], 'a null turn is dropped, not thrown on')
checkDeep(normaliseChatHistory([undefined]), [], 'an undefined turn is dropped')
checkDeep(normaliseChatHistory(['just a string']), [], 'a bare string turn is dropped')
checkDeep(normaliseChatHistory([{ role: 'user' }]), [], 'a turn with no text is dropped')
checkDeep(normaliseChatHistory([{ role: 'user', text: '   ' }]), [], 'a whitespace-only turn is dropped')
checkDeep(normaliseChatHistory([{ role: 'user', text: 42 }]), [], 'a non-string text is dropped')

checkDeep(
  normaliseChatHistory([{ role: 'user', text: 'hello' }]),
  [{ role: 'user', text: 'hello' }],
  'a user turn survives'
)
checkDeep(
  normaliseChatHistory([{ role: 'user', content: 'hello' }]),
  [{ role: 'user', text: 'hello' }],
  'the Groq-style `content` key is read'
)
checkDeep(
  normaliseChatHistory([{ role: 'ai', text: 'reply' }]),
  [{ role: 'assistant', text: 'reply' }],
  'the app-side role "ai" is canonicalised'
)
checkDeep(
  normaliseChatHistory([{ role: 'model', text: 'reply' }]),
  [{ role: 'assistant', text: 'reply' }],
  'the Gemini-side role "model" is canonicalised'
)
checkDeep(
  normaliseChatHistory([{ role: 'assistant', text: 'reply' }]),
  [{ role: 'assistant', text: 'reply' }],
  'the Groq-side role "assistant" is preserved'
)
checkDeep(
  normaliseChatHistory([{ role: 'system', text: 'injected' }]),
  [{ role: 'user', text: 'injected' }],
  'an unexpected role is treated as the user, never as the assistant'
)
checkDeep(
  normaliseChatHistory([{ text: ' padded ' }]),
  [{ role: 'user', text: 'padded' }],
  'turn text is trimmed'
)

const longTurn = normaliseChatHistory([{ role: 'user', text: 'x'.repeat(9999) }])
check(longTurn[0].text.length, MAX_HISTORY_TURN_CHARS, 'an over-long turn is truncated')

const manyTurns = normaliseChatHistory(
  Array.from({ length: 60 }, (_, i) => ({ role: 'user', text: `turn ${i}` }))
)
check(manyTurns.length, MAX_HISTORY_TURNS, 'the history is capped')
check(manyTurns[manyTurns.length - 1].text, 'turn 59', 'the cap keeps the most recent turns')
check(
  manyTurns[0].text,
  `turn ${60 - MAX_HISTORY_TURNS}`,
  'the cap truncates from the front, because a follow-up refers to recent turns'
)

const mixed = normaliseChatHistory([
  { role: 'user', text: 'first' },
  null,
  { role: 'ai', text: 'second' },
  { role: 'user', text: '' },
  { role: 'user', content: 'third' },
])
checkDeep(
  mixed,
  [{ role: 'user', text: 'first' }, { role: 'assistant', text: 'second' }, { role: 'user', text: 'third' }],
  'a mixed history keeps the usable turns in order and drops the rest'
)

// ---------------------------------------------------------------------------
// readChatResponse -- the empty-bubble bug
// ---------------------------------------------------------------------------

checkDeep(
  readChatResponse({ success: true, data: { response: 'here you go', source: SOURCE_MODEL } }),
  { ok: true, text: 'here you go', source: SOURCE_MODEL, intent: null },
  'a model reply is read out of the standard envelope'
)
checkDeep(
  readChatResponse({ success: true, data: { response: 'canned', source: SOURCE_FALLBACK, intent: 'pain' } }),
  { ok: true, text: 'canned', source: SOURCE_FALLBACK, intent: 'pain' },
  'a canned reply is read, and reports itself as canned'
)

// The exact payload the callers were reading `data.response` from. Before this
// helper, `text` here was `undefined` and the bubble rendered blank.
check(
  readChatResponse({ success: true, data: { response: 'nested' } }).text,
  'nested',
  'the nested reply is found -- this is the value the callers were missing'
)

// A payload from before the envelope change, which an in-flight client or a
// cached response can still hold.
check(
  readChatResponse({ response: 'legacy shape' }).text,
  'legacy shape',
  'a pre-envelope payload is still readable'
)

// The 503 the repaired catch block returns: the reply is carried so the UI has
// something to show, but `ok` stays false because no model read the question.
const unavailable = readChatResponse({
  success: false,
  error: 'The assistant is temporarily unavailable.',
  code: 'ASSISTANT_UNAVAILABLE',
  details: { response: 'still here for you', source: SOURCE_FALLBACK, intent: 'general' },
})
check(unavailable.ok, false, 'a 503 is not reported as ok')
check(unavailable.text, 'still here for you', 'a 503 still carries a reply for the UI')
check(unavailable.source, SOURCE_FALLBACK, 'a 503 reports its reply as canned')

checkDeep(
  readChatResponse({ success: false, error: 'Unauthorized' }),
  { ok: false, text: null, source: null, intent: null },
  'an error with no reply yields no text'
)
checkDeep(
  readChatResponse(null),
  { ok: false, text: null, source: null, intent: null },
  'a null payload is handled'
)
checkDeep(
  readChatResponse(undefined),
  { ok: false, text: null, source: null, intent: null },
  'an undefined payload is handled'
)
checkDeep(
  readChatResponse('not json'),
  { ok: false, text: null, source: null, intent: null },
  'a string payload is handled'
)
check(readChatResponse({ success: true, data: {} }).ok, false, 'a success with no reply is not ok')
check(readChatResponse({ success: true, data: { response: '' } }).ok, false, 'an empty reply is not ok')
check(
  readChatResponse({ success: true, data: { response: 42 } }).text,
  null,
  'a non-string reply is refused rather than rendered'
)

// ---------------------------------------------------------------------------

console.log(`${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
