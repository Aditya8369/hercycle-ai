/**
 * Cycle Regularity — analysis helpers for cycle length consistency.
 * Provides scoring, distribution buckets, trend detection, and alerts.
 */

// ─── Core calculations ──────────────────────────────────────────────────────

/**
 * Extracts valid cycle lengths from cycle history, sorted oldest → newest.
 * Filters out cycles without a positive length and deduplicates dates.
 */
export function extractLengths(cycles) {
  if (!Array.isArray(cycles)) return []
  const seen = new Set()
  return cycles
    .filter((c) => {
      const len = Number(c.cycle_length)
      const key = c.start_date
      if (!len || len < 15 || len > 60 || !key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
    .map((c) => Number(c.cycle_length))
}

/**
 * Calculates basic statistics for an array of numbers.
 */
export function calcStats(lengths) {
  if (!lengths.length) return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, count: 0 }
  const sorted = [...lengths].sort((a, b) => a - b)
  const count = sorted.length
  const mean = sorted.reduce((s, v) => s + v, 0) / count
  const mid = Math.floor(count / 2)
  const median = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count
  const stdDev = Math.sqrt(variance)
  return { mean: Math.round(mean * 10) / 10, median: Math.round(median * 10) / 10, stdDev: Math.round(stdDev * 10) / 10, min: sorted[0], max: sorted[count - 1], count }
}

/**
 * Returns a regularity score 0–100 based on coefficient of variation.
 * Lower CV → higher score. Clamped to [0, 100].
 */
export function calcRegularityScore(stats) {
  if (!stats.count || stats.mean === 0) return 0
  const cv = stats.stdDev / stats.mean
  // CV of 0 = perfect (100), CV of 0.20+ = poor (≤25)
  const raw = Math.round((1 - cv / 0.20) * 100)
  return Math.max(0, Math.min(100, raw))
}

/**
 * Classifies the regularity score into a tier with colour.
 */
export function getRegularityTier(score) {
  if (score >= 80) return { label: 'Very Regular', color: '#34d399', emoji: '✅' }
  if (score >= 60) return { label: 'Mostly Regular', color: '#fbbf24', emoji: '🟡' }
  if (score >= 40) return { label: 'Somewhat Irregular', color: '#fb923c', emoji: '🟠' }
  return { label: 'Irregular', color: '#f87171', emoji: '🔴' }
}

// ─── Distribution ────────────────────────────────────────────────────────────

const BUCKETS = [
  { min: 15, max: 21, label: 'Short (< 22d)' },
  { min: 22, max: 28, label: '22–28d' },
  { min: 29, max: 35, label: '29–35d' },
  { min: 36, max: 45, label: '36–45d' },
  { min: 46, max: 60, label: 'Long (> 45d)' },
]

/**
 * Builds a histogram of cycle lengths into fixed buckets.
 */
export function buildDistribution(lengths) {
  const counts = BUCKETS.map((b) => ({ ...b, count: 0 }))
  for (const len of lengths) {
    const bucket = counts.find((b) => len >= b.min && len <= b.max)
    if (bucket) bucket.count++
  }
  const maxCount = Math.max(1, ...counts.map((b) => b.count))
  return counts.map((b) => ({ ...b, pct: Math.round((b.count / maxCount) * 100) }))
}

// ─── Trend detection ─────────────────────────────────────────────────────────

/**
 * Compares the average of the most recent N cycles to the overall average.
 * Returns 'shortening', 'lengthening', or 'stable'.
 */
export function detectTrend(lengths, recentN = 4) {
  if (lengths.length < 4) return { direction: 'stable', delta: 0 }
  const overall = lengths.reduce((s, v) => s + v, 0) / lengths.length
  const recentSlice = lengths.slice(-recentN)
  const recentAvg = recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length
  const delta = Math.round((recentAvg - overall) * 10) / 10
  if (Math.abs(delta) < 1.5) return { direction: 'stable', delta }
  return { direction: delta < 0 ? 'shortening' : 'lengthening', delta }
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

/**
 * Generates contextual alerts based on cycle data.
 */
export function generateAlerts(lengths, stats, trend) {
  const alerts = []
  if (stats.count < 3) {
    alerts.push({ type: 'info', text: 'Log at least 3 cycles to unlock detailed regularity insights.' })
    return alerts
  }
  if (stats.stdDev > 7) {
    alerts.push({ type: 'warning', text: `Your cycle lengths vary by ±${stats.stdDev} days. This level of variation is worth monitoring.` })
  }
  if (stats.min < 21) {
    alerts.push({ type: 'warning', text: `A cycle of ${stats.min} days was recorded — shorter than the typical 21-day minimum.` })
  }
  if (stats.max > 40) {
    alerts.push({ type: 'warning', text: `A cycle of ${stats.max} days was recorded — longer than the typical 35-day range.` })
  }
  if (trend.direction === 'shortening' && Math.abs(trend.delta) > 3) {
    alerts.push({ type: 'info', text: `Recent cycles are trending shorter by ~${Math.abs(trend.delta)} days.` })
  }
  if (trend.direction === 'lengthening' && Math.abs(trend.delta) > 3) {
    alerts.push({ type: 'info', text: `Recent cycles are trending longer by ~${Math.abs(trend.delta)} days.` })
  }
  if (alerts.length === 0) {
    alerts.push({ type: 'success', text: 'Your cycles are within a healthy, regular range.' })
  }
  return alerts
}
