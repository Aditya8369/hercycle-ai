import { jsonSuccess, jsonError } from '../../../../lib/api-helpers.js'
import { getDashboardMetrics } from '../../../../lib/dashboard-metrics.js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/metrics
 * 
 * Query Params:
 * - startDate: ISO Date string (YYYY-MM-DD)
 * - endDate: ISO Date string (YYYY-MM-DD)
 * - modelId: Model identifier or 'all'
 * - dataset: Dataset identifier or 'all'
 * - learningRate: Hyperparameter learning rate float or 'all'
 * - batchSize: Hyperparameter batch size int or 'all'
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''
    const modelId = searchParams.get('modelId') || 'all'
    const dataset = searchParams.get('dataset') || 'all'
    const learningRate = searchParams.get('learningRate') || 'all'
    const batchSize = searchParams.get('batchSize') || 'all'

    const result = getDashboardMetrics({
      startDate,
      endDate,
      modelId,
      dataset,
      learningRate,
      batchSize
    })

    return jsonSuccess(result, 'Dashboard metrics retrieved successfully')
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error)
    return jsonError(
      error.message || 'Failed to aggregate dashboard metrics',
      500,
      'INTERNAL_SERVER_ERROR'
    )
  }
}
