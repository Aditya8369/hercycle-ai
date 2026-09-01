import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crudLimiter } from '@/lib/rateLimiter'
import { logger } from '@/lib/logger'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import { z } from 'zod'

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.array(z.string().max(40)).max(20),
  phase: z.string().max(20).optional(),
})

async function rateCheck(req) { try { await crudLimiter.check(req) } catch { return jsonError('Too many requests', 429) } return null }

export async function GET(request) {
  const r = await rateCheck(request); if (r) return r
  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)
    const days = Math.min(parseInt(new URL(request.url).searchParams.get('days') || '30', 10), 90)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const { data, error } = await getSupabaseAdmin().from('wellness_goals').select('*')
      .eq('user_id', userId).gte('date', cutoff.toISOString().split('T')[0])
      .order('date', { ascending: false }).limit(90)
    if (error) { logger.error(`WellnessGoals GET ${userId}:`, error.message); return jsonError(error.message, 500) }
    return jsonSuccess(data || [])
  } catch (e) { logger.error('WellnessGoals GET:', e.message); return jsonError('Failed to fetch wellness goals.', 500) }
}

export async function POST(request) {
  const r = await rateCheck(request); if (r) return r
  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)
    let json; try { json = await request.json() } catch { return jsonError('Invalid JSON', 400) }
    const parsed = postSchema.safeParse(json)
    if (!parsed.success) return jsonError(parsed.error.issues.map((i) => i.message).join('; '), 400)
    const { date, completed, phase } = parsed.data
    const { data, error } = await getSupabaseAdmin().from('wellness_goals').upsert({
      user_id: userId, date, completed, phase: phase || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' }).select().single()
    if (error) { logger.error(`WellnessGoals POST ${userId}:`, error.message); return jsonError(error.message, 500) }
    return jsonSuccess(data)
  } catch (e) { logger.error('WellnessGoals POST:', e.message); return jsonError('Failed to save wellness goals.', 500) }
}

export async function DELETE(request) {
  const r = await rateCheck(request); if (r) return r
  try {
    const userId = await getAuthUserId()
    if (!userId) return jsonError('Unauthorized', 401)
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return jsonError('Date parameter required.', 400)
    const { error } = await getSupabaseAdmin().from('wellness_goals').delete().eq('user_id', userId).eq('date', id)
    if (error) { logger.error(`WellnessGoals DELETE ${userId}:`, error.message); return jsonError(error.message, 500) }
    return jsonSuccess(null, 'Record deleted.')
  } catch (e) { logger.error('WellnessGoals DELETE:', e.message); return jsonError('Failed to delete.', 500) }
}
