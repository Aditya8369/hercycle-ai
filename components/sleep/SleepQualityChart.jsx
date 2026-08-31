/**
 * SleepQualityChart — Dual-axis Recharts visualization showing sleep
 * duration (bars) and quality trend (line) over the past 7 days.
 */
'use client'

import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from 'recharts'
import { formatDuration } from '@/lib/sleep-log-data.js'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  const durationEntry = payload.find((p) => p.dataKey === 'duration')
  const qualityEntry = payload.find((p) => p.dataKey === 'quality')

  return (
    <div className="sleep-chart-tooltip">
      <p className="sleep-chart-tooltip__date">{label}</p>
      {durationEntry && (
        <p className="sleep-chart-tooltip__row">
          💤 Sleep: <strong>{formatDuration(durationEntry.value)}</strong>
        </p>
      )}
      {qualityEntry && (
        <p className="sleep-chart-tooltip__row">
          ⭐ Quality: <strong>{qualityEntry.value}/5</strong>
        </p>
      )}
    </div>
  )
}

export default function SleepQualityChart({ weeklyData, goalHours = 8 }) {
  if (!weeklyData || weeklyData.length === 0) {
    return null
  }

  const hasData = weeklyData.some((d) => d.duration > 0 || d.quality > 0)
  if (!hasData) return null

  const goalMinutes = goalHours * 60

  return (
    <div className="sleep-chart">
      <h3 className="sleep-chart__title">📊 Weekly Sleep Trends</h3>

      <div className="sleep-chart__container">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={weeklyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />

            <XAxis
              dataKey="dayLabel"
              tick={{ fill: '#aaa', fontSize: 12 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />

            <YAxis
              yAxisId="duration"
              tick={{ fill: '#aaa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 60)}h`}
              domain={[0, 'auto']}
            />

            <YAxis
              yAxisId="quality"
              orientation="right"
              tick={{ fill: '#aaa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 5]}
              ticks={[1, 2, 3, 4, 5]}
            />

            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              yAxisId="duration"
              y={goalMinutes}
              stroke="#4FC3F7"
              strokeDasharray="6 3"
              strokeOpacity={0.5}
              label={{ value: 'Goal', position: 'insideTopRight', fill: '#4FC3F7', fontSize: 10 }}
            />

            <Bar
              yAxisId="duration"
              dataKey="duration"
              fill="#7B1FA2"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              opacity={0.8}
            />

            <Line
              yAxisId="quality"
              type="monotone"
              dataKey="quality"
              stroke="#FFD54F"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#FFD54F', stroke: '#1a1a2e', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="sleep-chart__legend">
        <span className="sleep-chart__legend-item">
          <span className="sleep-chart__legend-color" style={{ background: '#7B1FA2' }} />
          Duration
        </span>
        <span className="sleep-chart__legend-item">
          <span className="sleep-chart__legend-color" style={{ background: '#FFD54F' }} />
          Quality (1–5)
        </span>
        <span className="sleep-chart__legend-item">
          <span className="sleep-chart__legend-color" style={{ background: '#4FC3F7', opacity: 0.5 }} />
          Goal ({goalHours}h)
        </span>
      </div>
    </div>
  )
}
