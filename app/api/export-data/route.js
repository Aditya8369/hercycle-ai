import { getAuthUserId } from '@/lib/clerk-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'
import { formatDateForCSV } from '@/lib/utils'
import { toCsv } from '@/lib/csv'
import { crudLimiter } from '@/lib/rateLimiter'
import {
  EXPORT_ROW_LIMIT,
  buildArchiveFilename,
  contentDisposition,
  describeExportError,
  planArchiveEntries,
} from '@/lib/export-archive'
const archiver = require('archiver')

export const dynamic = 'force-dynamic'

/**
 * A JSON error response.
 *
 * This route cannot use `jsonError`: its success path returns a ZIP, and the
 * two have to carry the same no-store headers.
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 * @returns {Response}
 */
function errorResponse(message, status, code) {
  return new Response(JSON.stringify(code ? { success: false, error: message, code } : { success: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}

/**
 * Reads one bounded, deterministically ordered page of a table.
 *
 * Both reads used to be `select('*').eq('user_id', userId)` with no `.limit()`
 * and no `.order()`. `daily_logs` grows one row per tracked day forever, and
 * without an ORDER BY the row order in the exported file was whatever Postgres
 * happened to return — two exports of the same account could disagree.
 *
 * Ordered ascending by `id` as the tiebreaker so the ordering is total: both
 * tables allow one row per user per date, but an explicit tiebreaker means the
 * query stays deterministic if that ever changes.
 *
 * @param {object} supabase
 * @param {string} table
 * @param {string} dateColumn
 * @param {string} userId
 * @returns {Promise<{rows: object[], error: object|null}>}
 */
async function readExportRows(supabase, table, dateColumn, userId) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    // Newest first so the cap keeps the most recent history, then reversed
    // below: an export that has to truncate should drop the oldest rows, not
    // the ones the user is most likely to be showing a clinician.
    .order(dateColumn, { ascending: false })
    .order('id', { ascending: false })
    .limit(EXPORT_ROW_LIMIT)

  if (error) return { rows: [], error }
  return { rows: (data || []).reverse(), error: null }
}

export async function GET(request) {
  // ============ RATE LIMITING ============
  try {
    await crudLimiter.check(request)
  } catch (rateLimitError) {
    logger.warn(`[Rate Limit] Data export endpoint: ${rateLimitError.message}`)
    return errorResponse('Too many requests, please slow down.', 429)
  }
  // =======================================

  try {
    const userId = await getAuthUserId()
    if (!userId) {
      logger.warn('Unauthenticated access attempt to Data Export API')
      return errorResponse('Unauthorized', 401)
    }

    const supabaseAdmin = getSupabaseAdmin()

    const [cycleResult, logResult] = await Promise.all([
      readExportRows(supabaseAdmin, 'cycles', 'start_date', userId),
      readExportRows(supabaseAdmin, 'daily_logs', 'date', userId),
    ])

    for (const [table, result] of [['cycles', cycleResult], ['daily_logs', logResult]]) {
      if (result.error) {
        const described = describeExportError(result.error)
        logger.error(`[Export] ${described.code} reading ${table} for ${userId}: ${result.error.message}`)
        return errorResponse(described.message, described.status, described.code)
      }
    }

    const generatedAt = new Date()
    const entries = planArchiveEntries({
      cycles: cycleResult.rows,
      dailyLogs: logResult.rows,
      toCsv,
      formatDate: formatDateForCSV,
      generatedAt,
    })

    // The ZIP is produced as the client consumes it.
    //
    // Previously `start()` enqueued every chunk of the finished archive before
    // the Response was constructed — there was no `pull` and `desiredSize` was
    // never read, so `archiver`'s synchronous output all landed in the stream's
    // internal queue. Pausing the archiver when the queue is full and resuming
    // it from `pull` is what makes this a stream rather than a buffer with a
    // streaming interface.
    let archive = null
    let settled = false

    const stream = new ReadableStream({
      start(controller) {
        // Next.js ESM interop wraps the CJS module, so the class is
        // instantiated directly rather than through the factory export.
        archive = new archiver.ZipArchive({ zlib: { level: 9 } })

        archive.on('data', (chunk) => {
          if (settled) return
          controller.enqueue(chunk)
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            archive.pause()
          }
        })

        archive.on('end', () => {
          if (settled) return
          settled = true
          controller.close()
        })

        archive.on('error', (err) => {
          logger.error(`[Export] Archiver error for ${userId}: ${err.message}`)
          if (settled) return
          settled = true
          controller.error(err)
        })

        for (const entry of entries) {
          archive.append(entry.contents, { name: entry.name })
        }

        archive.finalize()
      },

      pull() {
        if (archive) archive.resume()
      },

      cancel(reason) {
        // A user who navigates away mid-download should not leave the archiver
        // producing the rest of the ZIP into a queue nobody will read.
        settled = true
        logger.info(`[Export] Download cancelled for ${userId}: ${reason || 'no reason given'}`)
        if (archive) archive.destroy()
      },
    })

    logger.info(
      `Data export generated for user ${userId} (${cycleResult.rows.length} cycles, ${logResult.rows.length} logs)`
    )

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(buildArchiveFilename(generatedAt)),
        // `lib/security-headers.mjs` already lists `/api/export-data` in
        // SENSITIVE_API_PREFIXES, but that applies at the edge; setting it here
        // means the policy survives a direct hit that bypasses the middleware.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    })
  } catch (err) {
    logger.error(`Data Export Route Error: ${err.message}`)
    return errorResponse('Failed to export data', 500, 'EXPORT_FAILED')
  }
}
