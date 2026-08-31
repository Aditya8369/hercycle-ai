'use client'

import { useState, useMemo } from 'react'
import {
  Moon, Sun, Cloud, Star, Clock, TrendingUp, TrendingDown, Zap,
  Heart, Brain, Battery, Thermometer, Droplets, Wind, Target,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Info,
  BarChart3, Calendar, Activity, Award, Sparkles, Shield,
  Coffee, Bed, Timer, Flame, ArrowRight, RefreshCw, Eye
} from 'lucide-react'

// ─── Data ─────────────────────────────────────────────────────────

const CYCLE_PHASES = {
  menstrual: { name: 'Menstrual', days: '1-5', color: '#ef4444', icon: '🩸', sleepNeed: 8.5, quality: 72, tips: 'Extra rest recommended, iron-rich foods before bed' },
  follicular: { name: 'Follicular', days: '6-13', color: '#10b981', icon: '🌱', sleepNeed: 7.5, quality: 88, tips: 'Peak energy — great for early wake-ups and new routines' },
  ovulation: { name: 'Ovulation', days: '14-16', color: '#f59e0b', icon: '✨', sleepNeed: 7.0, quality: 85, tips: 'Slightly elevated temperature may affect sleep comfort' },
  luteal: { name: 'Luteal', days: '17-28', color: '#8b5cf6', icon: '🌙', sleepNeed: 8.0, quality: 68, tips: 'Progesterone causes sleepiness — prioritize sleep hygiene' }
}

const SLEEP_LOG = [
  { date: '2025-08-28', bedTime: '10:30 PM', wakeTime: '6:45 AM', total: 8.25, deep: 1.8, light: 4.5, rem: 1.95, awake: 0.3, quality: 82, phase: 'follicular', notes: 'Good night, felt rested', mood: '😊', disturbances: 0 },
  { date: '2025-08-27', bedTime: '11:15 PM', wakeTime: '7:00 AM', total: 7.75, deep: 1.5, light: 4.2, rem: 1.8, awake: 0.25, quality: 75, phase: 'menstrual', notes: 'Cramps woke me briefly', mood: '😐', disturbances: 1 },
  { date: '2025-08-26', bedTime: '10:00 PM', wakeTime: '6:30 AM', total: 8.5, deep: 2.1, light: 4.6, rem: 1.6, awake: 0.2, quality: 88, phase: 'menstrual', notes: 'Slept deeply, heating pad helped', mood: '😊', disturbances: 0 },
  { date: '2025-08-25', bedTime: '10:45 PM', wakeTime: '7:15 AM', total: 8.5, deep: 1.9, light: 4.7, rem: 1.7, awake: 0.2, quality: 85, phase: 'menstrual', notes: 'Cozy night', mood: '😊', disturbances: 0 },
  { date: '2025-08-24', bedTime: '11:30 PM', wakeTime: '8:00 AM', total: 8.5, deep: 1.6, light: 4.8, rem: 2.0, awake: 0.1, quality: 78, phase: 'menstrual', notes: 'Slept late, still tired', mood: '😴', disturbances: 0 },
  { date: '2025-08-23', bedTime: '10:15 PM', wakeTime: '6:15 AM', total: 8.0, deep: 1.7, light: 4.3, rem: 1.8, awake: 0.2, quality: 80, phase: 'follicular', notes: 'Woke up naturally', mood: '😊', disturbances: 0 },
  { date: '2025-08-22', bedTime: '10:45 PM', wakeTime: '6:30 AM', total: 7.75, deep: 1.4, light: 4.0, rem: 2.1, awake: 0.25, quality: 76, phase: 'follicular', notes: 'Vivid dreams', mood: '😐', disturbances: 1 }
]

const WEEKLY_DATA = [
  { week: 'Week 1 (Mens.)', avgQuality: 74, avgDeep: 1.7, avgREM: 1.8, avgTotal: 8.4, avgDisturbances: 0.3, phase: 'menstrual' },
  { week: 'Week 2 (Foll.)', avgQuality: 87, avgDeep: 2.0, avgREM: 1.7, avgTotal: 7.8, avgDisturbances: 0.1, phase: 'follicular' },
  { week: 'Week 3 (Ovul.)', avgQuality: 83, avgDeep: 1.8, avgREM: 1.9, avgTotal: 7.5, avgDisturbances: 0.2, phase: 'ovulation' },
  { week: 'Week 4 (Luteal)', avgQuality: 66, avgDeep: 1.3, avgREM: 1.5, avgTotal: 8.2, avgDisturbances: 0.8, phase: 'luteal' }
]

const RECOVERY_ACTIVITIES = [
  { id: 1, name: 'Gentle Yoga', phase: 'menstrual', duration: '20 min', impact: 15, icon: '🧘', description: 'Restorative poses to ease cramps and promote relaxation', bestTime: 'Evening' },
  { id: 2, name: 'Progressive Muscle Relaxation', phase: 'luteal', duration: '15 min', impact: 20, icon: '💆', description: 'Tense and release muscle groups to reduce PMS tension', bestTime: 'Before bed' },
  { id: 3, name: 'Meditation', phase: 'all', duration: '10 min', impact: 18, icon: '🧠', description: 'Guided breathing meditation for stress reduction', bestTime: 'Morning or evening' },
  { id: 4, name: 'Warm Bath', phase: 'menstrual', duration: '20 min', impact: 22, icon: '🛁', description: 'Epsom salt bath with lavender for muscle relaxation', bestTime: '1 hour before bed' },
  { id: 5, name: 'Journaling', phase: 'luteal', duration: '10 min', impact: 12, icon: '📝', description: 'Brain dump to clear mind before sleep', bestTime: 'Before bed' },
  { id: 6, name: 'Light Walking', phase: 'follicular', duration: '30 min', impact: 16, icon: '🚶', description: 'Nature walk to boost serotonin and regulate circadian rhythm', bestTime: 'Morning' },
  { id: 7, name: 'HIIT Workout', phase: 'follicular', duration: '25 min', impact: 25, icon: '🔥', description: 'High-intensity training during peak energy phase', bestTime: 'Morning' },
  { id: 8, name: 'Breathwork', phase: 'all', duration: '5 min', impact: 14, icon: '🌬️', description: '4-7-8 breathing technique for sleep onset', bestTime: 'In bed' },
  { id: 9, name: 'Stretching', phase: 'ovulation', duration: '15 min', impact: 12, icon: '🤸', description: 'Full-body stretch routine, avoid overstretching joints', bestTime: 'Afternoon' },
  { id: 10, name: 'Cold Shower', phase: 'follicular', duration: '3 min', impact: 18, icon: '🧊', description: 'Cold exposure to boost alertness and dopamine', bestTime: 'Morning' }
]

const SLEEP_HYGIENE_TIPS = [
  { title: 'Consistent Sleep Schedule', description: 'Go to bed and wake up at the same time, even on weekends. This regulates your circadian rhythm.', importance: 10, phase: 'all', icon: '⏰' },
  { title: 'Cool Bedroom (65-68°F)', description: 'Your body temperature rises during ovulation and luteal phase — keep the room cooler.', importance: 9, phase: 'luteal', icon: '🌡️' },
  { title: 'Limit Screen Time', description: 'Blue light suppresses melatonin. Stop screens 1 hour before bed, especially during the luteal phase when sleep is more fragile.', importance: 9, phase: 'luteal', icon: '📱' },
  { title: 'Magnesium Supplement', description: 'Helps with muscle relaxation and sleep quality. Especially beneficial during menstruation and luteal phase.', importance: 8, phase: 'menstrual', icon: '💊' },
  { title: 'Avoid Caffeine After 2 PM', description: 'Caffeine sensitivity may increase during the luteal phase due to hormonal changes.', importance: 8, phase: 'luteal', icon: '☕' },
  { title: 'Evening Wind-Down Routine', description: 'Create a 30-60 minute routine: dim lights, gentle stretching, reading, or meditation.', importance: 9, phase: 'all', icon: '🌙' },
  { title: 'Herbal Tea Before Bed', description: 'Chamomile, valerian root, or passionflower tea can promote relaxation and sleep onset.', importance: 7, phase: 'menstrual', icon: '🍵' },
  { title: 'Heating Pad for Cramps', description: 'Using a heating pad during menstruation can relieve cramps that disrupt sleep.', importance: 8, phase: 'menstrual', icon: '🔥' }
]

// ─── Helpers ──────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px',
      border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '14px'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}><Icon size={24} color={color} /></div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</div>
        {sub && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

function ScoreGauge({ score, size = 120, label }) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference * 0.75
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B+' : score >= 60 ? 'B' : score >= 50 ? 'C' : 'D'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: size * 0.24, fontWeight: 800, color: '#fff' }}>{score}</div>
          <div style={{ fontSize: size * 0.12, color, fontWeight: 700 }}>{grade}</div>
        </div>
      </div>
      {label && <div style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</div>}
    </div>
  )
}

function SleepBar({ label, value, max, color, unit = 'hrs' }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color }}>{value}{unit}</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function PhaseCard({ phase, data, isCurrent }) {
  return (
    <div style={{
      background: isCurrent ? `${data.color}15` : 'rgba(255,255,255,0.03)',
      borderRadius: '14px', padding: '18px',
      border: `1px solid ${isCurrent ? data.color + '40' : 'rgba(255,255,255,0.06)'}`,
      position: 'relative'
    }}>
      {isCurrent && (
        <div style={{
          position: 'absolute', top: '10px', right: '10px',
          background: data.color, color: '#fff', fontSize: '10px',
          padding: '3px 8px', borderRadius: '6px', fontWeight: 600
        }}>Current</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '24px' }}>{data.icon}</span>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{data.name}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Days {data.days}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: data.color }}>{data.sleepNeed}h</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Sleep Need</div>
        </div>
        <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: data.quality >= 80 ? '#10b981' : '#f59e0b' }}>{data.quality}%</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Avg Quality</div>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5, padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
        💡 {data.tips}
      </div>
    </div>
  )
}

function ActivityCard({ activity, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '16px',
      border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '24px' }}>{activity.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{activity.name}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{activity.duration} · {activity.bestTime}</div>
        </div>
        <div style={{
          padding: '4px 8px', borderRadius: '6px',
          background: activity.phase === 'all' ? '#6366f120' : `${CYCLE_PHASES[activity.phase]?.color}20`,
          color: activity.phase === 'all' ? '#818cf8' : CYCLE_PHASES[activity.phase]?.color,
          fontSize: '11px', fontWeight: 600, textTransform: 'capitalize'
        }}>{activity.phase === 'all' ? 'Any Phase' : CYCLE_PHASES[activity.phase]?.name}</div>
      </div>
      <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>{activity.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Sleep Impact:</span>
        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
          <div style={{ width: `${activity.impact * 4}%`, height: '100%', background: '#10b981', borderRadius: '2px' }} />
        </div>
        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>+{activity.impact}%</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export default function SleepRecoveryTracker() {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedDay, setSelectedDay] = useState(null)
  const [currentPhase, setCurrentPhase] = useState('follicular')

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Moon },
    { id: 'log', label: 'Sleep Log', icon: Clock },
    { id: 'phases', label: 'Phase Analysis', icon: Calendar },
    { id: 'recovery', label: 'Recovery Activities', icon: Zap },
    { id: 'tips', label: 'Sleep Hygiene', icon: Shield }
  ]

  const avgStats = useMemo(() => {
    const avg = (arr, key) => arr.reduce((s, d) => s + d[key], 0) / arr.length
    return {
      quality: Math.round(avg(SLEEP_LOG, 'quality')),
      total: avg(SLEEP_LOG, 'total').toFixed(1),
      deep: avg(SLEEP_LOG, 'deep').toFixed(1),
      rem: avg(SLEEP_LOG, 'rem').toFixed(1),
      light: avg(SLEEP_LOG, 'light').toFixed(1),
      disturbances: avg(SLEEP_LOG, 'disturbances').toFixed(1)
    }
  }, [])

  const recoveryScore = useMemo(() => {
    const qualityScore = avgStats.quality
    const deepScore = (parseFloat(avgStats.deep) / 2.5) * 100
    const consistencyScore = 85
    const disturbancePenalty = parseFloat(avgStats.disturbances) * 15
    return Math.round(Math.min(100, (qualityScore * 0.4 + deepScore * 0.3 + consistencyScore * 0.3) - disturbancePenalty))
  }, [avgStats])

  const currentPhaseData = CYCLE_PHASES[currentPhase]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#fff', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px' }}>
              😴 Sleep & Recovery Tracker
            </h1>
            <p style={{ fontSize: '16px', color: '#94a3b8', margin: '0' }}>
              Cycle-aware sleep optimization — track, analyze, and improve your rest
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Current Phase:</span>
            <select value={currentPhase} onChange={e => setCurrentPhase(e.target.value)} style={{
              background: `${currentPhaseData.color}20`, borderRadius: '10px',
              padding: '8px 14px', color: currentPhaseData.color, border: `1px solid ${currentPhaseData.color}40`,
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', outline: 'none'
            }}>
              {Object.entries(CYCLE_PHASES).map(([key, p]) => (
                <option key={key} value={key}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <KPICard icon={Moon} label="Avg Sleep Quality" value={`${avgStats.quality}%`} color="#6366f1"
            sub={avgStats.quality >= 80 ? '↑ Excellent' : avgStats.quality >= 70 ? '→ Good' : '↓ Needs improvement'} />
          <KPICard icon={Clock} label="Avg Sleep Duration" value={`${avgStats.total}h`} color="#ec4899"
            sub={`${parseFloat(avgStats.total) >= currentPhaseData.sleepNeed ? '✓' : '✗'} Need: ${currentPhaseData.sleepNeed}h`} />
          <KPICard icon={Battery} label="Recovery Score" value={`${recoveryScore}%`} color="#10b981"
            sub={recoveryScore >= 80 ? '🏆 Great recovery' : '💪 Keep improving'} />
          <KPICard icon={Thermometer} label="Avg Deep Sleep" value={`${avgStats.deep}h`} color="#f59e0b"
            sub={`REM: ${avgStats.rem}h · Light: ${avgStats.light}h`} />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)',
          borderRadius: '14px', padding: '4px', marginBottom: '24px',
          border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto'
        }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedDay(null) }} style={{
              flex: 1, padding: '10px 16px', borderRadius: '10px',
              background: activeTab === tab.id ? '#6366f1' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#94a3b8',
              border: 'none', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.2s'
            }}><tab.icon size={16} /> {tab.label}</button>
          ))}
        </div>

        {/* ═══ Overview Tab ═══ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <ScoreGauge score={recoveryScore} size={160} label="Recovery Score" />
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px' }}>📊 7-Day Breakdown</h4>
                <SleepBar label="Deep Sleep" value={parseFloat(avgStats.deep)} max={3} color="#6366f1" />
                <SleepBar label="REM Sleep" value={parseFloat(avgStats.rem)} max={3} color="#ec4899" />
                <SleepBar label="Light Sleep" value={parseFloat(avgStats.light)} max={6} color="#f59e0b" />
                <SleepBar label="Awake" value={parseFloat(avgStats.disturbances) * 0.2} max={1} color="#ef4444" />
              </div>
            </div>
            <div>
              {/* Weekly phase comparison */}
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px' }}>📈 Sleep by Cycle Phase (Last Month)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {WEEKLY_DATA.map((w, i) => {
                  const phase = CYCLE_PHASES[w.phase]
                  return (
                    <div key={i} style={{
                      background: `${phase.color}10`, borderRadius: '14px', padding: '16px',
                      border: `1px solid ${phase.color}25`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                        <span>{phase.icon}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: phase.color }}>{phase.name}</span>
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{w.avgQuality}%</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>Avg Quality</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Duration: <strong style={{ color: '#fff' }}>{w.avgTotal}h</strong></div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Deep: <strong style={{ color: '#6366f1' }}>{w.avgDeep}h</strong></div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>REM: <strong style={{ color: '#ec4899' }}>{w.avgREM}h</strong></div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Wakes: <strong style={{ color: '#ef4444' }}>{w.avgDisturbances}</strong></div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Sleep trend chart */}
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 14px' }}>📉 7-Night Trend</h3>
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <svg width="100%" height="180" viewBox="0 0 700 180">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map(y => (
                    <line key={y} x1="40" y1={160 - y * 1.4} x2="680" y2={160 - y * 1.4}
                      stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  ))}
                  {/* Quality line */}
                  <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    points={SLEEP_LOG.slice().reverse().map((d, i) => `${60 + i * 100},${160 - d.quality * 1.4}`).join(' ')} />
                  {/* Deep sleep bars */}
                  {SLEEP_LOG.slice().reverse().map((d, i) => (
                    <rect key={i} x={50 + i * 100} y={160 - d.deep * 50} width="30" height={d.deep * 50}
                      fill="#6366f130" rx="4" />
                  ))}
                  {/* REM line */}
                  <polyline fill="none" stroke="#ec4899" strokeWidth="2" strokeDasharray="4 4"
                    points={SLEEP_LOG.slice().reverse().map((d, i) => `${60 + i * 100},${160 - d.rem * 50}`).join(' ')} />
                  {/* Labels */}
                  {SLEEP_LOG.slice().reverse().map((d, i) => (
                    <text key={i} x={60 + i * 100} y={178} textAnchor="middle"
                      fill="#64748b" fontSize="10">
                      {d.date.slice(5)}
                    </text>
                  ))}
                  {/* Legend */}
                  <circle cx="450" cy="12" r="4" fill="#6366f1" />
                  <text x="460" y="16" fill="#94a3b8" fontSize="10">Quality %</text>
                  <rect x="530" y="8" width="12" height="8" fill="#6366f130" rx="2" />
                  <text x="548" y="16" fill="#94a3b8" fontSize="10">Deep (h)</text>
                  <line x1="600" y1="12" x2="620" y2="12" stroke="#ec4899" strokeWidth="2" strokeDasharray="4 4" />
                  <text x="626" y="16" fill="#94a3b8" fontSize="10">REM (h)</text>
                </svg>
              </div>
              {/* Insights */}
              <div style={{
                background: 'linear-gradient(135deg, #6366f110, #8b5cf610)',
                borderRadius: '16px', padding: '20px', border: '1px solid #6366f130',
                marginTop: '20px'
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="#6366f1" /> AI Insights
                </h4>
                {[
                  { icon: '🌙', text: 'Your sleep quality drops 21% during the luteal phase. Consider earlier bedtimes during this phase.', type: 'warning' },
                  { icon: '💪', text: 'Deep sleep is 30% higher during menstruation — your body is recovering well.', type: 'positive' },
                  { icon: '⚡', text: 'Follicular phase shows your best sleep efficiency (92%). Try maintaining this routine year-round.', type: 'info' },
                  { icon: '🎯', text: 'Bedtime consistency improved 15% this month. Keep it up!', type: 'positive' }
                ].map((insight, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', padding: '10px 0',
                    borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}>
                    <span style={{ fontSize: '16px' }}>{insight.icon}</span>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>{insight.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Sleep Log Tab ═══ */}
        {activeTab === 'log' && !selectedDay && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {SLEEP_LOG.map((entry, i) => {
              const phase = CYCLE_PHASES[entry.phase]
              return (
                <div key={i} onClick={() => setSelectedDay(entry)} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: '14px', padding: '18px',
                  marginBottom: '10px', border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px'
                }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: `${phase.color}15`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '20px', flexDirection: 'column'
                  }}>
                    <span>{entry.mood}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{entry.date}</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: `${phase.color}15`, color: phase.color, fontWeight: 600
                      }}>{phase.name}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      🛏️ {entry.bedTime} → ⏰ {entry.wakeTime} · {entry.total}h total
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '20px', fontWeight: 800,
                      color: entry.quality >= 80 ? '#10b981' : entry.quality >= 60 ? '#f59e0b' : '#ef4444'
                    }}>{entry.quality}%</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>quality</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Day Detail ═══ */}
        {activeTab === 'log' && selectedDay && (
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <button onClick={() => setSelectedDay(null)} style={{
              background: 'none', border: 'none', color: '#6366f1',
              fontSize: '13px', cursor: 'pointer', marginBottom: '16px'
            }}>← Back to log</button>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '20px',
              padding: '32px', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <span style={{ fontSize: '40px' }}>{selectedDay.mood}</span>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 800 }}>{selectedDay.date}</div>
                  <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                    🛏️ {selectedDay.bedTime} → ⏰ {selectedDay.wakeTime}
                  </div>
                  <div style={{
                    display: 'inline-block', marginTop: '4px', padding: '3px 8px', borderRadius: '6px',
                    background: `${CYCLE_PHASES[selectedDay.phase].color}20`,
                    color: CYCLE_PHASES[selectedDay.phase].color,
                    fontSize: '12px', fontWeight: 600
                  }}>{CYCLE_PHASES[selectedDay.phase].icon} {CYCLE_PHASES[selectedDay.phase].name} Phase</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Total Sleep', value: `${selectedDay.total}h`, color: '#6366f1' },
                  { label: 'Deep Sleep', value: `${selectedDay.deep}h`, color: '#8b5cf6' },
                  { label: 'REM Sleep', value: `${selectedDay.rem}h`, color: '#ec4899' },
                  { label: 'Light Sleep', value: `${selectedDay.light}h`, color: '#f59e0b' },
                  { label: 'Quality', value: `${selectedDay.quality}%`, color: '#10b981' },
                  { label: 'Disturbances', value: selectedDay.disturbances.toString(), color: '#ef4444' }
                ].map(m => (
                  <div key={m.label} style={{
                    padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%', background: m.color
                    }} />
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: m.color }}>{m.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Sleep architecture bar */}
              <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px' }}>🛏️ Sleep Architecture</h4>
              <div style={{
                height: '32px', borderRadius: '8px', overflow: 'hidden',
                display: 'flex', marginBottom: '16px'
              }}>
                <div style={{ width: `${(selectedDay.deep / selectedDay.total) * 100}%`, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>Deep</div>
                <div style={{ width: `${(selectedDay.rem / selectedDay.total) * 100}%`, background: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>REM</div>
                <div style={{ width: `${(selectedDay.light / selectedDay.total) * 100}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>Light</div>
                <div style={{ width: `${(selectedDay.awake / selectedDay.total) * 100}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>Awake</div>
              </div>
              {selectedDay.notes && (
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', fontSize: '13px', color: '#cbd5e1' }}>
                  📝 {selectedDay.notes}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Phase Analysis Tab ═══ */}
        {activeTab === 'phases' && (
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🌙 Cycle Phase Sleep Analysis</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {Object.entries(CYCLE_PHASES).map(([key, phase]) => (
                <PhaseCard key={key} phase={key} data={phase} isCurrent={currentPhase === key} />
              ))}
            </div>
            {/* Phase comparison table */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
              padding: '24px', marginTop: '24px', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 14px' }}>📊 Phase Comparison</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Metric</th>
                    {WEEKLY_DATA.map((w, i) => (
                      <th key={i} style={{ textAlign: 'center', padding: '8px 12px', fontSize: '12px', color: CYCLE_PHASES[w.phase].color, borderBottom: `2px solid ${CYCLE_PHASES[w.phase].color}40` }}>
                        {CYCLE_PHASES[w.phase].icon} {CYCLE_PHASES[w.phase].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Avg Quality', key: 'avgQuality', suffix: '%', best: 'max' },
                    { label: 'Avg Duration', key: 'avgTotal', suffix: 'h', best: 'target' },
                    { label: 'Avg Deep', key: 'avgDeep', suffix: 'h', best: 'max' },
                    { label: 'Avg REM', key: 'avgREM', suffix: 'h', best: 'max' },
                    { label: 'Avg Disturbances', key: 'avgDisturbances', suffix: '', best: 'min' }
                  ].map(metric => {
                    const values = WEEKLY_DATA.map(w => w[metric.key])
                    const bestIdx = metric.best === 'max' ? values.indexOf(Math.max(...values)) : metric.best === 'min' ? values.indexOf(Math.min(...values)) : -1
                    return (
                      <tr key={metric.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: '#94a3b8' }}>{metric.label}</td>
                        {WEEKLY_DATA.map((w, i) => (
                          <td key={i} style={{
                            textAlign: 'center', padding: '10px 12px', fontSize: '13px',
                            fontWeight: bestIdx === i ? 700 : 400,
                            color: bestIdx === i ? '#10b981' : '#cbd5e1'
                          }}>{w[metric.key]}{metric.suffix} {bestIdx === i ? '🏆' : ''}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ Recovery Activities Tab ═══ */}
        {activeTab === 'recovery' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0' }}>
                ⚡ Recovery Activities for <span style={{ color: currentPhaseData.color }}>{currentPhaseData.name}</span> Phase
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px' }}>
              {RECOVERY_ACTIVITIES.filter(a => a.phase === currentPhase || a.phase === 'all').map(activity => (
                <ActivityCard key={activity.id} activity={activity} onClick={() => {}} />
              ))}
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '20px',
              marginTop: '20px', border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px' }}>🔄 All Phase Recovery Plan</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {Object.entries(CYCLE_PHASES).map(([key, phase]) => (
                  <div key={key} style={{
                    background: `${phase.color}08`, borderRadius: '10px', padding: '12px',
                    border: `1px solid ${phase.color}15`
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: phase.color, marginBottom: '6px' }}>
                      {phase.icon} {phase.name}
                    </div>
                    {RECOVERY_ACTIVITIES.filter(a => a.phase === key || a.phase === 'all').slice(0, 3).map(a => (
                      <div key={a.id} style={{ fontSize: '11px', color: '#cbd5e1', padding: '3px 0' }}>
                        {a.icon} {a.name}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Sleep Hygiene Tab ═══ */}
        {activeTab === 'tips' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px' }}>🛡️ Sleep Hygiene Checklist</h3>
            {SLEEP_HYGIENE_TIPS.sort((a, b) => b.importance - a.importance).map((tip, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                padding: '18px', marginBottom: '10px',
                border: `1px solid ${tip.phase === currentPhase ? '#6366f140' : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', gap: '14px', alignItems: 'flex-start'
              }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: tip.phase === currentPhase ? '#6366f120' : 'rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', flexShrink: 0
                }}>{tip.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{tip.title}</span>
                    {tip.phase === currentPhase && (
                      <span style={{
                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: '#6366f120', color: '#818cf8', fontWeight: 600
                      }}>🔑 Key for {currentPhaseData.name}</span>
                    )}
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      background: tip.phase === 'all' ? '#10b98120' : `${CYCLE_PHASES[tip.phase]?.color}20`,
                      color: tip.phase === 'all' ? '#10b981' : CYCLE_PHASES[tip.phase]?.color,
                      fontWeight: 600
                    }}>{tip.phase === 'all' ? 'All Phases' : CYCLE_PHASES[tip.phase]?.name}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>{tip.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Importance:</span>
                    {[...Array(10)].map((_, j) => (
                      <div key={j} style={{
                        width: '8px', height: '8px', borderRadius: '2px',
                        background: j < tip.importance ? '#6366f1' : 'rgba(255,255,255,0.08)'
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
