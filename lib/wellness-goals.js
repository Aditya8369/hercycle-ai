/**
 * Wellness Goals — Cycle-phase-aware wellness goal library.
 * Defines per-phase goals, scoring, streaks, and weekly summaries.
 */

export const CYCLE_PHASES = {
  menstrual: { label: 'Menstrual Phase', icon: '🩸', color: '#E53935' },
  follicular: { label: 'Follicular Phase', icon: '🌱', color: '#66BB6A' },
  ovulation: { label: 'Ovulation Phase', icon: '✨', color: '#FFA726' },
  luteal: { label: 'Luteal Phase', icon: '🌙', color: '#AB47BC' },
}

export const CATEGORIES = {
  exercise: { label: 'Exercise', icon: '🏋️' },
  nutrition: { label: 'Nutrition', icon: '🥗' },
  mental: { label: 'Mental Health', icon: '🧠' },
  rest: { label: 'Rest & Recovery', icon: '😴' },
}

export const GOALS = [
  { id: 'rest', label: 'Get 8 hours of rest', icon: '😴', cat: 'rest', phases: ['menstrual', 'luteal'] },
  { id: 'yoga', label: 'Do gentle yoga or stretching', icon: '🧘', cat: 'exercise', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
  { id: 'hydrate', label: 'Drink 8 glasses of water', icon: '💧', cat: 'nutrition', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
  { id: 'iron', label: 'Eat an iron-rich meal', icon: '🥩', cat: 'nutrition', phases: ['menstrual'] },
  { id: 'meditate', label: 'Meditate for 10 minutes', icon: '🧠', cat: 'mental', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
  { id: 'walk', label: 'Take a 30-minute walk', icon: '🚶‍♀️', cat: 'exercise', phases: ['follicular', 'ovulation'] },
  { id: 'hiit', label: 'Try a high-intensity workout', icon: '🏃‍♀️', cat: 'exercise', phases: ['follicular', 'ovulation'] },
  { id: 'journal', label: 'Write in your health journal', icon: '📝', cat: 'mental', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
  { id: 'sugar', label: 'Limit refined sugar intake', icon: '🍬', cat: 'nutrition', phases: ['luteal'] },
  { id: 'vitamins', label: 'Take your daily vitamins', icon: '💊', cat: 'nutrition', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
  { id: 'caffeine', label: 'Skip caffeine today', icon: '☕', cat: 'nutrition', phases: ['luteal'] },
  { id: 'social', label: 'Spend quality time with friends', icon: '👯', cat: 'mental', phases: ['follicular', 'ovulation'] },
  { id: 'early-bed', label: 'Go to bed before 10 PM', icon: '🛏️', cat: 'rest', phases: ['menstrual', 'luteal'] },
  { id: 'strength', label: 'Do a strength training session', icon: '💪', cat: 'exercise', phases: ['follicular', 'ovulation'] },
  { id: 'self-care', label: 'Do something just for yourself', icon: '🛁', cat: 'mental', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'] },
]

export const PHASE_TIPS = {
  menstrual: 'Your body is working hard. Prioritise rest, stay hydrated, and eat iron-rich foods.',
  follicular: 'Energy is rising! Great time to try new workouts and set fresh goals.',
  ovulation: 'Peak energy and confidence! Channel this into challenging workouts and socialising.',
  luteal: 'Hormones are shifting. Gentle exercise, comfort food, and self-care help ease PMS.',
}

const MILESTONES = [
  { threshold: 3, label: '3-day streak', icon: '🔥' },
  { threshold: 7, label: '1-week streak', icon: '⭐' },
  { threshold: 14, label: '2-week streak', icon: '🌟' },
  { threshold: 30, label: '1-month streak', icon: '👑' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function toDateString(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(v) {
  if (!v) return null
  const d = new Date(`${v}T00:00:00`)
  return isNaN(d.getTime()) ? null : d
}

export function daysBetween(a, b) {
  const da = parseDate(a), db = parseDate(b)
  return da && db ? Math.round((db - da) / 86400000) : null
}

export function detectPhase(lastStart, cycleLen = 28, today) {
  const days = daysBetween(lastStart, today || toDateString())
  if (days === null) return 'follicular'
  const day = (days % cycleLen) + 1
  if (day <= 5) return 'menstrual'
  if (day <= 13) return 'follicular'
  if (day <= 16) return 'ovulation'
  return 'luteal'
}

export function getGoalsForPhase(phase, category) {
  let goals = GOALS.filter((g) => g.phases.includes(phase))
  if (category) goals = goals.filter((g) => g.cat === category)
  return goals
}

export function calcWellnessScore(completed, goals) {
  if (!goals?.length) return 0
  const w = { exercise: 1.2, nutrition: 1.3, mental: 1.0, rest: 0.9 }
  let tw = 0, ew = 0
  for (const g of goals) { const v = w[g.cat] || 1; tw += v; if (completed?.includes(g.id)) ew += v }
  return tw > 0 ? Math.round((ew / tw) * 100) : 0
}

export function calcStreak(history, goalIds, threshold = 0.5, today) {
  if (!history?.length || !goalIds?.length) return { streak: 0, lastCompletedDate: null }
  const map = new Map(history.map((h) => [h.date, h.completed || []]))
  let streak = 0, last = null
  for (let i = 0; i < 365; i++) {
    const d = new Date(`${today || toDateString()}T00:00:00`)
    d.setDate(d.getDate() - i)
    const ds = toDateString(d), c = map.get(ds)
    if (!c || c.length / goalIds.length < threshold) break
    streak++; if (!last) last = ds
  }
  return { streak, lastCompletedDate: last }
}

export function buildWeeklySummary(history, goalIds, endDate) {
  const today = new Date(`${endDate || toDateString()}T00:00:00`)
  const map = new Map(history.map((h) => [h.date, h.completed || []]))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6 - i))
    const ds = toDateString(d), c = map.get(ds) || [], t = goalIds?.length || 0
    return { date: ds, dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }), completed: c.length, total: t, rate: t ? Math.round((c.length / t) * 100) : 0 }
  })
}

export function getLatestMilestone(streak) {
  let r = null
  for (const m of MILESTONES) if (streak >= m.threshold) r = m
  return r
}

export function getPhaseTip(phase) {
  return PHASE_TIPS[phase] || PHASE_TIPS.follicular
}
