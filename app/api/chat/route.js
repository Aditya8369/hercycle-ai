import { validateEnv } from "@/lib/env";
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAuthUserId } from '@/lib/clerk-server'
import { aiLimiter, getRateLimitIdentifier } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { pruneMessageHistory } from '@/lib/chat-utils';
import { jsonSuccess, jsonError } from '@/lib/api-helpers'

const TIMEOUT_MS = 6000; // 6 seconds timeout per AI attempt to keep chat snappy

const chatPayloadSchema = z.object({
  language: z.string().max(20).optional(),
  message: z.string().min(1).max(2000),
  context: z.any().optional(),
  history: z.array(z.any()).optional()
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

function getSmartLocalResponse(message, language = 'en', context = {}) {
  const query = (message || '').toLowerCase();
  const isHindi = language === 'hi' || language === 'हि';

  if (query.includes('eat') || query.includes('food') || query.includes('nutrition') || query.includes('diet') || query.includes('snack')) {
    return isHindi
      ? 'माहवारी के दौरान आयरन युक्त भोजन (जैसे पालक, दालें, मेवे), डार्क चॉकलेट और गर्म हर्बल चाय लें। प्रोसेस्ड और अत्यधिक नमकीन खाने से बचें।'
      : 'During your period, focus on iron-rich foods (spinach, lentils, pumpkin seeds), magnesium (dark chocolate), and warm herbal teas like ginger or chamomile. Stay hydrated and limit excess salt/sugar to minimize bloating! 🥗🍫';
  }

  if (query.includes('cramp') || query.includes('pain') || query.includes('ache') || query.includes('hurt')) {
    return isHindi
      ? 'माहवारी के दर्द (क्रैम्प्स) में गर्म पानी की थैली (हीटिंग पैड) से सिकाई करें, पर्याप्त पानी पिएं और हल्के खिंचाव (स्ट्रेचिंग) करें। यदि दर्द अत्यधिक हो तो डॉक्टर से परामर्श लें।'
      : 'For cramp relief, try a warm heating pad on your lower abdomen, gentle stretching/yoga, drinking warm chamomile or ginger tea, and staying hydrated. If severe, consult your doctor! 🌸';
  }

  if (query.includes('pcos') || query.includes('pcod')) {
    return isHindi
      ? 'PCOD/PCOS एक हार्मोनल स्थिति है। संतुलित आहार, नियमित व्यायाम और तनाव प्रबंधन इसे नियंत्रित करने में सहायक होते हैं।'
      : 'PCOD/PCOS is a common hormonal condition. It can be managed effectively with a low-glycemic balanced diet, regular exercise, consistent sleep, and medical guidance. 🩺';
  }

  if (query.includes('next period') || query.includes('predicted') || query.includes('when')) {
    if (context?.nextPeriodDate) {
      return isHindi
        ? `आपकी अगली माहवारी की अनुमानित तारीख ${context.nextPeriodDate} है।`
        : `Based on your cycle history, your next period is predicted around ${context.nextPeriodDate}. 💕`;
    }
    return isHindi
      ? 'नियमित रूप से अपनी माहवारी लॉग करें ताकि हम सटीक अनुमान लगा सकें।'
      : 'Keep tracking your daily cycle data so we can generate accurate predictions for your next period! 📅';
  }

  if (query.includes('hello') || query.includes('hi') || query.includes('hey') || query.includes('hie')) {
    return isHindi
      ? 'नमस्ते! मैं आपकी स्वास्थ्य सहायक हूँ। आप मुझसे अपनी माहवारी, पोषण या स्वास्थ्य के बारे में कुछ भी पूछ सकती हैं। 💕'
      : 'Hello! I am your HerCycle health assistant. Ask me anything about your cycle, nutrition, symptoms, or wellness tips! 💕';
  }

  return isHindi
    ? 'मैं आपके स्वास्थ्य और माहवारी से जुड़े प्रश्नों में मदद के लिए यहाँ हूँ। अपनी माहवारी के लक्षण या सुझाव के बारे बारे में पूछें। 💕'
    : 'I am here to support you with menstrual health, cycle tracking tips, nutrition, and symptom care. How can I help you today? 💕';
}

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

    let json;
    try {
      json = await request.json();
    } catch (parseError) {
      logger.warn(`Malformed JSON payload in AI Chat API: ${parseError.message}`);
      return jsonError('Bad Request: Invalid JSON payload', 400)
    }

    const result = chatPayloadSchema.safeParse(json)
    if (!result.success) {
      logger.warn(`Invalid request payload on AI Chat API: ${result.error.message}`);
      return jsonError('Bad Request', 400, null, result.error.errors)
    }

    const { message, context, history = [] } = result.data
    language = result.data.language || 'en'

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
      return jsonSuccess({ response: 'Privacy mode enabled' })
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

    // Try Gemini -> Groq -> Local smart response
    let responseText = null;
    try {
      responseText = await withTimeout((sig) => callGemini(message, systemPrompt, history, sig), TIMEOUT_MS);
    } catch (geminiErr) {
      logger.warn(`Gemini call failed: ${geminiErr.message}. Trying Groq fallback...`);
      try {
        responseText = await withTimeout((sig) => callGroq(message, systemPrompt, history, sig), TIMEOUT_MS);
      } catch (groqErr) {
        logger.warn(`Groq call failed: ${groqErr.message}. Using intelligent health fallback...`);
        responseText = getSmartLocalResponse(message, language, context);
      }
    }

    logger.info(`Successful chat assistant response generated for user ${userId}`);
    return jsonSuccess({ response: responseText })
  } catch (error) {
    logger.error('AI Chat Route Error:', error);
    const fallback = getSmartLocalResponse(json?.message || '', language, json?.context);
    return jsonSuccess({ response: fallback })
  }
}