/**
 * chat-utils.js — Utilities for LLM chat payload token estimation and sliding window pruning.
 */

export const MAX_CONTEXT_MESSAGES = 15
export const MAX_CONTEXT_CHARS = 12000
export const MAX_CONTEXT_TOKENS = 3000

/**
 * Estimates token count of a string or object (~4 characters per token).
 * @param {any} payload
 * @returns {number} estimated token count
 */
export function estimateTokens(payload) {
  if (!payload) return 0
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return Math.ceil(text.length / 4)
}

/**
 * Truncates conversation history using a sliding window token estimator.
 * Keeps system/header prompts and recent message turns within token, character,
 * and message count limits before dispatching to AI models.
 *
 * @param {Array<{role: string, ...}>} messages
 * @param {object} [options]
 * @param {number} [options.maxMessages=MAX_CONTEXT_MESSAGES]
 * @param {number} [options.maxChars=MAX_CONTEXT_CHARS]
 * @param {number} [options.maxTokens=MAX_CONTEXT_TOKENS]
 * @returns {Array<{role: string, ...}>}
 */
export function pruneMessageHistory(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return messages || []

  const maxMessages = options.maxMessages || MAX_CONTEXT_MESSAGES
  const maxChars = options.maxChars || MAX_CONTEXT_CHARS
  const maxTokens = options.maxTokens || MAX_CONTEXT_TOKENS

  // Determine header message count (e.g. system prompt + initial model/assistant acknowledgment)
  let headerCount = 1
  if (
    messages.length > 1 &&
    (messages[1].role === 'model' || messages[1].role === 'assistant') &&
    (messages[0].role === 'user' || messages[0].role === 'system')
  ) {
    headerCount = 2
  }

  const headerMessages = messages.slice(0, headerCount)
  let currentChars = JSON.stringify(headerMessages).length
  let currentTokens = estimateTokens(headerMessages)

  const recentMessages = []

  // Iterate backwards from the most recent conversation turn
  for (let i = messages.length - 1; i >= headerCount; i--) {
    const msg = messages[i]
    const msgChars = JSON.stringify(msg).length
    const msgTokens = estimateTokens(msg)

    if (recentMessages.length + headerCount >= maxMessages) break
    if (currentChars + msgChars > maxChars) break
    if (currentTokens + msgTokens > maxTokens) break

    recentMessages.unshift(msg)
    currentChars += msgChars
    currentTokens += msgTokens
  }

  return [...headerMessages, ...recentMessages]
}
