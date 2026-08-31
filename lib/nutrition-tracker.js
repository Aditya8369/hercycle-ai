/**
 * Nutrition Tracker — data constants and helpers for daily nutrient logging.
 * Focuses on nutrients critical to menstrual health.
 */

// ─── Nutrient catalog ────────────────────────────────────────────────────────

export const NUTRIENTS = [
  { id: 'iron', label: 'Iron', icon: '🥩', unit: 'mg', dailyTarget: 18, phaseBoost: { menstrual: 20, luteal: 18 }, color: '#E53935' },
  { id: 'folate', label: 'Folate (B9)', icon: '🥬', unit: 'mcg', dailyTarget: 400, phaseBoost: { follicular: 450, ovulation: 450 }, color: '#66BB6A' },
  { id: 'calcium', label: 'Calcium', icon: '🥛', unit: 'mg', dailyTarget: 1000, phaseBoost: {}, color: '#42A5F5' },
  { id: 'vitamin_d', label: 'Vitamin D', icon: '☀️', unit: 'IU', dailyTarget: 600, phaseBoost: {}, color: '#FFA726' },
  { id: 'omega3', label: 'Omega-3', icon: '🐟', unit: 'mg', dailyTarget: 250, phaseBoost: { luteal: 350 }, color: '#AB47BC' },
]

// ─── Food sources (for tips) ─────────────────────────────────────────────────

export const FOOD_SOURCES = {
  iron: ['Spinach', 'Red meat', 'Lentils', 'Fortified cereals', 'Tofu'],
  folate: ['Leafy greens', 'Avocado', 'Beans', 'Citrus fruits', 'Eggs'],
  calcium: ['Milk', 'Yogurt', 'Cheese', 'Kale', 'Almonds'],
  vitamin_d: ['Sunlight', 'Fatty fish', 'Fortified milk', 'Egg yolks', 'Mushrooms'],
  omega3: ['Salmon', 'Walnuts', 'Flaxseeds', 'Chia seeds', 'Sardines'],
}

// ─── Date helper ─────────────────────────────────────────────────────────────

export function toDateString(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Phase detection ─────────────────────────────────────────────────────────

export function detectPhase(lastStart, cycleLen = 28, today) {
  if (!lastStart) return 'follicular'
  const start = new Date(`${lastStart}T00:00:00`)
  const now = new Date(`${today || toDateString()}T00:00:00`)
  if (isNaN(start.getTime()) || isNaN(now.getTime())) return 'follicular'
  const days = Math.round((now - start) / 86400000)
  const day = (days % cycleLen) + 1
  if (day <= 5) return 'menstrual'
  if (day <= 13) return 'follicular'
  if (day <= 16) return 'ovulation'
  return 'luteal'
}

// ─── Target calculation ──────────────────────────────────────────────────────

/**
 * Returns the effective daily target for a nutrient, adjusted for cycle phase.
 */
export function getTarget(nutrientId, phase) {
  const n = NUTRIENTS.find((x) => x.id === nutrientId)
  if (!n) return 0
  return n.phaseBoost[phase] || n.dailyTarget
}

// ─── Completion scoring ──────────────────────────────────────────────────────

/**
 * Calculates an overall nutrition score (0–100) based on how many nutrients
 * met their phase-adjusted targets.
 */
export function calcNutritionScore(logged, phase) {
  if (!logged || typeof logged !== 'object') return 0
  let total = 0, met = 0
  for (const n of NUTRIENTS) {
    const target = getTarget(n.id, phase)
    total++
    if (Number(logged[n.id]) >= target) met++
  }
  return total > 0 ? Math.round((met / total) * 100) : 0
}

/**
 * Returns per-nutrient progress (0–1 clamped) for progress bars.
 */
export function getNutrientProgress(logged, phase) {
  return NUTRIENTS.map((n) => {
    const target = getTarget(n.id, phase)
    const value = Number(logged?.[n.id]) || 0
    return { ...n, value, target, pct: Math.min(1, target > 0 ? value / target : 0) }
  })
}

// ─── Weekly summary ──────────────────────────────────────────────────────────

/**
 * Builds a 7-day array with per-day nutrition scores for charting.
 */
export function buildWeeklyScores(history, phase, endDate) {
  const today = new Date(`${endDate || toDateString()}T00:00:00`)
  const map = new Map(history.map((h) => [h.date, h.logged || {}]))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i))
    const ds = toDateString(d)
    return {
      date: ds,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
      score: calcNutritionScore(map.get(ds) || {}, phase),
    }
  })
}

// ─── Streak ──────────────────────────────────────────────────────────────────

/**
 * Counts consecutive days where at least `threshold`% of nutrients were met.
 */
export function calcStreak(history, phase, threshold = 0.6, today) {
  if (!history?.length) return 0
  const map = new Map(history.map((h) => [h.date, h.logged || {}]))
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(`${today || toDateString()}T00:00:00`)
    d.setDate(d.getDate() - i)
    const ds = toDateString(d)
    const score = calcNutritionScore(map.get(ds) || {}, phase) / 100
    if (score < threshold) break
    streak++
  }
  return streak
}

// ─── Tip generation ──────────────────────────────────────────────────────────

/**
 * Returns a personalised tip based on the nutrient with the lowest progress.
 */
export function getWeakestNutrientTip(logged, phase) {
  const progress = getNutrientProgress(logged, phase)
  const weakest = progress.reduce((min, n) => (n.pct < min.pct ? n : min), progress[0])
  if (!weakest || weakest.pct >= 0.8) return null
  const sources = FOOD_SOURCES[weakest.id] || []
  const sourceList = sources.slice(0, 3).join(', ')
  return `Your ${weakest.label} intake is below target. Try adding ${sourceList} to your meals.`
}
