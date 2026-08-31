/**
 * Tests for lib/sleep-log-data.js
 * Run with: npm test -- --testPathPattern=sleep-log-data
 */
import {
  toDateString,
  calculateSleepDuration,
  formatDuration,
  getQualityInfo,
  calculateAverages,
  calculateSleepScore,
  buildWeeklySummary,
  calculateSleepStreak,
  validateSleepLogInput,
  SLEEP_QUALITY_RATINGS,
  SLEEP_DISTURBANCES,
} from '../lib/sleep-log-data.js'

describe('toDateString', () => {
  it('returns YYYY-MM-DD for today', () => {
    expect(toDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('formats a specific date', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('calculateSleepDuration', () => {
  it('same-day sleep', () => { expect(calculateSleepDuration('08:00', '12:00')).toBe(240) })
  it('overnight sleep', () => { expect(calculateSleepDuration('23:00', '07:00')).toBe(480) })
  it('short sleep across midnight', () => { expect(calculateSleepDuration('01:30', '05:45')).toBe(255) })
  it('midnight boundary', () => { expect(calculateSleepDuration('00:00', '08:00')).toBe(480) })
})

describe('formatDuration', () => {
  it('hours only', () => { expect(formatDuration(480)).toBe('8h') })
  it('minutes only', () => { expect(formatDuration(45)).toBe('45m') })
  it('hours and minutes', () => { expect(formatDuration(510)).toBe('8h 30m') })
  it('zero', () => { expect(formatDuration(0)).toBe('0m') })
})

describe('getQualityInfo', () => {
  it('returns correct labels', () => {
    expect(getQualityInfo(1).label).toBe('Terrible')
    expect(getQualityInfo(5).label).toBe('Excellent')
  })
  it('returns fallback for invalid', () => {
    expect(getQualityInfo(99).label).toBe('Okay')
  })
})

describe('calculateAverages', () => {
  it('zeros for empty', () => {
    const r = calculateAverages([])
    expect(r.avgDuration).toBe(0)
    expect(r.totalEntries).toBe(0)
  })
  it('correct averages', () => {
    const r = calculateAverages([{ duration_minutes: 480, quality: 4 }, { duration_minutes: 420, quality: 3 }])
    expect(r.avgDuration).toBe(450)
    expect(r.avgQuality).toBe(3.5)
  })
})

describe('calculateSleepScore', () => {
  it('high for perfect sleep', () => {
    expect(calculateSleepScore(480, 5, 8)).toBe(100)
  })
  it('low for poor sleep', () => {
    const score = calculateSleepScore(300, 1, 8)
    expect(score).toBeLessThan(50)
  })
})

describe('buildWeeklySummary', () => {
  it('returns 7 entries', () => {
    expect(buildWeeklySummary([], '2026-08-30')).toHaveLength(7)
  })
  it('last entry is the end day', () => {
    const week = buildWeeklySummary([], '2026-08-30')
    expect(week[6].date).toBe('2026-08-30')
  })
})

describe('calculateSleepStreak', () => {
  it('zero for empty', () => { expect(calculateSleepStreak([])).toBe(0) })
  it('counts consecutive days', () => {
    expect(calculateSleepStreak(['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'], '2026-08-30')).toBe(4)
  })
  it('stops at gap', () => {
    expect(calculateSleepStreak(['2026-08-30', '2026-08-29', '2026-08-27'], '2026-08-30')).toBe(2)
  })
})

describe('validateSleepLogInput', () => {
  const valid = { date: '2026-08-30', bed_time: '22:00', wake_time: '07:00', quality: 4 }
  it('no errors for valid', () => { expect(validateSleepLogInput(valid)).toHaveLength(0) })
  it('errors on missing date', () => { expect(validateSleepLogInput({ ...valid, date: '' })).toHaveLength(1) })
  it('errors on bad quality', () => { expect(validateSleepLogInput({ ...valid, quality: 6 })).toHaveLength(1) })
  it('errors on long notes', () => { expect(validateSleepLogInput({ ...valid, notes: 'x'.repeat(501) })).toHaveLength(1) })
})

describe('constants', () => {
  it('has 5 quality ratings', () => { expect(SLEEP_QUALITY_RATINGS).toHaveLength(5) })
  it('includes none disturbance', () => { expect(SLEEP_DISTURBANCES.some(d => d.key === 'none')).toBe(true) })
})
