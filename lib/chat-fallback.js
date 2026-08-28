/**
 * chat-fallback.js — what the assistant says when no model answers.
 *
 * ## The bug this exists to prevent
 *
 * `app/api/chat/route.js` ended with a `catch` that read a variable declared
 * inside the `try` it was catching for:
 *
 *     try {
 *       ...
 *       let json;                                    // <- block-scoped, in the try
 *       try { json = await request.json(); } catch { ... }
 *       ...
 *     } catch (error) {
 *       const fallback = getSmartLocalResponse(json?.message || '', language, json?.context);
 *       //                                     ^^^^ ReferenceError
 *     }
 *
 * `let` is block-scoped, and optional chaining does not rescue an undeclared
 * binding — `json?.message` on one is a `ReferenceError`, not `undefined`. The
 * handler written to keep the assistant answering when something went wrong was
 * the one thing guaranteeing it could not: every trip through that `catch`
 * threw, replacing the intended graceful reply with an unhandled rejection and
 * a bare framework 500 that the chat page renders as nothing at all.
 *
 * The path is ordinary, not exotic. `getAuthUserId()` throws when Clerk cannot
 * resolve a session — a rotated key, a clock-skewed JWT, a preview deployment
 * missing `CLERK_SECRET_KEY` — and `getSupabaseAdmin()` throws without a
 * service key. Both are precisely the situations the fallback exists for.
 *
 * ## What lives here
 *
 * The fallback's actual decisions: which intent a message expresses, which
 * language to answer in, and which reply that pair selects. It was a
 * module-private function inside a route handler, so the keyword matching that
 * decides what a user in distress is told had no test coverage at all.
 *
 * ## Why matching is on word boundaries
 *
 * The original matcher used `String.prototype.includes`:
 *
 *     if (query.includes('hello') || query.includes('hi') || query.includes('hey') ...)
 *
 * `includes('hi')` is a substring test. "I have been feeling this way for a
 * while", "my thighs ache", "which foods help", "is this normal" all contain
 * `hi`. Those branches sit last, so they only fired when nothing earlier
 * matched — but that residual case is the common one: any question that does
 * not happen to name a symptom was answered "Hello! I am your HerCycle health
 * assistant." rather than with health guidance.
 *
 * Boundaries here are Unicode-aware lookarounds rather than `\b`, because `\b`
 * is defined over `[A-Za-z0-9_]` and would never sit correctly against
 * Devanagari. That also lets the Hindi terms below participate in matching at
 * all — under the old English-only keyword list, a question typed in Hindi
 * could never match anything and always received the general reply.
 *
 * No imports, so this is usable from Route Handlers, Server Components, Client
 * Components and plain Node scripts alike.
 */

/** The reply came from a model. */
export const SOURCE_MODEL = 'model'

/** The reply is canned — no model answered. */
export const SOURCE_FALLBACK = 'fallback'

/**
 * Longest message the fallback matcher will scan.
 *
 * The route caps `message` at 2000 characters, so this is belt-and-braces for
 * callers that reach this module directly (the error path can be entered with
 * a body the schema never validated).
 */
export const MAX_FALLBACK_SCAN = 2000

/** Most history turns forwarded to a provider. */
export const MAX_HISTORY_TURNS = 20

/** Longest single history turn kept, in characters. */
export const MAX_HISTORY_TURN_CHARS = 2000

/**
 * Intents, in priority order.
 *
 * Order is explicit and data-driven rather than being the order a chain of
 * `if`s happens to be written in — that ordering was load-bearing and
 * invisible, which is how the greeting branch came to absorb every unmatched
 * question.
 *
 * `greeting` sits last on purpose: a message that names a symptom *and* opens
 * with "hi" is a symptom question.
 */
export const CHAT_INTENTS = Object.freeze([
  {
    key: 'nutrition',
    terms: ['eat', 'eating', 'food', 'foods', 'nutrition', 'diet', 'snack', 'snacks', 'meal', 'meals',
      'खाना', 'भोजन', 'आहार', 'पोषण'],
  },
  {
    key: 'pain',
    terms: ['cramp', 'cramps', 'cramping', 'pain', 'painful', 'ache', 'aches', 'aching', 'hurt', 'hurts', 'hurting',
      'दर्द', 'ऐंठन'],
  },
  {
    key: 'pcod',
    terms: ['pcod', 'pcos', 'polycystic'],
  },
  {
    key: 'prediction',
    terms: ['next period', 'predicted', 'prediction', 'predict', 'due', 'when',
      'कब', 'अगली'],
  },
  {
    key: 'greeting',
    terms: ['hello', 'hi', 'hey', 'hie', 'hiya', 'namaste',
      'नमस्ते', 'हैलो'],
  },
])

/** The intent used when nothing matches. */
export const DEFAULT_INTENT = 'general'

/**
 * Reply table. English and Hindi are held side by side so a missing
 * translation is visible at a glance rather than discovered at runtime.
 *
 * The strings are carried over verbatim from the route's private
 * `getSmartLocalResponse`, so this change alters *when* a reply is chosen, not
 * what it says.
 */
const REPLIES = Object.freeze({
  nutrition: {
    en: 'During your period, focus on iron-rich foods (spinach, lentils, pumpkin seeds), magnesium (dark chocolate), and warm herbal teas like ginger or chamomile. Stay hydrated and limit excess salt/sugar to minimize bloating! 🥗🍫',
    hi: 'माहवारी के दौरान आयरन युक्त भोजन (जैसे पालक, दालें, मेवे), डार्क चॉकलेट और गर्म हर्बल चाय लें। प्रोसेस्ड और अत्यधिक नमकीन खाने से बचें।',
  },
  pain: {
    en: 'For cramp relief, try a warm heating pad on your lower abdomen, gentle stretching/yoga, drinking warm chamomile or ginger tea, and staying hydrated. If severe, consult your doctor! 🌸',
    hi: 'माहवारी के दर्द (क्रैम्प्स) में गर्म पानी की थैली (हीटिंग पैड) से सिकाई करें, पर्याप्त पानी पिएं और हल्के खिंचाव (स्ट्रेचिंग) करें। यदि दर्द अत्यधिक हो तो डॉक्टर से परामर्श लें।',
  },
  pcod: {
    en: 'PCOD/PCOS is a common hormonal condition. It can be managed effectively with a low-glycemic balanced diet, regular exercise, consistent sleep, and medical guidance. 🩺',
    hi: 'PCOD/PCOS एक हार्मोनल स्थिति है। संतुलित आहार, नियमित व्यायाम और तनाव प्रबंधन इसे नियंत्रित करने में सहायक होते हैं।',
  },
  greeting: {
    en: 'Hello! I am your HerCycle health assistant. Ask me anything about your cycle, nutrition, symptoms, or wellness tips! 💕',
    hi: 'नमस्ते! मैं आपकी स्वास्थ्य सहायक हूँ। आप मुझसे अपनी माहवारी, पोषण या स्वास्थ्य के बारे में कुछ भी पूछ सकती हैं। 💕',
  },
  general: {
    en: 'I am here to support you with menstrual health, cycle tracking tips, nutrition, and symptom care. How can I help you today? 💕',
    hi: 'मैं आपके स्वास्थ्य और माहवारी से जुड़े प्रश्नों में मदद के लिए यहाँ हूँ। अपनी माहवारी के लक्षण या सुझाव के बारे में पूछें। 💕',
  },
  /** `prediction` is context-dependent; see `predictionReply`. */
  predictionKnown: {
    en: (date) => `Based on your cycle history, your next period is predicted around ${date}. 💕`,
    hi: (date) => `आपकी अगली माहवारी की अनुमानित तारीख ${date} है।`,
  },
  predictionUnknown: {
    en: 'Keep tracking your daily cycle data so we can generate accurate predictions for your next period! 📅',
    hi: 'नियमित रूप से अपनी माहवारी लॉग करें ताकि हम सटीक अनुमान लगा सकें।',
  },
})

/** Escapes a literal term for embedding in a regular expression. */
function escapeRegExp(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a Unicode-aware whole-word matcher for a term list.
 *
 * `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])` rather than `\b`: `\b` is defined
 * over `[A-Za-z0-9_]`, so it sits in the wrong places against Devanagari and
 * would make every Hindi term either always or never match. The lookarounds
 * are correct for both scripts, and they are what stops `thigh` reading as
 * `hi` and `update` reading as `date`.
 *
 * Terms containing a space (`next period`) work unchanged — the boundary is
 * only required at the two ends of the phrase.
 */
function buildTermMatcher(terms) {
  const alternation = terms
    .slice()
    // Longest first, so `cramps` is preferred over `cramp` and the matched
    // span is the full word rather than a prefix of it.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')

  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'iu')
}

/** Compiled once at module load, not per request. */
const COMPILED_INTENTS = CHAT_INTENTS.map((intent) => ({
  key: intent.key,
  matcher: buildTermMatcher(intent.terms),
}))

/**
 * Normalises the requested language to one this module can answer in.
 *
 * The route compared against both `'hi'` and the literal string `'हि'`, which
 * is what the language switcher stores. Both are accepted here, along with
 * region-tagged forms like `hi-IN`, and anything unrecognised falls back to
 * English rather than producing an undefined reply.
 *
 * @param {unknown} raw
 * @returns {'en'|'hi'}
 */
export function normaliseChatLanguage(raw) {
  if (typeof raw !== 'string') return 'en'
  const lowered = raw.trim().toLowerCase()
  if (lowered === 'hi' || lowered === 'हि' || lowered === 'हिंदी' || lowered.startsWith('hi-')) return 'hi'
  return 'en'
}

/**
 * Classifies a message into one of `CHAT_INTENTS`, or `DEFAULT_INTENT`.
 *
 * Never throws: a non-string, an empty string and a message of any length all
 * resolve to an intent, because this is the path taken when everything else
 * has already failed.
 *
 * @param {unknown} message
 * @returns {string} an intent key
 */
export function classifyChatIntent(message) {
  if (typeof message !== 'string') return DEFAULT_INTENT

  const scanned = message.slice(0, MAX_FALLBACK_SCAN)
  if (scanned.trim() === '') return DEFAULT_INTENT

  for (const intent of COMPILED_INTENTS) {
    if (intent.matcher.test(scanned)) return intent.key
  }

  return DEFAULT_INTENT
}

/**
 * The prediction reply, which is the one intent whose answer depends on
 * context rather than on the message alone.
 *
 * @param {'en'|'hi'} language
 * @param {object} context
 * @returns {string}
 */
function predictionReply(language, context) {
  const date = context?.nextPeriodDate
  if (typeof date === 'string' && date.trim()) {
    return REPLIES.predictionKnown[language](date.trim())
  }
  return REPLIES.predictionUnknown[language]
}

/**
 * Selects the canned reply for a message.
 *
 * Returns the intent alongside the text so the caller can log which branch
 * answered — previously unknowable, because the selection happened inside a
 * chain of `if`s in a route handler.
 *
 * @param {unknown} message
 * @param {unknown} rawLanguage
 * @param {object} [context]
 * @returns {{ text: string, intent: string, language: 'en'|'hi' }}
 */
export function buildFallbackReply(message, rawLanguage, context = {}) {
  const language = normaliseChatLanguage(rawLanguage)
  const intent = classifyChatIntent(message)

  if (intent === 'prediction') {
    return { text: predictionReply(language, context), intent, language }
  }

  const entry = REPLIES[intent] || REPLIES[DEFAULT_INTENT]
  return { text: entry[language] || entry.en, intent, language }
}

/**
 * Cleans a conversation history before it reaches a provider adapter.
 *
 * The route declared `history: z.array(z.any()).optional()` with no length cap
 * and then mapped over it:
 *
 *     history.map(msg => ({ role: ..., parts: [{ text: msg.text || msg.content || '' }] }))
 *
 * A `null` element throws inside that map. The throw was caught, but it was
 * caught by the *provider* handler — so a malformed history was charged as a
 * Gemini failure, spent the Groq retry as well, and only then fell back. And
 * because there was no cap, the whole array was parsed and mapped before
 * `pruneMessageHistory` ever saw it.
 *
 * Unusable turns are dropped rather than rejected: a client that sends one bad
 * turn should lose that turn, not the conversation.
 *
 * @param {unknown} history
 * @returns {Array<{ role: string, text: string }>}
 */
export function normaliseChatHistory(history) {
  if (!Array.isArray(history)) return []

  const cleaned = []

  for (const turn of history) {
    if (!turn || typeof turn !== 'object') continue

    const rawText = typeof turn.text === 'string'
      ? turn.text
      : typeof turn.content === 'string'
        ? turn.content
        : ''

    const text = rawText.trim()
    if (!text) continue

    // Anything that is not explicitly the assistant is treated as the user.
    // The two providers spell the assistant differently ('model' vs
    // 'assistant'), so both are recognised and a single canonical value is
    // emitted for the adapters to translate.
    const role = turn.role === 'ai' || turn.role === 'model' || turn.role === 'assistant'
      ? 'assistant'
      : 'user'

    cleaned.push({ role, text: text.slice(0, MAX_HISTORY_TURN_CHARS) })
  }

  // Keep the most recent turns: a conversation is truncated from the front,
  // because the newest turns are the ones a follow-up question refers to.
  return cleaned.slice(-MAX_HISTORY_TURNS)
}

/**
 * Reads an assistant reply out of a `/api/chat` response body.
 *
 * ## Why this is needed
 *
 * Commit "api: Standardize JSON error and success envelope across all API
 * routes" moved the route from
 *
 *     { response: '…' }
 *
 * to `jsonSuccess({ response })`, which nests it:
 *
 *     { success: true, data: { response: '…' } }
 *
 * None of the three callers were updated. `app/[locale]/chat/page.js` and
 * `components/layout/ChatFAB.jsx` both do
 *
 *     if (data.success) setChatMessages(prev => [...prev, { role: 'ai', text: data.response }])
 *
 * and `app/[locale]/page.js` checks `data?.response`. In every case
 * `data.response` is `undefined`: the first two append a message whose `text`
 * is `undefined` — `ChatAssistant` renders `{msg.text}`, so the reply arrives
 * as an **empty bubble** — and the third silently swaps in the generic error
 * string for a reply that actually succeeded.
 *
 * Reading the payload in one place, tolerant of all three shapes, is what stops
 * a fourth caller from making the same mistake.
 *
 * @param {unknown} payload the parsed response body
 * @returns {{ ok: boolean, text: string|null, source: string|null, intent: string|null }}
 */
export function readChatResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, text: null, source: null, intent: null }
  }

  // A 503 carries the canned reply under `details`, so the UI has something to
  // show rather than an empty bubble — but `ok` stays false, because no model
  // read the question.
  const envelope = payload.success === false ? payload.details : payload.data

  // The bare `response` fallback covers a payload from before the envelope
  // change, which an in-flight client or a cached response can still hold.
  const text = typeof envelope?.response === 'string'
    ? envelope.response
    : typeof payload.response === 'string'
      ? payload.response
      : null

  return {
    ok: payload.success === true && typeof text === 'string' && text.length > 0,
    text,
    source: typeof envelope?.source === 'string' ? envelope.source : null,
    intent: typeof envelope?.intent === 'string' ? envelope.intent : null,
  }
}
