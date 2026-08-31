import {
  extractLengths, calcStats, calcRegularityScore, getRegularityTier,
  buildDistribution, detectTrend, generateAlerts,
} from '../lib/cycle-regularity.js'

describe('cycle-regularity', () => {
  const makeCycles = (lengths) =>
    lengths.map((l, i) => ({
      id: `c${i}`, start_date: `2026-01-${String(i * 28 + 1).padStart(2, '0')}`, cycle_length: l,
    }))

  describe('extractLengths', () => {
    it('returns sorted valid lengths', () => {
      const result = extractLengths(makeCycles([28, 30, 26]))
      expect(result).toEqual([26, 28, 30])
    })
    it('filters out invalid lengths', () => {
      expect(extractLengths(makeCycles([10, 70, 28]))).toEqual([28])
    })
    it('deduplicates by start_date', () => {
      const cycles = [
        { id: 'a', start_date: '2026-01-01', cycle_length: 28 },
        { id: 'b', start_date: '2026-01-01', cycle_length: 30 },
      ]
      expect(extractLengths(cycles)).toEqual([28])
    })
    it('returns empty for non-array', () => expect(extractLengths(null)).toEqual([]))
  })

  describe('calcStats', () => {
    it('computes correct stats', () => {
      const s = calcStats([28, 28, 30, 26])
      expect(s.mean).toBe(28)
      expect(s.median).toBe(28)
      expect(s.count).toBe(4)
      expect(s.min).toBe(26)
      expect(s.max).toBe(30)
    })
    it('handles empty array', () => {
      const s = calcStats([])
      expect(s.mean).toBe(0)
      expect(s.count).toBe(0)
    })
  })

  describe('calcRegularityScore', () => {
    it('returns high score for identical lengths', () => {
      const s = calcStats([28, 28, 28, 28])
      expect(calcRegularityScore(s)).toBe(100)
    })
    it('returns low score for highly variable lengths', () => {
      const s = calcStats([24, 28, 35, 40])
      expect(calcRegularityScore(s)).toBeLessThan(40)
    })
    it('returns 0 for empty stats', () => {
      expect(calcRegularityScore({ mean: 0, stdDev: 0, count: 0 })).toBe(0)
    })
  })

  describe('getRegularityTier', () => {
    it('Very Regular for high score', () => expect(getRegularityTier(85).label).toBe('Very Regular'))
    it('Mostly Regular for 65', () => expect(getRegularityTier(65).label).toBe('Mostly Regular'))
    it('Somewhat Irregular for 45', () => expect(getRegularityTier(45).label).toBe('Somewhat Irregular'))
    it('Irregular for low score', () => expect(getRegularityTier(20).label).toBe('Irregular'))
  })

  describe('buildDistribution', () => {
    it('counts into correct buckets', () => {
      const d = buildDistribution([25, 28, 30, 42])
      expect(d[0].count).toBe(1) // 25 → Short
      expect(d[1].count).toBe(2) // 28, 30 → 22-28, 29-35
      expect(d[2].count).toBe(1) // 42 → 36-45
    })
    it('returns 5 buckets', () => expect(buildDistribution([])).toHaveLength(5))
  })

  describe('detectTrend', () => {
    it('detects shortening trend', () => {
      const t = detectTrend([30, 30, 30, 30, 28, 27, 26, 25])
      expect(t.direction).toBe('shortening')
    })
    it('detects lengthening trend', () => {
      const t = detectTrend([25, 26, 27, 28, 30, 30, 30, 30])
      expect(t.direction).toBe('lengthening')
    })
    it('detects stable trend', () => {
      const t = detectTrend([28, 29, 28, 29, 28, 29])
      expect(t.direction).toBe('stable')
    })
    it('returns stable for short arrays', () => {
      expect(detectTrend([28, 29]).direction).toBe('stable')
    })
  })

  describe('generateAlerts', () => {
    it('info alert for < 3 cycles', () => {
      const a = generateAlerts([28, 29], calcStats([28, 29]), { direction: 'stable', delta: 0 })
      expect(a.some((x) => x.type === 'info')).toBe(true)
    })
    it('warning for high stdDev', () => {
      const s = calcStats([24, 28, 35, 40])
      const a = generateAlerts([24, 28, 35, 40], s, { direction: 'stable', delta: 0 })
      expect(a.some((x) => x.type === 'warning')).toBe(true)
    })
    it('success for regular cycles', () => {
      const s = calcStats([28, 28, 29, 28])
      const a = generateAlerts([28, 28, 29, 28], s, { direction: 'stable', delta: 0 })
      expect(a.some((x) => x.type === 'success')).toBe(true)
    })
  })
})
