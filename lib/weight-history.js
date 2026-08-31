/**
 * weight-history.js — the weight tracker's window, its arithmetic and its
 * error vocabulary, in one place.
 *
 * ## The bug this exists to fix
 *
 * `GET /api/weight` asked for the user's **oldest** year of measurements:
 *
 *     .order('recorded_date', { ascending: true })
 *     .limit(365)
 *
 * `ORDER BY recorded_date ASC LIMIT 365` is "the first 365 days this account
 * ever logged". The limit reads as *a year of history*; the ordering makes it
 * *the first year of history*. The index the table ships with —
 * `weight_entries_user_date_idx ON (user_id, recorded_date DESC)` — says which
 * direction was intended.
 *
 * `WeightTrendChart` then took `chartData.at(-1)` as "now" and rendered its
 * weight and BMI in the card header. So on an account with more than 365
 * entries, the chart stopped moving, "current weight" was a figure from over a
 * year ago, and a freshly saved measurement — committed, `200 OK`, badge
 * showing *Saved* — simply was not in the refetched data. No error, no warning,
 * nothing in the UI that could distinguish it from a broken save.
 *
 * The fix is to select the **newest** `HISTORY_LIMIT` rows and then order that
 * window chronologically for plotting. Those are two different operations and
 * conflating them is what caused this; {@link orderForChart} is the second one,
 * and it is the only place a chart-ready ordering is produced.
 *
 * ## The other half: one BMI, not two
 *
 * `WeightTracker` computed the BMI it displays with `.toFixed(1)` and the route
 * computed the BMI it stores with `.toFixed(2)`. 62 kg at 165 cm shows as
 * **22.8** in the form and comes back as **22.77** in the chart header. There
 * is no reason for the number a user is shown to differ from the number that is
 * written down, so {@link computeBmi} is now the only implementation and both
 * sides call it.
 *
 * The module is pure — no fetch, no React, no Supabase — so it runs unchanged in
 * a Route Handler, a Client Component and `node scripts/test-weight-history.js`.
 */

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

/**
 * How many measurements a single history request returns.
 *
 * A year of daily weigh-ins. Anything past this is history the trend chart
 * cannot usefully plot in 300 pixels.
 */
export const HISTORY_LIMIT = 365

/**
 * Decimal places for a BMI.
 *
 * One. A BMI is a screening indicator with a four-point-wide "healthy" band;
 * the second decimal place is noise, and it was the source of the discrepancy
 * between the form and the stored row.
 */
export const BMI_PRECISION = 1

/**
 * The bounds `weight_entries` enforces:
 *
 *     bmi NUMERIC(5,2) NOT NULL CHECK (bmi >= 5 AND bmi <= 100)
 *
 * Kept here so the route can reject an out-of-range BMI with a sentence rather
 * than let Postgres reject it with a constraint name.
 */
export const MIN_STORABLE_BMI = 5
export const MAX_STORABLE_BMI = 100

/**
 * BMI band boundaries, WHO adult cut-offs.
 *
 * `WeightTracker.bmiLabel` inlined these as a chain of `if`s against the
 * translation keys; they are the same numbers, named once.
 */
export const BMI_BANDS = Object.freeze([
  { key: 'below', max: 18.5 },
  { key: 'healthy', max: 25 },
  { key: 'above', max: 30 },
  { key: 'high', max: Infinity },
])

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Body mass index from a weight in kilograms and a height in centimetres.
 *
 * @param {unknown} weightKg
 * @param {unknown} heightCm
 * @returns {number|null} `null` when either input is missing or non-positive
 */
export function computeBmi(weightKg, heightCm) {
  const weight = Number(weightKg)
  const height = Number(heightCm)
  if (!Number.isFinite(weight) || !Number.isFinite(height)) return null
  if (weight <= 0 || height <= 0) return null

  const metres = height / 100
  const bmi = weight / (metres * metres)
  if (!Number.isFinite(bmi)) return null

  return Number(bmi.toFixed(BMI_PRECISION))
}

/**
 * Whether a BMI is inside the range the column accepts.
 *
 * The API's own validation permits 20 kg and 250 cm, which is a BMI of 3.2 —
 * below the CHECK. That combination reached the database, raised `23514`, and
 * the route answered `500` with the constraint's own text.
 *
 * @param {unknown} bmi
 * @returns {boolean}
 */
export function isStorableBmi(bmi) {
  const value = Number(bmi)
  return Number.isFinite(value) && value >= MIN_STORABLE_BMI && value <= MAX_STORABLE_BMI
}

/**
 * The band a BMI falls in.
 *
 * @param {unknown} bmi
 * @returns {'below'|'healthy'|'above'|'high'|null}
 */
export function classifyBmi(bmi) {
  const value = Number(bmi)
  if (!Number.isFinite(value) || value <= 0) return null
  for (const band of BMI_BANDS) {
    if (value < band.max) return band.key
  }
  return 'high'
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Sorts a history window oldest-first for plotting.
 *
 * The route now selects **newest first** so the `LIMIT` keeps the recent end of
 * the history; the chart wants the opposite order. Doing that here rather than
 * in the query is the whole point: "which rows" and "in what order" are
 * separate decisions, and the old code answered the second one in a way that
 * silently changed the answer to the first.
 *
 * Rows with an unusable `recorded_date` are dropped rather than sorted to an
 * arbitrary end, where they would distort `earliest`/`latest`.
 *
 * @param {object[]} rows
 * @returns {object[]} a new array; the input is not mutated
 */
export function orderForChart(rows) {
  return [...(rows || [])]
    .filter((row) => row && typeof row.recorded_date === 'string' && row.recorded_date.length > 0)
    .sort((a, b) => (a.recorded_date < b.recorded_date ? -1 : a.recorded_date > b.recorded_date ? 1 : 0))
}

/**
 * Turns a stored row into the shape the chart plots, dropping rows it cannot.
 *
 * `weight_kg`, `waist_cm` and `bmi` are `NUMERIC` columns, which PostgREST
 * returns as **strings** to preserve precision. The chart's `Number(...)` casts
 * handled that; this keeps the conversion in one place and makes the
 * "unplottable row" rule explicit rather than a trailing `.filter`.
 *
 * @param {object} row
 * @returns {{recorded_date: string, weight: number, waist: number|null, bmi: number|null}|null}
 */
export function toChartPoint(row) {
  if (!row || typeof row.recorded_date !== 'string') return null

  const weight = Number(row.weight_kg)
  if (!Number.isFinite(weight) || weight <= 0) return null

  // `Number(null)` is 0, so an absent NUMERIC column has to be recognised
  // before the cast — a null waist or BMI must not be plotted as zero.
  const waist = toOptionalNumber(row.waist_cm)
  const bmi = toOptionalNumber(row.bmi)

  return { recorded_date: row.recorded_date, weight, waist, bmi }
}

/**
 * A `NUMERIC` column as a number, or `null` when it holds nothing.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The chart-ready series for a history window.
 *
 * @param {object[]} rows
 * @returns {Array<{recorded_date: string, weight: number, waist: number|null, bmi: number|null}>}
 */
export function toChartSeries(rows) {
  const series = []
  for (const row of orderForChart(rows)) {
    const point = toChartPoint(row)
    if (point) series.push(point)
  }
  return series
}

/**
 * The headline figures the card renders.
 *
 * `latest` is the most recent measurement in the window. That sentence was true
 * of `chartData.at(-1)` only because the series happened to be ascending — and
 * it was ascending over the *wrong* window, so the value it produced was over a
 * year old on any long-running account.
 *
 * @param {object[]} rows a history window, in any order
 * @returns {{count: number, latest: object|null, earliest: object|null, changeKg: number|null, spanDays: number|null}}
 */
export function summariseHistory(rows) {
  const series = toChartSeries(rows)

  if (series.length === 0) {
    return { count: 0, latest: null, earliest: null, changeKg: null, spanDays: null }
  }

  const earliest = series[0]
  const latest = series[series.length - 1]

  const changeKg = series.length > 1 ? Number((latest.weight - earliest.weight).toFixed(1)) : null
  const spanDays = series.length > 1 ? daysBetween(earliest.recorded_date, latest.recorded_date) : null

  return { count: series.length, latest, earliest, changeKg, spanDays }
}

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * Both are read as UTC midnight, so the result is a plain calendar difference
 * with no DST or local-offset component.
 *
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number|null}
 */
export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / 86400000)
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Maps a Supabase/Postgres error onto a client-safe response descriptor.
 *
 * Both handlers used to do `jsonError(error.message, 500)`, so a CHECK
 * violation reached the browser as:
 *
 *     new row for relation "weight_entries" violates check constraint
 *     "weight_entries_bmi_check"
 *
 * — a 500 for a bad request, naming the relation and the constraint. On a
 * connection fault the same line carries the pooler hostname.
 *
 * @param {{code?: string, message?: string}|null} error
 * @returns {{message: string, status: number, code: string}}
 */
export function describeWeightError(error) {
  const code = error && typeof error.code === 'string' ? error.code : ''
  const constraint = extractConstraint(error)

  if (code === '23514') {
    // The route validates the same ranges the CHECKs enforce, so reaching one
    // means the *derived* value is out of range — which is only possible for
    // BMI, from a legal weight and a legal height at the extremes.
    if (constraint.includes('bmi')) {
      return {
        message: `That height and weight give a BMI outside the range we can record (${MIN_STORABLE_BMI}-${MAX_STORABLE_BMI}). Please check both values.`,
        status: 400,
        code: 'BMI_OUT_OF_RANGE',
      }
    }
    return { message: 'One of those measurements is outside the range we can record.', status: 400, code: 'VALUE_OUT_OF_RANGE' }
  }

  switch (code) {
    case '22P02':
      return { message: 'That measurement could not be read as a number.', status: 400, code: 'INVALID_NUMBER' }
    case '22003':
      return { message: 'That measurement is too large to record.', status: 400, code: 'NUMERIC_OVERFLOW' }
    case '22007':
    case '22008':
      return { message: 'That is not a valid date.', status: 400, code: 'INVALID_DATE' }
    case '23503':
      return { message: 'This account is not set up yet, please reload and try again.', status: 409, code: 'MISSING_USER' }
    case '23505':
      // `UNIQUE (user_id, recorded_date)` with an `onConflict` upsert should
      // never surface this; if it does, the conflict target is wrong rather
      // than the user's input being at fault.
      return { message: 'A measurement for that date is already being saved.', status: 409, code: 'DUPLICATE_ENTRY' }
    case '42P01':
      return { message: 'The weight tracker is not available on this deployment yet.', status: 503, code: 'MISSING_TABLE' }
    case '42703':
      return { message: 'The weight tracker has not been migrated on this deployment yet.', status: 503, code: 'SCHEMA_DRIFT' }
    default:
      return { message: 'Could not save the measurement.', status: 500, code: 'WEIGHT_WRITE_FAILED' }
  }
}

/**
 * The constraint name from a Postgres error, lowercased, or `''`.
 *
 * Read only to decide *which* sentence to show; it never reaches the client.
 *
 * @param {{constraint?: string, details?: string, message?: string}|null} error
 * @returns {string}
 */
function extractConstraint(error) {
  if (!error) return ''
  if (typeof error.constraint === 'string' && error.constraint) return error.constraint.toLowerCase()

  const text = typeof error.message === 'string' ? error.message : ''
  const match = /constraint "([^"]+)"/i.exec(text)
  return match ? match[1].toLowerCase() : ''
}

// ---------------------------------------------------------------------------
// Client-side response reading
// ---------------------------------------------------------------------------

/**
 * Reads a history response.
 *
 * @param {{ok?: boolean, status?: number}} response
 * @param {any} json
 * @returns {{ok: true, entries: object[], notice: string|null}|{ok: false, error: string}}
 */
export function readHistoryResponse(response, json) {
  if (!response || response.ok !== true || !json || json.success !== true) {
    return { ok: false, error: (json && json.error) || 'Could not load your measurements.' }
  }
  const entries = Array.isArray(json.data) ? json.data : []
  return { ok: true, entries, notice: typeof json.message === 'string' ? json.message : null }
}

/**
 * Reads a save response.
 *
 * @param {{ok?: boolean}} response
 * @param {any} json
 * @returns {{ok: true, entry: object}|{ok: false, error: string}}
 */
export function readSaveResponse(response, json) {
  if (!response || response.ok !== true || !json || json.success !== true) {
    return { ok: false, error: (json && json.error) || 'Could not save the measurement.' }
  }
  return { ok: true, entry: json.data && typeof json.data === 'object' ? json.data : {} }
}
