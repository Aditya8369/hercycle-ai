/**
 * SleepLogList — Displays recent sleep entries in a scrollable list.
 * Each entry shows date, duration, quality rating, and optional notes.
 */
'use client'

import { getQualityInfo, formatDuration } from '@/lib/sleep-log-data.js'

export default function SleepLogList({ entries, onDelete }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="sleep-list-empty">
        <div className="sleep-list-empty__icon">🌙</div>
        <p className="sleep-list-empty__text">No sleep logs yet</p>
        <p className="sleep-list-empty__hint">
          Tap &quot;Log Sleep&quot; to start tracking your sleep quality.
        </p>
      </div>
    )
  }

  return (
    <div className="sleep-log-list">
      <h3 className="sleep-log-list__heading">Recent Entries</h3>
      <div className="sleep-log-list__scroll">
        {entries.map((entry) => {
          const qualityInfo = getQualityInfo(entry.quality)
          return (
            <div key={entry.id} className="sleep-log-list__item">
              <div className="sleep-log-list__item-header">
                <span className="sleep-log-list__date">
                  {new Date(`${entry.date}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <button
                  className="sleep-log-list__delete"
                  onClick={() => onDelete(entry.id)}
                  title="Delete entry"
                >
                  🗑️
                </button>
              </div>

              <div className="sleep-log-list__item-body">
                <div className="sleep-log-list__duration">
                  <span className="sleep-log-list__duration-icon">💤</span>
                  <span className="sleep-log-list__duration-value">
                    {formatDuration(entry.duration_minutes)}
                  </span>
                </div>

                <div
                  className="sleep-log-list__quality"
                  style={{ color: qualityInfo.color }}
                >
                  {qualityInfo.icon} {qualityInfo.label}
                </div>

                <div className="sleep-log-list__times">
                  🛏️ {entry.bed_time} → ☀️ {entry.wake_time}
                </div>

                {entry.position && (
                  <div className="sleep-log-list__meta">
                    🧍 {entry.position}
                  </div>
                )}

                {entry.disturbances && entry.disturbances.length > 0 && (
                  <div className="sleep-log-list__meta">
                    ⚠️ {entry.disturbances.join(', ')}
                  </div>
                )}

                {entry.notes && (
                  <div className="sleep-log-list__notes">
                    📝 {entry.notes}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
