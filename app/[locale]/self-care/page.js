'use client'

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { exercises, soundscapes } from '@/lib/selfCareData';
import HorizontalScroll from '@/components/self-care/HorizontalScroll';
import ExerciseCard from '@/components/self-care/ExerciseCard';
import SoundscapeCard from '@/components/self-care/SoundscapeCard';
import HydrationTracker from '@/components/self-care/HydrationTracker';import Navbar from '@/components/layout/Navbar';
import { useOffline } from '@/lib/OfflineContext';
import { calculateCyclePhase, getLatestCycle } from '@/lib/calculateCyclePhase';

const RECOMMENDATIONS_MAP = {
  menstrual: {
    exercises: ['period-pain-relief', 'foot-massage-cramps', 'lower-back-stretch'],
    soundscapes: ['forest-rain', 'gentle-rain']
  },
  follicular: {
    exercises: ['gentle-hip-opening'],
    soundscapes: ['beach-waves', 'peaceful-night']
  },
  ovulation: {
    exercises: ['pelvic-relaxation'],
    soundscapes: ['beach-waves', 'forest-adventure']
  },
  luteal: {
    exercises: ['lower-back-stretch'],
    soundscapes: ['gentle-rain', 'fireplace']
  }
};

export default function SelfCarePage() {
  const t = useTranslations('SelfCare');
  const { offlineClient } = useOffline();
  const [activeSoundId, setActiveSoundId] = useState(null);
  const [phaseKey, setPhaseKey] = useState(null);

  useEffect(() => {
    async function getPhase() {
      try {
        const data = await offlineClient.fetchCycles();
        if (data.success && data.data) {
          const latestCycle = getLatestCycle(data.data.cycles);
          if (latestCycle) {
            const periodStart = latestCycle.start_date || latestCycle.period_start || null;
            const periodEnd = latestCycle.end_date || latestCycle.period_end || null;
            const inferredPeriodLength = periodStart && periodEnd
              ? Math.max(
                  1,
                  Math.round(
                    (new Date(`${periodEnd}T00:00:00`) - new Date(`${periodStart}T00:00:00`)) / 86400000
                  ) + 1
                )
              : 5;
            const phaseInfo = calculateCyclePhase({
              periodStart,
              cycleLength: latestCycle.cycle_length || data.data.averageCycleLength || 28,
              periodLength: inferredPeriodLength,
            });
            if (phaseInfo.hasData && phaseInfo.phaseKey) {
              setPhaseKey(phaseInfo.phaseKey);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching cycle data in self-care:', err);
      }
    }
    getPhase();
  }, [offlineClient]);

  const handlePlaySound = (id) => {
    setActiveSoundId(id);
  };

  const phaseRecommendations = RECOMMENDATIONS_MAP[phaseKey];
  const recommendedExercises = phaseRecommendations
    ? exercises.filter(e => phaseRecommendations.exercises.includes(e.id))
    : [];
  const recommendedSoundscapes = phaseRecommendations
    ? soundscapes.filter(s => phaseRecommendations.soundscapes.includes(s.id))
    : [];

  const hasRecommendations = recommendedExercises.length > 0 || recommendedSoundscapes.length > 0;

  return (
    <div className="page">
      <Navbar />
      <main className="pb-24 pt-6 px-4 max-w-7xl mx-auto w-full space-y-10">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-md">
          {t('title')}
        </h1>
      </header>

{/* Hydration & Cramp Relief Water Tracker */}
      <HydrationTracker phaseKey={phaseKey} />

      {/* Recommended for You Section */}      {phaseKey && phaseRecommendations && hasRecommendations && (
        <section className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✨</span>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {t('recommendedForYou')}
            </h2>
          </div>
          
          {recommendedExercises.length > 0 && (
            <div>
              <h3 className="text-white/80 text-sm font-semibold mb-3 tracking-wide uppercase">
                {t('recExercises')}
              </h3>
              <HorizontalScroll>
                {recommendedExercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </HorizontalScroll>
            </div>
          )}

          {recommendedSoundscapes.length > 0 && (
            <div>
              <h3 className="text-white/80 text-sm font-semibold mb-3 tracking-wide uppercase">
                {t('recSoundscapes')}
              </h3>
              <HorizontalScroll>
                {recommendedSoundscapes.map((sound) => (
                  <SoundscapeCard 
                    key={sound.id} 
                    sound={sound} 
                    activeSoundId={activeSoundId}
                    onPlay={handlePlaySound}
                  />
                ))}
              </HorizontalScroll>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-xl sm:text-2xl font-semibold text-white/90 mb-4">{t('crampRelief')}</h2>
        <HorizontalScroll>
          {exercises.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </HorizontalScroll>
      </section>

      <section>
        <h2 className="text-xl sm:text-2xl font-semibold text-white/90 mb-4">{t('soundscapes')}</h2>
        <HorizontalScroll>
          {soundscapes.map((sound) => (
            <SoundscapeCard 
              key={sound.id} 
              sound={sound} 
              activeSoundId={activeSoundId}
              onPlay={handlePlaySound}
            />
          ))}
        </HorizontalScroll>
      </section>
      </main>
    </div>
  );
}

