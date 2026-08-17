import { calculateCyclePhase, getLatestCycle } from './calculateCyclePhase.js'

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ Assertion Failed: ${message}`)
        process.exit(1)
    }
}

async function runTests() {
    console.log('Running calculateCyclePhase Tests...')

    // Test 1: Day 1 transition — period starts today
    {
        console.log('Testing day 1 transition...')
        const today = new Date('2026-03-10T00:00:00')
        const result = calculateCyclePhase({
            periodStart: '2026-03-10',
            cycleLength: 28,
            periodLength: 5,
            today,
        })
        assert(result.cycleDay === 1, `Expected cycleDay 1, got ${result.cycleDay}`)
        assert(result.phaseKey === 'menstrual', `Expected menstrual phase, got ${result.phaseKey}`)
        assert(result.hasData === true, 'Expected hasData to be true on day 1')
    }

    // Test 2: cycleDay > 28 (past a 28-day cycle length) is reported as irregular
    {
        console.log('Testing cycleDay > 28...')
        const today = new Date('2026-04-09T00:00:00') // 30 days after start
        const result = calculateCyclePhase({
            periodStart: '2026-03-10',
            cycleLength: 28,
            periodLength: 5,
            today,
        })
        assert(result.cycleDay === 31, `Expected cycleDay 31, got ${result.cycleDay}`)
        assert(result.phaseKey === 'irregular', `Expected irregular phase past cycle length, got ${result.phaseKey}`)
    }

    // Test 3: Leap year — Feb 29 2028 to Mar 1 2028 is a 1-day gap, not skipped/doubled
    {
        console.log('Testing leap year day counting (Feb 29 -> Mar 1, 2028)...')
        const today = new Date('2028-03-01T00:00:00')
        const result = calculateCyclePhase({
            periodStart: '2028-02-29',
            cycleLength: 28,
            periodLength: 5,
            today,
        })
        assert(result.cycleDay === 2, `Expected cycleDay 2 across the leap day, got ${result.cycleDay}`)
        assert(result.phaseKey === 'menstrual', `Expected menstrual phase, got ${result.phaseKey}`)
    }

    // Test 4: Leap year — full 29-day February counted correctly into March
    {
        console.log('Testing leap year day counting (Feb 1 -> Mar 1, 2028)...')
        const today = new Date('2028-03-01T00:00:00')
        const result = calculateCyclePhase({
            periodStart: '2028-02-01',
            cycleLength: 35,
            periodLength: 5,
            today,
        })
        // Feb 2028 has 29 days, so Feb 1 -> Mar 1 is 29 days later = cycle day 30
        assert(result.cycleDay === 30, `Expected cycleDay 30 across a leap February, got ${result.cycleDay}`)
    }

    // Test 5: Missing period start reports hasData: false
    {
        console.log('Testing missing period start...')
        const result = calculateCyclePhase({ periodStart: null })
        assert(result.hasData === false, 'Expected hasData false with no periodStart')
        assert(result.phaseKey === null, 'Expected phaseKey null with no periodStart')
        assert(result.reason === 'missing-period-start', `Unexpected reason: ${result.reason}`)
    }

    // Test 6: Future period start is rejected
    {
        console.log('Testing future period start...')
        const today = new Date('2026-01-01T00:00:00')
        const result = calculateCyclePhase({ periodStart: '2026-06-01', today })
        assert(result.hasData === false, 'Expected hasData false for a future period start')
        assert(result.reason === 'future-period-start', `Unexpected reason: ${result.reason}`)
    }

    // Test 7: getLatestCycle picks the most recent by start_date
    {
        console.log('Testing getLatestCycle...')
        const cycles = [
            { start_date: '2026-01-01' },
            { start_date: '2026-03-01' },
            { start_date: '2026-02-01' },
        ]
        const latest = getLatestCycle(cycles)
        assert(latest.start_date === '2026-03-01', `Expected latest cycle 2026-03-01, got ${latest?.start_date}`)
    }

    // Test 8: getLatestCycle handles an empty/missing array
    {
        console.log('Testing getLatestCycle with no cycles...')
        assert(getLatestCycle([]) === null, 'Expected null for empty cycles array')
        assert(getLatestCycle(undefined) === null, 'Expected null for undefined cycles')
    }

    console.log('=== All calculateCyclePhase Tests Passed Successfully! ===')
}

runTests().catch(err => {
    console.error('Test execution failed:', err)
    process.exit(1)
})