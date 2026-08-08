import assert from 'assert'
import {
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_MESSAGES,
  MAX_CONTEXT_TOKENS,
  estimateTokens,
  pruneMessageHistory,
} from '../lib/chat-utils.js'

async function runTests() {
  console.log('Running Chat History Pruning & Token Optimization Tests...\n')

  // 1. Token estimator tests (~4 chars per token)
  const sampleText = 'Hello, how can I help you today?' // 32 chars => ~8 tokens
  const estimated = estimateTokens(sampleText)
  assert.strictEqual(estimated, 8, 'Text token estimation should be ceil(32 / 4) = 8')

  const objectPayload = { role: 'user', content: 'What is ovulation?' }
  const objTokens = estimateTokens(objectPayload)
  assert(objTokens > 0, 'Object payload token estimation should be greater than 0')

  // 2. Sliding window pruning tests - Message Count Limit (15 max)
  const systemHeader = [{ role: 'system', content: 'You are a helpful assistant.' }]
  const longTurnHistory = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Turn message index ${i} with sample content.`,
  }))

  const prunedByCount = pruneMessageHistory([...systemHeader, ...longTurnHistory])
  assert(
    prunedByCount.length <= MAX_CONTEXT_MESSAGES,
    `Pruned messages length (${prunedByCount.length}) should not exceed MAX_CONTEXT_MESSAGES (${MAX_CONTEXT_MESSAGES})`
  )
  assert.strictEqual(
    prunedByCount[0].content,
    systemHeader[0].content,
    'System header prompt must be preserved at index 0'
  )
  assert.strictEqual(
    prunedByCount[prunedByCount.length - 1].content,
    longTurnHistory[longTurnHistory.length - 1].content,
    'Most recent conversation turn must be preserved'
  )

  // 3. Sliding window pruning tests - Token / Character Limit
  const largeTurnHistory = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'X'.repeat(2500), // Large payload per message
  }))

  const prunedByTokenLimit = pruneMessageHistory([...systemHeader, ...largeTurnHistory], {
    maxTokens: 1000,
    maxChars: 4000,
    maxMessages: 15,
  })

  const totalChars = JSON.stringify(prunedByTokenLimit).length
  const totalTokens = estimateTokens(prunedByTokenLimit)

  assert(totalChars <= 4000, `Total characters (${totalChars}) should be <= maxChars limit (4000)`)
  assert(totalTokens <= 1000, `Total tokens (${totalTokens}) should be <= maxTokens limit (1000)`)
  assert.strictEqual(
    prunedByTokenLimit[0].content,
    systemHeader[0].content,
    'Header prompt preserved despite token limit'
  )

  // 4. Edge cases: empty history or single item
  const emptyResult = pruneMessageHistory([])
  assert.deepStrictEqual(emptyResult, [], 'Empty message list returns empty array')

  const singleResult = pruneMessageHistory(systemHeader)
  assert.deepStrictEqual(singleResult, systemHeader, 'Single message list returns identical array')

  console.log('✅ All chat history pruning and token optimization tests passed successfully!')
}

runTests().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
