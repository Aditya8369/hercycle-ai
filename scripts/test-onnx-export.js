import fs from 'fs'
import path from 'path'
import {
  MODEL_REGISTRY,
  buildOnnxModelProto,
  exportModelToONNX
} from '../lib/onnx-exporter.js'
import { POST, GET } from '../app/api/models/export-onnx/route.js'

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

function checkTrue(condition, label) {
  if (condition) {
    passed += 1
    return
  }
  failed += 1
  console.error(`  ❌ ${label}`)
}

async function runOnnxExportTests() {
  console.log('— Testing One-Click ONNX Model Export Engine & API Handler\n')

  // Test 1: Model Registry Metadata
  console.log('1. Testing Model Registry Definitions')
  const registeredKeys = Object.keys(MODEL_REGISTRY)
  check(registeredKeys.length >= 4, true, 'At least 4 models registered for ONNX export')
  checkTrue('pcod_risk_classifier' in MODEL_REGISTRY, 'pcod_risk_classifier is registered')
  checkTrue('cycle_length_regressor' in MODEL_REGISTRY, 'cycle_length_regressor is registered')

  // Test 2: Protobuf Binary Buffer Generation
  console.log('\n2. Testing ONNX Protobuf Buffer Compiler')
  const pcodMeta = MODEL_REGISTRY.pcod_risk_classifier
  const pcodBuffer = buildOnnxModelProto(pcodMeta)
  checkTrue(Buffer.isBuffer(pcodBuffer), 'Returns a valid Node.js Buffer')
  checkTrue(pcodBuffer.length > 50, 'Generated ONNX binary buffer is non-trivial size (>50 bytes)')

  // Test 3: Export Model to File & Metadata
  console.log('\n3. Testing exportModelToONNX File Generation')
  const scratchDir = path.join(process.cwd(), 'scratch', 'test-onnx-export')
  const result = exportModelToONNX('pcod_risk_classifier', { exportDir: scratchDir })
  check(result.modelId, 'pcod_risk_classifier', 'Result modelId matches')
  check(result.fileName, 'pcod_risk_classifier.onnx', 'File name matches pcod_risk_classifier.onnx')
  checkTrue(fs.existsSync(result.filePath), 'ONNX file exists on disk')
  checkTrue(result.fileSizeBytes > 0, 'File size > 0 bytes')
  checkTrue(result.fileHash.length === 64, 'Generated valid SHA-256 checksum hash (64 hex chars)')

  // Test 4: API POST Handler (/api/models/export-onnx)
  console.log('\n4. Testing API POST Handler')
  const postReq = new Request('http://localhost:3000/api/models/export-onnx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId: 'cycle_length_regressor' })
  })
  const postRes = await POST(postReq)
  check(postRes.status, 200, 'POST status is 200')
  const postBody = await postRes.json()
  check(postBody.success, true, 'POST envelope success is true')
  check(postBody.data.modelId, 'cycle_length_regressor', 'POST exported model ID matches request')
  check(postBody.data.fileName, 'cycle_length_regressor.onnx', 'POST output file name matches')

  // Test 5: API GET Handler Download Stream
  console.log('\n5. Testing API GET Handler Download Stream')
  const getReq = new Request(
    'http://localhost:3000/api/models/export-onnx?modelId=pcod_risk_classifier&download=true'
  )
  const getRes = await GET(getReq)
  check(getRes.status, 200, 'GET download status is 200')
  check(
    getRes.headers.get('Content-Type'),
    'application/octet-stream',
    'Content-Type header is application/octet-stream'
  )
  checkTrue(
    getRes.headers.get('Content-Disposition').includes('pcod_risk_classifier.onnx'),
    'Content-Disposition header includes filename attachment'
  )
  const downloadedBuf = Buffer.from(await getRes.arrayBuffer())
  checkTrue(downloadedBuf.length > 0, 'Downloaded binary buffer size > 0')

  console.log(`\n✅ All ${passed} ONNX Export assertions passed successfully.`)
  if (failed > 0) process.exit(1)
}

runOnnxExportTests().catch((err) => {
  console.error('Unhandled error in ONNX export test runner:', err)
  process.exit(1)
})
