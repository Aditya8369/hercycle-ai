'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Droplets, TrendingUp, ChevronRight, AlertCircle } from 'lucide-react'
import { PHASE_LABELS, PHASE_COLORS, PHASE_ICONS, getRecommendations } from '@/lib/nutrition'

const CARD_BG = 'rgba(255, 255, 255, 0.08)'
const CARD_BORDER = '1px solid rgba(255, 255, 255, 0.14)'
const TEXT_PRIMARY = '#ffffff'
const TEXT_SOFT = 'rgba(255, 255, 255, 0.65)'

/**
 * PhaseRecommendations — renders the current cycle phase's nutrition guidance.
 * Fetches from /api/nutrition/recommendations, falling back to client-side data.
 */
export default function PhaseRecommendations() {
  const { isLoaded, isSignedIn } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedFood, setExpandedFood] = useState(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const fallback = {
      phase: 'menstrual', label: PHASE_LABELS.menstrual,
      color: PHASE_COLORS.menstrual, icon: PHASE_ICONS.menstrual,
      recommendations: getRecommendations('menstrual'), averageCycleLength: 28,
    }

    fetch('/api/nutrition/recommendations')
      .then(r => r.json())
      .then(json => json.success && json.data ? setData(json.data) : setData(fallback))
      .catch(() => setError('Could not load recommendations'))
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn])

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {[1, 2, 3].map(i => <div key={i} className="chart-skeleton-box" style={{ height: 160, borderRadius: 16 }} />)}
      </div>
    )
  }

  if (!data) return null
  const rec = data.recommendations
  const phaseColor = data.color || PHASE_COLORS[data.phase]

  return (
    <div>
      {/* Phase Header Card */}
      <div style={{ background: CARD_BG, border: CARD_BORDER, borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '2rem' }}>{data.icon}</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: TEXT_PRIMARY }}>{rec.title}</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: TEXT_SOFT }}>{rec.subtitle}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <Pill icon={<Droplets size={14} />} text={`${rec.waterLitres}L water/day`} color={phaseColor} />
          <Pill icon={<TrendingUp size={14} />} text={rec.calorieAdjustment === 0 ? 'Base calories' : `+${rec.calorieAdjustment} cal`} color={phaseColor} />
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: TEXT_SOFT, fontStyle: 'italic', lineHeight: 1.5 }}>
          💡 {rec.tip}
        </p>
      </div>

      {error && <div style={{ color: '#f59e0b', fontSize: '0.82rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={14} /> {error}</div>}

      {/* Nutrient Priorities */}
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: TEXT_PRIMARY, marginBottom: '0.5rem' }}>Key Nutrients</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {rec.nutrientPriorities.map(n => (
          <span key={n} style={{ background: `${phaseColor}22`, color: phaseColor, border: `1px solid ${phaseColor}44`, borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600 }}>{n}</span>
        ))}
      </div>

      {/* Food Recommendations */}
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: TEXT_PRIMARY, marginBottom: '0.5rem' }}>Recommended Foods</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {rec.foods.map((food, i) => (
          <div key={i} onClick={() => setExpandedFood(expandedFood === i ? null : i)} style={{
            background: expandedFood === i ? `${phaseColor}10` : CARD_BG,
            border: expandedFood === i ? `1px solid ${phaseColor}44` : CARD_BORDER,
            borderRadius: 12, padding: '0.85rem 1rem', cursor: 'pointer', transition: 'all 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.3rem' }}>{food.icon}</span>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: TEXT_PRIMARY }}>{food.name}</div>
                  <div style={{ fontSize: '0.72rem', color: phaseColor }}>{food.category}</div>
                </div>
              </div>
              <ChevronRight size={16} style={{ color: TEXT_SOFT, transform: expandedFood === i ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            {expandedFood === i && <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: TEXT_SOFT, lineHeight: 1.4, paddingLeft: '2rem' }}>{food.benefit}</p>}
          </div>
        ))}
      </div>

      {/* Foods to Limit */}
      <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: '1rem 1.25rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.4rem' }}>⚠️ Limit During This Phase</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {rec.avoid.map(item => (
            <span key={item} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', borderRadius: 8, padding: '3px 10px', fontSize: '0.76rem' }}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pill({ icon, text, color }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${color}15`, border: `1px solid ${color}33`, borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', color, fontWeight: 600 }}>{icon} {text}</div>
}
