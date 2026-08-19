'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { RefreshCw, Calendar, CalendarRange, TrendingUp, Activity, BarChart2, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from 'recharts'
import dynamic from 'next/dynamic'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { useOffline } from '@/lib/OfflineContext'
import { useTranslations } from 'next-intl'
import SymptomPhaseInsights from '@/components/dashboard/SymptomPhaseInsights'
import { formatDateForCSV } from '@/lib/utils'
import { normaliseRiskResult } from '@/lib/pcod-risk-result'
import { copyToClipboard } from '@/lib/clipboard'
import SectionCard, { IconBadge } from '@/components/ui/SectionCard'

const WeightTrendChart = dynamic(() => import('@/components/dashboard/WeightTrendChart'), {
  loading: () => <div className="chart-skeleton-box" style={{ width: '100%', height: 260, borderRadius: 16 }} />,
  ssr: false,
})
// ─── Design tokens ────────────────────────────────────────────────────────────
const PINK = '#e8527e'
const MAUVE = '#9d3f7a'
const ACCENT = '#e91e8c'
const TEXT_PRIMARY = '#ffffff'
// Was a hardcoded rgba literal that bypassed the app's theme system, so it
// never picked up the higher-contrast value .dark already defines for
// secondary text (see --text-soft in app/globals.css). Using the CSS
// variable directly fixes contrast on dark cards without touching every
// call site below.
const TEXT_FAINT = 'var(--text-soft)'
const CARD_BG = 'rgba(255,255,255,0.08)'
const CARD_BORDER = '1px solid rgba(255,255,255,0.14)'

const SYMPTOM_LIST = ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Acne', 'Nausea']
const MOOD_EMOJIS = ['😊', '😐', '😢', '😡']
const MOOD_LABELS = { '😊': 'Happy', '😐': 'Neutral', '😢': 'Sad', '😡': 'Angry' }


// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, loading }) {
  return (
    <div className="insight-card interactive-card" style={{
      textAlign: 'center',
      padding: '1.5rem 1rem',
      background: CARD_BG,
      border: CARD_BORDER,
      borderRadius: 16,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <IconBadge size="lg">{icon}</IconBadge>
      </div>
      {loading ? (
        <div className="chart-skeleton-box" style={{ width: '60%', height: '2rem', margin: '4px auto 4px auto' }} />
      ) : (
        <div style={{
          fontSize: '2rem', fontWeight: 700,
          background: `linear-gradient(135deg, ${PINK}, ${MAUVE})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: TEXT_PRIMARY, marginTop: 4 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: '0.75rem', color: TEXT_FAINT, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(30,12,40,0.95)',
      border: `1px solid ${PINK}55`,
      borderRadius: 10,
      padding: '8px 14px',
      fontSize: '0.82rem',
      color: TEXT_PRIMARY,
    }}>
      <p style={{ color: TEXT_FAINT, marginBottom: 2 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          <strong>{p.value}</strong> {p.name}
        </p>
      ))}
    </div>
  )
}

const axisProps = { tick: { fill: 'rgba(255,255,255,0.75)', fontSize: 12 } }
const gridProps = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)' }

// Formats a YYYY-MM-DD cycle start date into a compact "day month" label,
// e.g. "2026-07-03" -> "3 Jul". Parsing is anchored to local midnight to avoid
// the UTC offset shift that `new Date("YYYY-MM-DD")` introduces.
function formatStartDate(value) {
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) return value || ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const t = useTranslations('pages.insights')
  const tSymp = useTranslations('symptoms')
  const tMood = useTranslations('moods')
  const tRisk = useTranslations('Risk')
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { offlineClient } = useOffline()

const [cycleData, setCycleData] = useState(null)
  const [pcodRisk, setPcodRisk] = useState(null)
  const [dailyLogs, setDailyLogs] = useState([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [showCopyFallback, setShowCopyFallback] = useState(false)
  const [fallbackText, setFallbackText] = useState('')

  useEffect(() => {
    setMounted(true)
    if (!isLoaded) return
    if (!isSignedIn) { router.push('/auth/login'); return }

    const init = async () => {
      const [cycleRes, pcodRes, logsRes] = await Promise.all([
        offlineClient.fetchCycles(),
        offlineClient.fetchPCODRisk(),
        offlineClient.fetchAllLogs(),
      ])
      if (cycleRes.success) setCycleData(cycleRes.data)
      if (pcodRes.success) setPcodRisk(pcodRes.data)
      setDailyLogs(logsRes.success ? logsRes.data : [])
      setLoading(false)
    }
    init()
  }, [isLoaded, isSignedIn, router, offlineClient])

  // ── Derived data ──────────────────────────────────────────────────────────
  const cycles = cycleData?.cycles || []
  const avgCycle = cycleData?.averageCycleLength || 28
  const totalCycles = cycles.length
  const totalLogs = dailyLogs.length

  let nextDate = '—'
  if (cycleData?.nextPeriodDate) {
    const nextPeriodDateObj = new Date(cycleData.nextPeriodDate)
    if (!isNaN(nextPeriodDateObj.getTime())) {
      nextDate = nextPeriodDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    }
  }

  // Last 12 cycles, rendered oldest -> newest. The x-axis uses each cycle's
  // start date so users can spot how cycle length varies over time.
  const cycleLengthData = cycles
    .slice(0, 12)
    .reverse()
    .map(c => ({
      name: formatStartDate(c.start_date),
      days: c.cycle_length || 28,
    }))

  const symptomCounts = {}
  SYMPTOM_LIST.forEach(s => { symptomCounts[s] = 0 })
  dailyLogs.forEach(log => {
    if (!log) return
    const syms = Array.isArray(log.symptoms) ? log.symptoms : []
    syms.forEach(s => {
      const key = SYMPTOM_LIST.find(k => k.toLowerCase() === s.toLowerCase())
      if (key) symptomCounts[key] = (symptomCounts[key] || 0) + 1
    })
  })
  const symptomFreq = SYMPTOM_LIST.map(s => ({ name: tSymp(s), count: symptomCounts[s] }))

  const moodCounts = { '😊': 0, '😐': 0, '😢': 0, '😡': 0 }
  dailyLogs.forEach(log => {
    if (!log) return
    if (log.mood && moodCounts[log.mood] !== undefined) moodCounts[log.mood]++
  })
  const moodData = MOOD_EMOJIS.map(emoji => ({
    emoji,
    label: tMood(MOOD_LABELS[emoji]),
    pct: totalLogs > 0 ? Math.round((moodCounts[emoji] / totalLogs) * 100) : 0,
  }))

  const recordedValue = totalCycles > 0 ? totalCycles : totalLogs
  const recordedLabel = totalCycles > 0 ? t('cyclesRecorded') : t('daysLogged')
  const recordedSub = totalCycles > 0 ? t('cycles') : t('entries')

  const handleCSVExport = () => {
    if (!cycles || cycles.length === 0) {
      toast.error(t('trendEmpty') || 'No cycle records available to export')
      return
    }

    // Branding, metadata, and user context
    const brand = 'HerCycle AI - Cycle Export'
    const exportDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    const userEmail = user?.primaryEmailAddress?.emailAddress || user?.id || 'Guest'

    // Computed Summary Statistics
    const metadata = [
      `${brand},,`,
      `Exported On,"${exportDate}",`,
      `User Context,"${userEmail}",`,
      `Average Cycle Length,${avgCycle} days,`,
      `Total Cycles Tracked,${totalCycles},`,
      ',,'
    ]

    const header = 'start_date,end_date,cycle_length'
    const rows = cycles.map(c =>
      `${formatDateForCSV(c.start_date)},${formatDateForCSV(c.end_date)},${c.cycle_length || ''}`
    )
    const csvContent = [...metadata, header, ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hercycle-cycles.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Cycle records exported to CSV! 📊')
  }

  // `null` when there is no assessment. This used to default to 'LOW RISK',
  // which turned every missing or unrecognised payload into a reassuring
  // reading — in the stat card, and in the summary users copy and share.
  const riskResult = normaliseRiskResult(pcodRisk)
  const riskTier = riskResult?.tier ?? null
  const riskLevelWord =
    riskTier === 'HIGH RISK' ? 'High' :
      riskTier === 'MEDIUM RISK' ? 'Medium' :
        riskTier === 'LOW RISK' ? 'Low' : 'Not available'

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentSymptomNames = new Set()
  dailyLogs.forEach(log => {
    if (!log || !log.date) return
    const logDate = new Date(log.date)
    if (isNaN(logDate.getTime()) || logDate < thirtyDaysAgo) return
    const syms = Array.isArray(log.symptoms) ? log.symptoms : []
    syms.forEach(s => {
      const key = SYMPTOM_LIST.find(k => k.toLowerCase() === s.toLowerCase())
      if (key) recentSymptomNames.add(tSymp(key))
    })
  })
  const recentSymptomsText = recentSymptomNames.size > 0
    ? Array.from(recentSymptomNames).join(', ')
    : t('noSymptomsLogged')

  const handleCopySummary = async () => {
    const summaryText = `🌸 HerCycle AI Health Summary
- Avg Cycle Length: ${avgCycle} Days
- Recent PCOD Risk: ${riskLevelWord}
- Logged Symptoms (Last 30 Days): ${recentSymptomsText}`
    const ok = await copyToClipboard(summaryText)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy automatically. Please copy the text manually below.')
      setFallbackText(summaryText)
      setShowCopyFallback(true)
    }
  }

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0e0314' }}>
        <p style={{ color: TEXT_FAINT }}>Loading Insights...</p>
      </div>
    )
  }

  return (
    <>
      <div className="blob"></div>
      <div className="blob"></div>
      <div className="blob"></div>

      <div className="page">
        <Navbar />

        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8">

          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '12px',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}>
                <BarChart2 size={28} color="white" strokeWidth={1.5} />
              </div>
              <h1 style={{ margin: 0, fontSize: '2rem' }} className="font-bold text-white tracking-tight leading-tight min-w-0 break-words">
                {t('title')}
              </h1>
            </div>

            {!loading && (
              <div className="self-start sm:self-auto shrink-0" style={{
                background: 'rgba(233,30,140,0.15)',
                border: `1px solid ${PINK}55`,
                padding: '6px 14px',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
              }}>
                <CalendarRange size={16} color={PINK} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffb3d9' }}>
                  {t('avgCycle')}: {avgCycle}d
                </span>
              </div>
            )}
          </div>
          <p style={{ color: TEXT_FAINT, marginBottom: '2rem' }}>
            {t('subtitle')}
          </p>

          {/* ── Stat Cards ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            <StatCard
              icon={<RefreshCw size={28} color={ACCENT} strokeWidth={1.5} />}
              label={t('avgCycle')}
              value={`${avgCycle}d`}
              sub="days"
              loading={loading}
            />
            <StatCard
              icon={<Calendar size={28} color={ACCENT} strokeWidth={1.5} />}
              label={recordedLabel}
              value={recordedValue}
              sub={recordedSub}
              loading={loading}
            />
            <StatCard
              icon={<span style={{ fontSize: '1.75rem', lineHeight: 1 }}>🌸</span>}
              label={t('nextPeriod')}
              value={nextDate}
              sub={t('predicted')}
              loading={loading}
            />
            <StatCard
              icon={<span style={{ fontSize: '1.75rem', lineHeight: 1 }}>🩺</span>}
              label={t('pcodRisk')}
              value={riskResult ? `${riskResult.score}/100` : '—'}
              sub={
                riskTier === 'HIGH RISK' ? tRisk('high')
                  : riskTier === 'MEDIUM RISK' ? tRisk('med')
                    : riskTier === 'LOW RISK' ? tRisk('low')
                      : tRisk('unavailableBadge')
              }
              loading={loading}
            />
          </div>

          {/* ── Export Buttons ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <button
              onClick={handleCopySummary}
              className="export-btn"
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              {copied ? `✅ ${t('copiedSummary')}` : `📋 ${t('copySummary')}`}
            </button>
            <button
              onClick={handleCSVExport}
              className="export-btn"
              style={{
                width: 'auto',
                padding: '10px 20px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: cycles.length === 0 ? 0.75 : 1,
              }}
              title={cycles.length === 0 ? 'No cycle records available to export' : 'Export cycle history as CSV'}
            >
              <Download size={16} />
              <span>{t('exportCsv')}</span>
            </button>
          </div>

          {/* ── Visible copy fallback, shown only when automatic clipboard copy fails ── */}
          {showCopyFallback && (
            <div style={{
              background: CARD_BG,
              border: CARD_BORDER,
              borderRadius: 16,
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
            }}>
              <p style={{ color: TEXT_PRIMARY, fontSize: '0.85rem', marginBottom: 8 }}>
                Automatic copy didn&apos;t work. Select the text below and copy it manually:
              </p>
              <textarea
                readOnly
                value={fallbackText}
                onClick={(e) => e.target.select()}
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: '10px',
                  borderRadius: 10,
                  border: CARD_BORDER,
                  background: 'rgba(255,255,255,0.05)',
                  color: TEXT_PRIMARY,
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  resize: 'vertical',
                }}
              />
              <button
                onClick={() => setShowCopyFallback(false)}
                className="export-btn"
                style={{ width: 'auto', padding: '6px 14px', marginTop: 8, fontSize: '0.8rem' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Cycle Length Trend ── */}
          <SectionCard
            icon={<TrendingUp size={18} color={ACCENT} strokeWidth={1.5} />}
            title={t('trendTitle')}
            headerAction={
              <button
                onClick={handleCSVExport}
                className="export-btn"
                style={{
                  width: 'auto',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: cycles.length === 0 ? 0.75 : 1,
                }}
                title={cycles.length === 0 ? 'No cycle records available to export' : 'Export cycle history as CSV'}
              >
                <Download size={14} />
                <span>{t('exportCsv')}</span>
              </button>
            }
          >
            {loading ? (
              <div style={{ width: '100%', height: 220, display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
                <div className="chart-skeleton-box" style={{ width: '100%', height: 160, borderRadius: 12 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                  <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                  <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                  <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                  <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                  <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                </div>
              </div>
            ) : (
              <div className="insights-fade-in">
                {cycleLengthData.length < 1 ? (
                  <p style={{ color: TEXT_FAINT, textAlign: 'center', padding: '2rem 0' }}>
                    {t('trendEmpty')}
                  </p>
                ) : (
                  <div
                    role="img"
                    aria-label={`Line chart showing cycle length trend across your last ${cycleLengthData.length} tracked cycles, averaging ${avgCycle} days`}
                  >
                    <ResponsiveContainer width="100%" height={220} aria-hidden="true">
                      <LineChart
                        data={cycleLengthData}
                        margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <filter
                            id="cycleGlow"
                            x="-50%"
                            y="-50%"
                            width="200%"
                            height="200%"
                          >
                            <feGaussianBlur
                              in="SourceGraphic"
                              stdDeviation="4"
                              result="blur"
                            />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                        </defs>

                        <CartesianGrid
                          vertical={false}
                          stroke="rgba(255,255,255,0.05)"
                        />

                        <XAxis
                          dataKey="name"
                          {...axisProps}
                        />

                        <YAxis
                          domain={[20, 40]}
                          {...axisProps}
                        />

                        <Tooltip content={<CustomTooltip />} />

                        <Line
                          type="monotone"
                          dataKey="days"
                          name="days"
                          stroke={PINK}
                          strokeWidth={2.5}
                          filter="url(#cycleGlow)"
                          dot={{
                            fill: PINK,
                            stroke: PINK,
                            strokeWidth: 2,
                            r: 5,
                          }}
                          activeDot={{
                            r: 8,
                            fill: MAUVE,
                            stroke: PINK,
                            strokeWidth: 3,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <WeightTrendChart />

          {/* ── Symptom Frequency ── */}
          <SectionCard
            icon={<Activity size={18} color={ACCENT} strokeWidth={1.5} />}
            title={t('symptomTitle')}
          >
            {loading ? (
              <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '10px 20px 20px 20px' }}>
                <div className="chart-skeleton-box" style={{ width: '12%', height: '40%', borderRadius: '6px 6px 0 0' }} />
                <div className="chart-skeleton-box" style={{ width: '12%', height: '75%', borderRadius: '6px 6px 0 0' }} />
                <div className="chart-skeleton-box" style={{ width: '12%', height: '30%', borderRadius: '6px 6px 0 0' }} />
                <div className="chart-skeleton-box" style={{ width: '12%', height: '60%', borderRadius: '6px 6px 0 0' }} />
                <div className="chart-skeleton-box" style={{ width: '12%', height: '85%', borderRadius: '6px 6px 0 0' }} />
                <div className="chart-skeleton-box" style={{ width: '12%', height: '50%', borderRadius: '6px 6px 0 0' }} />
              </div>
            ) : (
              <div className="insights-fade-in">
                {totalLogs === 0 ? (
                  <p style={{ color: TEXT_FAINT, textAlign: 'center', padding: '2rem 0' }}>
                    {t('symptomEmpty')}
                  </p>
                ) : (
                  <div
                    role="img"
                    aria-label={`Bar chart showing frequency of logged symptoms across ${totalLogs} entries`}
                  >
                    <ResponsiveContainer width="100%" height={200} aria-hidden="true">
                      <BarChart data={symptomFreq} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis allowDecimals={false} {...axisProps} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="occurrences" radius={[6, 6, 0, 0]}>
                          {symptomFreq.map((_, i) => (
                            <Cell key={i} fill={i % 2 === 0 ? PINK : MAUVE} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ── Symptom patterns by cycle phase ──
              Sits directly after the frequency chart on purpose: it answers the
              question that chart raises. "Cramps: 34" is a count; this is where
              in the cycle those 34 actually landed. */}
          <SymptomPhaseInsights
            dailyLogs={dailyLogs}
            cycles={cycles}
            averageCycleLength={avgCycle}
            loading={loading}
          />

          {/* ── Mood Distribution ── */}
          <SectionCard
            icon={null}
            title={t('moodTitle')}
          >
            {loading ? (
              <div className="mood-distribution-grid">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    textAlign: 'center', padding: '1rem 0.5rem',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                  }}>
                    <div className="chart-skeleton-box" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                    <div className="chart-skeleton-box" style={{ width: 48, height: 24 }} />
                    <div className="chart-skeleton-box" style={{ width: 40, height: 12 }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="insights-fade-in">
                {totalLogs === 0 ? (
                  <p style={{ color: TEXT_FAINT, textAlign: 'center', padding: '1rem 0' }}>
                    {t('moodEmpty')}
                  </p>
                ) : (
                  <>
                    <div className="mood-distribution-grid">
                      {moodData.map(({ emoji, label, pct }) => (
                        <div key={label} className="mood-summary-card interactive-card" style={{
                          textAlign: 'center', padding: '1rem 0.5rem',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          <div style={{ fontSize: '1.8rem' }}>{emoji}</div>
                          <div style={{
                            fontSize: '1.2rem', fontWeight: 700,
                            background: `linear-gradient(135deg, ${PINK}, ${MAUVE})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            marginTop: 4,
                          }}>
                            {pct}%
                          </div>
                          <div style={{ fontSize: '0.78rem', color: TEXT_PRIMARY, marginTop: 2 }}>
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: TEXT_FAINT, marginTop: '0.75rem' }}>
                      {t('moodBasedOn', { count: totalLogs, entryLabel: totalLogs === 1 ? t('entry') : t('entries') })}
                    </p>
                  </>
                )}
              </div>
            )}
          </SectionCard>

        </div>

        <Footer />
      </div>
    </>
  )
}
