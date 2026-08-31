/**
 * SleepLogForm — A modal form for logging a night's sleep.
 * Users set bed time, wake time, quality rating, optional position and disturbances.
 */
'use client'

import { useState } from 'react'
import {
  SLEEP_QUALITY_RATINGS,
  SLEEP_POSITIONS,
  SLEEP_DISTURBANCES,
  calculateSleepDuration,
  formatDuration,
  toDateString,
} from '@/lib/sleep-log-data.js'

export default function SleepLogForm({ onSubmit, onClose, initialDate }) {
  const [form, setForm] = useState({
    date: initialDate || toDateString(),
    bed_time: '22:00',
    wake_time: '07:00',
    quality: 3,
    position: '',
    disturbances: [],
    notes: '',
  })
  const [errors, setErrors] = useState([])
  const duration = calculateSleepDuration(form.bed_time, form.wake_time)

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const toggleDisturbance = (key) => {
    if (key === 'none') { setForm((prev) => ({ ...prev, disturbances: [] })); return }
    setForm((prev) => {
      const filtered = prev.disturbances.filter((d) => d !== 'none')
      return filtered.includes(key)
        ? { ...prev, disturbances: filtered.filter((d) => d !== key) }
        : { ...prev, disturbances: [...filtered, key] }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = []
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errs.push('Please select a valid date.')
    if (!/^\d{2}:\d{2}$/.test(form.bed_time) || !/^\d{2}:\d{2}$/.test(form.wake_time)) errs.push('Enter valid times (HH:MM).')
    if (form.notes.length > 500) errs.push('Notes must be 500 characters or fewer.')
    if (errs.length > 0) { setErrors(errs); return }
    onSubmit({ ...form, duration_minutes: duration, position: form.position || null, notes: form.notes.trim() || null })
  }

  return (
    <div className="sleep-form-overlay" onClick={onClose}>
      <div className="sleep-form" onClick={(e) => e.stopPropagation()}>
        <div className="sleep-form__header">
          <h2 className="sleep-form__title">🌙 Log Sleep</h2>
          <button className="sleep-form__close" onClick={onClose}>✕</button>
        </div>
        {errors.length > 0 && <div className="sleep-form__errors">{errors.map((err, i) => <p key={i}>{err}</p>)}</div>}
        <form className="sleep-form__fields" onSubmit={handleSubmit}>
          <label className="sleep-form__label">
            Date
            <input className="sleep-form__input" type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} />
          </label>
          <div className="sleep-form__row">
            <label className="sleep-form__label sleep-form__label--half">
              Bed Time
              <input className="sleep-form__input" type="time" value={form.bed_time} onChange={(e) => handleChange('bed_time', e.target.value)} />
            </label>
            <label className="sleep-form__label sleep-form__label--half">
              Wake Time
              <input className="sleep-form__input" type="time" value={form.wake_time} onChange={(e) => handleChange('wake_time', e.target.value)} />
            </label>
          </div>
          <div className="sleep-form__duration">💤 Total sleep: <strong>{formatDuration(duration)}</strong></div>
          <fieldset className="sleep-form__fieldset">
            <legend className="sleep-form__legend">Sleep Quality</legend>
            <div className="sleep-form__quality-row">
              {SLEEP_QUALITY_RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`sleep-form__quality-btn ${form.quality === r.value ? 'sleep-form__quality-btn--active' : ''}`}
                  style={form.quality === r.value ? { borderColor: r.color, background: r.color + '22' } : {}}
                  onClick={() => handleChange('quality', r.value)}
                  title={r.label}
                >
                  <span className="sleep-form__quality-icon">{r.icon}</span>
                  <span className="sleep-form__quality-label">{r.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="sleep-form__label">
            Sleep Position (optional)
            <select className="sleep-form__select" value={form.position} onChange={(e) => handleChange('position', e.target.value)}>
              <option value="">— Select —</option>
              {SLEEP_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <fieldset className="sleep-form__fieldset">
            <legend className="sleep-form__legend">Sleep Disturbances</legend>
            <div className="sleep-form__chips">
              {SLEEP_DISTURBANCES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`sleep-form__chip ${form.disturbances.includes(d.key) ? 'sleep-form__chip--active' : ''}`}
                  onClick={() => toggleDisturbance(d.key)}
                >{d.icon} {d.label}</button>
              ))}
            </div>
          </fieldset>
          <label className="sleep-form__label">
            Notes (optional)
            <textarea className="sleep-form__textarea" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="Dreams, how you felt waking up, etc." rows={3} maxLength={500} />
            <span className="sleep-form__char-count">{form.notes.length}/500</span>
          </label>
          <button type="submit" className="sleep-form__submit">Save Sleep Log</button>
        </form>
      </div>
    </div>
  )
}
