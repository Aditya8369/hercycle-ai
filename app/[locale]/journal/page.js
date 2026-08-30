'use client'

import { useEffect, useState, useCallback } from 'react'
import Navbar from '@/components/layout/Navbar'
import EntryForm from '@/components/symptom-journal/EntryForm.jsx'
import TimelineView from '@/components/symptom-journal/TimelineView.jsx'
import TrendChart from '@/components/symptom-journal/TrendChart.jsx'
import { weeklyTrend } from '@/lib/symptom-journal.js'
import fetchWithTimeout from '@/lib/fetch-with-timeout'

function Skeleton() {
  return (
    <div className="journal-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="journal-skeleton__card">
          <div className="journal-skeleton__line" />
          <div className="journal-skeleton__line journal-skeleton__line--short" />
        </div>
      ))}
    </div>
  )
}

export default function JournalPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDate, setEditingDate] = useState(null)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetchWithTimeout('/api/symptom-journal?limit=60')
      const json = await res.json()
      if (json.success) setEntries(json.data)
      else setError(json.error || 'Failed to load journal')
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async (form) => {
    try {
      const res = await fetchWithTimeout('/api/symptom-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (json.success) {
        setShowForm(false)
        setEditingDate(null)
        await fetchData()
      } else {
        alert(json.error || 'Failed to save')
      }
    } catch {
      alert('Network error')
    }
  }

  const handleDelete = async (date) => {
    if (!confirm(`Delete entry for ${date}?`)) return
    try {
      const res = await fetchWithTimeout(`/api/symptom-journal?date=${date}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) await fetchData()
    } catch {
      alert('Failed to delete')
    }
  }

  const handleEdit = (date) => {
    const entry = entries.find((e) => e.date === date)
    if (entry) {
      setEditingDate(date)
      setShowForm(true)
    }
  }

  const editingEntry = editingDate ? entries.find((e) => e.date === editingDate) : null
  const trend = weeklyTrend(entries)

  return (
    <div className="page">
      <Navbar />
      <main className="journal-page">
        <header className="journal-page__header">
          <h1 className="journal-page__title">📔 Symptom Journal</h1>
          <p className="journal-page__subtitle">
            {loading ? 'Loading...' : `${entries.length} entries · Track how you feel each day`}
          </p>
          <button className="journal-page__add-btn" onClick={() => { setShowForm(true); setEditingDate(null) }}>
            + New Entry
          </button>
        </header>

        {error && (
          <div className="journal-page__error">
            <p>{error}</p>
            <button onClick={fetchData}>Retry</button>
          </div>
        )}

        {loading && <Skeleton />}

        {!loading && showForm && (
          <div className="journal-page__form-wrap">
            <EntryForm
              onSave={handleSave}
              initialData={editingEntry}
              onCancel={() => { setShowForm(false); setEditingDate(null) }}
            />
          </div>
        )}

        {!loading && (
          <>
            <TrendChart weeklyTrend={trend} entries={entries} />
            <TimelineView entries={entries} onDelete={handleDelete} />
          </>
        )}
      </main>
    </div>
  )
}
