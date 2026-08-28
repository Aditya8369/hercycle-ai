'use client'
import ChallengeCard from './ChallengeCard'
import { CHALLENGES } from '@/lib/challenges-data'
import fetchWithTimeout from '@/lib/fetch-with-timeout'
import { describeProgressOutcome, readProgressResponse } from '@/lib/challenge-progress'
import toast from 'react-hot-toast'

export default function IronMealChallenge({ initialProgress, target, onUpdate }) {
  const completed = initialProgress >= target
  const logMeal = async () => {
    const res = await fetchWithTimeout('/api/challenges/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_type: 'iron', increment: 1 }),
    })
    // Read through `readProgressResponse`. This used to be a bare
    // `if (json.success)` with no `else`, so a rejected write did nothing at
    // all -- the tap registered, the server said no, and the card sat there
    // unchanged. That is how a challenge the database refused outright could
    // stay broken for the life of a deployment.
    const result = readProgressResponse(await res.json())
    const outcome = describeProgressOutcome(result)
    if (outcome) toast[outcome.tone === 'error' ? 'error' : 'success'](outcome.message)
    if (result.ok) onUpdate?.(result.data)
  }
  return (
    <ChallengeCard
      icon="🥬"
      title="Eat an Iron-Rich Meal"
      subtitle="Spinach, beans, dates, or almonds all count"
      points={CHALLENGES.iron.points}
      progress={initialProgress}
      target={target}
      unit=""
      completed={completed}
    >
      {!completed && (
        <button onClick={logMeal} className="btn-pill px-4 py-1.5 text-sm mt-1">I Ate This Today</button>
      )}
    </ChallengeCard>
  )
}