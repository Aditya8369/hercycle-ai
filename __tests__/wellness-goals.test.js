import {
  detectPhase, getGoalsForPhase, getPhaseTip, calcWellnessScore, calcStreak,
  buildWeeklySummary, getLatestMilestone, toDateString, daysBetween, parseDate,
  GOALS, MILESTONES,
} from '../lib/wellness-goals.js'

describe('wellness-goals', () => {
  describe('toDateString', () => {
    it('formats a Date as YYYY-MM-DD', () => {
      expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
    it('defaults to today', () => {
      expect(toDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('parseDate', () => {
    it('parses valid date string', () => expect(parseDate('2026-03-15')).toBeInstanceOf(Date))
    it('returns null for invalid input', () => {
      expect(parseDate(null)).toBeNull()
      expect(parseDate('not-a-date')).toBeNull()
    })
  })

  describe('daysBetween', () => {
    it('calculates days between dates', () => expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7))
    it('returns negative for reversed', () => expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7))
    it('returns null for invalid', () => expect(daysBetween(null, '2026-01-01')).toBeNull())
  })

  describe('detectPhase', () => {
    it('menstrual for day 1-5', () => expect(detectPhase('2026-01-01', 28, '2026-01-03')).toBe('menstrual'))
    it('follicular for day 6-13', () => expect(detectPhase('2026-01-01', 28, '2026-01-10')).toBe('follicular'))
    it('ovulation for day 14-16', () => expect(detectPhase('2026-01-01', 28, '2026-01-15')).toBe('ovulation'))
    it('luteal for day 17-28', () => expect(detectPhase('2026-01-01', 28, '2026-01-20')).toBe('luteal'))
    it('wraps around cycle length', () => expect(detectPhase('2026-01-01', 28, '2026-01-31')).toBe('menstrual'))
    it('defaults to follicular', () => expect(detectPhase(null)).toBe('follicular'))
  })

  describe('getGoalsForPhase', () => {
    it('returns goals for menstrual phase', () => {
      const goals = getGoalsForPhase('menstrual')
      expect(goals.length).toBeGreaterThan(0)
      goals.forEach((g) => expect(g.phases).toContain('menstrual'))
    })
    it('filters by category', () => {
      const goals = getGoalsForPhase('follicular', 'exercise')
      goals.forEach((g) => { expect(g.cat).toBe('exercise'); expect(g.phases).toContain('follicular') })
    })
  })

  describe('calcWellnessScore', () => {
    it('returns 0 for empty', () => expect(calcWellnessScore([], [])).toBe(0))
    it('returns 100 when all completed', () => {
      expect(calcWellnessScore(['a', 'b'], [{ id: 'a', cat: 'exercise' }, { id: 'b', cat: 'nutrition' }])).toBe(100)
    })
    it('weights categories differently', () => {
      const goals = [{ id: 'ex', cat: 'exercise' }, { id: 'nu', cat: 'nutrition' }]
      expect(calcWellnessScore(['nu'], goals)).toBe(52)
    })
  })

  describe('calcStreak', () => {
    it('returns 0 for empty history', () => expect(calcStreak([], ['a']).streak).toBe(0))
    it('counts consecutive days', () => {
      const today = toDateString()
      const y = toDateString(new Date(Date.now() - 86400000))
      expect(calcStreak([{ date: today, completed: ['a'] }, { date: y, completed: ['a'] }], ['a'], 0.5, today).streak).toBe(2)
    })
    it('breaks on missing day', () => {
      const today = toDateString()
      const twoAgo = toDateString(new Date(Date.now() - 2 * 86400000))
      expect(calcStreak([{ date: today, completed: ['a'] }, { date: twoAgo, completed: ['a'] }], ['a'], 0.5, today).streak).toBe(1)
    })
  })

  describe('buildWeeklySummary', () => {
    it('returns 7 days', () => expect(buildWeeklySummary([], ['a'])).toHaveLength(7))
    it('has valid day labels', () => {
      buildWeeklySummary([], ['a']).forEach((d) => expect(d.dayLabel).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/))
    })
  })

  describe('getLatestMilestone', () => {
    it('returns null for 0', () => expect(getLatestMilestone(0)).toBeNull())
    it('returns 3-day streak', () => expect(getLatestMilestone(3).label).toBe('3-day streak'))
    it('returns highest applicable', () => expect(getLatestMilestone(35).label).toBe('1-month streak'))
  })

  describe('getPhaseTip', () => {
    it('returns tip for each phase', () => {
      for (const p of ['menstrual', 'follicular', 'ovulation', 'luteal']) {
        expect(getPhaseTip(p).length).toBeGreaterThan(10)
      }
    })
  })

  describe('GOALS catalog', () => {
    it('has 15 goals', () => expect(GOALS.length).toBe(15))
    it('every goal has required fields', () => {
      GOALS.forEach((g) => { expect(g.id); expect(g.label); expect(g.icon); expect(g.cat); expect(g.phases.length).toBeGreaterThan(0) })
    })
  })

  describe('MILESTONES', () => {
    it('sorted ascending', () => {
      for (let i = 1; i < MILESTONES.length; i++) expect(MILESTONES[i].threshold).toBeGreaterThan(MILESTONES[i - 1].threshold)
    })
  })
})
