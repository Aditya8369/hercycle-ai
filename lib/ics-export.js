import { parseDateValue } from './date-utils.js'

/**
 * Parses a prediction date string or Date object into a normalised Date at local midnight.
 * Handles ISO strings, Date objects, and formatted strings like "Jul 15, 2026".
 *
 * @param {Date|string|number} value
 * @returns {Date|null}
 */
export function parsePredictionDate(value) {
  if (!value || value === '—') return null
  const parsed = parseDateValue(value)
  if (parsed && !isNaN(parsed.getTime())) return parsed

  // Fallback for formatted dates like "Jul 15, 2026"
  const d = new Date(value)
  if (!isNaN(d.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return null
}

/**
 * Formats a Date object to YYYYMMDD for all-day iCalendar DTSTART/DTEND.
 *
 * @param {Date} date
 * @returns {string|null}
 */
export function formatIcsDate(date) {
  if (!date || isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Formats a Date object to YYYYMMDDTHHMMSSZ for DTSTAMP.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatIcsTimestamp(date = new Date()) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date()
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  const seconds = String(d.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

/**
 * Escapes special characters for iCalendar text fields according to RFC 5545.
 * Characters to escape: \, ;, ,, \n
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeIcsText(str) {
  if (!str) return ''
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Helper to add days to a Date.
 */
function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Generates an RFC 5545 compliant .ics string for predicted period and ovulation dates.
 *
 * @param {object} cycleData The prediction payload containing nextPeriodDate, confidence, etc.
 * @param {object} [options] Customization options (t, titles, descriptions, timestamp, uidSuffix)
 * @returns {string|null} The .ics file content, or null if cycleData lacks valid prediction date
 */
export function generatePredictionIcs(cycleData, options = {}) {
  if (!cycleData) return null
  if (cycleData.hasEnoughRecentData === false) return null

  const periodStartDate = parsePredictionDate(cycleData.nextPeriodDate)
  if (!periodStartDate) return null

  const timestamp = formatIcsTimestamp(options.now || new Date())
  const uidSuffix = options.uidSuffix || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const confidenceStr = cycleData.confidence ? String(cycleData.confidence) : null

  // Localization / text fallbacks
  const periodSummary = options.t
    ? options.t('periodEventSummary')
    : (options.periodEventSummary || 'Predicted Period - HerCycle')

  let periodDesc = options.t
    ? options.t('periodEventDescription', { confidence: confidenceStr || 'N/A' })
    : (options.periodEventDescription || `Predicted start of menstrual cycle based on HerCycle AI analysis (Confidence: ${confidenceStr || 'N/A'}).`)

  if (cycleData.predictionWindow?.from && cycleData.predictionWindow?.to) {
    periodDesc += ` Window: ${cycleData.predictionWindow.from} to ${cycleData.predictionWindow.to}.`
  }

  const ovulationSummary = options.t
    ? options.t('ovulationEventSummary')
    : (options.ovulationEventSummary || 'Predicted Ovulation Window - HerCycle')

  const ovulationDesc = options.t
    ? options.t('ovulationEventDescription')
    : (options.ovulationEventDescription || 'Predicted ovulation window based on HerCycle AI analysis.')

  // Period duration: default 5 days (DTEND is exclusive in RFC 5545)
  const periodStartIcs = formatIcsDate(periodStartDate)
  const periodEndIcs = formatIcsDate(addDays(periodStartDate, 5))

  // Ovulation window: 5-day window ending 11 days before predicted period start (exclusive DTEND)
  const ovulationStartDate = addDays(periodStartDate, -16)
  const ovulationEndDate = addDays(periodStartDate, -11)
  const ovStartIcs = formatIcsDate(ovulationStartDate)
  const ovEndIcs = formatIcsDate(ovulationEndDate)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HerCycle//Cycle Predictions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:prediction-period-${periodStartIcs}-${uidSuffix}@hercycle.app`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${periodStartIcs}`,
    `DTEND;VALUE=DATE:${periodEndIcs}`,
    `SUMMARY:${escapeIcsText(periodSummary)}`,
    `DESCRIPTION:${escapeIcsText(periodDesc)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:prediction-ovulation-${ovStartIcs}-${uidSuffix}@hercycle.app`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${ovStartIcs}`,
    `DTEND;VALUE=DATE:${ovEndIcs}`,
    `SUMMARY:${escapeIcsText(ovulationSummary)}`,
    `DESCRIPTION:${escapeIcsText(ovulationDesc)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n') + '\r\n'
}

/**
 * Triggers a client-side browser download for an .ics file payload.
 *
 * @param {string} [filename]
 * @param {string} [content]
 * @returns {boolean}
 */
export function downloadIcsFile(filename = 'hercycle-predictions.ics', content = '') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!content) return false

  try {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.error('Error downloading ICS file:', err)
    return false
  }
}
