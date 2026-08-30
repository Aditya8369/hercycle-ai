'use client'

import React from 'react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import CycleWellnessDashboard from '@/components/dashboard/CycleWellnessDashboard'

export default function WellnessPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <CycleWellnessDashboard />
      </main>
      <Footer />
    </div>
  )
}
