'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Apple, BookOpen } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import PhaseRecommendations from '@/components/nutrition/PhaseRecommendations'
import MealLogForm from '@/components/nutrition/MealLogForm'
import { THEME_COLORS, THEME_TEXT } from '@/lib/theme-constants'
import '@/styles/nutrition.css'

const PINK = THEME_COLORS.pink

export default function NutritionPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState('recommendations')

  if (isLoaded && !isSignedIn) { router.push('/auth/login'); return null }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <div className="page">
          <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 8 }}>
                <Apple size={28} color={PINK} strokeWidth={1.5} />
              </div>
              <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#fff' }}>Nutrition Advisor</h1>
            </div>
            <p style={{ color: THEME_TEXT.faint, marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Personalised nutrition guidance based on your cycle phase. Eat right for where you are in your cycle.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[
                { key: 'recommendations', icon: <BookOpen size={16} />, label: 'Phase Guide' },
                { key: 'log', icon: <Apple size={16} />, label: 'Log Today' },
              ].map(btn => (
                <button key={btn.key} onClick={() => setTab(btn.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: tab === btn.key ? `${PINK}22` : 'rgba(255,255,255,0.05)', border: tab === btn.key ? `1px solid ${PINK}55` : '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: tab === btn.key ? PINK : 'rgba(255,255,255,0.65)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  {btn.icon} {btn.label}
                </button>
              ))}
            </div>

            {tab === 'recommendations' && <PhaseRecommendations />}
            {tab === 'log' && <MealLogForm />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
