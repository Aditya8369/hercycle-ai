'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Check, Flame, Star, Target, TrendingUp } from 'lucide-react'
import {
  CYCLE_PHASES, detectPhase, getGoalsForPhase, getPhaseTip,
  calcWellnessScore, calcStreak, buildWeeklySummary, getLatestMilestone,
  toDateString, CATEGORIES,
} from '@/lib/wellness-goals'

const PINK = '#e8527e', MAUVE = '#9d3f7a', ACCENT = '#c084fc'
const BG = 'rgba(255,255,255,0.08)', BORDER = '1px solid rgba(255,255,255,0.12)'
const TXT = 'rgba(255,255,255,0.95)', SOFT = 'rgba(255,255,255,0.65)'

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: BG, border: BORDER, borderRadius: 14, padding: '1rem', textAlign: 'center' }}>
      <div style={{ marginBottom: '0.4rem' }}>{icon}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || PINK }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: SOFT, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function GoalItem({ goal, checked, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={checked} className="wellness-goal-item" style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem 1rem',
      background: checked ? 'rgba(232,82,126,0.12)' : 'rgba(255,255,255,0.04)',
      border: checked ? `1px solid ${PINK}44` : BORDER, borderRadius: 12,
      cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        border: checked ? 'none' : '2px solid rgba(255,255,255,0.25)',
        background: checked ? `linear-gradient(135deg, ${PINK}, ${MAUVE})` : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
      }}>
        {checked && <Check size={14} color="white" strokeWidth={3} />}
      </div>
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{goal.icon}</span>
      <div>
        <div style={{
          fontSize: '0.88rem', fontWeight: 600, color: TXT,
          textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.7 : 1,
        }}>{goal.label}</div>
        <div style={{ fontSize: '0.7rem', color: SOFT }}>
          {CATEGORIES[goal.cat]?.icon} {CATEGORIES[goal.cat]?.label}
        </div>
      </div>
    </button>
  )
}

function WeeklyChart({ data }) {
  return (
    <div className="wellness-weekly-chart" style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: '0.35rem', height: 100, padding: '0 4px',
    }}>
      {data.map((d) => {
        const h = Math.max(2, (d.rate / 100) * 80)
        const isToday = d.date === toDateString()
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: '100%', maxWidth: 36, height: h, borderRadius: '6px 6px 2px 2px',
              background: d.rate >= 80 ? `linear-gradient(180deg, ${PINK}, ${MAUVE})`
                : d.rate >= 40 ? `linear-gradient(180deg, ${ACCENT}88, ${MAUVE}66)` : 'rgba(255,255,255,0.12)',
              transition: 'height 0.4s ease',
            }} />
            <span style={{ fontSize: '0.65rem', fontWeight: isToday ? 700 : 400, color: isToday ? PINK : SOFT }}>
              {d.dayLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function WeeklyGoalTracker({ lastPeriodStart, cycleLength }) {
  const { isLoaded, isSignedIn } = useAuth()
  const today = toDateString()
  const phase = detectPhase(lastPeriodStart, cycleLength || 28, today)
  const info = CYCLE_PHASES[phase] || CYCLE_PHASES.follicular
  const goals = getGoalsForPhase(phase)
  const allIds = goals.map((g) => g.id)
  const tip = getPhaseTip(phase)

  const [completed, setCompleted] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let off = false
    fetch('/api/wellness-goals?days=30').then((r) => r.json()).then((j) => {
      if (off || !j.success) return
      setHistory(j.data || [])
      const rec = (j.data || []).find((r) => r.date === today)
      if (rec) setCompleted(rec.completed || [])
    }).catch(() => {}).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [isLoaded, isSignedIn, today])

  const saveGoals = useCallback((next) => {
    setSaving(true)
    fetch('/api/wellness-goals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, completed: next, phase }),
    }).then((r) => r.json()).then(() => {
      setHistory((prev) => {
        const i = prev.findIndex((r) => r.date === today)
        const rec = { date: today, completed: next, phase }
        return i >= 0 ? prev.map((r, idx) => idx === i ? rec : r) : [rec, ...prev]
      })
    }).catch(() => {}).finally(() => setSaving(false))
  }, [today, phase])

  const toggle = useCallback((id) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      saveGoals(next); return next
    })
  }, [saveGoals])

  const score = calcWellnessScore(completed, goals)
  const { streak } = calcStreak(history, allIds, 0.5, today)
  const milestone = getLatestMilestone(streak)
  const weekly = buildWeeklySummary(history, allIds, today)

  if (!isLoaded || !isSignedIn) return null

  return (
    <section className="wellness-goal-tracker" style={{
      background: BG, border: BORDER, borderRadius: 20, padding: '1.5rem', backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 4 }}>
            <Target size={20} color={ACCENT} strokeWidth={1.5} />
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: TXT }}>Weekly Wellness Goals</h2>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20,
            background: `${info.color}22`, border: `1px solid ${info.color}44`,
            fontSize: '0.78rem', fontWeight: 600, color: info.color,
          }}>
            <span>{info.icon}</span> {info.label}
          </div>
        </div>
        {saving && <span style={{ fontSize: '0.72rem', color: SOFT }}>Saving...</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <StatCard icon={<TrendingUp size={20} color={ACCENT} />} label="Today's Score"
          value={`${score}%`} color={score >= 80 ? '#66BB6A' : score >= 40 ? ACCENT : PINK} />
        <StatCard icon={<Flame size={20} color="#FF7043" />} label="Streak" value={`${streak}d`} color="#FF7043" />
        <StatCard icon={milestone ? <span style={{ fontSize: '1.2rem' }}>{milestone.icon}</span> : <Star size={20} color={SOFT} />}
          label={milestone ? milestone.label : 'No Milestone'} value={milestone ? '✓' : '—'} color={milestone ? '#FFA726' : SOFT} />
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>This Week</h3>
        <WeeklyChart data={weekly} />
      </div>

      <div>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Today&apos;s Goals ({completed.length}/{goals.length})
        </h3>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map((i) => <div key={i} style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((g) => <GoalItem key={g.id} goal={g} checked={completed.includes(g.id)} onToggle={() => toggle(g.id)} />)}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: SOFT, lineHeight: 1.5 }}>
          💡 <strong style={{ color: TXT }}>Phase tip:</strong> {tip}
        </p>
      </div>
    </section>
  )
}
