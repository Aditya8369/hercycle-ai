'use client'

/**
 * CycleComparisonCard — "Compare This Cycle" insights card.
 *
 * Compares current cycle length and symptom activity against the user's
 * previous 3 completed cycles.
 */

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { GitCompare, Calendar, Activity, Info } from 'lucide-react'
import { compareCurrentCycle } from '@/lib/cycle-comparison'
import SectionCard, { IconBadge } from '@/components/ui/SectionCard'
import { THEME_COLORS, THEME_SURFACES, THEME_TEXT } from '@/lib/theme-constants'

const PINK = THEME_COLORS.pink
const MAUVE = THEME_COLORS.mauve
const CARD_BG = THEME_SURFACES.cardBg
const CARD_BORDER = THEME_SURFACES.cardBorder

export default function CycleComparisonCard({ cycles = [], dailyLogs = [] }) {
  const t = useTranslations('CycleComparison')

  const comparison = useMemo(() => {
    return compareCurrentCycle(cycles, dailyLogs)
  }, [cycles, dailyLogs])

  if (!comparison.hasEnoughData) {
    return (
      <SectionCard
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<GitCompare size={20} color={PINK} />}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1.25rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 14,
            color: 'var(--text-soft)',
            fontSize: '0.9rem',
          }}
        >
          <Info size={24} style={{ flexShrink: 0, color: PINK }} />
          <span>{t('insufficientData')}</span>
        </div>
      </SectionCard>
    )
  }

  const { currentCycle, previous3Avg, comparison: comp } = comparison

  const getLengthBadge = () => {
    if (comp.cycleLengthStatus === 'longer') {
      return {
        label: t('longerThanUsual', { diff: Math.abs(comp.cycleLengthDiff) }),
        color: '#fbbf24',
        bg: 'rgba(251,191,36,0.15)',
        border: 'rgba(251,191,36,0.4)',
      }
    }
    if (comp.cycleLengthStatus === 'shorter') {
      return {
        label: t('shorterThanUsual', { diff: Math.abs(comp.cycleLengthDiff) }),
        color: '#6ee7b7',
        bg: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.4)',
      }
    }
    return {
      label: t('sameAsUsual'),
      color: 'rgba(255,255,255,0.85)',
      bg: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.2)',
    }
  }

  const getSymptomBadge = () => {
    if (comp.symptomStatus === 'more') {
      return {
        label: t('moreSymptomsThanUsual', { diff: Math.abs(comp.symptomDiff) }),
        color: '#f87171',
        bg: 'rgba(248,113,113,0.15)',
        border: 'rgba(248,113,113,0.4)',
      }
    }
    if (comp.symptomStatus === 'fewer') {
      return {
        label: t('fewerSymptomsThanUsual', { diff: Math.abs(comp.symptomDiff) }),
        color: '#34d399',
        bg: 'rgba(52,211,153,0.15)',
        border: 'rgba(52,211,153,0.4)',
      }
    }
    return {
      label: t('sameSymptomsAsUsual'),
      color: 'rgba(255,255,255,0.85)',
      bg: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.2)',
    }
  }

  const lengthBadge = getLengthBadge()
  const symptomBadge = getSymptomBadge()

  return (
    <SectionCard
      title={t('title')}
      subtitle={t('subtitle')}
      icon={<GitCompare size={20} color={PINK} />}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Metric 1: Cycle Length Comparison */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: CARD_BORDER,
            borderRadius: 14,
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justify: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <IconBadge size="sm">
                <Calendar size={14} color={PINK} />
              </IconBadge>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>
                {t('cycleLengthLabel')}
              </span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: THEME_TEXT.primary }}>
              {t('currentDay', { day: currentCycle.cycleDay })}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {t('prev3AvgDays', { avg: previous3Avg.cycleLength })}
            </div>
          </div>
          <div
            style={{
              marginTop: '1rem',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: lengthBadge.color,
              background: lengthBadge.bg,
              border: `1px solid ${lengthBadge.border}`,
              width: 'fit-content',
            }}
          >
            {lengthBadge.label}
          </div>
        </div>

        {/* Metric 2: Symptom Activity Comparison */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: CARD_BORDER,
            borderRadius: 14,
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justify: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <IconBadge size="sm">
                <Activity size={14} color={MAUVE} />
              </IconBadge>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-soft)' }}>
                {t('symptomActivityLabel')}
              </span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: THEME_TEXT.primary }}>
              {t('currentSymptomsCount', { count: currentCycle.symptomCount })}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              {t('prev3AvgSymptoms', { avg: previous3Avg.symptomCount })}
            </div>
          </div>
          <div
            style={{
              marginTop: '1rem',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: symptomBadge.color,
              background: symptomBadge.bg,
              border: `1px solid ${symptomBadge.border}`,
              width: 'fit-content',
            }}
          >
            {symptomBadge.label}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
