'use client'

/**
 * CycleWellnessDashboard.jsx
 *
 * Comprehensive cycle wellness dashboard with:
 * - Current cycle phase detection and health insights
 * - Phase-based nutrition recommendations
 * - Exercise planner tailored to cycle phase
 * - Mood and energy tracking
 * - Sleep quality analysis
 * - Hydration reminders
 * - Supplement tracker
 * - Weekly wellness score
 */

import React, { useState, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Cycle phase data
// ---------------------------------------------------------------------------

const CYCLE_PHASES = {
  menstrual: {
    name: 'Menstrual Phase',
    icon: '🩸',
    days: '1-5',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    description: 'Your body is shedding the uterine lining. Energy may be lower, and cramps are common.',
    energyLevel: 'Low',
    mood: 'Introspective',
    hormones: 'Estrogen & Progesterone at lowest',
    tips: [
      'Rest is productive — honor your body\'s need for slower pace',
      'Gentle movement like yoga or walking can help with cramps',
      'Stay hydrated and consider warm herbal teas',
      'Iron-rich foods help replenish what\'s lost',
    ],
  },
  follicular: {
    name: 'Follicular Phase',
    icon: '🌱',
    days: '6-13',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    description: 'Estrogen rises as follicles develop. Energy and mood typically improve.',
    energyLevel: 'Rising',
    mood: 'Optimistic & Creative',
    hormones: 'Estrogen rising, FSH active',
    tips: [
      'Great time for new projects and creative endeavors',
      'Try high-intensity workouts — your body can handle more',
      'Social activities feel more appealing now',
      'Experiment with new recipes and foods',
    ],
  },
  ovulation: {
    name: 'Ovulation Phase',
    icon: '✨',
    days: '14-16',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    description: 'Peak energy and fertility. Estrogen peaks and you may feel your best.',
    energyLevel: 'Peak',
    mood: 'Confident & Social',
    hormones: 'Estrogen peaks, LH surge',
    tips: [
      'Your peak performance window — tackle challenging tasks',
      'Great time for presentations or important meetings',
      'High-intensity and strength training are ideal',
      'Communication feels easiest now',
    ],
  },
  luteal: {
    name: 'Luteal Phase',
    icon: '🍂',
    days: '17-28',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.3)',
    description: 'Progesterone rises then falls. PMS symptoms may appear in the late luteal phase.',
    energyLevel: 'Declining',
    mood: 'Varies (PMS possible)',
    hormones: 'Progesterone peaks, then both hormones drop',
    tips: [
      'Magnesium-rich foods can help with mood and cramps',
      'Moderate exercise like swimming or cycling is ideal',
      'Reduce caffeine and salt intake to minimize bloating',
      'Practice stress management — meditation helps',
    ],
  },
}

// ---------------------------------------------------------------------------
// Nutrition data
// ---------------------------------------------------------------------------

const NUTRITION_DATA = {
  menstrual: {
    focus: 'Iron Replenishment & Anti-inflammatory',
    foods: [
      { name: 'Red meat / Spinach', icon: '🥩', reason: 'Iron replenishment', priority: 'high' },
      { name: 'Dark chocolate', icon: '🍫', reason: 'Magnesium + mood boost', priority: 'medium' },
      { name: 'Ginger tea', icon: '🫖', reason: 'Anti-inflammatory, reduces cramps', priority: 'high' },
      { name: 'Salmon', icon: '🐟', reason: 'Omega-3 reduces inflammation', priority: 'high' },
      { name: 'Berries', icon: '🫐', reason: 'Antioxidants + vitamin C for iron absorption', priority: 'medium' },
      { name: 'Turmeric', icon: '🟡', reason: 'Natural anti-inflammatory', priority: 'medium' },
    ],
    avoid: ['Excessive caffeine', 'Alcohol', 'Salty foods', 'Cold/raw foods'],
    hydration: '2.5L — warm liquids preferred',
    supplements: ['Iron', 'Vitamin C', 'Magnesium'],
  },
  follicular: {
    focus: 'Energy Building & Gut Health',
    foods: [
      { name: 'Fermented foods', icon: '🥒', reason: 'Probiotics for gut health', priority: 'high' },
      { name: 'Lean proteins', icon: '🍗', reason: 'Building blocks for rising energy', priority: 'high' },
      { name: 'Sprouted grains', icon: '🌾', reason: 'Easy to digest, B vitamins', priority: 'medium' },
      { name: 'Eggs', icon: '🥚', reason: 'Complete protein + choline', priority: 'medium' },
      { name: 'Citrus fruits', icon: '🍊', reason: 'Vitamin C + antioxidants', priority: 'medium' },
      { name: 'Seeds (flax, pumpkin)', icon: '🌻', reason: 'Omega-3 + zinc for follicle health', priority: 'high' },
    ],
    avoid: ['Heavy/greasy foods', 'Excess sugar'],
    hydration: '2.5L — room temperature',
    supplements: ['Probiotics', 'B-complex', 'Zinc'],
  },
  ovulation: {
    focus: 'Peak Performance & Antioxidants',
    foods: [
      { name: 'Leafy greens', icon: '🥬', reason: 'Fiber + folate for egg quality', priority: 'high' },
      { name: 'Sweet potatoes', icon: '🍠', reason: 'Complex carbs + beta-carotene', priority: 'medium' },
      { name: 'Avocado', icon: '🥑', reason: 'Healthy fats + vitamin E', priority: 'high' },
      { name: 'Nuts & seeds', icon: '🥜', reason: 'Zinc + selenium for fertility', priority: 'high' },
      { name: 'Bright vegetables', icon: '🫑', reason: 'Antioxidants for egg health', priority: 'medium' },
      { name: 'Watermelon', icon: '🍉', reason: 'Hydration + lycopene', priority: 'medium' },
    ],
    avoid: ['Excess dairy', 'Highly processed foods'],
    hydration: '3L — add electrolytes',
    supplements: ['CoQ10', 'Vitamin E', 'Selenium'],
  },
  luteal: {
    focus: 'Mood Support & Bloating Prevention',
    foods: [
      { name: 'Bananas', icon: '🍌', reason: 'Potassium reduces bloating', priority: 'high' },
      { name: 'Complex carbs', icon: '🍠', reason: 'Serotonin production + mood', priority: 'high' },
      { name: 'Calcium-rich foods', icon: '🧀', reason: 'Reduces PMS symptoms by 50%', priority: 'high' },
      { name: 'Magnesium foods (dark chocolate)', icon: '🍫', reason: 'Calms nervous system', priority: 'high' },
      { name: 'Cruciferous veggies', icon: '🥦', reason: 'Support estrogen metabolism', priority: 'medium' },
      { name: 'Herbal teas', icon: '🫖', reason: 'Chamomile for relaxation', priority: 'medium' },
    ],
    avoid: ['Salty foods (bloating)', 'Caffeine (worsens PMS)', 'Alcohol', 'Refined sugar'],
    hydration: '2.5L — room temperature, herbal teas',
    supplements: ['Calcium', 'Magnesium', 'Vitamin B6', 'Chasteberry'],
  },
}

// ---------------------------------------------------------------------------
// Exercise data
// ---------------------------------------------------------------------------

const EXERCISE_DATA = {
  menstrual: {
    intensity: 'Low to Gentle',
    color: '#ef4444',
    recommended: [
      { name: 'Gentle Yoga', icon: '🧘', duration: '20-30 min', benefit: 'Reduces cramps, relieves tension' },
      { name: 'Walking', icon: '🚶‍♀️', duration: '20-40 min', benefit: 'Gentle movement, improves mood' },
      { name: 'Stretching', icon: '🤸‍♀️', duration: '10-15 min', benefit: 'Eases lower back pain' },
      { name: 'Breathing exercises', icon: '🌬️', duration: '5-10 min', benefit: 'Activates parasympathetic system' },
    ],
    avoid: ['High-intensity training', 'Heavy lifting', 'Inversions'],
  },
  follicular: {
    intensity: 'Moderate to High',
    color: '#22c55e',
    recommended: [
      { name: 'HIIT Training', icon: '⚡', duration: '20-30 min', benefit: 'Maximizes rising energy' },
      { name: 'Running/Sprints', icon: '🏃‍♀️', duration: '30-45 min', benefit: 'Cardio at peak capacity' },
      { name: 'Dance classes', icon: '💃', duration: '45-60 min', benefit: 'Fun + creative expression' },
      { name: 'Strength training', icon: '🏋️‍♀️', duration: '30-45 min', benefit: 'Build muscle effectively' },
    ],
    avoid: [],
  },
  ovulation: {
    intensity: 'Peak Performance',
    color: '#f59e0b',
    recommended: [
      { name: 'Powerlifting', icon: '🏋️‍♀️', duration: '45-60 min', benefit: 'Peak strength — set PRs!' },
      { name: 'Competitive sports', icon: '🎾', duration: '60 min', benefit: 'Coordination at its best' },
      { name: 'Intense HIIT', icon: '🔥', duration: '25-35 min', benefit: 'Maximum calorie burn' },
      { name: 'Team sports', icon: '⚽', duration: '60-90 min', benefit: 'Social + peak performance' },
    ],
    avoid: [],
  },
  luteal: {
    intensity: 'Moderate (early) / Low (late)',
    color: '#8b5cf6',
    recommended: [
      { name: 'Swimming', icon: '🏊‍♀️', duration: '30-45 min', benefit: 'Low-impact, reduces bloating' },
      { name: 'Cycling', icon: '🚴‍♀️', duration: '30-40 min', benefit: 'Moderate cardio without impact' },
      { name: 'Pilates', icon: '🧘‍♀️', duration: '30-45 min', benefit: 'Core strength, reduces cramps' },
      { name: 'Restorative yoga', icon: '🧘', duration: '20-30 min', benefit: 'Calming, reduces PMS anxiety' },
    ],
    avoid: ['Max effort lifts (late luteal)', 'High-impact cardio (late luteal)'],
  },
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CycleWellnessDashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [currentDay, setCurrentDay] = useState(10)

  const currentPhase = useMemo(() => {
    if (currentDay <= 5) return 'menstrual'
    if (currentDay <= 13) return 'follicular'
    if (currentDay <= 16) return 'ovulation'
    return 'luteal'
  }, [currentDay])

  const phase = CYCLE_PHASES[currentPhase]
  const nutrition = NUTRITION_DATA[currentPhase]
  const exercise = EXERCISE_DATA[currentPhase]

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'nutrition', label: 'Nutrition', icon: '🥗' },
    { id: 'exercise', label: 'Exercise', icon: '🏋️' },
    { id: 'mood', label: 'Mood & Energy', icon: '😊' },
    { id: 'supplements', label: 'Supplements', icon: '💊' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 8px 0' }}>
          {phase.icon} Cycle Wellness Dashboard
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
          Personalized health insights based on your current cycle phase
        </p>
      </div>

      {/* Day Selector */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.8)', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px',
        border: `1px solid ${phase.borderColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Cycle Day</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: phase.color }}>Day {currentDay} — {phase.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Adjust:</span>
            <button onClick={() => setCurrentDay(Math.max(1, currentDay - 1))} style={arrowBtnStyle}>←</button>
            <input
              type="range" min={1} max={28} value={currentDay}
              onChange={(e) => setCurrentDay(parseInt(e.target.value))}
              style={{ width: '200px', accentColor: phase.color }}
            />
            <button onClick={() => setCurrentDay(Math.min(28, currentDay + 1))} style={arrowBtnStyle}>→</button>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Energy</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: phase.color }}>{phase.energyLevel}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Mood</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: phase.color }}>{phase.mood}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Days</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: phase.color }}>{phase.days}</div>
            </div>
          </div>
        </div>

        {/* Cycle progress bar */}
        <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', height: '8px', position: 'relative' }}>
          <div style={{ width: `${(currentDay / 28) * 100}%`, height: '100%', background: phase.color, borderRadius: '8px', transition: 'all 0.3s' }} />
          <div style={{
            position: 'absolute', left: `${(5 / 28) * 100}%`, top: '-2px', width: '2px', height: '12px', background: '#ef4444', opacity: 0.5,
          }} title="Menstrual end" />
          <div style={{
            position: 'absolute', left: `${(14 / 28) * 100}%`, top: '-2px', width: '2px', height: '12px', background: '#f59e0b', opacity: 0.5,
          }} title="Ovulation" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', color: '#64748b' }}>
          <span>🩸 Menstrual</span>
          <span>🌱 Follicular</span>
          <span>✨ Ovulation</span>
          <span>🍂 Luteal</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              border: activeTab === tab.id ? `1px solid ${phase.borderColor}` : '1px solid transparent',
              background: activeTab === tab.id ? phase.bgColor : 'rgba(30, 41, 59, 0.5)',
              color: activeTab === tab.id ? phase.color : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* Phase Info */}
          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 8px 0' }}>
              {phase.icon} {phase.name}
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 12px 0' }}>{phase.description}</p>
            <div style={{ fontSize: '12px', color: '#64748b', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '8px' }}>
              <strong style={{ color: '#94a3b8' }}>Hormones:</strong> {phase.hormones}
            </div>
          </div>

          {/* Today's Tips */}
          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>💡 Today's Tips</h3>
            <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'none' }}>
              {phase.tips.map((tip, i) => (
                <li key={i} style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px', paddingLeft: '12px', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: phase.color }}>•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Stats */}
          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>📊 Quick Stats</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Energy', value: phase.energyLevel, icon: '⚡' },
                { label: 'Mood', value: phase.mood, icon: '😊' },
                { label: 'Hydration', value: nutrition.hydration.split('—')[0].trim(), icon: '💧' },
                { label: 'Exercise', value: exercise.intensity.split('(')[0].trim(), icon: '🏃‍♀️' },
              ].map((stat) => (
                <div key={stat.label} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '16px' }}>{stat.icon}</div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>{stat.label}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: phase.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'nutrition' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 4px 0' }}>
              🥗 {nutrition.focus}
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>Hydration: {nutrition.hydration}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {nutrition.foods.map((food) => (
                <div key={food.name} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px',
                  background: food.priority === 'high' ? phase.bgColor : 'rgba(0,0,0,0.2)',
                  border: food.priority === 'high' ? `1px solid ${phase.borderColor}` : '1px solid transparent',
                }}>
                  <span style={{ fontSize: '18px' }}>{food.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{food.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{food.reason}</div>
                  </div>
                  {food.priority === 'high' && (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: phase.bgColor, color: phase.color, fontWeight: '600' }}>★ Key</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>⚠️ Foods to Limit</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {nutrition.avoid.map((food) => (
                <div key={food} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span style={{ fontSize: '13px', color: '#fca5a5' }}>🚫 {food}</span>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '20px 0 12px 0' }}>💊 Recommended Supplements</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {nutrition.supplements.map((supp) => (
                <span key={supp} style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', background: phase.bgColor, color: phase.color, border: `1px solid ${phase.borderColor}` }}>
                  {supp}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'exercise' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={cardStyle(phase)}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 4px 0' }}>
              🏋️ Recommended Exercises
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>Intensity: {exercise.intensity}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {exercise.recommended.map((ex) => (
                <div key={ex.name} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${exercise.color}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '20px' }}>{ex.icon}</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>{ex.name}</span>
                    <span style={{ fontSize: '11px', color: exercise.color, marginLeft: 'auto' }}>{ex.duration}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{ex.benefit}</p>
                </div>
              ))}
            </div>
          </div>

          {exercise.avoid.length > 0 && (
            <div style={cardStyle(phase)}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>🚫 Avoid</h3>
              {exercise.avoid.map((item) => (
                <div key={item} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#fca5a5' }}>🚫 {item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mood' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <MoodTracker phase={phase} />
          <SleepQuality phase={phase} />
          <HydrationTracker phase={phase} nutrition={nutrition} />
        </div>
      )}

      {activeTab === 'supplements' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <SupplementTracker phase={phase} nutrition={nutrition} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MoodTracker({ phase }) {
  const [selectedMood, setSelectedMood] = useState(null)
  const moods = [
    { emoji: '😊', label: 'Happy', color: '#22c55e' },
    { emoji: '😌', label: 'Calm', color: '#3b82f6' },
    { emoji: '😤', label: 'Irritable', color: '#ef4444' },
    { emoji: '😢', label: 'Sad', color: '#6366f1' },
    { emoji: '💪', label: 'Energetic', color: '#f59e0b' },
    { emoji: '😴', label: 'Tired', color: '#8b5cf6' },
    { emoji: '🧠', label: 'Focused', color: '#06b6d4' },
    { emoji: '🥰', label: 'Loved', color: '#ec4899' },
  ]

  return (
    <div style={cardStyle(phase)}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>😊 How are you feeling?</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {moods.map((mood) => (
          <button
            key={mood.label}
            onClick={() => setSelectedMood(mood.label)}
            style={{
              padding: '12px 8px', borderRadius: '10px', border: selectedMood === mood.label ? `2px solid ${mood.color}` : '2px solid transparent',
              background: selectedMood === mood.label ? `${mood.color}22` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '24px' }}>{mood.emoji}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{mood.label}</div>
          </button>
        ))}
      </div>
      {selectedMood && (
        <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: phase.bgColor, border: `1px solid ${phase.borderColor}` }}>
          <span style={{ fontSize: '13px', color: phase.color }}>
            ✅ Feeling {selectedMood.toLowerCase()} today — {selectedMood === 'Irritable' || selectedMood === 'Sad' ? 'this is normal during the ' + phase.name.toLowerCase() + '. Be gentle with yourself.' : 'great! Your cycle phase supports this energy.'}
          </span>
        </div>
      )}
    </div>
  )
}

function SleepQuality({ phase }) {
  const sleepData = { menstrual: 7.2, follicular: 7.8, ovulation: 7.5, luteal: 6.8 }
  const hours = sleepData[phase.name === CYCLE_PHASES.menstrual.name ? 'menstrual' : phase.name === CYCLE_PHASES.follicular.name ? 'follicular' : phase.name === CYCLE_PHASES.ovulation.name ? 'ovulation' : 'luteal']
  const pct = (hours / 9) * 100

  return (
    <div style={cardStyle(phase)}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>😴 Sleep Quality</h3>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '36px', fontWeight: 'bold', color: phase.color }}>{hours}h</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Recommended avg for this phase</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', height: '12px', marginBottom: '8px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: phase.color, borderRadius: '8px' }} />
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
        {phase.name === 'Luteal' ? 'Progesterone can disrupt sleep — try magnesium before bed.' : phase.name === 'Menstrual' ? 'Cramps may affect sleep — try a heating pad.' : 'Sleep quality is typically good during this phase.'}
      </div>
    </div>
  )
}

function HydrationTracker({ phase, nutrition }) {
  const [glasses, setGlasses] = useState(3)
  const target = 8

  return (
    <div style={cardStyle(phase)}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 12px 0' }}>💧 Hydration</h3>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '36px', fontWeight: 'bold', color: phase.color }}>{glasses}/{target}</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>glasses today (target: {nutrition.hydration})</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {Array.from({ length: target }, (_, i) => (
          <button
            key={i}
            onClick={() => setGlasses(i + 1)}
            style={{
              width: '36px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: i < glasses ? phase.color : 'rgba(255,255,255,0.05)',
              fontSize: '16px', transition: 'all 0.2s',
            }}
          >
            {i < glasses ? '💧' : '○'}
          </button>
        ))}
      </div>
    </div>
  )
}

function SupplementTracker({ phase, nutrition }) {
  const allSupplements = [
    { name: 'Iron', icon: '🔴', phases: ['menstrual'], benefit: 'Replenishes iron lost during menstruation' },
    { name: 'Vitamin C', icon: '🍊', phases: ['menstrual'], benefit: 'Enhances iron absorption' },
    { name: 'Magnesium', icon: '🟣', phases: ['menstrual', 'luteal'], benefit: 'Reduces cramps, improves sleep, calms mood' },
    { name: 'Omega-3', icon: '🐟', phases: ['menstrual', 'follicular'], benefit: 'Anti-inflammatory, supports brain health' },
    { name: 'Probiotics', icon: '🟢', phases: ['follicular'], benefit: 'Supports gut health and immune function' },
    { name: 'B-Complex', icon: '🟡', phases: ['follicular', 'luteal'], benefit: 'Energy production, mood support' },
    { name: 'Zinc', icon: '⚪', phases: ['follicular', 'ovulation'], benefit: 'Supports follicle development and egg quality' },
    { name: 'CoQ10', icon: '🟠', phases: ['ovulation'], benefit: 'Supports egg quality and mitochondrial function' },
    { name: 'Calcium', icon: '🟤', phases: ['luteal'], benefit: 'Reduces PMS symptoms by up to 50%' },
    { name: 'Vitamin B6', icon: '🔵', phases: ['luteal'], benefit: 'Supports serotonin production, reduces mood swings' },
    { name: 'Vitamin D', icon: '☀️', phases: ['menstrual', 'follicular', 'ovulation', 'luteal'], benefit: 'Always beneficial for hormone balance' },
  ]

  const currentPhaseKey = phase.name === CYCLE_PHASES.menstrual.name ? 'menstrual' : phase.name === CYCLE_PHASES.follicular.name ? 'follicular' : phase.name === CYCLE_PHASES.ovulation.name ? 'ovulation' : 'luteal'

  return (
    <div style={cardStyle(phase)}>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: '0 0 4px 0' }}>💊 Supplement Guide</h3>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0' }}>Recommended for {phase.name}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {allSupplements.map((supp) => {
          const isRecommended = supp.phases.includes(currentPhaseKey)
          return (
            <div key={supp.name} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px',
              background: isRecommended ? phase.bgColor : 'rgba(0,0,0,0.15)',
              border: isRecommended ? `1px solid ${phase.borderColor}` : '1px solid transparent',
              opacity: isRecommended ? 1 : 0.5,
            }}>
              <span style={{ fontSize: '20px' }}>{supp.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{supp.name}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{supp.benefit}</div>
              </div>
              {isRecommended && (
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: phase.bgColor, color: phase.color, fontWeight: '700' }}>✓ NOW</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const arrowBtnStyle = {
  width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: '#f8fafc', cursor: 'pointer', fontSize: '14px',
}

function cardStyle(phase) {
  return {
    background: 'rgba(30, 41, 59, 0.8)',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid rgba(255,255,255,0.08)',
  }
}
