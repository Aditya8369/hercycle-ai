import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateEntry,
  getMoodEmoji,
  getEnergyEmoji,
  getFlowColor,
  symptomFrequency,
  moodDistribution,
  quickInsight,
  weeklyTrend,
  MOOD_OPTIONS,
  ENERGY_LEVELS,
  FLOW_OPTIONS,
} from './symptom-journal.js'

describe('MOOD_OPTIONS / ENERGY_LEVELS / FLOW_OPTIONS', () => {
  it('has expected mood keys', () => {
    assert.ok(MOOD_OPTIONS.find((m) => m.key === 'great'))
    assert.ok(MOOD_OPTIONS.find((m) => m.key === 'low'))
  })
  it('has expected energy keys', () => {
    assert.equal(ENERGY_LEVELS.length, 3)
  })
  it('has expected flow keys', () => {
    assert.ok(FLOW_OPTIONS.find((f) => f.key === 'heavy'))
  })
})

describe('validateEntry', () => {
  it('requires date', () => {
    const errors = validateEntry({})
    assert.ok(errors.some((e) => e.includes('Date')))
  })
  it('accepts valid input', () => {
    assert.equal(validateEntry({ date: '2026-08-01', mood: 'great' }).length, 0)
  })
  it('rejects invalid mood', () => {
    const errors = validateEntry({ date: '2026-08-01', mood: 'bad' })
    assert.ok(errors.some((e) => e.includes('mood')))
  })
  it('rejects notes over 500 chars', () => {
    const errors = validateEntry({ date: '2026-08-01', notes: 'x'.repeat(501) })
    assert.ok(errors.some((e) => e.includes('500')))
  })
})

describe('getMoodEmoji', () => {
  it('returns emoji for known mood', () => {
    assert.equal(getMoodEmoji('great'), '😄')
  })
  it('returns empty for unknown', () => {
    assert.equal(getMoodEmoji('zzz'), '')
  })
})

describe('getEnergyEmoji', () => {
  it('returns emoji for known key', () => {
    assert.equal(getEnergyEmoji('high'), '⚡')
  })
  it('returns empty for unknown', () => {
    assert.equal(getEnergyEmoji('turbo'), '')
  })
})

describe('getFlowColor', () => {
  it('returns color for heavy', () => {
    assert.equal(getFlowColor('heavy'), '#b91c1c')
  })
  it('returns transparent for none', () => {
    assert.equal(getFlowColor('none'), 'transparent')
  })
})

describe('symptomFrequency', () => {
  it('counts symptoms correctly', () => {
    const entries = [
      { symptoms: ['cramps', 'headache'] },
      { symptoms: ['cramps', 'bloating'] },
      { symptoms: ['headache'] },
    ]
    const result = symptomFrequency(entries)
    assert.equal(result[0].symptom, 'cramps')
    assert.equal(result[0].count, 2)
  })
  it('returns empty for no symptoms', () => {
    assert.deepEqual(symptomFrequency([{ symptoms: [] }]), [])
  })
})

describe('moodDistribution', () => {
  it('counts moods', () => {
    const entries = [
      { mood: 'great' },
      { mood: 'great' },
      { mood: 'low' },
    ]
    const dist = moodDistribution(entries)
    assert.equal(dist.great, 2)
    assert.equal(dist.low, 1)
  })
})

describe('quickInsight', () => {
  it('returns insight from entries', () => {
    const entries = [
      { mood: 'great', symptoms: ['cramps'] },
      { mood: 'great', symptoms: ['cramps', 'headache'] },
      { mood: 'low', symptoms: ['headache'] },
    ]
    const insight = quickInsight(entries)
    assert.equal(insight.topSymptom, 'cramps')
    assert.equal(insight.topSymptomCount, 2)
    assert.equal(insight.topMood, 'great')
    assert.equal(insight.totalEntries, 3)
  })
  it('handles empty entries', () => {
    const insight = quickInsight([])
    assert.equal(insight.totalEntries, 0)
    assert.equal(insight.topSymptom, null)
  })
})

describe('weeklyTrend', () => {
  it('returns empty for no entries', () => {
    assert.deepEqual(weeklyTrend([]), [])
  })
  it('groups entries by week', () => {
    const entries = [
      { date: '2026-08-03', mood: 'great', energy: 'high' },
      { date: '2026-08-05', mood: 'low', energy: 'low' },
      { date: '2026-08-10', mood: 'okay', energy: 'medium' },
    ]
    const trend = weeklyTrend(entries)
    assert.ok(trend.length >= 2)
    assert.ok(trend[0].entryCount >= 1)
  })
  it('computes avg mood and energy', () => {
    const entries = [
      { date: '2026-08-03', mood: 'great', energy: 'high' },
      { date: '2026-08-04', mood: 'good', energy: 'medium' },
    ]
    const trend = weeklyTrend(entries)
    assert.ok(trend[0].avgMood >= 4 && trend[0].avgMood <= 5)
    assert.ok(trend[0].avgEnergy >= 2 && trend[0].avgEnergy <= 3)
  })
})
