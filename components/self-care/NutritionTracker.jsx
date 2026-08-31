'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Check, Flame, TrendingUp } from 'lucide-react'
import {
  NUTRIENTS, detectPhase, getTarget, getNutrientProgress,
  calcNutritionScore, buildWeeklyScores, calcStreak, getWeakestNutrientTip,
  toDateString,
} from '@/lib/nutrition-tracker'

const BG = 'rgba(255,255,255,0.08)'
const BORDER = '1px solid rgba(255,255,255,0.12)'
const TXT = 'rgba(255,255,255,0.95)'
const SOFT = 'rgba(255,255,255,0.65)'

// ─── Nutrient row ────────────────────────────────────────────────────────────

function NutrientRow({ nutrient, value, onChange }) {
  const pct = nutrient.pct
  const met = pct >= 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0' }}>
      <span style={{ fontSize: '1.2rem', width: 28, textAlign: 'center' }}>{nutrient.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: met ? '#34d399' : TXT }}>{nutrient.label}</span>
          <span style={{ fontSize: '0.72rem', color: SOFT }}>{value}/{nutrient.target}{nutrient.unit}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, pct * 100)}%`, height: '100%', borderRadius: 3,
            background: met
              ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
              : `linear-gradient(90deg, ${nutrient.color}88, ${nutrient.color})`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
      <input
        type="number"
        min={0}
        max={nutrient.target * 3}
        step={nutrient.target > 100 ? 50 : 1}
        value={value}
        onChange={(e) => onChange(nutrient.id, Number(e.target.value))}
        style={{
          width: 60, padding: '4px 6px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)', color: TXT, fontSize: '0.8rem', textAlign: 'center',
          outline: 'none',
        }}
        aria-label={`${nutrient.label} intake in ${nutrient.unit}`}
      />
    </div>
  )
}

// ─── Weekly mini chart ───────────────────────────────────────────────────────

function WeeklyMiniChart({ data }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, height: 60 }}>
      {data.map((d) => {
        const h = Math.max(3, (d.score / 100) * 50)
        const isToday = d.date === toDateString()
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: '100%', maxWidth: 28, height: h, borderRadius: '4px 4px 1px 1px',
              background: d.score >= 80 ? 'linear-gradient(180deg, #34d399, #059669)'
                : d.score >= 40 ? 'linear-gradient(180deg, #fbbf24, #f59e0b)'
                : 'rgba(255,255,255,0.12)',
              transition: 'height 0.4s ease',
            }} />
            <span style={{ fontSize: '0.6rem', fontWeight: isToday ? 700 : 400, color: isToday ? '#34d399' : SOFT }}>
              {d.dayLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function NutritionTracker({ lastPeriodStart, cycleLength }) {
  const { isLoaded, isSignedIn } = useAuth()
  const today = toDateString()
  const phase = detectPhase(lastPeriodStart, cycleLength || 28, today)

  const [logged, setLogged] = useState({})
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let off = false
    fetch('/api/nutrition-log?days=30').then((r) => r.json()).then((j) => {
      if (off || !j.success) return
      setHistory(j.data || [])
      const rec = (j.data || []).find((r) => r.date === today)
      if (rec) setLogged(rec.logged || {})
    }).catch(() => {}).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [isLoaded, isSignedIn, today])

  const saveLog = useCallback((next) => {
    setSaving(true)
    fetch('/api/nutrition-log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, logged: next, phase }),
    }).then((r) => r.json()).then(() => {
      setHistory((prev) => {
        const i = prev.findIndex((r) => r.date === today)
        const rec = { date: today, logged: next, phase }
        return i >= 0 ? prev.map((r, idx) => idx === i ? rec : r) : [rec, ...prev]
      })
    }).catch(() => {}).finally(() => setSaving(false))
  }, [today, phase])

  const handleChange = useCallback((id, val) => {
    setLogged((prev) => {
      const next = { ...prev, [id]: val }
      saveLog(next)
      return next
    })
  }, [saveLog])

  const progress = getNutrientProgress(logged, phase)
  const score = calcNutritionScore(logged, phase)
  const weekly = buildWeeklyScores(history, phase, today)
  const streak = calcStreak(history, phase, 0.6, today)
  const tip = getWeakestNutrientTip(logged, phase)

  if (!isLoaded || !isSignedIn) return null

  return (
    <section style={{ background: BG, border: BORDER, borderRadius: 20, padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🥗</span>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: TXT }}>Nutrition Tracker</h2>
        </div>
        {saving && <span style={{ fontSize: '0.7rem', color: SOFT }}>Saving...</span>}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ flex: 1, background: BG, border: BORDER, borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
          <TrendingUp size={16} color={score >= 80 ? '#34d399' : '#fbbf24'} style={{ marginBottom: 2 }} />
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: score >= 80 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171' }}>{score}%</div>
          <div style={{ fontSize: '0.65rem', color: SOFT }}>Today</div>
        </div>
        <div style={{ flex: 1, background: BG, border: BORDER, borderRadius: 12, padding: '0.75rem', textAlign: 'center' }}>
          <Flame size={16} color="#FF7043" style={{ marginBottom: 2 }} />
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#FF7043' }}>{streak}d</div>
          <div style={{ fontSize: '0.65rem', color: SOFT }}>Streak</div>
        </div>
      </div>

      {/* Weekly chart */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '0.72rem', fontWeight: 600, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>This Week</h3>
        <WeeklyMiniChart data={weekly} />
      </div>

      {/* Nutrient inputs */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }} />)}
        </div>
      ) : (
        <div>
          {progress.map((n) => (
            <NutrientRow key={n.id} nutrient={n} value={logged[n.id] || 0} onChange={handleChange} />
          ))}
        </div>
      )}

      {/* Tip */}
      {tip && (
        <div style={{ marginTop: '1rem', padding: '0.7rem 0.9rem', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: SOFT, lineHeight: 1.5 }}>💡 {tip}</p>
        </div>
      )}
    </section>
  )
}
