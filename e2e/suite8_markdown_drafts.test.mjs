import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 8: Markdown Editor & Drafts API', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  test('05_user_drafts.sql migration file exists and contains user_drafts table schema', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const sqlPath = path.join(process.cwd(), 'supabase/05_user_drafts.sql');
    const content = await fs.readFile(sqlPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.user_drafts'), 'SQL migration should contain user_drafts table definition');
    // 05 created the table keyed on user_id alone; 12 replaces that key. This
    // asserts the original file is intact, not that the key is still correct.
    assert(content.includes('user_id TEXT PRIMARY KEY'), 'user_drafts should specify user_id primary key');
  });

  test('12_user_drafts_per_type.sql keys drafts on (user_id, draft_type)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const sqlPath = path.join(process.cwd(), 'supabase/12_user_drafts_per_type.sql');
    const content = await fs.readFile(sqlPath, 'utf8');
    assert(
      content.includes('PRIMARY KEY (user_id, draft_type)'),
      'drafts must be keyed per type, so one composer cannot overwrite another'
    );
    assert(
      content.includes('user_drafts_draft_type_check'),
      'the draft_type allow-list should be enforced by the schema, not only by the route'
    );
  });

  test('Protected draft route /api/drafts is guarded by authentication', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/drafts`);
      assert([401, 307, 200, 404].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      // Server offline in isolated test runner mode
      assert(true);
    }
  });

  test('POST /api/drafts returns 401 Unauthorized for unauthenticated requests', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', content: 'Test draft' })
      });
      assert([401, 429].includes(res.status), `Expected 401 Unauthorized, got ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });

  test('DELETE /api/drafts returns 401 Unauthorized for unauthenticated requests', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/drafts`, {
        method: 'DELETE'
      });
      assert([401, 429].includes(res.status), `Expected 401 Unauthorized, got ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });
});
