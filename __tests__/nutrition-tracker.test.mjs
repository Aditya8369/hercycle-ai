import {
  NUTRIENTS, detectPhase, getTarget, getNutrientProgress,
  calcNutritionScore, buildWeeklyScores, calcStreak, getWeakestNutrientTip,
  toDateString, FOOD_SOURCES,
} from '../lib/nutrition-tracker.js'

describe('nutrition-tracker', () => {
  describe('toDateString', () => {
    it('formats YYYY-MM-DD', () => expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05'))
    it('defaults to today', () => expect(toDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/))
  })

  describe('detectPhase', () => {
    it('menstrual for day 1-5', () => expect(detectPhase('2026-01-01', 28, '2026-01-03')).toBe('menstrual'))
    it('follicular for day 6-13', () => expect(detectPhase('2026-01-01', 28, '2026-01-10')).toBe('follicular'))
    it('ovulation for day 14-16', () => expect(detectPhase('2026-01-01', 28, '2026-01-15')).toBe('ovulation'))
    it('luteal for day 17-28', () => expect(detectPhase('2026-01-01', 28, '2026-01-20')).toBe('luteal'))
    it('wraps around', () => expect(detectPhase('2026-01-01', 28, '2026-01-31')).toBe('menstrual'))
    it('defaults to follicular for null', () => expect(detectPhase(null)).toBe('follicular'))
  })

  describe('getTarget', () => {
    it('returns phase-boosted target for iron during menstrual', () => {
      expect(getTarget('iron', 'menstrual')).toBe(20)
    })
    it('returns default target when no boost', () => {
      expect(getTarget('calcium', 'menstrual')).toBe(1000)
    })
    it('returns 0 for unknown nutrient', () => {
      expect(getTarget('unknown', 'menstrual')).toBe(0)
    })
  })

  describe('getNutrientProgress', () => {
    it('returns progress for all nutrients', () => {
      const p = getNutrientProgress({ iron: 10, folate: 200 }, 'menstrual')
      expect(p).toHaveLength(NUTRIENTS.length)
      expect(p[0].value).toBe(10) // iron
    })
    it('clamps pct to max 1', () => {
      const p = getNutrientProgress({ iron: 100 }, 'menstrual')
      expect(p[0].pct).toBe(1)
    })
  })

  describe('calcNutritionScore', () => {
    it('returns 100 when all targets met', () => {
      const logged = {}
      NUTRIENTS.forEach((n) => { logged[n.id] = getTarget(n.id, 'menstrual') })
      expect(calcNutritionScore(logged, 'menstrual')).toBe(100)
    })
    it('returns 0 when nothing logged', () => {
      expect(calcNutritionScore({}, 'menstrual')).toBe(0)
    })
    it('returns 0 for null input', () => {
      expect(calcNutritionScore(null)).toBe(0)
    })
  })

  describe('buildWeeklyScores', () => {
    it('returns 7 entries', () => {
      expect(buildWeeklyScores([], 'follicular')).toHaveLength(7)
    })
    it('has valid day labels', () => {
      buildWeeklyScores([], 'follicular').forEach((d) => {
        expect(d.dayLabel).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
      })
    })
  })

  describe('calcStreak', () => {
    it('returns 0 for empty history', () => {
      expect(calcStreak([], 'menstrual')).toBe(0)
    })
    it('counts consecutive days meeting threshold', () => {
      const today = toDateString()
      const y = toDateString(new Date(Date.now() - 86400000))
      const fullLogged = {}
      NUTRIENTS.forEach((n) => { fullLogged[n.id] = getTarget(n.id, 'menstrual') })
      expect(calcStreak([
        { date: today, logged: fullLogged },
        { date: y, logged: fullLogged },
      ], 'menstrual', 0.6, today)).toBe(2)
    })
  })

  describe('getWeakestNutrientTip', () => {
    it('returns tip for weakest nutrient', () => {
      const tip = getWeakestNutrientTip({ iron: 0, folate: 400, calcium: 1000, vitamin_d: 600, omega3: 250 }, 'follicular')
      expect(tip).toContain('Iron')
    })
    it('returns null when all are met', () => {
      const logged = {}
      NUTRIENTS.forEach((n) => { logged[n.id] = getTarget(n.id, 'follicular') })
      expect(getWeakestNutrientTip(logged, 'follicular')).toBeNull()
    })
  })

  describe('NUTRIENTS catalog', () => {
    it('has 5 nutrients', () => expect(NUTRIENTS.length).toBe(5))
    it('every nutrient has required fields', () => {
      NUTRIENTS.forEach((n) => {
        expect(n.id).toBeDefined()
        expect(n.label).toBeDefined()
        expect(n.icon).toBeDefined()
        expect(n.dailyTarget).toBeGreaterThan(0)
        expect(n.color).toBeDefined()
      })
    })
  })

  describe('FOOD_SOURCES', () => {
    it('has sources for every nutrient', () => {
      NUTRIENTS.forEach((n) => {
        expect(FOOD_SOURCES[n.id]).toBeDefined()
        expect(FOOD_SOURCES[n.id].length).toBeGreaterThan(0)
      })
    })
  })
})
