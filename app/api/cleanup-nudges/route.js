import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'

/**
 * Manually triggers the same retention cleanup that pg_cron runs
 * automatically every hour (see supabase/04_partner_nudges_cleanup.sql).
 *
 * This exists as a fallback/manual-trigger option: pg_cron requires the
 * extension to be enabled per-project, and this route lets the cleanup
 * run (or be verified) without waiting on that, or without waiting for
 * the next scheduled hour during testing.
 *
 * Intentionally requires authentication so this isn't a public,
 * unauthenticated way to hit the database — but does not restrict to a
 * specific admin role, since this project has no admin-role concept yet.
 * Worth tightening further if one is added later.
 */
export async function POST(request) {
  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to POST /api/cleanup-nudges')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('partner_nudges')
      .delete()
      .not('read_at', 'is', null)
      .lt('read_at', cutoff)
      .select('id')

    if (error) {
      logger.error('Error running manual nudge cleanup:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const deletedCount = data?.length ?? 0
    logger.info(`Manual nudge cleanup: deleted ${deletedCount} read nudges older than 24h`)

    return NextResponse.json({ success: true, deletedCount })
  } catch (error) {
    logger.error('Error in cleanup-nudges route:', error.message || error)
    return NextResponse.json({ success: false, error: `Cleanup failed: ${error.message || error}` }, { status: 500 })
  }
}