/**
 * nutrition.js — Cycle-phase-aware nutrition data and helpers.
 *
 * Maps each menstrual cycle phase to evidence-based food recommendations,
 * calorie adjustments, hydration targets, and nutrient priorities.
 */

export const CYCLE_PHASES = {
  MENSTRUAL: 'menstrual',
  FOLLICULAR: 'follicular',
  OVULATION: 'ovulation',
  LUTEAL: 'luteal',
}

export const PHASE_LABELS = {
  [CYCLE_PHASES.MENSTRUAL]: 'Menstrual',
  [CYCLE_PHASES.FOLLICULAR]: 'Follicular',
  [CYCLE_PHASES.OVULATION]: 'Ovulation',
  [CYCLE_PHASES.LUTEAL]: 'Luteal',
}

export const PHASE_COLORS = {
  [CYCLE_PHASES.MENSTRUAL]: '#e8527e',
  [CYCLE_PHASES.FOLLICULAR]: '#6ee7b7',
  [CYCLE_PHASES.OVULATION]: '#a98bff',
  [CYCLE_PHASES.LUTEAL]: '#f59e0b',
}

export const PHASE_ICONS = {
  [CYCLE_PHASES.MENSTRUAL]: '🩸',
  [CYCLE_PHASES.FOLLICULAR]: '🌱',
  [CYCLE_PHASES.OVULATION]: '✨',
  [CYCLE_PHASES.LUTEAL]: '🌙',
}

export const PHASE_RECOMMENDATIONS = {
  [CYCLE_PHASES.MENSTRUAL]: {
    title: 'Menstrual Phase Nutrition',
    subtitle: 'Days 1–5: Support iron loss and reduce inflammation',
    calorieAdjustment: 0,
    waterLitres: 2.5,
    nutrientPriorities: ['Iron', 'Vitamin C', 'Omega-3', 'Magnesium'],
    foods: [
      { name: 'Spinach & Lentils', category: 'Iron-rich', icon: '🥬', benefit: 'Replenishes iron lost during menstruation' },
      { name: 'Salmon & Walnuts', category: 'Omega-3', icon: '🐟', benefit: 'Reduces menstrual cramps and inflammation' },
      { name: 'Dark Chocolate (70%+)', category: 'Magnesium', icon: '🍫', benefit: 'Eases cramps and boosts mood' },
      { name: 'Orange & Bell Peppers', category: 'Vitamin C', icon: '🍊', benefit: 'Enhances iron absorption naturally' },
      { name: 'Ginger Tea', category: 'Anti-inflammatory', icon: '🫖', benefit: 'Soothes cramps and nausea' },
      { name: 'Whole Grains', category: 'Complex Carbs', icon: '🌾', benefit: 'Stabilises energy and serotonin levels' },
    ],
    avoid: ['Excess caffeine', 'Salty snacks', 'Refined sugar', 'Alcohol'],
    tip: 'Warm, nourishing meals like soups and stews are ideal. Focus on comfort foods that are nutrient-dense.',
  },
  [CYCLE_PHASES.FOLLICULAR]: {
    title: 'Follicular Phase Nutrition',
    subtitle: 'Days 6–13: Fuel rising energy and estrogen',
    calorieAdjustment: +100,
    waterLitres: 2.5,
    nutrientPriorities: ['Protein', 'B-Vitamins', 'Zinc', 'Folate'],
    foods: [
      { name: 'Eggs & Greek Yoghurt', category: 'Protein', icon: '🥚', benefit: 'Supports follicle development and energy' },
      { name: 'Berries & Citrus', category: 'Antioxidants', icon: '🫐', benefit: 'Protects developing eggs from oxidative stress' },
      { name: 'Lean Chicken & Tofu', category: 'Lean Protein', icon: '🍗', benefit: 'Builds muscle and sustains rising energy' },
      { name: 'Leafy Greens', category: 'Folate', icon: '🥗', benefit: 'Essential for healthy cell division' },
      { name: 'Pumpkin Seeds', category: 'Zinc', icon: '🎃', benefit: 'Supports follicular growth and immunity' },
    ],
    avoid: ['Excess dairy', 'Fried foods', 'Processed meats'],
    tip: 'Estrogen is rising — your body can handle more protein and complex carbs. Great time to try new recipes!',
  },
  [CYCLE_PHASES.OVULATION]: {
    title: 'Ovulation Phase Nutrition',
    subtitle: 'Days 14–16: Peak energy — maximise antioxidant intake',
    calorieAdjustment: +200,
    waterLitres: 3.0,
    nutrientPriorities: ['Antioxidants', 'Fibre', 'Vitamin E', 'Selenium'],
    foods: [
      { name: 'Avocado & Olive Oil', category: 'Healthy Fats', icon: '🥑', benefit: 'Supports hormone production and cell membranes' },
      { name: 'Pomegranate & Tomatoes', category: 'Antioxidants', icon: '🍅', benefit: 'Rich in lycopene for egg quality' },
      { name: 'Brazil Nuts', category: 'Selenium', icon: '🥜', benefit: 'Just 2–3 nuts provide daily selenium' },
      { name: 'Quinoa & Chickpeas', category: 'Complete Protein', icon: '🫘', benefit: 'Plant-based complete amino acid profile' },
    ],
    avoid: ['Excess sugar', 'Carbonated drinks', 'Very spicy foods'],
    tip: 'Your energy is at its peak! Great time for high-intensity workouts and adventurous meals.',
  },
  [CYCLE_PHASES.LUTEAL]: {
    title: 'Luteal Phase Nutrition',
    subtitle: 'Days 17–28: Manage PMS and support progesterone',
    calorieAdjustment: +300,
    waterLitres: 2.5,
    nutrientPriorities: ['Calcium', 'Magnesium', 'Tryptophan', 'B6'],
    foods: [
      { name: 'Bananas & Dates', category: 'Potassium', icon: '🍌', benefit: 'Reduces bloating and supports mood' },
      { name: 'Cottage Cheese & Milk', category: 'Calcium', icon: '🧀', benefit: 'Reduces PMS severity by up to 48%' },
      { name: 'Turkey & Pumpkin', category: 'Tryptophan', icon: '🦃', benefit: 'Promotes serotonin and better sleep' },
      { name: 'Almonds & Cashews', category: 'Magnesium', icon: '🌰', benefit: 'Eases cramps, anxiety, and water retention' },
    ],
    avoid: ['Caffeine (after noon)', 'Alcohol', 'Excess salt', 'Processed sugar'],
    tip: 'Cravings are normal — choose nutrient-dense swaps. Increase calories slightly to support your metabolism.',
  },
}

/** Determines the current cycle phase from cycle history. */
export function getCurrentPhase(cycles, avgCycleLength = 28) {
  if (!cycles || cycles.length === 0) return CYCLE_PHASES.MENSTRUAL
  const sorted = [...cycles].sort((a, b) => a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0)
  const latest = sorted[sorted.length - 1]
  const diffDays = Math.floor((Date.now() - new Date(latest.start_date + 'T00:00:00').getTime()) / 86400000)
  if (diffDays <= 5) return CYCLE_PHASES.MENSTRUAL
  if (diffDays <= 13) return CYCLE_PHASES.FOLLICULAR
  if (diffDays <= 16) return CYCLE_PHASES.OVULATION
  return CYCLE_PHASES.LUTEAL
}

export function getRecommendations(phase) {
  return PHASE_RECOMMENDATIONS[phase] || PHASE_RECOMMENDATIONS[CYCLE_PHASES.MENSTRUAL]
}

/** Estimated daily calories adjusted for the cycle phase. */
export function getCalorieTarget(baseCalories = 2000, phase) {
  const rec = getRecommendations(phase)
  return baseCalories + rec.calorieAdjustment
}

/** Compact summary for the API response. */
export function buildPhaseSummary(phase, cycles, avgCycleLength = 28) {
  const rec = getRecommendations(phase)
  return {
    phase,
    label: PHASE_LABELS[phase],
    color: PHASE_COLORS[phase],
    icon: PHASE_ICONS[phase],
    recommendations: rec,
    totalCycles: cycles ? cycles.length : 0,
  }
}
