'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { UtensilsCrossed, Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { THEME_COLORS, THEME_SURFACES, THEME_TEXT } from '@/lib/theme-constants'

const PINK = THEME_COLORS.pink
const CARD_BG = THEME_SURFACES.cardBg
const CARD_BORDER = THEME_SURFACES.cardBorder
const TEXT_PRIMARY = THEME_TEXT.primary

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
  { key: 'snack', label: 'Snack', icon: '🍎' },
]

const QUICK_ADD = [
  { name: 'Rice & Dal', calories: 350 },
  { name: 'Roti & Sabzi', calories: 280 },
  { name: 'Idli Sambar', calories: 250 },
  { name: 'Poha', calories: 180 },
  { name: 'Egg Bhurji', calories: 210 },
  { name: 'Sprout Salad', calories: 150 },
]

const inputStyle = {
  width: '100%', padding: '8px 12px', marginBottom: '0.5rem',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#fff', fontSize: '0.85rem', outline: 'none',
}

/**
 * MealLogForm — inline form for logging daily meals and water intake.
 */
export default function MealLogForm({ onLogSaved }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [mealType, setMealType] = useState('breakfast')
  const [foodName, setFoodName] = useState('')
  const [calories, setCalories] = useState('')
  const [waterLitres, setWaterLitres] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!foodName.trim()) return toast.error('Please enter a food name')
    setSaving(true)
    try {
      const res = await fetch('/api/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, meal_type: mealType, food_name: foodName.trim(), calories: calories ? Number(calories) : null, notes: notes.trim() || null }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`${foodName} logged! 🍽️`)
        setFoodName(''); setCalories(''); setNotes('')
        onLogSaved?.()
      } else toast.error(json.error || 'Failed to save')
    } catch { toast.error('Network error') } finally { setSaving(false) }
  }

  const handleWater = async (amount) => {
    setSaving(true)
    try {
      const res = await fetch('/api/nutrition', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, meal_type: 'water', food_name: 'Water', calories: 0, notes: `${waterLitres + amount}L total` }),
      })
      const json = await res.json()
      if (json.success) { setWaterLitres(prev => prev + amount); toast.success(`+${amount}L water 💧`) }
    } catch { toast.error('Could not log water') } finally { setSaving(false) }
  }

  return (
    <div>
      {/* Water Tracker */}
      <div style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: 16, padding: '1.25rem', marginBottom: '1rem', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: TEXT_PRIMARY }}>💧 Water Intake</h3>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa' }}>{waterLitres.toFixed(2)}L</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[0.25, 0.5, 1.0].map(amt => (
            <button key={amt} onClick={() => handleWater(amt)} disabled={saving}
              style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 10, padding: '6px 14px', color: '#93c5fd', fontSize: '0.78rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              +{amt}L
            </button>
          ))}
        </div>
        <div style={{ marginTop: '0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min((waterLitres / 2.5) * 100, 100)}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 8, transition: 'width 0.3s' }} />
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: THEME_TEXT.faint }}>Goal: 2.5L per day</p>
      </div>

      {/* Meal Log Form */}
      <form onSubmit={handleSubmit} style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: 16, padding: '1.25rem', backdropFilter: 'blur(12px)' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600, color: TEXT_PRIMARY, display: 'flex', alignItems: 'center', gap: 8 }}>
          <UtensilsCrossed size={18} color={PINK} /> Log a Meal
        </h3>

        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {MEAL_TYPES.map(mt => (
            <button key={mt.key} type="button" onClick={() => setMealType(mt.key)}
              style={{ background: mealType === mt.key ? `${PINK}25` : 'rgba(255,255,255,0.05)', border: mealType === mt.key ? `1px solid ${PINK}66` : '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '5px 12px', color: mealType === mt.key ? PINK : TEXT_PRIMARY, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              {mt.icon} {mt.label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: THEME_TEXT.faint }}>Quick add:</p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {QUICK_ADD.map(f => (
              <button key={f.name} type="button" onClick={() => { setFoodName(f.name); setCalories(String(f.calories)) }}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '3px 10px', color: THEME_TEXT.soft, fontSize: '0.72rem', cursor: 'pointer' }}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <input type="text" value={foodName} onChange={e => setFoodName(e.target.value)} placeholder="What did you eat?" style={inputStyle} />
        <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="Estimated calories (optional)" style={inputStyle} min="0" max="5000" />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        <button type="submit" disabled={saving || !foodName.trim()}
          style={{ width: '100%', background: saving ? '#9d3f7a' : `linear-gradient(135deg, ${PINK}, #9d3f7a)`, border: 'none', borderRadius: 12, padding: '10px 0', color: '#fff', fontSize: '0.88rem', fontWeight: 700, cursor: saving || !foodName.trim() ? 'not-allowed' : 'pointer', opacity: !foodName.trim() && !saving ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {saving ? 'Saving...' : 'Log Meal'}
        </button>
      </form>
    </div>
  )
}
