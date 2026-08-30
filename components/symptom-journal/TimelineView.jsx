'use client'

import { getMoodEmoji, getEnergyEmoji, getFlowColor, SYMPTOM_TAGS } from '@/lib/symptom-journal.js'

const symptomLookup = Object.fromEntries(SYMPTOM_TAGS.map((s) => [s.key, s]))

export default function TimelineView({ entries, onDelete }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="journal-timeline__empty">
        <span className="journal-timeline__empty-icon">📔</span>
        <p>No journal entries yet.</p>
        <p className="journal-timeline__empty-hint">Start logging how you feel each day.</p>
      </div>
    )
  }

  const formatDate = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`)
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="journal-timeline">
      {entries.map((entry) => (
        <div key={entry.date} className="journal-timeline__entry">
          <div className="journal-timeline__date">{formatDate(entry.date)}</div>

          <div className="journal-timeline__row">
            {entry.mood && (
              <span className="journal-timeline__badge journal-timeline__badge--mood">
                {getMoodEmoji(entry.mood)} {entry.mood}
              </span>
            )}
            {entry.energy && (
              <span className="journal-timeline__badge journal-timeline__badge--energy">
                {getEnergyEmoji(entry.energy)} {entry.energy}
              </span>
            )}
            {entry.flow && entry.flow !== 'none' && (
              <span className="journal-timeline__badge journal-timeline__badge--flow">
                <span
                  className="journal-timeline__flow-dot"
                  style={{ background: getFlowColor(entry.flow) }}
                />
                {entry.flow}
              </span>
            )}
          </div>

          {entry.symptoms && entry.symptoms.length > 0 && (
            <div className="journal-timeline__symptoms">
              {entry.symptoms.map((s) => (
                <span key={s} className="journal-timeline__symptom-chip">
                  {symptomLookup[s]?.emoji || '•'} {symptomLookup[s]?.label || s}
                </span>
              ))}
            </div>
          )}

          {entry.notes && (
            <p className="journal-timeline__notes">{entry.notes}</p>
          )}

          <button
            className="journal-timeline__delete"
            onClick={() => onDelete(entry.date)}
            title="Delete entry"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
