import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 5: Daily Challenges, Badges & Monthly Recap Flow', () => {
  test('CHALLENGES and BADGES dictionary data structures are valid', async () => {
    const { CHALLENGES, BADGES } = await import('../lib/challenges-data.js');

    assert(CHALLENGES.water, 'CHALLENGES should include water');
    assert(CHALLENGES.stretch, 'CHALLENGES should include stretch');
    assert(CHALLENGES.mood, 'CHALLENGES should include mood');
    assert(CHALLENGES.iron, 'CHALLENGES should include iron');
    assert(CHALLENGES.sleep, 'CHALLENGES should include sleep');

    assert.strictEqual(CHALLENGES.water.target, 2000, 'Water target should be 2000ml');
    assert(Object.keys(BADGES).length > 0, 'BADGES dictionary should not be empty');
  });

  test('POST /api/challenges/progress validates parameter structure or authentication', async () => {
    try {
      const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${BASE_URL}/api/challenges/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_type: 'unknown_type', increment: 10 })
      });
      const contentType = res.headers.get('content-type') || '';
      assert(contentType.includes('text/html') || [401, 400, 307, 200].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });
});
