import { NextResponse } from 'next/server.js'
import fs from 'fs'
import path from 'path'
import { jsonSuccess, jsonError } from '../../../../lib/api-helpers.js'
import { exportModelToONNX, MODEL_REGISTRY } from '../../../../lib/onnx-exporter.js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/models/export-onnx
 * Body: { modelId: string }
 * Performs server-side ONNX graph export and returns download link and file metadata.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { modelId } = body

    if (!modelId) {
      return jsonError('Missing required parameter: modelId', 400, 'INVALID_PARAMETER')
    }

    if (!MODEL_REGISTRY[modelId]) {
      return jsonError(
        `Model '${modelId}' not found. Available models: ${Object.keys(MODEL_REGISTRY).join(', ')}`,
        404,
        'MODEL_NOT_FOUND'
      )
    }

    const exportResult = exportModelToONNX(modelId)

    return jsonSuccess(exportResult, 'Model successfully exported to ONNX format', 200)
  } catch (error) {
    console.error('Error exporting model to ONNX:', error)
    return jsonError(
      error.message || 'Failed to export model to ONNX format',
      500,
      'EXPORT_FAILED'
    )
  }
}

/**
 * GET /api/models/export-onnx
 * Params: ?modelId=<modelId>&download=true
 * Streams the generated .onnx binary file to the user for download.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const modelId = searchParams.get('modelId') || 'pcod_risk_classifier'
    const isDownload = searchParams.get('download') === 'true'

    if (!MODEL_REGISTRY[modelId]) {
      return jsonError(`Model '${modelId}' is invalid`, 404, 'MODEL_NOT_FOUND')
    }

    // Ensure model is compiled/exported
    const exportResult = exportModelToONNX(modelId)

    if (isDownload) {
      if (!fs.existsSync(exportResult.filePath)) {
        return jsonError('Exported ONNX file not found on server', 404, 'FILE_NOT_FOUND')
      }

      const fileBuffer = fs.readFileSync(exportResult.filePath)

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${exportResult.fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      })
    }

    return jsonSuccess(exportResult, 'ONNX export status and metadata')
  } catch (error) {
    console.error('Error handling ONNX download request:', error)
    return jsonError('Failed to process download request', 500, 'DOWNLOAD_FAILED')
  }
}
