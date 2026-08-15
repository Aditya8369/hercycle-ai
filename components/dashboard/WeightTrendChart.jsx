'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Scale } from 'lucide-react'
import { useTranslations } from 'next-intl'
import fetchWithTimeout from '@/lib/fetch-with-timeout'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const cardStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 16,
  backdropFilter: 'blur(12px)',
  padding: '1.5rem',
  marginBottom: '1.5rem',
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

export default function WeightTrendChart({ refreshKey = 0 }) {
  const t = useTranslations('WeightTracker')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadEntries() {
      setLoading(true)
      try {
        const response = await fetchWithTimeout('/api/weight', { cache: 'no-store' })
        const result = await response.json()
        if (active && response.ok && result.success) {
          setEntries(result.data || [])
        }
      } catch (error) {
        console.error('Failed to load weight history:', error)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEntries()
    return () => {
      active = false
    }
  }, [refreshKey])

  const chartData = useMemo(
    () => entries.map(entry => ({
      ...entry,
      label: formatDate(entry.recorded_date),
      weight: Number(entry.weight_kg),
      waist: entry.waist_cm == null ? null : Number(entry.waist_cm),
      bmi: Number(entry.bmi),
    })).filter(entry => Number.isFinite(entry.weight) && entry.weight > 0),
    [entries]
  )

  const latest = chartData.at(-1)
  const first = chartData[0]
  const weightChange = latest && first
    ? Number((latest.weight - first.weight).toFixed(1))
    : null

  return (
    <section
      className="insight-card interactive-card"
      style={cardStyle}
      aria-labelledby="weight-trend-title"
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 18,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Scale size={22} color="#e91e8c" />
            <h3 id="weight-trend-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              {t('trendTitle')}
            </h3>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.62)', margin: '6px 0 0' }}>
            {t('trendDesc')}
          </p>
        </div>

        {latest && (
          <div style={{ textAlign: 'right' }}>
            <strong style={{ display: 'block', fontSize: '1.3rem' }}>
              {latest.weight} kg
            </strong>
            <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.82rem' }}>
              BMI {latest.bmi}
              {weightChange !== null && chartData.length > 1
                ? ` · ${weightChange > 0 ? '+' : ''}${weightChange} kg ${t('overall')}`
                : ''}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ width: '100%', height: 260, display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
          <div className="chart-skeleton-box" style={{ width: '100%', height: 180, borderRadius: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
            <div className="chart-skeleton-box" style={{ width: 45, height: 12 }} />
            <div className="chart-skeleton-box" style={{ width: 45, height: 12 }} />
            <div className="chart-skeleton-box" style={{ width: 45, height: 12 }} />
            <div className="chart-skeleton-box" style={{ width: 45, height: 12 }} />
            <div className="chart-skeleton-box" style={{ width: 45, height: 12 }} />
          </div>
        </div>
      ) : (
        <div className="insights-fade-in">
          {chartData.length === 0 ? (
            <div style={{
              minHeight: 180,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.62)',
            }}>
              <div>
                <Activity size={30} style={{ marginBottom: 8 }} />
                <p style={{ margin: 0 }}>
                  {t('noMeasurements')}
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              width: '100%',
              height: 300,
              background: 'rgba(20, 8, 28, 0.25)',
              borderRadius: 12,
              padding: '8px 4px',
            }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                  <defs>
                    <filter id="weightGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="waistGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="4.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                  />

                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }}
                  />

                  <YAxis
                    yAxisId="weight"
                    tick={{ fill: '#e8527e', fontSize: 12 }}
                    domain={['dataMin - 3', 'dataMax + 3']}
                  />
                  <YAxis
                    yAxisId="waist"
                    orientation="right"
                    tick={{ fill: '#a98bff', fontSize: 12 }}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />

                  <Tooltip
                    contentStyle={{
                      background: 'rgba(30, 12, 40, 0.75)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 10,
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Legend />

                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weight"
                    name={t('weight')}
                    stroke="#e8527e"
                    strokeWidth={3}
                    activeDot={{ r: 6, fill: '#e8527e', stroke: '#fff', strokeWidth: 2 }}
                    style={{ filter: 'url(#weightGlow)' }}
                  />
                  <Line
                    yAxisId="waist"
                    type="monotone"
                    dataKey="waist"
                    name={t('waist')}
                    stroke="#a98bff"
                    strokeWidth={2.5}
                    connectNulls
                    activeDot={{ r: 6, fill: '#a98bff', stroke: '#fff', strokeWidth: 2 }}
                    style={{ filter: 'url(#waistGlow)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
