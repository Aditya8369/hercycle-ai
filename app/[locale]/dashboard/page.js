'use client'

import React from 'react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import ModelPerformanceDashboard from '@/components/dashboard/ModelPerformanceDashboard'

export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <ModelPerformanceDashboard />
      </main>
      <Footer />
    </div>
  )
}
