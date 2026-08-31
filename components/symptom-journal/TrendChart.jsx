'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { symptomFrequency, moodDistribution, quickInsight, SYMPTOM_TAGS, MOOD_OPTIONS } from '@/lib/symptom-journal.js'

const MOOD_COLORS = {
  great: '#4ade80',
  good: '#86efac',
  okay: '#fbbf24',
  low: '#f87171',
  anxious: '#c084fc',
  irritable: '#fb923c',
}

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="journal-chart-tooltip">
      <p className="journal-chart-tooltip__label">{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color }}>{e.name}: {e.value}</p>
      ))}
    </div>
  )
}

export default function TrendChart({ weeklyTrend, entries }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="journal-charts journal-charts--empty">
        <p>📊 Add journal entries to see trend charts.</p>
      </div>
    )
  }

  const insight = quickInsight(entries)
  const freq = symptomFrequency(entries).slice(0, 8)
  const moodDist = moodDistribution(entries)
  const moodPie = Object.entries(moodDist).map(([key, count]) => ({
    name: MOOD_OPTIONS.find((m) => m.key === key)?.label || key,
    value: count,
    color: MOOD_COLORS[key] || '#999',
  }))

  const hasTrend = weeklyTrend && weeklyTrend.length > 0

  return (
    <div className="journal-charts">
      {/* Quick Insight */}
      <div className="journal-charts__insight">
        <span>💡</span>
        <p>
          {insight.totalEntries} entries · Most common: <strong>{insight.topSymptom || '—'}</strong>
          {insight.topMood && <> · Dominant mood: <strong>{insight.topMood}</strong></>}
        </p>
      </div>

      {/* Symptom frequency bar chart */}
      {freq.length > 0 && (
        <div className="journal-charts__card">
          <h3 className="journal-charts__title">🩺 Symptom Frequency</h3>
          <ResponsiveContainer width="100%" height={Math.max(140, freq.length * 28)}>
            <BarChart data={freq} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="symptom"
                tick={(props) => {
                  const tag = SYMPTOM_TAGS.find((s) => s.key === props.payload.value)
                  return (
                    <text x={props.x - 4} y={props.y + 4} textAnchor="end" fill="rgba(255,255,255,0.7)" fontSize={11}>
                      {tag ? `${tag.emoji} ${tag.label}` : props.payload.value}
                    </text>
                  )
                }}
                width={130}
              />
              <Tooltip content={<TooltipBox />} />
              <Bar dataKey="count" name="Count" fill="#f472b6" radius={[0, 4, 4, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mood pie + weekly trend in a grid */}
      <div className="journal-charts__grid">
        {moodPie.length > 0 && (
          <div className="journal-charts__card">
            <h3 className="journal-charts__title">😊 Mood Distribution</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={moodPie} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                  {moodPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="journal-charts__legend">
              {moodPie.map((e) => (
                <span key={e.name} className="journal-charts__legend-item">
                  <span className="journal-charts__legend-dot" style={{ background: e.color }} />
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasTrend && (
          <div className="journal-charts__card">
            <h3 className="journal-charts__title">📈 Weekly Trend</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weeklyTrend} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                <YAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                <Tooltip content={<TooltipBox />} />
                <Line type="monotone" dataKey="avgMood" name="Avg Mood" stroke="#c084fc" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="avgEnergy" name="Avg Energy" stroke="#4ade80" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
