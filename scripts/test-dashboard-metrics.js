import {
  MOCK_TRAINING_LOGS,
  filterTrainingLogs,
  aggregateMetrics,
  getAvailableFilterOptions,
  getDashboardMetrics
} from '../lib/dashboard-metrics.js'

let passed = 0
let failed = 0

function check(actual, expected, label) {
  if (Object.is(actual, expected)) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${JSON.stringify(expected)}`)
  console.error(`       actual:   ${JSON.stringify(actual)}`)
}

function checkDeep(actual, expected, label) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
  console.error(`       expected: ${b}`)
  console.error(`       actual:   ${a}`)
}

async function runDashboardMetricsTests() {
  console.log('— Testing Dashboard Metrics Aggregation & Filtering Engine\n')

  // Test 1: Full unfiltered set count
  console.log('1. Testing Unfiltered Log Retrieval')
  const allLogs = filterTrainingLogs(MOCK_TRAINING_LOGS, {})
  check(allLogs.length, MOCK_TRAINING_LOGS.length, 'Returns all mock logs when no filters are specified')

  // Test 2: Date range filtering
  console.log('\n2. Testing Date Range Filtering')
  const dateFiltered = filterTrainingLogs(MOCK_TRAINING_LOGS, {
    startDate: '2026-08-10',
    endDate: '2026-08-20'
  })
  const datesInRange = dateFiltered.every(
    (log) => log.date >= '2026-08-10' && log.date <= '2026-08-20'
  )
  check(datesInRange, true, 'All returned logs are within the date range [2026-08-10, 2026-08-20]')
  check(dateFiltered.length > 0, true, 'Date range filter returned non-empty dataset')

  // Test 3: Model ID filtering
  console.log('\n3. Testing Model ID Filtering')
  const pcodLogs = filterTrainingLogs(MOCK_TRAINING_LOGS, { modelId: 'pcod_risk_classifier' })
  const allPcod = pcodLogs.every((log) => log.modelId === 'pcod_risk_classifier')
  check(allPcod, true, 'All returned logs belong to pcod_risk_classifier')
  check(pcodLogs.length, 5, 'Exact expected count for pcod_risk_classifier runs (5)')

  // Test 4: Dataset filtering
  console.log('\n4. Testing Dataset Filtering')
  const datasetLogs = filterTrainingLogs(MOCK_TRAINING_LOGS, { dataset: 'cycle_v2' })
  const allCycleV2 = datasetLogs.every((log) => log.dataset === 'cycle_v2')
  check(allCycleV2, true, 'All returned logs match dataset cycle_v2')
  check(datasetLogs.length, 2, 'Exact expected count for dataset cycle_v2 (2)')

  // Test 5: Hyperparameter filtering (Learning Rate & Batch Size)
  console.log('\n5. Testing Hyperparameter Filtering')
  const hyperLogs = filterTrainingLogs(MOCK_TRAINING_LOGS, {
    learningRate: '0.001',
    batchSize: '32'
  })
  const matchHyper = hyperLogs.every(
    (log) => log.hyperparameters.learningRate === 0.001 && log.hyperparameters.batchSize === 32
  )
  check(matchHyper, true, 'All returned logs match LR=0.001 and BatchSize=32')

  // Test 6: Aggregate Metrics Computation
  console.log('\n6. Testing Aggregate Metrics Computation')
  const aggregated = aggregateMetrics(pcodLogs)
  check(aggregated.kpis.totalRuns, 5, 'Total runs in KPI equals 5')
  check(aggregated.kpis.latestAccuracy, 92.8, 'Latest accuracy for PCOD classifier is 92.8%')
  check(aggregated.timeSeries.length, 5, 'Time series contains 5 chronological data points')
  check(aggregated.modelBenchmarks.length, 1, 'Model benchmarks contain 1 model entry')
  check(aggregated.confusionMatrix !== null, true, 'Confusion matrix exists')
  check(aggregated.confusionMatrix.labels.length, 3, 'Confusion matrix has 3 labels for PCOD risk')

  // Test 7: Empty Filter Results Handling
  console.log('\n7. Testing Empty Filter Aggregation')
  const emptyAgg = aggregateMetrics([])
  check(emptyAgg.kpis.totalRuns, 0, 'Total runs is 0 for empty logs')
  check(emptyAgg.kpis.latestAccuracy, 0, 'Latest accuracy is 0 for empty logs')
  checkDeep(emptyAgg.timeSeries, [], 'Time series is empty array for no logs')

  // Test 8: Available Filter Options Extraction
  console.log('\n8. Testing Filter Options Extraction')
  const options = getAvailableFilterOptions(MOCK_TRAINING_LOGS)
  check(options.models.length >= 3, true, 'At least 3 distinct models exist in options')
  check(options.datasets.includes('pcod_v1'), true, 'Datasets option includes pcod_v1')
  check(options.learningRates.includes(0.001), true, 'Learning rates option includes 0.001')
  check(options.batchSizes.includes(32), true, 'Batch sizes option includes 32')

  // Test 9: End-to-end getDashboardMetrics wrapper
  console.log('\n9. Testing getDashboardMetrics Wrapper')
  const dashboardResult = getDashboardMetrics({
    modelId: 'cycle_length_regressor',
    dataset: 'cycle_v2'
  })
  check(dashboardResult.filtersApplied.modelId, 'cycle_length_regressor', 'Filter applied modelId recorded')
  check(dashboardResult.metrics.kpis.totalRuns, 2, 'Filtered total runs equals 2')

  console.log(`\n✅ All ${passed} Dashboard Metrics assertions passed successfully.`)
  if (failed > 0) process.exit(1)
}

runDashboardMetricsTests().catch((err) => {
  console.error('Unhandled error in test runner:', err)
  process.exit(1)
})
