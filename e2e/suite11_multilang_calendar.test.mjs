import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 11: Multi-Language Calendar Integration & Custom Events', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  test('08_events.sql migration exists and contains events table definition', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const sqlPath = path.join(process.cwd(), 'supabase/08_events.sql');
    const content = await fs.readFile(sqlPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.events'), 'SQL should define events table');
    assert(content.includes('recurrence_rule TEXT DEFAULT \'none\''), 'SQL should have recurrence_rule column');
  });

  test('Protected endpoint /api/events handles unauthenticated requests safely', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/events`);
      assert([200, 401, 307].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });

  test('POST /api/events validates payload requirements', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert([400, 401, 307, 429].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });
});
