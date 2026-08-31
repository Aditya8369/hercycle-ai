import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import { getCurrentPhase, buildPhaseSummary } from '@/lib/nutrition'

/**
 * GET /api/nutrition/recommendations
 * Returns cycle-phase-aware nutrition recommendations for the authenticated user.
 */
export async function GET() {
  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)

    const supabaseAdmin = getSupabaseAdmin()
    const { data: cycles, error } = await supabaseAdmin
      .from('cycles')
      .select('start_date, end_date, cycle_length')
      .eq('user_id', userId)
      .order('start_date', { ascending: true })
      .limit(12)

    if (error) {
      logger.error(`[Nutrition Recs] Failed to fetch cycles for ${userId}:`, error.message)
      return jsonError('Unable to load cycle data.', 500)
    }

    const safeCycles = cycles || []
    let avgCycleLength = 28
    if (safeCycles.length >= 2) {
      const lengths = safeCycles.filter(c => c.cycle_length >= 21 && c.cycle_length <= 45).map(c => c.cycle_length)
      if (lengths.length > 0) avgCycleLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    }

    const currentPhase = getCurrentPhase(safeCycles, avgCycleLength)
    return jsonSuccess({
      ...buildPhaseSummary(currentPhase, safeCycles, avgCycleLength),
      averageCycleLength: avgCycleLength,
    })
  } catch (error) {
    logger.error('[Nutrition Recs] Unexpected error:', error.message || error)
    return jsonError('Failed to load nutrition recommendations.', 500)
  }
}
