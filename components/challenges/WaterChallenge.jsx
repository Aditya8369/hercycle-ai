'use client'
import { useState } from 'react'
import ChallengeCard from './ChallengeCard'
import { CHALLENGES } from '@/lib/challenges-data'
import fetchWithTimeout from '@/lib/fetch-with-timeout'
import { describeProgressOutcome, readProgressResponse } from '@/lib/challenge-progress'
import toast from 'react-hot-toast'

export default function WaterChallenge({ initialProgress, target, onUpdate }) {
  const [progress, setProgress] = useState(initialProgress)
  const [loading, setLoading] = useState(false)

  const addWater = async (ml) => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/challenges/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_type: 'water', increment: ml }),
      })
      const result = readProgressResponse(await res.json())
      const outcome = describeProgressOutcome(result)
      if (outcome) toast[outcome.tone === 'error' ? 'error' : 'success'](outcome.message)

      if (result.ok) {
        setProgress(result.data.progress_value)
        onUpdate?.(result.data)
      }
    } finally {
      setLoading(false)
    }
  }

  return (

    <ChallengeCard
      icon="💧"
      title="Drink 2L Water"
      subtitle="Stay hydrated, feel less bloated"
      points={CHALLENGES.water.points}
      progress={progress}
      target={target}
      unit="ml"
      completed={progress >= target}
    >
      <div className="flex gap-2 pt-1">
        <button disabled={loading || progress >= target} onClick={() => addWater(250)} className="btn-pill px-4 py-1.5 text-sm disabled:opacity-40">+250ml</button>
        <button disabled={loading || progress >= target} onClick={() => addWater(500)} className="btn-pill px-4 py-1.5 text-sm disabled:opacity-40">+500ml</button>
      </div>
    </ChallengeCard>
  )
  
}