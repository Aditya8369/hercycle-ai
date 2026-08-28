import { auth } from '@clerk/nextjs/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { aiLimiter, getRateLimitIdentifier } from '@/lib/rateLimiter'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import { logger } from '@/lib/logger'
import {
  SOURCE_FALLBACK,
  SOURCE_MODEL,
  buildBriefing,
  buildCoachFallback,
  buildSystemPrompt,
  buildUserPrompt,
  normaliseCoachRequest,
} from '@/lib/partner-coach'

/** Deadline for the model call, matching the chat route's per-attempt budget. */
const TIMEOUT_MS = 8000

/**
 * Calls Gemini for a coaching reply.
 *
 * Every value reaching the prompt has already been through
 * `normaliseCoachRequest` — the phase is one of four literals, the day is a
 * bounded integer, and the symptoms and question have had their quotes,
 * brackets and newlines stripped. The route used to interpolate all four raw,
 * with `phase` landing inside the *system* prompt's guideline block.
 *
 * Returns `null` on any failure; the caller falls back and says that it did.
 *
 * @param {{ phase: string, cycleDay: number, symptoms: string[], query: string, history: Array<{role: string, text: string}> }} context
 * @returns {Promise<string|null>}
 */
async function callGeminiCoach(context) {
  if (!process.env.GEMINI_API_KEY) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const systemPrompt = buildSystemPrompt(context)
    const userPrompt = buildUserPrompt(context.query)

    // History is actually passed now. `callGeminiCoach` has always declared a
    // `history` parameter and the caller never supplied one, so a follow-up
    // like "what about at night?" was answered with no idea what it referred
    // to, even though the partner could see the previous turn on screen.
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will give warm, practical support advice.' }] },
        ...context.history.map((turn) => ({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        })),
      ],
    })

    const result = await chat.sendMessage(userPrompt, { signal: controller.signal })
    const text = result?.response?.text?.()

    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch (err) {
    logger.warn(`Gemini Partner Coach call failed: ${err.message || err}`)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function POST(req) {
  // ============ RATE LIMITING ============
  try {
    const identifier = await getRateLimitIdentifier(req)
    await aiLimiter.check(req, identifier)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Partner coach endpoint: ${rateLimitError.message}`)
    return jsonError('Too many requests, please slow down. AI partner coach is rate limited.', 429)
  }
  // =======================================

  try {
    const { userId } = await auth()
    if (!userId) {
      return jsonError('Unauthorized', 401)
    }

    let body
    try {
      body = await req.json()
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in partner-coach: ${parseError.message}`)
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    // One call applies every field's policy. Previously the body was
    // destructured with plain defaults — `phase = 'Follicular'` — which guards
    // against a *missing* value and not at all against a hostile one.
    const context = normaliseCoachRequest(body)

    // 1. Opening briefing: no question asked, so no model call is needed.
    if (!context.query) {
      return jsonSuccess({
        reply: buildBriefing(context.phase, context.symptoms),
        phase: context.phase,
        cycleDay: context.cycleDay,
        source: SOURCE_FALLBACK,
        intent: 'briefing',
      })
    }

    // 2. A real question: ask the model.
    const geminiReply = await callGeminiCoach(context)
    if (geminiReply) {
      return jsonSuccess({
        reply: geminiReply,
        phase: context.phase,
        cycleDay: context.cycleDay,
        source: SOURCE_MODEL,
      })
    }

    // 3. No key, or the provider failed. `source` says so, rather than
    //    presenting a keyword-table answer exactly like a generated one.
    const fallback = buildCoachFallback(context.query, context.phase, context.cycleDay)
    logger.info(`Partner coach fallback used (intent: ${fallback.intent}) for user ${userId}`)

    return jsonSuccess({
      reply: fallback.text,
      phase: context.phase,
      cycleDay: context.cycleDay,
      source: SOURCE_FALLBACK,
      intent: fallback.intent,
    })
  } catch (error) {
    logger.error(`Error in partner-coach API: ${error.message || error}`)

    // A server fault is reported as one. This branch used to return 200 with a
    // reassuring sentence, so an outage was indistinguishable from advice —
    // and the malformed-JSON branch returned the *same* sentence with a 400,
    // leaving the client unable to tell three outcomes apart by shape. The
    // reply is still carried so the UI has something to show.
    return jsonError('The partner coach is temporarily unavailable.', 503, 'COACH_UNAVAILABLE', {
      reply: "I'm here to help you support her! Try asking about cramp relief, food ideas, or mood support.",
      source: SOURCE_FALLBACK,
    })
  }
}
