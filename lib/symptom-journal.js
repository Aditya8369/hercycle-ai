/**
 * symptom-journal.js — Data definitions, analysis helpers, and validation
 * for the Symptom Journal feature.
 */

export const MOOD_OPTIONS = [
  { key: 'great', emoji: '😄', label: 'Great' },
  { key: 'good', emoji: '🙂', label: 'Good' },
  { key: 'okay', emoji: '😐', label: 'Okay' },
  { key: 'low', emoji: '😔', label: 'Low' },
  { key: 'anxious', emoji: '😰', label: 'Anxious' },
  { key: 'irritable', emoji: '😤', label: 'Irritable' },
]

export const ENERGY_LEVELS = [
  { key: 'high', emoji: '⚡', label: 'High', value: 3 },
  { key: 'medium', emoji: '🔋', label: 'Medium', value: 2 },
  { key: 'low', emoji: '🪫', label: 'Low', value: 1 },
]

export const SYMPTOM_TAGS = [
  { key: 'cramps', emoji: '🤕', label: 'Cramps' },
  { key: 'headache', emoji: '🤯', label: 'Headache' },
  { key: 'bloating', emoji: '🫧', label: 'Bloating' },
  { key: 'backache', emoji: '💆', label: 'Back Pain' },
  { key: 'fatigue', emoji: '😴', label: 'Fatigue' },
  { key: 'nausea', emoji: '🤢', label: 'Nausea' },
  { key: 'breast_tenderness', emoji: '💗', label: 'Breast Tenderness' },
  { key: 'acne', emoji: '✨', label: 'Acne' },
  { key: 'cravings', emoji: '🍫', label: 'Cravings' },
  { key: 'insomnia', emoji: '🌙', label: 'Insomnia' },
  { key: 'hot_flashes', emoji: '🔥', label: 'Hot Flashes' },
  { key: 'dizziness', emoji: '💫', label: 'Dizziness' },
]

export const FLOW_OPTIONS = [
  { key: 'none', label: 'None', color: 'transparent' },
  { key: 'spotting', label: 'Spotting', color: '#fecaca' },
  { key: 'light', label: 'Light', color: '#f87171' },
  { key: 'medium', label: 'Medium', color: '#ef4444' },
  { key: 'heavy', label: 'Heavy', color: '#b91c1c' },
]

function toDateString(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function validateEntry(input) {
  const errors = []
  if (!input.date) errors.push('Date is required.')
  if (input.mood && !MOOD_OPTIONS.find((m) => m.key === input.mood))
    errors.push('Invalid mood value.')
  if (input.energy && !ENERGY_LEVELS.find((e) => e.key === input.energy))
    errors.push('Invalid energy level.')
  if (input.flow && !FLOW_OPTIONS.find((f) => f.key === input.flow))
    errors.push('Invalid flow value.')
  if (input.symptoms && !Array.isArray(input.symptoms))
    errors.push('Symptoms must be an array.')
  if (input.notes && input.notes.length > 500)
    errors.push('Notes must be 500 characters or fewer.')
  return errors
}

export function getMoodEmoji(key) {
  return MOOD_OPTIONS.find((m) => m.key === key)?.emoji || ''
}

export function getEnergyEmoji(key) {
  return ENERGY_LEVELS.find((e) => e.key === key)?.emoji || ''
}

export function getFlowColor(key) {
  return FLOW_OPTIONS.find((f) => f.key === key)?.color || 'transparent'
}

/**
 * Build a frequency map of symptoms from journal entries.
 * Returns sorted array: [{ symptom, count }] descending.
 */
export function symptomFrequency(entries) {
  const counts = {}
  for (const entry of entries) {
    for (const s of entry.symptoms || []) {
      counts[s] = (counts[s] || 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([symptom, count]) => ({ symptom, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Calculate mood distribution from entries.
 * Returns { mood: count } map.
 */
export function moodDistribution(entries) {
  const dist = {}
  for (const entry of entries) {
    if (entry.mood) {
      dist[entry.mood] = (dist[entry.mood] || 0) + 1
    }
  }
  return dist
}

/**
 * Find the most common symptom and most common mood.
 * Returns { topSymptom, topMood, totalEntries }.
 */
export function quickInsight(entries) {
  const freq = symptomFrequency(entries)
  const mood = moodDistribution(entries)
  const topMood = Object.entries(mood).sort((a, b) => b[1] - a[1])[0]

  return {
    topSymptom: freq[0]?.symptom || null,
    topSymptomCount: freq[0]?.count || 0,
    topMood: topMood?.[0] || null,
    totalEntries: entries.length,
  }
}

/**
 * Build weekly trend data for Recharts.
 * Returns [{ week: 'Jul 1-7', avgMood, avgEnergy, entryCount }]
 */
export function weeklyTrend(entries) {
  if (entries.length === 0) return []

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const moodMap = { great: 5, good: 4, okay: 3, low: 2, anxious: 2, irritable: 2 }
  const energyMap = { high: 3, medium: 2, low: 1 }

  const weeks = new Map()
  for (const entry of sorted) {
    const d = new Date(`${entry.date}T00:00:00`)
    const startOfWeek = new Date(d)
    startOfWeek.setDate(d.getDate() - d.getDay())
    const weekKey = toDateString(startOfWeek)

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { moods: [], energies: [], count: 0 })
    }
    const w = weeks.get(weekKey)
    if (entry.mood) w.moods.push(moodMap[entry.mood] || 3)
    if (entry.energy) w.energies.push(energyMap[entry.energy] || 2)
    w.count++
  }

  return Array.from(weeks.entries()).map(([key, w]) => {
    const d = new Date(`${key}T00:00:00`)
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    const short = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      week: `${short(d)}-${short(end)}`,
      avgMood: w.moods.length ? Math.round((w.moods.reduce((a, b) => a + b, 0) / w.moods.length) * 10) / 10 : 0,
      avgEnergy: w.energies.length ? Math.round((w.energies.reduce((a, b) => a + b, 0) / w.energies.length) * 10) / 10 : 0,
      entryCount: w.count,
    }
  })
}
