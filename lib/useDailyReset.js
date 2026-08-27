'use client'

/**
 * useDailyReset — tells a component when the user's calendar day has changed.
 *
 * Everything about *what* a day-scoped record looks like lives in
 * `./daily-storage.js`, which is pure and separately tested. This hook only
 * decides *when* to ask.
 *
 * ## Why a timer alone is not enough
 *
 * The self-care trackers resolved "today" once, in a mount effect, and never
 * again — so a tab left open across midnight kept showing yesterday's progress
 * and then wrote it under today's date. A midnight timer fixes the obvious
 * case, but not the three that actually happen more often:
 *
 *  - **A backgrounded tab.** Browsers throttle timers in hidden tabs to once a
 *    minute or worse, and a suspended tab may not fire them at all. Coming back
 *    to the tab has to re-check, which is what `visibilitychange` is for.
 *  - **A laptop that was asleep.** The machine wakes hours later with the timer
 *    long overdue; `focus` catches this even where the timer did not fire.
 *  - **Another tab.** Two self-care tabs are perfectly ordinary. When one rolls
 *    over and writes, the other has to notice, which is what `storage` is for.
 *
 * The day is re-read from the clock on every one of those signals and compared
 * with the last one seen, so a spurious wake-up costs a string comparison and
 * nothing else.
 */

import { useEffect, useRef } from 'react'
import { getTodayISO } from './date-utils.js'
import { msUntilNextLocalMidnight } from './daily-storage.js'

/**
 * Calls `onRollover(newDay)` whenever the local calendar day changes while the
 * component is mounted.
 *
 * @param {(day: string) => void} onRollover
 * @param {{ watchKeys?: string[] }} [options] storage keys that should also
 *   trigger a re-check when another tab writes them
 */
export default function useDailyReset(onRollover, { watchKeys = [] } = {}) {
  // Held in refs so changing the callback or the key list does not tear down
  // and re-arm the midnight timer.
  const callbackRef = useRef(onRollover)
  const keysRef = useRef(watchKeys)
  const lastDayRef = useRef(null)

  callbackRef.current = onRollover
  keysRef.current = watchKeys

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let timeoutId = null
    let cancelled = false

    if (lastDayRef.current === null) {
      lastDayRef.current = getTodayISO()
    }

    const checkDay = () => {
      if (cancelled) return

      const today = getTodayISO()
      if (today === lastDayRef.current) return

      lastDayRef.current = today
      callbackRef.current?.(today)
    }

    const scheduleMidnight = () => {
      if (cancelled) return

      timeoutId = window.setTimeout(() => {
        checkDay()
        // Re-arm from the new "now" rather than adding a fixed 24 hours, so a
        // DST change does not drift the boundary for every following day.
        scheduleMidnight()
      }, msUntilNextLocalMidnight())
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkDay()
    }

    const handleStorage = (event) => {
      // A null key means the whole store was cleared, which is worth a re-check
      // whatever the component is watching.
      if (event.key === null || keysRef.current.includes(event.key)) checkDay()
    }

    scheduleMidnight()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', checkDay)
    window.addEventListener('storage', handleStorage)

    return () => {
      cancelled = true
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', checkDay)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])
}
