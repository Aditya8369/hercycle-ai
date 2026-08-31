/**
 * /sleep — Sleep Quality Tracker page.
 *
 * Users can log nightly sleep (bed/wake time, quality, disturbances),
 * see stats overview, view weekly trend charts, and get personalized insights.
 * Also includes the cycle-phase Sleep Recovery Tracker from upstream/main.
 */
'use client'

import { useEffect, useState, useCallback } from 'react'
import Navbar from '@/components/layout/Navbar'
import SleepLogForm from '@/components/sleep/SleepLogForm.jsx'
import SleepLogList from '@/components/sleep/SleepLogList.jsx'
import SleepQualityChart from '@/components/sleep/SleepQualityChart.jsx'
import SleepInsights from '@/components/sleep/SleepInsights.jsx'
import SleepRecoveryTracker from '@/components/dashboard/SleepRecoveryTracker'
import { buildWeeklySummary, toDateString } from '@/lib/sleep-log-data.js'
import fetchWithTimeout from '@/lib/fetch-with-timeout'
import './sleep-tracker.css'

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                  */
/* -------------------------------------------------------------------------- */

function SkeletonSleepCard() {
  return (
    <div className="skeleton-sleep-card" aria-hidden="true">
      <div className="skeleton-sleep-card__line skeleton-sleep-card__line--medium" />
      <div className="skeleton-sleep-card__line skeleton-sleep-card__line--short" />
    </div>
  )
}

function SleepSkeleton() {
  return (
    <div>
      <div className="sleep-insights__stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-sleep-card" style={{ minHeight: 100 }} />
        ))}
      </div>
      {[0, 1].map((i) => <SkeletonSleepCard key={i} />)}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function SleepPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)

  const today = toDateString()

  /* ---- Fetch data ---- */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchWithTimeout('/api/sleep-log?days=30')
      const json = await res.json()
      if (json.success) {
        setEntries(json.data)
      } else {
        setError(json.error || 'Failed to load sleep data')
      }
    } catch {
      setError('Could not connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ---- Create sleep log ---- */
  const handleCreateLog = async (logData) => {
    try {
      const res = await fetchWithTimeout('/api/sleep-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      })
      const json = await res.json()
      if (json.success) {
        setShowForm(false)
        await fetchData()
      } else {
        alert(json.error || 'Failed to save sleep log')
      }
    } catch {
      alert('Network error. Please try again.')
    }
  }

  /* ---- Delete sleep log ---- */
  const handleDeleteLog = async (id) => {
    if (!confirm('Delete this sleep entry?')) return
    try {
      const res = await fetchWithTimeout(`/api/sleep-log?id=${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        await fetchData()
      }
    } catch {
      alert('Failed to delete sleep entry')
    }
  }

  /* ---- Derived data ---- */
  const weeklyData = buildWeeklySummary(entries, today)

  return (
    <div className="page">
      <Navbar />
      <main className="sleep-tracker-page">
        {/* Header */}
        <header className="sleep-tracker-page__header">
          <h1 className="sleep-tracker-page__title">🌙 Sleep Tracker</h1>
          <p className="sleep-tracker-page__subtitle">
            {loading
              ? 'Loading your sleep data...'
              : entries.length === 0
                ? 'Start tracking your sleep to see insights'
                : `${entries.length} nights tracked this month`}
          </p>
          <div className="sleep-tracker-page__actions">
            <button
              className="btn-log-sleep"
              onClick={() => setShowForm(true)}
            >
              + Log Sleep
            </button>
          </div>
        </header>

        {/* Error state */}
        {error && (
          <div className="sleep-error">
            <p>{error}</p>
            <button
              onClick={fetchData}
              style={{
                background: 'none',
                border: 'none',
                color: '#E57373',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '0.8rem',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && <SleepSkeleton />}

        {/* Content */}
        {!loading && (
          <>
            {/* Insights & Stats */}
            <SleepInsights entries={entries} />

            {/* Chart */}
            {entries.length > 0 && (
              <SleepQualityChart weeklyData={weeklyData} />
            )}

            {/* Recent entries */}
            <SleepLogList entries={entries} onDelete={handleDeleteLog} />
          </>
        )}

        {/* Cycle-Phase Sleep Recovery Tracker (upstream) */}
        <section className="sleep-recovery-section">
          <SleepRecoveryTracker />
        </section>

        {/* Log sleep form modal */}
        {showForm && (
          <SleepLogForm
            onSubmit={handleCreateLog}
            onClose={() => setShowForm(false)}
          />
        )}
      </main>
    </div>
  )
}
