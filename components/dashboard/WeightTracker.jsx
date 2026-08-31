'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Ruler, Scale, Save, Loader2, CheckCircle2 } from 'lucide-react'
import fetchWithTimeout from '@/lib/fetch-with-timeout'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { getTodayISO } from '@/lib/date-utils'
import { classifyBmi, computeBmi, readSaveResponse } from '@/lib/weight-history'

/** Where the last entered height is remembered between visits. */
const HEIGHT_KEY = 'hercycle-height-cm'

/**
 * `localStorage` throws rather than returning undefined in a privacy-restricted
 * browser — Safari's private mode raises `QuotaExceededError` on write. The read
 * at mount was already guarded; the write was not, and it sat *inside* the
 * submit's `try`, after the response had been accepted. A committed save was
 * therefore reported to the user as a failure, with the form rolled back.
 */
function rememberHeight(heightCm) {
  try {
    localStorage.setItem(HEIGHT_KEY, String(heightCm))
  } catch {
    // Remembering the height is a convenience; losing it is not worth an error.
  }
}

function recallHeight() {
  try {
    return localStorage.getItem(HEIGHT_KEY)
  } catch {
    return null
  }
}

const cardStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 16,
  backdropFilter: 'blur(12px)',
  padding: '1.5rem',
}

const fieldStyle = {
  width: '100%',
  padding: '0.75rem 0.85rem',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  outline: 'none',
}

function todayISO() {
  return getTodayISO()
}

const BMI_LABEL_KEYS = {
  below: 'bmiBelowRange',
  healthy: 'bmiHealthyRange',
  above: 'bmiAboveRange',
  high: 'bmiHighRange',
}

function bmiLabel(bmi, t) {
  const band = classifyBmi(bmi)
  return band ? t(BMI_LABEL_KEYS[band]) : t('bmiNotCalculated')
}

export default function WeightTracker({ onSaved }) {
  const t = useTranslations('WeightTracker')
  const [form, setForm] = useState({
    recorded_date: todayISO(),
    weight_kg: '',
    waist_cm: '',
    height_cm: '',
  })
  const [saving, setSaving] = useState(false)
  const [pendingEntry, setPendingEntry] = useState(null)
  const badgeTimerRef = useRef(null)

  useEffect(() => {
    const savedHeight = recallHeight()
    if (savedHeight) {
      setForm(current => ({ ...current, height_cm: savedHeight }))
    }
  }, [])

  // Clear the success badge's timer on unmount, so navigating away inside the
  // 2.5s window does not set state on a component that is gone.
  useEffect(() => () => {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
  }, [])

  // The same BMI the route stores. These were two implementations rounding to
  // different precisions, so the figure shown while typing (22.8) was not the
  // figure that came back from the server (22.77).
  const bmi = useMemo(
    () => computeBmi(form.weight_kg, form.height_cm),
    [form.weight_kg, form.height_cm]
  )

  const setField = (name, value) => {
    setForm(current => ({ ...current, [name]: value }))
  }

  const handleSubmit = async event => {
    event.preventDefault()

    const weightNum = Number(form.weight_kg)
    const heightNum = Number(form.height_cm)
    const waistNum = form.waist_cm ? Number(form.waist_cm) : null
    const dateVal = form.recorded_date

    if (!Number.isFinite(weightNum) || weightNum <= 0 || !Number.isFinite(heightNum) || heightNum <= 0) {
      // This used to `return` in silence: no toast, no field error, the button
      // simply did nothing.
      toast.error(t('saveError'))
      return
    }

    // Snapshot current form for potential rollback
    const previousForm = { ...form }

    // Construct optimistic record
    const optimisticRecord = {
      id: `temp-${Date.now()}`,
      recorded_date: dateVal,
      weight_kg: weightNum,
      waist_cm: waistNum,
      height_cm: heightNum,
      bmi: bmi,
      isPending: true,
      status: 'syncing',
    }

    // 1. Optimistic state update
    setPendingEntry(optimisticRecord)
    onSaved?.(optimisticRecord, { isOptimistic: true })

    // Reset inputs immediately for responsive UX
    setForm(current => ({
      ...current,
      weight_kg: '',
      waist_cm: '',
    }))
    setSaving(true)

    try {
      const response = await fetchWithTimeout('/api/weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recorded_date: dateVal,
          weight_kg: weightNum,
          waist_cm: waistNum,
          height_cm: heightNum,
        }),
      })

      const result = await response.json()
      const read = readSaveResponse(response, result)
      if (!read.ok) {
        throw new Error(read.error || t('saveError'))
      }

      // Outside the failure path: a storage error here is not a save error.
      rememberHeight(heightNum)

      // 2. Server confirmation update
      const confirmedEntry = { ...read.entry, isPending: false, status: 'saved' }
      setPendingEntry(confirmedEntry)
      toast.success(t('saveSuccess'))
      onSaved?.(confirmedEntry, { isOptimistic: false })

      // Clear badge after brief success display
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current)
      badgeTimerRef.current = setTimeout(() => {
        setPendingEntry(null)
      }, 2500)
    } catch (error) {
      // 3. Rollback on failure
      setPendingEntry(null)
      setForm(previousForm)
      toast.error(error.message || t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={cardStyle} aria-labelledby="weight-tracker-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Scale size={24} color="#e91e8c" />
        <h2 id="weight-tracker-title" style={{ margin: 0, fontSize: '1.2rem' }}>
          {t('title')}
        </h2>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.68)', marginTop: 0, marginBottom: 20 }}>
        {t('desc')}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 14,
        }}>
          <label>
            <span style={{ display: 'block', marginBottom: 6 }}>{t('date')}</span>
            <input
              type="date"
              value={form.recorded_date}
              max={todayISO()}
              onChange={e => setField('recorded_date', e.target.value)}
              required
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Scale size={15} /> {t('weight')}
            </span>
            <input
              type="number"
              min="20"
              max="350"
              step="0.1"
              value={form.weight_kg}
              onChange={e => setField('weight_kg', e.target.value)}
              placeholder={t('weightPlaceholder')}
              required
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ruler size={15} /> {t('waist')}
            </span>
            <input
              type="number"
              min="30"
              max="250"
              step="0.1"
              value={form.waist_cm}
              onChange={e => setField('waist_cm', e.target.value)}
              placeholder={t('optional')}
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ruler size={15} /> {t('height')}
            </span>
            <input
              type="number"
              min="100"
              max="250"
              step="0.1"
              value={form.height_cm}
              onChange={e => setField('height_cm', e.target.value)}
              placeholder={t('heightPlaceholder')}
              required
              style={fieldStyle}
            />
          </label>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 18,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'rgba(255,255,255,0.78)',
          }}>
            <Activity size={18} color="#e91e8c" />
            <span>
              {t('bmi')}: <strong style={{ color: '#fff' }}>{bmi ?? '—'}</strong>
              {bmi ? ` · ${bmiLabel(bmi, t)}` : ''}
            </span>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '0.8rem 1.1rem',
              background: 'linear-gradient(135deg, #e8527e, #9d3f7a)',
              color: '#fff',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Save size={17} />
            {saving ? t('saving') : t('saveBtn')}
          </button>
        </div>
      </form>

      {/* Optimistic Pending / Confirmation Badge Card */}
      {pendingEntry && (
        <div style={{
          marginTop: 18,
          padding: '1rem 1.25rem',
          borderRadius: 12,
          background: pendingEntry.status === 'syncing'
            ? 'rgba(233, 30, 140, 0.12)'
            : 'rgba(34, 197, 94, 0.12)',
          border: pendingEntry.status === 'syncing'
            ? '1px solid rgba(233, 30, 140, 0.4)'
            : '1px solid rgba(34, 197, 94, 0.4)',
          transition: 'all 0.3s ease',
          boxShadow: pendingEntry.status === 'syncing'
            ? '0 0 15px rgba(233, 30, 140, 0.25)'
            : '0 0 15px rgba(34, 197, 94, 0.25)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {pendingEntry.status === 'syncing' ? (
                <>
                  <Loader2 size={16} color="#e91e8c" className="animate-spin" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e91e8c' }}>
                    {t('syncingBadge')}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} color="#22c55e" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#22c55e' }}>
                    {t('savedBadge')}
                  </span>
                </>
              )}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
              {pendingEntry.recorded_date}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: '0.9rem', color: '#fff', flexWrap: 'wrap' }}>
            <span>{t('weightBadgeLabel')}: <strong>{pendingEntry.weight_kg} kg</strong></span>
            {pendingEntry.waist_cm && <span>{t('waistBadgeLabel')}: <strong>{pendingEntry.waist_cm} cm</strong></span>}
            {pendingEntry.height_cm && <span>{t('heightBadgeLabel')}: <strong>{pendingEntry.height_cm} cm</strong></span>}
            {pendingEntry.bmi && <span>{t('bmiBadgeLabel')}: <strong>{pendingEntry.bmi}</strong></span>}
          </div>
        </div>
      )}

      <p style={{
        color: 'rgba(255,255,255,0.52)',
        fontSize: '0.78rem',
        lineHeight: 1.5,
        marginBottom: 0,
        marginTop: 16,
      }}>
        {t('disclaimer')}
      </p>
    </section>
  )
}

