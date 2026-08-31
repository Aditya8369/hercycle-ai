'use client'

import React from 'react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import CycleWellnessDashboard from '@/components/dashboard/CycleWellnessDashboard'
import WeeklyGoalTracker from '@/components/wellness/WeeklyGoalTracker'
import '@/styles/wellness-goals.css'

/**
 * Wellness Goals page — cycle-phase-aware weekly goal tracker.
 * Pass the user's last cycle start and average length to personalise goals.
 */
export default function WellnessPage() {
  // In production these would come from the user's cycle data via API.
  // For now we default to a reasonable starting point; the component
  // gracefully handles null/missing values.
  const lastPeriodStart = null
  const cycleLength = 28

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <CycleWellnessDashboard />
        <div style={{ padding: '2rem 1rem', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <WeeklyGoalTracker
            lastPeriodStart={lastPeriodStart}
            cycleLength={cycleLength}
          />
        </div>
      </main>
      <Footer />
    </div>
  )
}
