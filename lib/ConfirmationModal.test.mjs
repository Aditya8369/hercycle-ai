import assert from 'node:assert'
import { test, describe } from 'node:test'

function validateConfirmationKeyword(inputValue, targetKeyword = 'DELETE') {
  if (!inputValue || typeof inputValue !== 'string') return false
  return inputValue.trim() === targetKeyword
}

describe('ConfirmationModal Keyword Validation Unit Tests', () => {
  test('rejects empty input', () => {
    assert.strictEqual(validateConfirmationKeyword(''), false)
    assert.strictEqual(validateConfirmationKeyword('   '), false)
    assert.strictEqual(validateConfirmationKeyword(null), false)
  })

  test('rejects partial or incorrect keyword match', () => {
    assert.strictEqual(validateConfirmationKeyword('del'), false)
    assert.strictEqual(validateConfirmationKeyword('delete'), false)
    assert.strictEqual(validateConfirmationKeyword('DELETE ACCOUNT'), false)
  })

  test('accepts exact matching keyword', () => {
    assert.strictEqual(validateConfirmationKeyword('DELETE'), true)
    assert.strictEqual(validateConfirmationKeyword('  DELETE  '), true)
  })

  test('supports custom keywords', () => {
    assert.strictEqual(validateConfirmationKeyword('REMOVE', 'REMOVE'), true)
    assert.strictEqual(validateConfirmationKeyword('CONFIRM', 'CONFIRM'), true)
    assert.strictEqual(validateConfirmationKeyword('DELETE', 'REMOVE'), false)
  })
})

describe('ConfirmationModal Behavior Simulation', () => {
  test('submit triggers onConfirm only when input is matched and not loading', () => {
    let confirmCalled = false
    const onConfirm = () => { confirmCalled = true }

    const simulateSubmit = (inputValue, keyword, isLoading) => {
      const isMatched = validateConfirmationKeyword(inputValue, keyword)
      if (isMatched && !isLoading) {
        onConfirm()
        return true
      }
      return false
    }

    const res1 = simulateSubmit('invalid', 'DELETE', false)
    assert.strictEqual(res1, false)
    assert.strictEqual(confirmCalled, false)

    const res2 = simulateSubmit('DELETE', 'DELETE', true)
    assert.strictEqual(res2, false)
    assert.strictEqual(confirmCalled, false)

    const res3 = simulateSubmit('DELETE', 'DELETE', false)
    assert.strictEqual(res3, true)
    assert.strictEqual(confirmCalled, true)
  })
})
