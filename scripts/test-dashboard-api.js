import { GET } from '../app/api/dashboard/metrics/route.js'

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

async function runDashboardApiTests() {
  console.log('— Testing Dashboard Metrics API Route (/api/dashboard/metrics)\n')

  // Test 1: GET route without parameters returns default full metrics envelope
  console.log('1. Testing GET route with no parameters')
  const req1 = new Request('http://localhost:3000/api/dashboard/metrics')
  const res1 = await GET(req1)
  check(res1.status, 200, 'HTTP status is 200')
  const body1 = await res1.json()
  check(body1.success, true, 'Envelope success flag is true')
  check(body1.data.metrics.kpis.totalRuns > 0, true, 'KPI total runs > 0')

  // Test 2: GET route with filters (modelId & dataset)
  console.log('\n2. Testing GET route with query filters')
  const req2 = new Request(
    'http://localhost:3000/api/dashboard/metrics?modelId=pcod_risk_classifier&dataset=pcod_v2&learningRate=0.0005'
  )
  const res2 = await GET(req2)
  check(res2.status, 200, 'HTTP status is 200 for filtered request')
  const body2 = await res2.json()
  check(body2.success, true, 'Filtered envelope success flag is true')
  check(body2.data.filtersApplied.modelId, 'pcod_risk_classifier', 'Filters applied modelId matches query')
  check(body2.data.filtersApplied.dataset, 'pcod_v2', 'Filters applied dataset matches query')
  check(body2.data.metrics.kpis.totalRuns, 2, 'Filtered total runs matches expected count (2)')

  console.log(`\n✅ All ${passed} Dashboard API assertions passed successfully.`)
  if (failed > 0) process.exit(1)
}

runDashboardApiTests().catch((err) => {
  console.error('Unhandled error in API test runner:', err)
  process.exit(1)
})
