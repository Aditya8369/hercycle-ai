import { NextResponse } from 'next/server.js'
import { addDays, compareDates, diffInDays, formatDisplayDate, getTodayISO, parseDateValue } from './date-utils.js'
import fetchWithTimeout from './fetch-with-timeout.js'
import { ML_FAILURE_REASONS, callMlService } from './ml-client.js'
import { parseMlPrediction, parseMlRisk } from './ml-schemas.js'

/**
 * Standardized API success response envelope generator.
 * Response shape: { success: true, data: T, message?: string }
 */
export function jsonSuccess(data = null, messageOrOptions = null, status = 200) {
  let message = null
  let statusCode = status

  if (typeof messageOrOptions === 'string') {
    message = messageOrOptions
  } else if (typeof messageOrOptions === 'number') {
    statusCode = messageOrOptions
  } else if (messageOrOptions && typeof messageOrOptions === 'object') {
    if (messageOrOptions.message) message = messageOrOptions.message
    if (messageOrOptions.status) statusCode = messageOrOptions.status
  }

  const payload = { success: true, data }
  if (message) payload.message = message

  return NextResponse.json(payload, { status: statusCode })
}

/**
 * Standardized API error response envelope generator.
 * Response shape: { success: false, error: string, code?: string, details?: any }
 */
export function jsonError(message, status = 400, code = null, details = null) {
  let statusCode = typeof status === 'number' ? status : 400
  let errorCode = code
  let errorDetails = details

  if (status && typeof status === 'object') {
    if (status.status) statusCode = status.status
    if (status.code) errorCode = status.code
    if (status.details) errorDetails = status.details
  }

  const errorMessage = typeof message === 'string'
    ? message
    : (message?.message || String(message || 'An error occurred'))

  const payload = { success: false, error: errorMessage }
  if (errorCode) payload.code = errorCode
  if (errorDetails !== null && errorDetails !== undefined) payload.details = errorDetails

  return NextResponse.json(payload, { status: statusCode })
}

/**
 * ============================================================================
 * PAGINATION & CURSOR FETCHING HELPERS (Issue #590)
 * ============================================================================
 */

/**
 * Parses and validates pagination parameters from URL search parameters.
 * Defaults to fetching 50 records if limit is missing/invalid.
 * 
 * @param {URLSearchParams} searchParams request URL search params
 * @param {number} [defaultLimit=50]
 * @param {number} [maxLimit=100]
 * @returns {{ limit: number, cursor: string|null }}
 */
export function getPaginationParams(searchParams, defaultLimit = 50, maxLimit = 100) {
  const limitParam = searchParams.get('limit')
  const cursor = searchParams.get('cursor')

  let limit = parseInt(limitParam, 10)
  if (isNaN(limit) || limit <= 0) {
    limit = defaultLimit
  } else if (limit > maxLimit) {
    limit = maxLimit
  }

  // `URLSearchParams.get()` has already percent-decoded this. Decoding a second
  // time threw `URIError: URI malformed` for any literal `%` that is not a valid
  // escape — `?cursor=100%` reached the caller's outer catch as a 500 — and
  // silently corrupted a cursor that legitimately contained `%25`.
  return { limit, cursor: cursor || null }
}

/**
 * Formats standard pagination metadata response envelope.
 * 
 * @param {Array} data sliced record array
 * @param {number} limit query record limit
 * @param {number} totalCount total matched count in storage
 * @param {Function} getNextCursorFn callback extracting cursor value from last item
 * @returns {object} standardized paginated payload shape
 */
export function formatPaginatedResponse(data, limit, totalCount, getNextCursorFn) {
  const hasMore = data.length === limit
  const nextCursor = hasMore && data.length > 0 ? getNextCursorFn(data[data.length - 1]) : null

  return {
    success: true,
    data,
    pagination: {
      totalCount,
      limit,
      hasMore,
      nextCursor: nextCursor !== null && nextCursor !== undefined ? String(nextCursor) : null,
    },
  }
}

// A history this far behind cannot support a meaningful projection: past this
// point the app is guessing, and prolonged amenorrhea is itself a PCOD signal
// worth surfacing rather than papering over with a confident-looking date.
const MAX_MEANINGFUL_MISSED_CYCLES = 3

// Confidence lost per missed cycle. Combined with the floor below, three or more
// missed cycles can never report a high-confidence prediction.
const CONFIDENCE_PENALTY_PER_MISSED_CYCLE = 12

// Confidence never drops below this while a date is still being shown.
const MIN_STALE_CONFIDENCE = 20

/**
 * Projects `startDate` forward by whole `cycleLength`-day cycles until the
 * result is on or after today.
 *
 * @param {Date} startDate the last logged period start
 * @param {number} cycleLength days per cycle
 * @param {Date} today
 * @returns {{ nextPeriod: Date, missedCycles: number }}
 */
function projectForward(startDate, cycleLength, today) {
  const safeLength = Math.max(1, Math.round(cycleLength) || 28)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const firstProjection = new Date(startDate)
  firstProjection.setDate(firstProjection.getDate() + safeLength)

  const projectionUTC = Date.UTC(
    firstProjection.getFullYear(), firstProjection.getMonth(), firstProjection.getDate()
  )
  const todayUTC = Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate())

  const daysBehind = Math.round((todayUTC - projectionUTC) / 86400000)
  const missedCycles = daysBehind > 0 ? Math.ceil(daysBehind / safeLength) : 0

  const nextPeriod = new Date(firstProjection)
  if (missedCycles > 0) {
    nextPeriod.setDate(nextPeriod.getDate() + missedCycles * safeLength)
  }

  return { nextPeriod, missedCycles }
}

function applyStalenessPenalty(baseConfidence, missedCycles) {
  if (missedCycles <= 0) return baseConfidence
  const penalised = baseConfidence - missedCycles * CONFIDENCE_PENALTY_PER_MISSED_CYCLE
  return Math.max(MIN_STALE_CONFIDENCE, Math.round(penalised))
}

function dedupeCycles(cycleHistory) {
  if (!cycleHistory || cycleHistory.length === 0) return []

  const validHistory = cycleHistory.filter(c => Boolean(c) && parseDateValue(c.start_date) !== null)

  if (validHistory.length === 0) return []

  const sorted = [...validHistory].sort((a, b) => compareDates(a.start_date, b.start_date))

  const deduped = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = diffInDays(deduped[deduped.length - 1].start_date, sorted[i].start_date)
    if (gapDays !== null && gapDays >= 20) deduped.push(sorted[i])
  }
  return deduped
}

function unknownPrediction() {
  return {
    nextPeriodDate: formatDisplayDate(addDays(getTodayISO(), 28)),
    confidence: '0%',
    averageCycleLength: 28
  }
}

export function median(arr) {
  if (!arr || arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export function filterOutliers(values, minKeep = 2) {
  if (!values || values.length < 3) return values || []

  const med = median(values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return values

  const filtered = values.filter(v => Math.abs(v - med) < 2.5 * stdDev)
  return filtered.length >= minKeep ? filtered : values
}

function predictNextPeriodFallback(cycleHistory, today = new Date()) {
  if (!cycleHistory || cycleHistory.length === 0) {
    return unknownPrediction()
  }

  const deduped = dedupeCycles(cycleHistory)

  if (deduped.length === 0) {
    return unknownPrediction()
  }

  if (deduped.length < 2) {
    let avgLen = parseInt(deduped[0].cycle_length, 10)
    if (isNaN(avgLen) || avgLen < 21 || avgLen > 45) {
      avgLen = 28
    }
    const lastPeriod = parseDateValue(deduped[0].start_date)
    const { nextPeriod, missedCycles } = projectForward(lastPeriod, avgLen, today)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return {
      nextPeriodDate: `${months[nextPeriod.getMonth()]} ${nextPeriod.getDate()}, ${nextPeriod.getFullYear()}`,
      confidence: `${applyStalenessPenalty(75, missedCycles)}%`,
      averageCycleLength: avgLen,
      missedCycles,
      isStale: missedCycles > 0,
      hasEnoughRecentData: missedCycles < MAX_MEANINGFUL_MISSED_CYCLES,
      lastLoggedDate: deduped[0].start_date
    }
  }

  const gapLengths = []
  for (let i = 1; i < deduped.length; i++) {
    const gap = diffInDays(deduped[i - 1].start_date, deduped[i].start_date)
    if (gap !== null) gapLengths.push(gap)
  }

  const filteredGaps = filterOutliers(gapLengths)

  const explicitLengths = deduped
    .filter(c => c.cycle_length && c.cycle_length >= 20 && c.cycle_length <= 45)
    .map(c => c.cycle_length)

  const filteredExplicit = filterOutliers(explicitLengths)

  let avgLength
  if (filteredExplicit.length >= 2) {
    const explicitAvg = filteredExplicit.reduce((a, b) => a + b, 0) / filteredExplicit.length
    const gapAvg = filteredGaps.reduce((a, b) => a + b, 0) / filteredGaps.length
    avgLength = Math.round(explicitAvg * 0.6 + gapAvg * 0.4)
  } else {
    avgLength = Math.round(filteredGaps.reduce((a, b) => a + b, 0) / filteredGaps.length)
  }

  avgLength = Math.max(21, Math.min(45, avgLength || 28))

  let stdDev = 0
  if (filteredGaps.length >= 2) {
    const gapMean = filteredGaps.reduce((a, b) => a + b, 0) / filteredGaps.length
    const gapVariance = filteredGaps.reduce((sum, gap) => sum + Math.pow(gap - gapMean, 2), 0) / filteredGaps.length
    stdDev = Math.sqrt(gapVariance)
  }
  const isIrregular = filteredGaps.length >= 2 && stdDev > 5

  const lastLoggedStart = deduped[deduped.length - 1].start_date
  const lastPeriod = parseDateValue(lastLoggedStart)

  const { nextPeriod, missedCycles } = projectForward(lastPeriod, avgLength, today)

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const formatPredictionDate = (date) => `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  const formattedDate = formatPredictionDate(nextPeriod)

  let predictionWindow = null
  if (isIrregular) {
    const fromDate = new Date(nextPeriod)
    fromDate.setDate(fromDate.getDate() - Math.round(stdDev))
    const toDate = new Date(nextPeriod)
    toDate.setDate(toDate.getDate() + Math.round(stdDev))
    predictionWindow = { from: formatPredictionDate(fromDate), to: formatPredictionDate(toDate) }
  }

  let variance = 0
  for (let i = 0; i < filteredGaps.length; i++) {
    variance += Math.abs(filteredGaps[i] - avgLength)
  }
  const avgVariance = variance / filteredGaps.length
  const regularity = Math.max(60, Math.min(95, 95 - avgVariance * 2))

  const confidence = applyStalenessPenalty(regularity, missedCycles)

  return {
    nextPeriodDate: formattedDate,
    confidence: `${Math.round(confidence)}%`,
    averageCycleLength: avgLength,
    missedCycles,
    isStale: missedCycles > 0,
    hasEnoughRecentData: missedCycles < MAX_MEANINGFUL_MISSED_CYCLES,
    lastLoggedDate: lastLoggedStart,
    isIrregular,
    regularityLabel: isIrregular ? 'Irregular Cycle' : 'Regular Cycle',
    varianceStdDev: Math.round(stdDev * 10) / 10,
    predictionWindow
  }
}

function detectConsecutiveRecurrence(entries, highRiskSymptoms) {
  const dayKey = (date) => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const bySymptom = {}

  for (const entry of entries) {
    if (!entry.date || !highRiskSymptoms.includes(entry.name)) continue
    if (!bySymptom[entry.name]) bySymptom[entry.name] = new Set()
    bySymptom[entry.name].add(dayKey(entry.date))
  }

  const recurring = []
  for (const [name, dayKeys] of Object.entries(bySymptom)) {
    const sorted = Array.from(dayKeys).sort((a, b) => a - b)
    let run = 1
    let maxRun = 1
    for (let i = 1; i < sorted.length; i++) {
      run = sorted[i] - sorted[i - 1] === 1 ? run + 1 : 1
      if (run > maxRun) maxRun = run
    }
    if (maxRun >= 3) recurring.push(name)
  }

  return recurring.sort()
}

function calculatePCODRiskFallback(cycleHistory, symptoms) {
  const cycles = Array.isArray(cycleHistory) ? cycleHistory : []
  const symptomList = Array.isArray(symptoms) ? symptoms : []

  if (cycles.length === 0) {
    return { score: 0, tier: 'LOW RISK', factors: [] }
  }

  const deduped = dedupeCycles(cycles)

  let riskScore = 0
  let riskFactors = []

  if (deduped.length >= 3) {
    let cycleLengths = []
    for (let i = 1; i < deduped.length; i++) {
      const diff = diffInDays(deduped[i - 1].start_date, deduped[i].start_date)
      if (diff !== null) cycleLengths.push(Math.abs(diff))
    }

    if (cycleLengths.length > 0) {
      const avgLength = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length
      const variance = cycleLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / cycleLengths.length
      const stdDev = Math.sqrt(variance)

      if (stdDev > 7) {
        riskScore += 25
        riskFactors.push('Irregular cycle patterns detected')
      }

      if (avgLength < 21 || avgLength > 35) {
        riskScore += 20
        riskFactors.push('Cycle length outside normal range')
      }
    }
  }

  if (symptomList.length > 0) {
    const highRiskSymptoms = ['acne', 'fatigue', 'bloating', 'headache', 'hirsutism', 'weight gain', 'hair loss', 'irregular periods']

    const entries = []
    for (const item of symptomList) {
      if (!item) continue
      if (typeof item === 'string') {
        entries.push({ name: item.trim().toLowerCase(), date: null })
      } else if (typeof item === 'object') {
        const rawDate = item.date || item.created_at || item.timestamp
        const validDate = rawDate ? parseDateValue(rawDate) : null

        if (Array.isArray(item.symptoms)) {
          for (const s of item.symptoms) {
            if (typeof s === 'string' && s.trim()) {
              entries.push({ name: s.trim().toLowerCase(), date: validDate })
            }
          }
        } else {
          const sName = item.symptom || item.name
          if (typeof sName === 'string' && sName.trim()) {
            entries.push({ name: sName.trim().toLowerCase(), date: validDate })
          }
        }
      }
    }

    const uniqueEntriesMap = new Map()
    for (const entry of entries) {
      const dayKey = entry.date ? entry.date.getTime().toString() : 'undated'
      const uniqueKey = `${entry.name}_${dayKey}`
      if (!uniqueEntriesMap.has(uniqueKey)) {
        uniqueEntriesMap.set(uniqueKey, entry)
      }
    }
    const deduplicatedEntries = Array.from(uniqueEntriesMap.values())

    const datedEntries = deduplicatedEntries.filter(e => e.date !== null)
    let validEntries = deduplicatedEntries

    if (datedEntries.length > 0) {
      const latestTime = Math.max(...datedEntries.map(e => e.date.getTime()))
      const windowCutoff = latestTime - (90 * 24 * 60 * 60 * 1000)
      validEntries = deduplicatedEntries.filter(e => !e.date || e.date.getTime() >= windowCutoff)
    }

    const frequencyMap = {}
    const monthBuckets = new Set()

    for (const entry of validEntries) {
      if (highRiskSymptoms.includes(entry.name)) {
        frequencyMap[entry.name] = (frequencyMap[entry.name] || 0) + 1
        if (entry.date) {
          const monthKey = `${entry.date.getFullYear()}-${entry.date.getMonth() + 1}`
          monthBuckets.add(monthKey)
        }
      }
    }

    const matchedSymptomTypes = Object.keys(frequencyMap)
    const totalHighRiskOccurrences = Object.values(frequencyMap).reduce((a, b) => a + b, 0)
    const highlyRecurring = matchedSymptomTypes.filter(name => frequencyMap[name] >= 3)
    const recurring = matchedSymptomTypes.filter(name => frequencyMap[name] >= 2)
    const isMultiMonth = monthBuckets.size >= 2

    if (totalHighRiskOccurrences >= 5 || isMultiMonth || highlyRecurring.length > 0) {
      if (matchedSymptomTypes.length >= 3 && (totalHighRiskOccurrences >= 5 || isMultiMonth)) {
        riskScore += 40
        riskFactors.push('High symptom recurrence detected across 90-day window')
      } else if (matchedSymptomTypes.length >= 2) {
        riskScore += 30
        riskFactors.push('Persistent recurrence of PCOD-related symptoms over 90 days')
      } else {
        riskScore += 25
        riskFactors.push(`Recurring PCOD symptom pattern detected (${recurring.join(', ') || matchedSymptomTypes.join(', ')})`)
      }
    } else if (matchedSymptomTypes.length >= 3) {
      riskScore += 25
      riskFactors.push('Multiple PCOD-related symptoms reported')
    } else if (matchedSymptomTypes.length >= 2 || totalHighRiskOccurrences >= 2) {
      riskScore += 15
      riskFactors.push('Some hormonal symptoms present')
    } else if (matchedSymptomTypes.length === 1) {
      riskScore += 10
      riskFactors.push('Mild hormonal symptom noted')
    }

    const consecutiveRecurring = detectConsecutiveRecurrence(validEntries, highRiskSymptoms)
    if (consecutiveRecurring.length > 0) {
      riskScore += Math.min(20, consecutiveRecurring.length * 10)
      riskFactors.push(`Symptoms recurring across 3+ consecutive days (${consecutiveRecurring.join(', ')})`)
    }
  }

  let tier = 'LOW RISK'
  if (riskScore >= 55) {
    tier = 'HIGH RISK'
  } else if (riskScore >= 30) {
    tier = 'MEDIUM RISK'
  }

  if (riskScore < 30 && riskFactors.length === 0) {
    riskFactors = [
      'Regular cycle length maintained',
      'No significant hormonal symptoms'
    ]
  }

  return {
    score: Math.min(riskScore, 100),
    tier,
    factors: riskFactors,
    recommendation: tier === 'HIGH RISK'
      ? 'Consider consulting with a healthcare provider for detailed assessment.'
      : 'Keep tracking your cycle and maintaining healthy habits.'
  }
}

const NOISY_ML_REASONS = new Set([ML_FAILURE_REASONS.DISABLED, ML_FAILURE_REASONS.CIRCUIT_OPEN])

export async function predictNextPeriod(cycleHistory, today = new Date(), options = {}) {
  const result = await callMlService(
    '/predict-cycle',
    { cycle_history: cycleHistory || [], today: today.toISOString() },
    { ...options, parse: parseMlPrediction }
  )

  if (result.ok) return result.value

  if (!NOISY_ML_REASONS.has(result.reason)) {
    console.warn(
      `ML prediction unavailable (${result.reason}); using the rule-based engine.`
    )
  }

  return predictNextPeriodFallback(cycleHistory, today)
}

export async function calculatePCODRisk(cycleHistory, symptoms, options = {}) {
  const safeHistory = Array.isArray(cycleHistory) ? cycleHistory : []
  const safeSymptoms = Array.isArray(symptoms) ? symptoms : []

  const result = await callMlService(
    '/pcod-risk',
    { cycle_history: safeHistory, symptoms: safeSymptoms },
    { ...options, parse: parseMlRisk }
  )

  if (result.ok) return result.value

  if (!NOISY_ML_REASONS.has(result.reason)) {
    console.warn(
      `ML PCOD risk unavailable (${result.reason}); using the rule-based engine.`
    )
  }

  return calculatePCODRiskFallback(safeHistory, safeSymptoms)
}

export const MAX_CUSTOM_SYMPTOMS = 20
export const MAX_SYMPTOM_LENGTH = 50

export function sanitizeText(value, maxLength = MAX_SYMPTOM_LENGTH) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeSymptomList(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(item => sanitizeText(item, MAX_SYMPTOM_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_SYMPTOMS)
}
