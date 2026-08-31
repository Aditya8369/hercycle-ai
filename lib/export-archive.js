/**
 * export-archive.js — what goes into the data-export ZIP, how much of it, and
 * what it is called.
 *
 * ## The bugs this exists to fix
 *
 * `app/api/export-data/route.js` is the one export endpoint in the app that was
 * never bounded. Its two siblings — `/api/user/export` and
 * `/api/privacy/export` — both page; this one did not:
 *
 *     const { data: cycles }    = await supabaseAdmin.from('cycles').select('*').eq('user_id', userId)
 *     const { data: dailyLogs } = await supabaseAdmin.from('daily_logs').select('*').eq('user_id', userId)
 *
 * No `.limit()`, and no `.order()` either — so the row order in the exported
 * file was whatever Postgres happened to return, and two exports of the same
 * account could disagree with each other. `daily_logs` grows one row per
 * tracked day, forever.
 *
 * The same rows were then serialised **twice**, as pretty-printed JSON and as
 * CSV, and both copies plus the compressed archive were held in memory at once.
 *
 * ## The date-column rule
 *
 * The route decided which columns to reformat like this:
 *
 *     normalizedKey.endsWith('_at') ||
 *     normalizedKey.endsWith('at') ||        // <- anything ending in "at"
 *
 * The second line makes the first redundant and matches any column name ending
 * in those two letters — `format`, `repeat`, `flow_stat`, `heat`, `fat`. Any
 * such column added later would be silently run through `formatDateForCSV` and
 * rewritten in the user's export. {@link isDateColumn} matches date columns.
 *
 * The module is pure — no fetch, no archiver, no Supabase — so the archive's
 * contents can be asserted without building one.
 */

/**
 * Rows per table in a single export.
 *
 * Ten years of daily logging is about 3650 rows; five thousand covers any real
 * account while still being a bound. When it bites, the manifest says so —
 * silently handing someone a partial copy of their own health record and
 * calling it an export would be worse than the unbounded read.
 */
export const EXPORT_ROW_LIMIT = 5000

/** Base name for the downloaded archive. */
export const ARCHIVE_BASENAME = 'hercycle-data'

/**
 * Columns whose values are rendered as `YYYY-MM-DD` in the CSV copies.
 *
 * An exact-suffix list rather than a loose `endsWith('at')`. `date` is matched
 * whole; the rest must be preceded by an underscore, so a column has to be
 * *named* as a date to be treated as one.
 */
const DATE_COLUMN_SUFFIXES = Object.freeze(['_date', '_at', '_timestamp', '_time', '_on'])

/** Column names that are date columns in their own right. */
const DATE_COLUMN_NAMES = Object.freeze(['date', 'timestamp'])

/**
 * True when a column holds a date or timestamp.
 *
 * @param {unknown} name
 * @returns {boolean}
 */
export function isDateColumn(name) {
  if (typeof name !== 'string' || name === '') return false
  const key = name.toLowerCase()
  if (DATE_COLUMN_NAMES.includes(key)) return true
  return DATE_COLUMN_SUFFIXES.some((suffix) => key.endsWith(suffix) && key.length > suffix.length)
}

/**
 * Rewrites a row's date columns with `format`, leaving everything else alone.
 *
 * Objects and arrays are skipped: a `jsonb` column or a `TEXT[]` of symptoms is
 * not a date however it is named, and `formatDateForCSV` would turn one into
 * an empty string.
 *
 * @param {object} row
 * @param {(value: unknown) => string} format normally `formatDateForCSV`
 * @returns {object} a new row; the input is not mutated
 */
export function formatDateFields(row, format) {
  if (!row || typeof row !== 'object') return row

  const formatted = { ...row }
  for (const [key, value] of Object.entries(formatted)) {
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'object' && !(value instanceof Date)) continue
    if (!isDateColumn(key)) continue
    formatted[key] = format(value)
  }
  return formatted
}

/**
 * The download filename, dated.
 *
 * Every export was called `my-hercycle-data.zip`, so a second download landed
 * as `my-hercycle-data (1).zip` with nothing inside either archive saying when
 * it was taken.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function buildArchiveFilename(now = new Date()) {
  const stamp = Number.isFinite(now?.getTime?.()) ? now.toISOString().slice(0, 10) : 'export'
  return `${ARCHIVE_BASENAME}-${stamp}.zip`
}

/**
 * A `Content-Disposition` value that survives a filename with a quote in it.
 *
 * The name is generated here rather than taken from user input, so this is
 * belt-and-braces — but a header built by string concatenation is worth
 * getting right once.
 *
 * @param {string} filename
 * @returns {string}
 */
export function contentDisposition(filename) {
  const safe = String(filename).replace(/["\\\r\n]/g, '')
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

/**
 * The README that ships inside the archive.
 *
 * An export the user is encouraged to keep and forward to a clinician should be
 * able to say what it is and when it was taken. It carries no identifiers: the
 * archive is already the user's own data, and adding a user id would put one
 * into a file people are told to email.
 *
 * @param {{generatedAt?: Date, counts: {cycles: number, dailyLogs: number}, truncated: {cycles: boolean, dailyLogs: boolean}, rowLimit?: number}} options
 * @returns {string}
 */
export function buildManifest({ generatedAt = new Date(), counts, truncated, rowLimit = EXPORT_ROW_LIMIT }) {
  const stamp = Number.isFinite(generatedAt?.getTime?.())
    ? generatedAt.toISOString()
    : new Date().toISOString()

  const lines = [
    'HerCycle AI — data export',
    '=========================',
    '',
    `Generated: ${stamp}`,
    '',
    'Contents',
    '--------',
    `  cycles.json      ${counts.cycles} cycle${counts.cycles === 1 ? '' : 's'}`,
    `  cycles.csv       the same rows, for a spreadsheet`,
    `  daily_logs.json  ${counts.dailyLogs} daily log${counts.dailyLogs === 1 ? '' : 's'}`,
    `  daily_logs.csv   the same rows, for a spreadsheet`,
    '',
    'Rows are ordered oldest first. Dates in the CSV copies are YYYY-MM-DD;',
    'the JSON copies keep the full timestamps as stored.',
  ]

  if (truncated.cycles || truncated.dailyLogs) {
    const tables = [truncated.cycles ? 'cycles' : null, truncated.dailyLogs ? 'daily logs' : null]
      .filter(Boolean)
      .join(' and ')
    lines.push(
      '',
      'Note',
      '----',
      `This export is capped at ${rowLimit} rows per table and your ${tables}`,
      'reached that cap, so the most recent entries are included and older ones',
      'are not. Contact support if you need the complete history.'
    )
  }

  return `${lines.join('\n')}\n`
}

/**
 * The complete list of files to put in the archive.
 *
 * Returning a plan rather than writing to an archiver keeps the decision about
 * *what* the export contains testable without building a ZIP.
 *
 * JSON is emitted without the two-space indent the route used. Pretty-printing
 * a few thousand rows adds a large fraction to a payload nothing reads by eye,
 * and this endpoint holds every copy in memory at once.
 *
 * @param {{cycles: object[], dailyLogs: object[], toCsv: (rows: object[]) => string, formatDate: (value: unknown) => string, generatedAt?: Date, rowLimit?: number}} options
 * @returns {Array<{name: string, contents: string}>}
 */
export function planArchiveEntries({
  cycles,
  dailyLogs,
  toCsv,
  formatDate,
  generatedAt = new Date(),
  rowLimit = EXPORT_ROW_LIMIT,
}) {
  const cycleRows = Array.isArray(cycles) ? cycles : []
  const logRows = Array.isArray(dailyLogs) ? dailyLogs : []

  const counts = { cycles: cycleRows.length, dailyLogs: logRows.length }
  const truncated = {
    cycles: cycleRows.length >= rowLimit,
    dailyLogs: logRows.length >= rowLimit,
  }

  return [
    { name: 'README.txt', contents: buildManifest({ generatedAt, counts, truncated, rowLimit }) },
    { name: 'cycles.json', contents: JSON.stringify(cycleRows) },
    { name: 'daily_logs.json', contents: JSON.stringify(logRows) },
    { name: 'cycles.csv', contents: toCsv(cycleRows.map((row) => formatDateFields(row, formatDate))) },
    { name: 'daily_logs.csv', contents: toCsv(logRows.map((row) => formatDateFields(row, formatDate))) },
  ]
}

/**
 * Maps a Supabase/Postgres error onto a client-safe response descriptor.
 *
 * The route threw `new Error(\`Failed to fetch cycles: ${error.message}\`)` into
 * its own catch, which logged the driver's sentence — relation names, and on a
 * connection fault the pooler host — alongside a stack trace, for what may be
 * an ordinary transient failure.
 *
 * @param {{code?: string}|null} error
 * @returns {{message: string, status: number, code: string}}
 */
export function describeExportError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''

  switch (code) {
    case '42P01':
      return { message: 'Data export is not available on this deployment yet.', status: 503, code: 'MISSING_TABLE' }
    case '42703':
      return { message: 'Data export has not been migrated on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    case '57014':
      return { message: 'The export took too long to build. Please try again.', status: 504, code: 'EXPORT_TIMEOUT' }
    case '08006':
    case '08003':
      return { message: 'Could not reach the database. Please try again.', status: 503, code: 'BACKEND_UNAVAILABLE' }
    default:
      return { message: 'Failed to export data', status: 500, code: 'EXPORT_FAILED' }
  }
}
