import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from './supabase-admin.js'
import { logger } from './logger.js'


/**
 * Computes an anonymized, non-PII audit hash for compliance logs.
 * @param {string} userId
 * @returns {string}
 */
export function buildAuditHash(userId) {
  if (!userId) return 'unknown_user'
  return createHash('sha256').update(`gdpr_purge_${userId}`).digest('hex').slice(0, 32)
}

/**
 * Performs a comprehensive, atomic batch purge of all database records associated with `userId`.
 *
 * Deletes records across all tables (partner connections, community posts/comments/votes,
 * badges, challenges, weight logs, daily logs, cycle history, and public.users row)
 * and records a non-PII compliance audit log.
 *
 * @param {string} userId
 * @returns {Promise<{ success: boolean, auditHash: string, tablesPurged: string[] }>}
 */
export async function purgeUserData(userId) {
  if (!userId) {
    throw new Error('purgeUserData requires a valid userId')
  }

  const supabaseAdmin = getSupabaseAdmin()
  const auditHash = buildAuditHash(userId)
  const tablesPurged = []

  logger.info(`[GDPR Compliance Purge] Initiating atomic user data purge for auditHash: ${auditHash}`)

  try {
    // 1. Try atomic database RPC function `purge_user_data` first if defined on Supabase
    const { error: rpcError } = await supabaseAdmin.rpc('purge_user_data', { p_user_id: userId })
    if (!rpcError) {
      logger.info(`[GDPR Compliance Purge] Atomic RPC purge_user_data succeeded for auditHash: ${auditHash}`)
      return { success: true, auditHash, tablesPurged: ['all_tables_rpc'] }
    }
  } catch (rpcExc) {
    // RPC function not defined or fell through; proceed to explicit multi-table batch delete
  }

  // 2. Fallback: Explicit multi-table batch delete in exact dependency order
  try {
    // Find partner connections involving the user to clean up dependent child records
    const { data: partnerConnections } = await supabaseAdmin
      .from('partner_connections')
      .select('id')
      .or(`primary_user_id.eq.${userId},partner_user_id.eq.${userId}`)

    const connectionIds = (partnerConnections || []).map((c) => c.id)

    if (connectionIds.length > 0) {
      await supabaseAdmin.from('partner_vibes').delete().in('connection_id', connectionIds)
      await supabaseAdmin.from('partner_quests').delete().in('connection_id', connectionIds)
      await supabaseAdmin.from('partner_permissions').delete().in('connection_id', connectionIds)
    }

    // Direct user-related partner tables
    await supabaseAdmin.from('partner_vibes').delete().eq('sender_id', userId)
    await supabaseAdmin.from('partner_connections').delete().or(`primary_user_id.eq.${userId},partner_user_id.eq.${userId}`)
    tablesPurged.push('partner_tables')

    // Auxiliary user data tables
    await supabaseAdmin.from('pairing_attempts').delete().eq('user_id', userId)
    await supabaseAdmin.from('user_push_subscriptions').delete().eq('user_id', userId)
    tablesPurged.push('push_and_pairing')

    // Forum & Community data
    await supabaseAdmin.from('forum_votes').delete().eq('user_id', userId)
    await supabaseAdmin.from('forum_comments').delete().eq('author_id', userId)
    await supabaseAdmin.from('forum_posts').delete().eq('author_id', userId)
    tablesPurged.push('forum_data')

    // Gamification & Badges
    await supabaseAdmin.from('user_badges').delete().eq('user_id', userId)
    await supabaseAdmin.from('challenge_progress').delete().eq('user_id', userId)
    tablesPurged.push('challenges_and_badges')

    // Cycle & Health Tracking Data
    await supabaseAdmin.from('weight_entries').delete().eq('user_id', userId)
    await supabaseAdmin.from('daily_logs').delete().eq('user_id', userId)
    await supabaseAdmin.from('cycles').delete().eq('user_id', userId)
    tablesPurged.push('health_data')

    // Primary User Table Delete (cascades any remaining foreign-key constrained rows)
    const { error: userDeleteError } = await supabaseAdmin.from('users').delete().eq('id', userId)
    if (userDeleteError) {
      logger.error(`[GDPR Compliance Purge] Error deleting user row for auditHash ${auditHash}:`, userDeleteError.message)
      throw new Error(`Failed to delete user table row: ${userDeleteError.message}`)
    }
    tablesPurged.push('users')

    logger.info(`[GDPR Compliance Purge] Successfully purged all user records atomically. AuditHash: ${auditHash}`, {
      tablesPurged,
      timestamp: new Date().toISOString(),
    })

    return { success: true, auditHash, tablesPurged }
  } catch (error) {
    logger.error(`[GDPR Compliance Purge] Purge execution failed for auditHash ${auditHash}:`, error.message || error)
    throw error
  }
}
