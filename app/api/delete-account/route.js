import { getAuthUserId } from '@/lib/clerk-server'
import { clerkClient } from '@clerk/nextjs/server'
import { logger } from '@/lib/logger'
import { crudLimiter } from '@/lib/rateLimiter'
import { jsonSuccess, jsonError } from '@/lib/api-helpers'
import { purgeUserData } from '@/lib/user-purge'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  // ============ RATE LIMITING ============
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Delete account endpoint: ${rateLimitError.message}`)
    return jsonError('Too many requests, please slow down.', 429)
  }
  // =======================================

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to Delete Account API')
      return jsonError('Unauthorized', 401)
    }

    // 1. Perform atomic batch deletion across all user-associated database tables
    const purgeResult = await purgeUserData(userId)

    // 2. Delete user from Clerk authentication backend
    try {
      const client = typeof clerkClient === 'function' ? await clerkClient() : clerkClient
      await client.users.deleteUser(userId)
    } catch (clerkErr) {
      logger.warn(`Clerk deleteUser warning for ${userId}: ${clerkErr.message}`)
    }

    logger.info(`Account deleted successfully for auditHash: ${purgeResult.auditHash}`)
    return jsonSuccess({ auditHash: purgeResult.auditHash }, 'Account and associated user data purged successfully.')
  } catch (error) {
    logger.error('Error in account deletion handler:', error.message || error)
    return jsonError(`Failed to delete account: ${error.message || error}`, 500)
  }
}

export async function DELETE(request) {
  return POST(request)
}


