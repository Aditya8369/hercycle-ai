import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  toDateString, calculateSleepDuration, formatDuration, getQualityInfo,
  calculateAverages, calculateSleepScore, buildWeeklySummary,
  calculateSleepStreak, validateSleepLogInput, SLEEP_QUALITY_RATINGS, SLEEP_DISTURBANCES,
} from '../lib/sleep-log-data.js'

describe('toDateString', () => {
  it('returns YYYY-MM-DD for today', () => assert.match(toDateString(), /^\d{4}-\d{2}-\d{2}$/))
  it('formats a specific date', () => assert.equal(toDateString(new Date(2026, 0, 5)), '2026-01-05'))
})

describe('calculateSleepDuration', () => {
  it('same-day sleep', () => assert.equal(calculateSleepDuration('08:00', '12:00'), 240))
  it('overnight sleep', () => assert.equal(calculateSleepDuration('23:00', '07:00'), 480))
  it('short sleep across midnight', () => assert.equal(calculateSleepDuration('01:30', '05:45'), 255))
  it('midnight boundary', () => assert.equal(calculateSleepDuration('00:00', '08:00'), 480))
})

describe('formatDuration', () => {
  it('hours only', () => assert.equal(formatDuration(480), '8h'))
  it('minutes only', () => assert.equal(formatDuration(45), '45m'))
  it('hours and minutes', () => assert.equal(formatDuration(510), '8h 30m'))
  it('zero', () => assert.equal(formatDuration(0), '0m'))
})

describe('getQualityInfo', () => {
  it('returns correct labels', () => {
    assert.equal(getQualityInfo(1).label, 'Terrible')
    assert.equal(getQualityInfo(5).label, 'Excellent')
  })
  it('returns fallback for invalid', () => assert.equal(getQualityInfo(99).label, 'Okay'))
})

describe('calculateAverages', () => {
  it('zeros for empty', () => {
    const r = calculateAverages([])
    assert.equal(r.avgDuration, 0)
    assert.equal(r.totalEntries, 0)
  })
  it('correct averages', () => {
    const r = calculateAverages([{ duration_minutes: 480, quality: 4 }, { duration_minutes: 420, quality: 3 }])
    assert.equal(r.avgDuration, 450)
    assert.equal(r.avgQuality, 3.5)
  })
})

describe('calculateSleepScore', () => {
  it('high for perfect sleep', () => assert.equal(calculateSleepScore(480, 5, 8), 100))
  it('low for poor sleep', () => assert.ok(calculateSleepScore(300, 1, 8) < 50))
})

describe('buildWeeklySummary', () => {
  it('returns 7 entries', () => assert.equal(buildWeeklySummary([], '2026-08-30').length, 7))
  it('last entry is the end day', () => assert.equal(buildWeeklySummary([], '2026-08-30')[6].date, '2026-08-30'))
})

describe('calculateSleepStreak', () => {
  it('zero for empty', () => assert.equal(calculateSleepStreak([]), 0))
  it('counts consecutive days', () => assert.equal(calculateSleepStreak(['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27'], '2026-08-30'), 4))
  it('stops at gap', () => assert.equal(calculateSleepStreak(['2026-08-30', '2026-08-29', '2026-08-27'], '2026-08-30'), 2))
})

describe('validateSleepLogInput', () => {
  const valid = { date: '2026-08-30', bed_time: '22:00', wake_time: '07:00', quality: 4 }
  it('no errors for valid', () => assert.equal(validateSleepLogInput(valid).length, 0))
  it('errors on missing date', () => assert.equal(validateSleepLogInput({ ...valid, date: '' }).length, 1))
  it('errors on bad quality', () => assert.equal(validateSleepLogInput({ ...valid, quality: 6 }).length, 1))
  it('errors on long notes', () => assert.equal(validateSleepLogInput({ ...valid, notes: 'x'.repeat(501) }).length, 1))
})

describe('constants', () => {
  it('has 5 quality ratings', () => assert.equal(SLEEP_QUALITY_RATINGS.length, 5))
  it('includes none disturbance', () => assert.ok(SLEEP_DISTURBANCES.some(d => d.key === 'none')))
})
