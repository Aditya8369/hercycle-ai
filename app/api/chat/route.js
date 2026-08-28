import { validateEnv } from "@/lib/env";
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAuthUserId } from '@/lib/clerk-server'
import { aiLimiter, getRateLimitIdentifier } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { pruneMessageHistory } from '@/lib/chat-utils';
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import {
  MAX_HISTORY_TURNS,
  SOURCE_FALLBACK,
  SOURCE_MODEL,
  buildFallbackReply,
  normaliseChatHistory,
} from '@/lib/chat-fallback'

const TIMEOUT_MS = 6000; // 6 seconds timeout per AI attempt to keep chat snappy

const chatPayloadSchema = z.object({
  language: z.string().max(20).optional(),
  message: z.string().min(1).max(2000),
  context: z.any().optional(),
  // Capped here rather than relying on `pruneMessageHistory` downstream: the
  // pruner runs *after* the whole array has been parsed and mapped, so an
  // unbounded history was already fully materialised — and one `null` element
  // threw inside that map, which was charged as a provider failure and spent
  // the Groq retry before the local fallback was reached.
  history: z.array(z.any()).max(MAX_HISTORY_TURNS).optional()
}).passthrough()

const withTimeout = async (fn, ms) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Primary AI Call: Google Gemini API
 */
async function callGemini(message, systemPrompt, history = [], signal) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_gemini_key')) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const formattedHistory = history.map(msg => ({
    role: msg.role === 'ai' ? 'model' : (msg.role || 'user'),
    parts: [{ text: msg.text || msg.content || '' }]
  }));

  const chat = model.startChat({
    history: pruneMessageHistory([
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [
          {
            text: 'I understand. I will provide helpful menstrual health guidance.',
          },
        ],
      },
      ...formattedHistory
    ]),
  });

  const result = await chat.sendMessage(message, { signal });
  return result.response.text();
}

/**
 * Fallback AI Call: Groq API
 */
async function callGroq(message, systemPrompt, history = [], signal) {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.includes('your_groq_key')) {
    throw new Error('GROQ_API_KEY environment variable is not defined.');
  }

  const formattedHistory = history.map(msg => ({
    role: msg.role === 'ai' || msg.role === 'model' ? 'assistant' : (msg.role || 'user'),
    content: msg.text || msg.content || ''
  }));

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: pruneMessageHistory([
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: 'I understand. I will provide helpful menstrual health guidance.' },
        ...formattedHistory,
        { role: 'user', content: message }
      ]),
      max_tokens: 300
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(`Groq API returned status ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function POST(request) {
  validateEnv();

  // Hoisted above the try/catch that reads them.
  //
  // These lived *inside* the `try`, and the `catch` at the bottom read
  // `json?.message`. `let` is block-scoped and optional chaining does not
  // rescue an undeclared binding, so every trip through that handler threw
  // `ReferenceError: json is not defined` — the fallback written to keep the
  // assistant answering was the one thing guaranteeing it could not.
  let requestBody = null;
  let language = 'en';

  // ============ RATE LIMITING ============
  try {
    const identifier = await getRateLimitIdentifier(request);
    await aiLimiter.check(request, identifier);
  } catch (rateLimitError) {
    console.warn(`[Rate Limit] Chat endpoint: ${rateLimitError.message}`);
    return jsonError('Too many requests, please slow down. AI chat is rate limited.', 429)
  }

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to AI Chat API');
      return jsonError('Unauthorized', 401)
    }

    try {
      requestBody = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in AI Chat API: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    const result = chatPayloadSchema.safeParse(requestBody)
    if (!result.success) {
      logger.warn(`Invalid request payload on AI Chat API: ${result.error.message}`);
      return jsonError('Bad Request', 400, null, result.error.errors)
    }

    const { message, context } = result.data
    language = result.data.language || 'en'
    // Unusable turns are dropped before an adapter can throw on them.
    const history = normaliseChatHistory(result.data.history)

    if (!message || message.trim().length === 0) {
      return jsonError("Message content cannot be empty", 400)
    }

    let userProfile = null;
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      userProfile = data;
    } catch (profileErr) {
      logger.warn(`Could not fetch user profile for AI context: ${profileErr.message}`);
    }

    if (userProfile && userProfile.allow_ai_analysis === false) {
      return jsonSuccess({ response: 'Privacy mode enabled', source: SOURCE_FALLBACK, intent: 'privacy' })
    }

    let systemPrompt = `You are a helpful menstrual health assistant. Provide empathetic, accurate health guidance.`;

    const sanitizeForPrompt = (str, maxLen = 200) => {
      if (!str) return '';
      return String(str).replace(/[\[\]"'`\\]/g, '').replace(/\n/g, ' ').slice(0, maxLen);
    };

    if (userProfile) {
      const conditions = userProfile.known_conditions || [];
      const ageStr = userProfile.age ? sanitizeForPrompt(`${userProfile.age} yrs old`) : 'unknown age';
      const weightStr = userProfile.weight_kg ? sanitizeForPrompt(`${userProfile.weight_kg}kg`) : 'unknown weight';
      const conditionsStr = conditions.length > 0 ? conditions.map(c => sanitizeForPrompt(c)).join(', ') : 'none';
      systemPrompt += `\n[CONTEXT: User is ${ageStr}, weighs ${weightStr}, conditions: ${conditionsStr}].`;
    }

    if (language === 'हि' || language === 'hi') {
      systemPrompt = `आप एक सहायक मासिक धर्म स्वास्थ्य सहायक हैं। सहानुभूतिपूर्ण, सटीक स्वास्थ्य मार्गदर्शन प्रदान करें। हमेशा हिंदी में जवाब दें।`;
    }

    if (context?.nextPeriodDate) {
      systemPrompt += `\n\nUser's next period is predicted on ${context.nextPeriodDate}. Average cycle length: ${context.averageCycleLength || 28} days.`;
    }

    if (context?.currentPhase?.day && context?.currentPhase?.phase) {
      systemPrompt += `\n\nCurrent Cycle Day: ${context.currentPhase.day}. Current Phase: ${context.currentPhase.phase}.`;
    }

    systemPrompt += `\n\nImportant: Keep responses under 100 words. Be supportive and conversational.`;

    // Try Gemini -> Groq -> local canned reply.
    let responseText = null;
    let source = SOURCE_MODEL;
    let intent = null;

    try {
      responseText = await withTimeout((sig) => callGemini(message, systemPrompt, history, sig), TIMEOUT_MS);
    } catch (geminiErr) {
      logger.warn(`Gemini call failed: ${geminiErr.message}. Trying Groq fallback...`);
      try {
        responseText = await withTimeout((sig) => callGroq(message, systemPrompt, history, sig), TIMEOUT_MS);
      } catch (groqErr) {
        logger.warn(`Groq call failed: ${groqErr.message}. Using the local health fallback...`);
        const fallback = buildFallbackReply(message, language, context);
        responseText = fallback.text;
        source = SOURCE_FALLBACK;
        intent = fallback.intent;
      }
    }

    // `source` lets the caller say so. A canned paragraph about heating pads
    // was previously returned with the same shape and the same 200 as a
    // generated answer, so neither the UI nor the user could tell that no
    // model had read the question.
    logger.info(`Chat response for user ${userId} (source: ${source}${intent ? `, intent: ${intent}` : ''})`);
    return jsonSuccess({ response: responseText, source, ...(intent ? { intent } : {}) })
  } catch (error) {
    logger.error('AI Chat Route Error:', error);

    // `requestBody` is hoisted, so this handler can actually run. It is still
    // whatever the client sent — unvalidated, possibly null — which is why
    // every accessor below tolerates that.
    const fallback = buildFallbackReply(requestBody?.message, language, requestBody?.context);

    // A server fault is reported as one. Returning 200 here made an outage
    // indistinguishable from advice; the reply is still carried so the chat UI
    // has something to show rather than an empty bubble.
    return jsonError('The assistant is temporarily unavailable.', 503, 'ASSISTANT_UNAVAILABLE', {
      response: fallback.text,
      source: SOURCE_FALLBACK,
      intent: fallback.intent,
    })
  }
}
