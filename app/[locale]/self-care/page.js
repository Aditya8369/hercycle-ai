'use client'

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { exercises, soundscapes } from '@/lib/selfCareData';
import HorizontalScroll from '@/components/self-care/HorizontalScroll';
import ExerciseCard from '@/components/self-care/ExerciseCard';
import SoundscapeCard from '@/components/self-care/SoundscapeCard';
import HydrationTracker from '@/components/self-care/HydrationTracker'; import Navbar from '@/components/layout/Navbar';
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
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef(null);

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
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const query = searchQuery.trim().toLowerCase();

  const filteredExercises = query
    ? exercises.filter(e => e.title.toLowerCase().includes(query))
    : exercises;

  const filteredSoundscapes = query
    ? soundscapes.filter(s => s.title.toLowerCase().includes(query))
    : soundscapes;

  const noResults = query && filteredExercises.length === 0 && filteredSoundscapes.length === 0;
  const suggestions = query
    ? [
      ...filteredExercises.map(e => ({ type: 'exercise', ...e })),
      ...filteredSoundscapes.map(s => ({ type: 'soundscape', ...s })),
    ].slice(0, 6)
    : [];

  const handleSelectSuggestion = (item) => {
    if (item.type === 'soundscape') {
      handlePlaySound(item.id);
    }
    setIsDropdownOpen(false);
    if (item.type === 'exercise') {
      setSearchQuery('');
    }
  };

  return (
    <div className="page">
      <Navbar />
      <main className="pb-24 pt-6 px-4 max-w-7xl mx-auto w-full space-y-10">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-md">
            {t('title')}
          </h1>
        </header>

        <div className="relative mb-6" ref={searchRef}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => searchQuery && setIsDropdownOpen(true)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/40"
          />

          {isDropdownOpen && query && (
            <div className="absolute z-20 mt-2 w-full rounded-xl bg-[#1e1b2e] border border-white/10 shadow-xl overflow-hidden">
              {suggestions.length === 0 ? (
                <p className="px-4 py-3 text-white/60 text-sm">{t('noResults')}</p>
              ) : (
                suggestions.map((item) => (
                  item.type === 'exercise' ? (
                    <Link
                      key={`ex-${item.id}`}
                      href={`/${locale}/self-care/${item.id}`}
                      onClick={() => handleSelectSuggestion(item)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors"
                    >
                      <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <span className="text-white/90 text-sm">{item.title}</span>
                      <span className="ml-auto text-white/40 text-xs uppercase">{t('crampRelief')}</span>
                    </Link>
                  ) : (
                    <button
                      key={`sc-${item.id}`}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors text-left"
                    >
                      <img src={item.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <span className="text-white/90 text-sm">{item.title}</span>
                      <span className="ml-auto text-white/40 text-xs uppercase">{t('soundscapes')}</span>
                    </button>
                  )
                ))
              )}
            </div>
          )}
        </div>

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


        {noResults ? (
          <p className="text-white/70 text-center py-10">
            {t('noResults')}
          </p>
        ) : (
          <>
            <section>
              <h2 className="text-xl sm:text-2xl font-semibold text-white/90 mb-4">{t('crampRelief')}</h2>
              <HorizontalScroll>
                {filteredExercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </HorizontalScroll>
            </section>

            <section>
              <h2 className="text-xl sm:text-2xl font-semibold text-white/90 mb-4">{t('soundscapes')}</h2>
              <HorizontalScroll>
                {filteredSoundscapes.map((sound) => (
                  <SoundscapeCard
                    key={sound.id}
                    sound={sound}
                    activeSoundId={activeSoundId}
                    onPlay={handlePlaySound}
                  />
                ))}
              </HorizontalScroll>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

