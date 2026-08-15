import assert from 'node:assert'
import { test, describe } from 'node:test'

// Helper function simulating the optimistic workflow of WeightTracker
async function processWeightTrackerSubmission({
  formData,
  apiMock,
  onSaved,
}) {
  const weightNum = Number(formData.weight_kg)
  const heightNum = Number(formData.height_cm)
  const waistNum = formData.waist_cm ? Number(formData.waist_cm) : null
  const dateVal = formData.recorded_date

  if (!weightNum || !heightNum) {
    throw new Error('Invalid input')
  }

  const heightM = heightNum / 100
  const calculatedBmi = Number((weightNum / (heightM * heightM)).toFixed(1))
  const previousForm = { ...formData }

  // 1. Construct Optimistic Record
  const optimisticRecord = {
    id: `temp-${Date.now()}`,
    recorded_date: dateVal,
    weight_kg: weightNum,
    waist_cm: waistNum,
    height_cm: heightNum,
    bmi: calculatedBmi,
    isPending: true,
    status: 'syncing',
  }

  let currentPendingEntry = optimisticRecord
  let currentForm = {
    recorded_date: dateVal,
    weight_kg: '',
    waist_cm: '',
    height_cm: formData.height_cm,
  }

  // Notify optimistic callback
  onSaved?.(optimisticRecord, { isOptimistic: true })

  try {
    const apiResult = await apiMock({
      recorded_date: dateVal,
      weight_kg: weightNum,
      waist_cm: waistNum,
      height_cm: heightNum,
    })

    if (!apiResult.success) {
      throw new Error(apiResult.error || 'Server error')
    }

    const confirmedEntry = { ...apiResult.data, isPending: false, status: 'saved' }
    currentPendingEntry = confirmedEntry
    onSaved?.(confirmedEntry, { isOptimistic: false })

    return {
      success: true,
      pendingEntry: currentPendingEntry,
      form: currentForm,
    }
  } catch (error) {
    // Rollback
    currentPendingEntry = null
    currentForm = previousForm

    return {
      success: false,
      error: error.message,
      pendingEntry: currentPendingEntry,
      form: currentForm,
    }
  }
}

describe('WeightTracker Optimistic UI Workflow', () => {
  test('optimistically creates record and triggers callback immediately', async () => {
    const savedCalls = []
    const onSaved = (data, meta) => savedCalls.push({ data, meta })

    const mockApi = async (body) => {
      // Simulate network latency
      await new Promise(r => setTimeout(r, 10))
      return {
        success: true,
        data: {
          id: 'server-id-123',
          ...body,
          bmi: 22.5,
          created_at: new Date().toISOString(),
        },
      }
    }

    const result = await processWeightTrackerSubmission({
      formData: {
        recorded_date: '2026-08-14',
        weight_kg: '65',
        waist_cm: '75',
        height_cm: '170',
      },
      apiMock: mockApi,
      onSaved,
    })

    assert.strictEqual(result.success, true)
    assert.strictEqual(savedCalls.length, 2)
    assert.strictEqual(savedCalls[0].meta.isOptimistic, true)
    assert.strictEqual(savedCalls[0].data.isPending, true)
    assert.strictEqual(savedCalls[0].data.weight_kg, 65)
    assert.strictEqual(savedCalls[1].meta.isOptimistic, false)
    assert.strictEqual(savedCalls[1].data.isPending, false)
    assert.strictEqual(savedCalls[1].data.id, 'server-id-123')
  })

  test('rolls back pending state and restores form inputs on API failure', async () => {
    const savedCalls = []
    const onSaved = (data, meta) => savedCalls.push({ data, meta })

    const failingApiMock = async () => {
      await new Promise(r => setTimeout(r, 10))
      return { success: false, error: 'Database connection failed' }
    }

    const initialFormData = {
      recorded_date: '2026-08-14',
      weight_kg: '70',
      waist_cm: '80',
      height_cm: '175',
    }

    const result = await processWeightTrackerSubmission({
      formData: initialFormData,
      apiMock: failingApiMock,
      onSaved,
    })

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, 'Database connection failed')
    assert.strictEqual(result.pendingEntry, null) // Optimistic entry cleared
    assert.deepStrictEqual(result.form, initialFormData) // Form values restored
    assert.strictEqual(savedCalls.length, 1) // Only optimistic call was fired before failure
    assert.strictEqual(savedCalls[0].meta.isOptimistic, true)
  })
})
