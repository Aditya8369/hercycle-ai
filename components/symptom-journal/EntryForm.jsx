'use client'

import { useState } from 'react'
import { MOOD_OPTIONS, ENERGY_LEVELS, FLOW_OPTIONS, SYMPTOM_TAGS } from '@/lib/symptom-journal.js'

export default function EntryForm({ onSave, initialData, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    date: initialData?.date || today,
    mood: initialData?.mood || '',
    energy: initialData?.energy || '',
    flow: initialData?.flow || '',
    symptoms: initialData?.symptoms || [],
    notes: initialData?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const toggle = (key) => {
    setForm((p) => ({
      ...p,
      symptoms: p.symptoms.includes(key)
        ? p.symptoms.filter((s) => s !== key)
        : [...p.symptoms, key],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <form className="journal-form" onSubmit={handleSubmit}>
      <div className="journal-form__section">
        <label className="journal-form__label">Date</label>
        <input
          type="date"
          className="journal-form__input"
          value={form.date}
          max={today}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
        />
      </div>

      <div className="journal-form__section">
        <label className="journal-form__label">Mood</label>
        <div className="journal-form__row">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`journal-form__emoji-btn ${form.mood === m.key ? 'active' : ''}`}
              onClick={() => setForm((p) => ({ ...p, mood: p.mood === m.key ? '' : m.key }))}
              title={m.label}
            >
              <span>{m.emoji}</span>
              <span className="journal-form__emoji-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="journal-form__section">
        <label className="journal-form__label">Energy</label>
        <div className="journal-form__row">
          {ENERGY_LEVELS.map((e) => (
            <button
              key={e.key}
              type="button"
              className={`journal-form__emoji-btn ${form.energy === e.key ? 'active' : ''}`}
              onClick={() => setForm((p) => ({ ...p, energy: p.energy === e.key ? '' : e.key }))}
              title={e.label}
            >
              <span>{e.emoji}</span>
              <span className="journal-form__emoji-label">{e.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="journal-form__section">
        <label className="journal-form__label">Flow</label>
        <div className="journal-form__row">
          {FLOW_OPTIONS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`journal-form__flow-btn ${form.flow === f.key ? 'active' : ''}`}
              onClick={() => setForm((p) => ({ ...p, flow: p.flow === f.key ? '' : f.key }))}
              style={form.flow === f.key ? { borderColor: f.color, background: f.color + '33' } : {}}
            >
              <span className="journal-form__flow-dot" style={{ background: f.color }} />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="journal-form__section">
        <label className="journal-form__label">Symptoms</label>
        <div className="journal-form__tag-grid">
          {SYMPTOM_TAGS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`journal-form__symptom-tag ${form.symptoms.includes(s.key) ? 'active' : ''}`}
              onClick={() => toggle(s.key)}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="journal-form__section">
        <label className="journal-form__label">Notes</label>
        <textarea
          className="journal-form__textarea"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="How are you feeling today?"
          maxLength={500}
          rows={3}
        />
        <span className="journal-form__char-count">{form.notes.length}/500</span>
      </div>

      <div className="journal-form__actions">
        {onCancel && (
          <button type="button" className="journal-form__cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="journal-form__submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Entry'}
        </button>
      </div>
    </form>
  )
}
