/**
 * cycle-comparison.js — compares current active cycle against previous completed cycles.
 *
 * All functions here are pure and testable in plain Node without side effects.
 */

import { getTodayISO, isISODateString } from './date-utils.js'
import { normalizeSymptomsList } from './symptom-correlation.js'

function toLocalDay(dateVal) {
  if (!dateVal) return null
  const str = String(dateVal).slice(0, 10)
  if (!isISODateString(str)) return null
  const date = new Date(`${str}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Calculates current cycle metrics and compares against previous 3 completed cycles.
 *
 * @param {Array<object>} cycles array of cycle records
 * @param {Array<object>} dailyLogs array of daily log records
 * @param {object} [options]
 * @param {string} [options.today] YYYY-MM-DD date override for testing
 * @returns {object} structured comparison object
 */
export function compareCurrentCycle(cycles, dailyLogs, options = {}) {
  const todayISO = options.today || getTodayISO()
  const todayDate = toLocalDay(todayISO)

  if (!todayDate) {
    return {
      hasEnoughData: false,
      completedCount: 0,
      currentCycle: null,
      previous3Avg: null,
      comparison: null,
    }
  }

  const safeCycles = Array.isArray(cycles)
    ? cycles.filter((c) => c && toLocalDay(c.start_date || c.period_start))
    : []

  // Sort cycles descending by start date (newest first)
  const sortedCycles = [...safeCycles].sort((a, b) => {
    const aTime = toLocalDay(a.start_date || a.period_start).getTime()
    const bTime = toLocalDay(b.start_date || b.period_start).getTime()
    return bTime - aTime
  })

  // We need at least 1 current cycle + at least 3 completed previous cycles (total >= 4 cycles)
  if (sortedCycles.length < 4) {
    return {
      hasEnoughData: false,
      completedCount: Math.max(0, sortedCycles.length - 1),
      currentCycle: null,
      previous3Avg: null,
      comparison: null,
    }
  }

  const currentCycleObj = sortedCycles[0]
  const currentStartDate = toLocalDay(currentCycleObj.start_date || currentCycleObj.period_start)

  // Current cycle elapsed days (1-indexed)
  const daysElapsed = Math.max(
    1,
    Math.floor((todayDate.getTime() - currentStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
  )

  // Previous 3 completed cycles
  const prev3Cycles = sortedCycles.slice(1, 4)

  // Calculate average length of previous 3 completed cycles
  const prev3Lengths = prev3Cycles.map((c, index) => {
    if (
      Number.isFinite(Number(c.cycle_length)) &&
      Number(c.cycle_length) >= 15 &&
      Number(c.cycle_length) <= 90
    ) {
      return Number(c.cycle_length)
    }

    const thisStart = toLocalDay(c.start_date || c.period_start)
    const nextStart = toLocalDay(sortedCycles[index].start_date || sortedCycles[index].period_start)
    if (thisStart && nextStart) {
      const diffDays = Math.round((nextStart.getTime() - thisStart.getTime()) / (24 * 60 * 60 * 1000))
      return Math.min(90, Math.max(15, diffDays))
    }
    return 28
  })

  const avgPrev3CycleLength =
    Math.round((prev3Lengths.reduce((a, b) => a + b, 0) / prev3Lengths.length) * 10) / 10

  // Calculate symptoms per cycle from daily logs
  const safeLogs = Array.isArray(dailyLogs) ? dailyLogs.filter((l) => l && l.date) : []

  // Count symptoms for current cycle
  let currentSymptomCount = 0
  safeLogs.forEach((log) => {
    const logDate = toLocalDay(log.date)
    if (!logDate) return
    if (logDate.getTime() >= currentStartDate.getTime() && logDate.getTime() <= todayDate.getTime()) {
      const symptoms = normalizeSymptomsList(log.symptoms)
      currentSymptomCount += symptoms.length
    }
  })

  // Count symptoms for each of the 3 previous completed cycles
  const prev3SymptomCounts = prev3Cycles.map((c, idx) => {
    const start = toLocalDay(c.start_date || c.period_start)
    const end = toLocalDay(sortedCycles[idx].start_date || sortedCycles[idx].period_start)
    let count = 0
    safeLogs.forEach((log) => {
      const logDate = toLocalDay(log.date)
      if (!logDate) return
      if (logDate.getTime() >= start.getTime() && logDate.getTime() < end.getTime()) {
        const symptoms = normalizeSymptomsList(log.symptoms)
        count += symptoms.length
      }
    })
    return count
  })

  const avgPrev3SymptomCount =
    Math.round((prev3SymptomCounts.reduce((a, b) => a + b, 0) / prev3SymptomCounts.length) * 10) / 10

  // Comparisons
  const cycleLengthDiff = Math.round((daysElapsed - avgPrev3CycleLength) * 10) / 10
  let cycleLengthStatus = 'same'
  if (cycleLengthDiff >= 2) cycleLengthStatus = 'longer'
  else if (cycleLengthDiff <= -2) cycleLengthStatus = 'shorter'

  const symptomDiff = Math.round((currentSymptomCount - avgPrev3SymptomCount) * 10) / 10
  let symptomStatus = 'same'
  if (symptomDiff >= 1) symptomStatus = 'more'
  else if (symptomDiff <= -1) symptomStatus = 'fewer'

  return {
    hasEnoughData: true,
    completedCount: sortedCycles.length - 1,
    currentCycle: {
      startDate: String(currentCycleObj.start_date || currentCycleObj.period_start).slice(0, 10),
      cycleDay: daysElapsed,
      symptomCount: currentSymptomCount,
    },
    previous3Avg: {
      cycleLength: avgPrev3CycleLength,
      symptomCount: avgPrev3SymptomCount,
      completedCyclesCount: prev3Cycles.length,
    },
    comparison: {
      cycleLengthDiff,
      cycleLengthStatus,
      symptomDiff,
      symptomStatus,
    },
  }
}
