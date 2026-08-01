import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 3: Self-Care & Personalized Recommendations Flow', () => {
  test('Self-Care data structures are valid and non-empty', async () => {
    const selfCareData = await import('../lib/selfCareData.js');
    assert(Array.isArray(selfCareData.exercises), 'exercises should be an array');
    assert(selfCareData.exercises.length > 0, 'exercises should contain items');
    assert(Array.isArray(selfCareData.soundscapes), 'soundscapes should be an array');
    assert(selfCareData.soundscapes.length > 0, 'soundscapes should contain items');
  });

  test('Exercise items contain required properties (id, title, durationMin, poses)', async () => {
    const { exercises } = await import('../lib/selfCareData.js');
    for (const ex of exercises) {
      assert(typeof ex.id === 'string', `exercise id should be string: ${ex.id}`);
      assert(typeof ex.title === 'string', `exercise title should be string: ${ex.title}`);
      assert(typeof ex.durationMin === 'number', `exercise durationMin should be number: ${ex.id}`);
      assert(Array.isArray(ex.poses), `exercise poses should be array: ${ex.id}`);
    }
  });

  test('Cycle phase calculation produces valid phase keys', async () => {
    const { calculateCyclePhase } = await import('../lib/calculateCyclePhase.js');
    const phase = calculateCyclePhase({
      periodStart: '2026-07-15',
      cycleLength: 28,
      periodLength: 5
    });
    assert(phase.hasData, 'calculateCyclePhase should have data for valid start date');
    assert(['menstrual', 'follicular', 'ovulation', 'luteal'].includes(phase.phaseKey), `Invalid phaseKey: ${phase.phaseKey}`);
  });
});
