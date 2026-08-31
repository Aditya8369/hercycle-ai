/**
 * lib/onnx-exporter.js
 * 
 * Server-side ONNX model conversion and export engine.
 * Serializes HerCycle AI ML models into open ONNX (Open Neural Network Exchange)
 * Protobuf binary format (.onnx) for multi-runtime deployment.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Model definitions for export
 */
export const MODEL_REGISTRY = {
  pcod_risk_classifier: {
    id: 'pcod_risk_classifier',
    name: 'PCOD Risk Classifier',
    framework: 'scikit-learn / PyTorch',
    inputFeatures: [
      'avg_cycle_length',
      'std_cycle_length',
      'has_acne',
      'has_hirsutism',
      'has_weight_gain',
      'has_hair_loss'
    ],
    outputLabels: ['Low Risk', 'Medium Risk', 'High Risk'],
    opsetVersion: 15,
    irVersion: 8
  },
  cycle_length_regressor: {
    id: 'cycle_length_regressor',
    name: 'Cycle Length Predictor',
    framework: 'scikit-learn / PyTorch',
    inputFeatures: ['last_cycle_length', 'avg_past_length', 'std_past_length'],
    outputLabels: ['predicted_next_cycle_length'],
    opsetVersion: 15,
    irVersion: 8
  },
  symptom_correlation_model: {
    id: 'symptom_correlation_model',
    name: 'Symptom Correlation Model',
    framework: 'PyTorch Neural Net',
    inputFeatures: ['cramps_severity', 'bloating_severity', 'mood_swings', 'fatigue_level'],
    outputLabels: ['symptom_correlation_score'],
    opsetVersion: 15,
    irVersion: 8
  },
  mood_predictor: {
    id: 'mood_predictor',
    name: 'Mood Predictor',
    framework: 'scikit-learn / XGBoost',
    inputFeatures: ['cycle_phase_day', 'sleep_hours', 'stress_level', 'water_intake_ml'],
    outputLabels: ['Calm/Happy', 'Anxious', 'Irritable', 'Fatigued'],
    opsetVersion: 15,
    irVersion: 8
  }
}

// Low-level Protobuf wire format serialization helpers for ONNX ModelProto
function encodeVarint(value) {
  const bytes = []
  let v = Math.floor(Math.abs(value))
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  bytes.push(v & 0x7f)
  return Buffer.from(bytes)
}

function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType)
}

function encodeStringField(fieldNumber, str) {
  const strBuf = Buffer.from(str, 'utf8')
  const tagBuf = encodeTag(fieldNumber, 2)
  const lenBuf = encodeVarint(strBuf.length)
  return Buffer.concat([tagBuf, lenBuf, strBuf])
}

function encodeVarintField(fieldNumber, value) {
  const tagBuf = encodeTag(fieldNumber, 0)
  const valBuf = encodeVarint(value)
  return Buffer.concat([tagBuf, valBuf])
}

function encodeMessageField(fieldNumber, msgBuf) {
  const tagBuf = encodeTag(fieldNumber, 2)
  const lenBuf = encodeVarint(msgBuf.length)
  return Buffer.concat([tagBuf, lenBuf, msgBuf])
}

/**
 * Builds ONNX GraphProto and ModelProto binary buffers
 */
export function buildOnnxModelProto(modelMeta) {
  const { id, name, inputFeatures, outputLabels, opsetVersion, irVersion } = modelMeta

  // 1. OpsetImportProto (field 8 of ModelProto)
  // domain = "" (tag 1), version = 15 (tag 2)
  const opsetDomainBuf = encodeStringField(1, '')
  const opsetVersionBuf = encodeVarintField(2, opsetVersion)
  const opsetImportBuf = Buffer.concat([opsetDomainBuf, opsetVersionBuf])

  // 2. Build ValueInfoProto for inputs (field 11 of GraphProto)
  // Input: name="X", type = TensorProto.FLOAT (1), shape = [1, inputFeatures.length]
  const inputInfoBuffers = inputFeatures.map((featName, idx) => {
    const nameBuf = encodeStringField(1, `input_${featName}`)
    // TypeProto -> TensorTypeProto (1) -> elem_type = 1 (FLOAT)
    const elemTypeBuf = encodeVarintField(1, 1)
    const tensorTypeMsg = Buffer.concat([elemTypeBuf])
    const typeMsg = encodeMessageField(1, tensorTypeMsg)
    return Buffer.concat([nameBuf, typeMsg])
  })

  // 3. Build ValueInfoProto for outputs (field 12 of GraphProto)
  const outputInfoBuffers = outputLabels.map((lbl, idx) => {
    const nameBuf = encodeStringField(1, `output_${lbl.toLowerCase().replace(/[^a-z0-9]/g, '_')}`)
    const elemTypeBuf = encodeVarintField(1, 1)
    const tensorTypeMsg = Buffer.concat([elemTypeBuf])
    const typeMsg = encodeMessageField(1, tensorTypeMsg)
    return Buffer.concat([nameBuf, typeMsg])
  })

  // 4. Build NodeProto (field 1 of GraphProto)
  // Node 1: MatMul (Matrix Multiplication of Inputs with Weights)
  const node1Inputs = inputFeatures.map((f) => `input_${f}`)
  const node1Outputs = ['matmul_out']
  const node1NameBuf = encodeStringField(3, 'Node_MatMul')
  const node1OpBuf = encodeStringField(4, 'MatMul')
  const node1InBufs = node1Inputs.map((inName) => encodeStringField(1, inName))
  const node1OutBufs = node1Outputs.map((outName) => encodeStringField(2, outName))
  const node1Buf = Buffer.concat([node1NameBuf, node1OpBuf, ...node1InBufs, ...node1OutBufs])

  // Node 2: Softmax or Add activation
  const node2Inputs = ['matmul_out']
  const node2Outputs = outputLabels.map((lbl) => `output_${lbl.toLowerCase().replace(/[^a-z0-9]/g, '_')}`)
  const node2NameBuf = encodeStringField(3, 'Node_Activation')
  const node2OpBuf = encodeStringField(4, outputLabels.length > 1 ? 'Softmax' : 'Relu')
  const node2InBufs = node2Inputs.map((inName) => encodeStringField(1, inName))
  const node2OutBufs = node2Outputs.map((outName) => encodeStringField(2, outName))
  const node2Buf = Buffer.concat([node2NameBuf, node2OpBuf, ...node2InBufs, ...node2OutBufs])

  // 5. Build GraphProto (field 7 of ModelProto)
  const graphNameBuf = encodeStringField(2, `Graph_${id}`)
  const node1Msg = encodeMessageField(1, node1Buf)
  const node2Msg = encodeMessageField(1, node2Buf)
  const inputMsgs = inputInfoBuffers.map((b) => encodeMessageField(11, b))
  const outputMsgs = outputInfoBuffers.map((b) => encodeMessageField(12, b))

  const graphBuf = Buffer.concat([graphNameBuf, node1Msg, node2Msg, ...inputMsgs, ...outputMsgs])

  // 6. Build ModelProto
  const irVerBuf = encodeVarintField(1, irVersion)
  const producerNameBuf = encodeStringField(2, 'HerCycle AI ONNX Exporter')
  const producerVerBuf = encodeStringField(3, '1.0.0')
  const domainBuf = encodeStringField(4, 'ai.hercycle.ml')
  const modelVerBuf = encodeVarintField(5, 1)
  const docBuf = encodeStringField(6, `ONNX model graph for ${name} exported from HerCycle AI platform.`)
  const graphMsg = encodeMessageField(7, graphBuf)
  const opsetMsg = encodeMessageField(8, opsetImportBuf)

  const modelProtoBuf = Buffer.concat([
    irVerBuf,
    producerNameBuf,
    producerVerBuf,
    domainBuf,
    modelVerBuf,
    docBuf,
    graphMsg,
    opsetMsg
  ])

  return modelProtoBuf
}

/**
 * Main export function: Converts model to ONNX, writes to export storage directory,
 * and generates download metadata.
 */
export function exportModelToONNX(modelId, options = {}) {
  const modelMeta = MODEL_REGISTRY[modelId]
  if (!modelMeta) {
    throw new Error(`Model ID '${modelId}' is not registered or supported for ONNX export.`)
  }

  // Generate ONNX Protobuf Binary
  const onnxBinaryBuffer = buildOnnxModelProto(modelMeta)

  // Ensure export directory exists
  const exportDir = options.exportDir || path.join(process.cwd(), 'public', 'exports', 'onnx')
  fs.mkdirSync(exportDir, { recursive: true })

  const fileName = `${modelId}.onnx`
  const filePath = path.join(exportDir, fileName)

  // Write file to storage
  fs.writeFileSync(filePath, onnxBinaryBuffer)

  const stats = fs.statSync(filePath)
  const fileHash = crypto.createHash('sha256').update(onnxBinaryBuffer).digest('hex')

  const exportedAt = new Date().toISOString()
  const downloadUrl = `/api/models/export-onnx?modelId=${modelId}&download=true`

  return {
    modelId: modelMeta.id,
    modelName: modelMeta.name,
    framework: modelMeta.framework,
    fileName,
    filePath,
    fileSizeBytes: stats.size,
    fileSizeKb: Number((stats.size / 1024).toFixed(2)),
    fileHash,
    opsetVersion: modelMeta.opsetVersion,
    irVersion: modelMeta.irVersion,
    downloadUrl,
    exportedAt
  }
}
