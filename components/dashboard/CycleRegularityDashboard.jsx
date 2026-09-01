'use client'

import { useMemo } from 'react'
import { TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import {
  extractLengths, calcStats, calcRegularityScore, getRegularityTier,
  buildDistribution, detectTrend, generateAlerts,
} from '@/lib/cycle-regularity'

const BG = 'rgba(255,255,255,0.08)'
const BORDER = '1px solid rgba(255,255,255,0.12)'
const TXT = 'rgba(255,255,255,0.95)'
const SOFT = 'rgba(255,255,255,0.65)'

function AlertIcon({ type }) {
  if (type === 'warning') return <AlertTriangle size={14} color="#fbbf24" />
  if (type === 'success') return <CheckCircle size={14} color="#34d399" />
  return <Info size={14} color="#60a5fa" />
}

function TrendIcon({ direction }) {
  if (direction === 'shortening') return <TrendingDown size={16} color="#34d399" />
  if (direction === 'lengthening') return <TrendingUp size={16} color="#fb923c" />
  return <Minus size={16} color={SOFT} />
}

function ScoreRing({ score, color, size = 80 }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{score}</span>
        <span style={{ fontSize: '0.55rem', color: SOFT }}>/ 100</span>
      </div>
    </div>
  )
}

function DistBar({ bucket }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
      <span style={{ width: 70, color: SOFT, textAlign: 'right', flexShrink: 0 }}>{bucket.label}</span>
      <div style={{ flex: 1, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${bucket.pct}%`, height: '100%', borderRadius: 4,
          background: bucket.count > 0 ? 'linear-gradient(90deg, #e8527e, #9d3f7a)' : 'transparent',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ width: 20, color: SOFT, textAlign: 'left' }}>{bucket.count}</span>
    </div>
  )
}

export default function CycleRegularityDashboard({ cycles }) {
  const analysis = useMemo(() => {
    const lengths = extractLengths(cycles)
    const stats = calcStats(lengths)
    const score = calcRegularityScore(stats)
    const tier = getRegularityTier(score)
    const distribution = buildDistribution(lengths)
    const trend = detectTrend(lengths)
    const alerts = generateAlerts(lengths, stats, trend)
    return { lengths, stats, score, tier, distribution, trend, alerts }
  }, [cycles])

  const { stats, score, tier, distribution, trend, alerts } = analysis

  return (
    <section style={{ background: BG, border: BORDER, borderRadius: 20, padding: '1.5rem', backdropFilter: 'blur(12px)' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 700, color: TXT }}>Cycle Regularity</h2>

      {/* Score + stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <ScoreRing score={score} color={tier.color} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: tier.color, marginBottom: 4 }}>
            {tier.emoji} {tier.label}
          </div>
          <div style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.6 }}>
            <div>Average: <strong style={{ color: TXT }}>{stats.mean} days</strong></div>
            <div>Range: <strong style={{ color: TXT }}>{stats.min}–{stats.max} days</strong></div>
            <div>Std Dev: <strong style={{ color: TXT }}>±{stats.stdDev} days</strong></div>
            <div>Cycles tracked: <strong style={{ color: TXT }}>{stats.count}</strong></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '0.78rem', color: SOFT }}>
            <TrendIcon direction={trend.direction} />
            {trend.direction === 'stable' ? 'Stable trend' : `${trend.direction} by ~${Math.abs(trend.delta)}d`}
          </div>
        </div>
      </div>

      {/* Distribution */}
      {stats.count >= 3 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Length Distribution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {distribution.map((b) => <DistBar key={b.label} bucket={b} />)}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0.6rem 0.8rem',
              borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <AlertIcon type={a.type} />
              <span style={{ fontSize: '0.8rem', color: SOFT, lineHeight: 1.5 }}>{a.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
