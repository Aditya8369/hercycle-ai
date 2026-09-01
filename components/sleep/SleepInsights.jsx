/**
 * SleepInsights — Stats overview and personalized sleep tips.
 */
'use client'

import {
  calculateAverages,
  formatDuration,
  getQualityInfo,
  calculateSleepScore,
  calculateSleepStreak,
} from '@/lib/sleep-log-data.js'

function StatCard({ icon, label, value, subtext, color }) {
  return (
    <div className="sleep-stat-card" style={{ borderTopColor: color || '#7B1FA2' }}>
      <div className="sleep-stat-card__icon">{icon}</div>
      <div className="sleep-stat-card__value">{value}</div>
      <div className="sleep-stat-card__label">{label}</div>
      {subtext && <div className="sleep-stat-card__subtext">{subtext}</div>}
    </div>
  )
}

function generateInsights(logs, stats) {
  const insights = []
  if (stats.totalEntries < 3) {
    insights.push({ icon: '📝', title: 'Keep Logging', text: 'Log at least 3 nights to unlock personalized insights.', type: 'info' })
    return insights
  }
  if (stats.avgDuration < 420) {
    insights.push({ icon: '⚠️', title: 'Short Sleep Duration', text: `Average ${formatDuration(stats.avgDuration)} is below 7 hours. Try adjusting bedtime earlier.`, type: 'warning' })
  } else if (stats.avgDuration >= 480 && stats.avgDuration <= 540) {
    insights.push({ icon: '✅', title: 'Great Sleep Duration', text: `Averaging ${formatDuration(stats.avgDuration)} — right in the sweet spot for recovery.`, type: 'positive' })
  }
  if (stats.avgQuality < 3) {
    insights.push({ icon: '😟', title: 'Quality Could Improve', text: 'Try limiting screens 30 min before bed and maintaining a cool room.', type: 'warning' })
  } else if (stats.avgQuality >= 4) {
    insights.push({ icon: '🌟', title: 'Excellent Sleep Quality', text: 'You consistently report good to excellent sleep. Keep it up!', type: 'positive' })
  }
  // Disturbance analysis
  const distCount = {}
  for (const log of logs) {
    if (log.disturbances?.length > 0) {
      for (const d of log.disturbances) distCount[d] = (distCount[d] || 0) + 1
    }
  }
  const top = Object.entries(distCount).sort(([, a], [, b]) => b - a)[0]
  if (top && top[1] >= 2) {
    const labels = { insomnia: 'insomnia', nightmare: 'nightmares', noise: 'noise', pain: 'pain', bathroom: 'bathroom trips', anxiety: 'anxiety', temperature: 'temperature' }
    insights.push({ icon: '🔍', title: 'Recurring Disturbance', text: `${top[1]} nights with ${labels[top[0]] || top[0]}. Consider addressing this pattern.`, type: 'info' })
  }
  if (stats.avgQuality < 3 && stats.avgDuration < 420) {
    insights.push({ icon: '🌸', title: 'Cycle Health Notice', text: 'Short, poor-quality sleep can affect cycle regularity. Prioritise rest.', type: 'info' })
  }
  if (stats.totalEntries >= 7) {
    insights.push({ icon: '📈', title: 'Great Consistency', text: `${stats.totalEntries} nights logged — consistent tracking improves cycle predictions.`, type: 'positive' })
  }
  return insights
}

export default function SleepInsights({ entries }) {
  const stats = calculateAverages(entries || [])
  const streak = calculateSleepStreak((entries || []).map(e => e.date))
  const latest = entries?.[0]
  const score = latest ? calculateSleepScore(latest.duration_minutes, latest.quality) : 0
  const insights = generateInsights(entries || [], stats)

  return (
    <div className="sleep-insights">
      <div className="sleep-insights__stats">
        <StatCard icon="📊" label="Avg Duration" value={stats.avgDuration > 0 ? formatDuration(stats.avgDuration) : '—'} color="#7B1FA2" />
        <StatCard icon="⭐" label="Avg Quality" value={stats.avgQuality > 0 ? `${stats.avgQuality}/5` : '—'} subtext={stats.avgQuality > 0 ? getQualityInfo(Math.round(stats.avgQuality)).icon : ''} color="#FFD54F" />
        <StatCard icon="🔥" label="Sleep Streak" value={`${streak} day${streak !== 1 ? 's' : ''}`} color="#E57373" />
        <StatCard icon="🏆" label="Sleep Score" value={score > 0 ? `${score}/100` : '—'} color="#4FC3F7" />
      </div>
      {insights.length > 0 && (
        <div className="sleep-insights__tips">
          <h3 className="sleep-insights__tips-title">💡 Insights</h3>
          {insights.map((insight, i) => (
            <div key={i} className={`sleep-insights__tip sleep-insights__tip--${insight.type}`}>
              <div className="sleep-insights__tip-header">
                <span>{insight.icon}</span>
                <strong>{insight.title}</strong>
              </div>
              <p className="sleep-insights__tip-text">{insight.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
