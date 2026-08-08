import assert from 'assert'
import { filterOutliers, median, predictNextPeriod } from '../lib/api-helpers.js'

async function runTests() {
  console.log('Running Cycle Prediction Outlier Filtering Tests...\n')

  // 1. Median helper unit tests
  assert.strictEqual(median([28]), 28, 'Median of single item')
  assert.strictEqual(median([26, 30]), 28, 'Median of 2 items')
  assert.strictEqual(median([24, 28, 32]), 28, 'Median of 3 items')

  // 2. Outlier filtration unit tests (> 2.5 stdDev from median)
  const normalGaps = [28, 27, 29, 28, 30]
  const filteredNormal = filterOutliers(normalGaps)
  assert.deepStrictEqual(filteredNormal, normalGaps, 'Normal gaps should not filter any entries')

  // Array with a extreme outlier (90 days gap in regular history)
  const skewedGaps = [28, 27, 29, 28, 90, 28]
  const filteredSkewed = filterOutliers(skewedGaps)
  assert.deepStrictEqual(filteredSkewed, [28, 27, 29, 28, 28], 'Outlier 90 should be filtered out')

  // Array with insufficient items (< 3)
  const smallGaps = [28, 90]
  assert.deepStrictEqual(filterOutliers(smallGaps), [28, 90], 'Arrays < 3 items should return unmodified')

  // Array with all identical items
  const identicalGaps = [28, 28, 28, 28]
  assert.deepStrictEqual(filterOutliers(identicalGaps), [28, 28, 28, 28], 'Identical values return unmodified')

  // 3. Integration test: predictNextPeriod with outlier skew
  // Today fixed to 2026-08-01 for deterministic test run
  const testToday = new Date('2026-08-01T00:00:00Z')

  const historyWithOutlier = [
    { start_date: '2026-03-01' },
    { start_date: '2026-03-29' }, // gap 28
    { start_date: '2026-04-26' }, // gap 28
    { start_date: '2026-05-24' }, // gap 28
    { start_date: '2026-08-22' }, // gap 90 (outlier)
    { start_date: '2026-09-19' }, // gap 28
  ]

  const prediction = await predictNextPeriod(historyWithOutlier, testToday, { disableMl: true })
  assert.strictEqual(prediction.averageCycleLength, 28, 'Average cycle length should be 28 despite 90-day outlier')

  console.log('✅ All outlier filtration unit and integration tests passed successfully!')
}

runTests().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
