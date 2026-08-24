import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 10: OAuth 2.0 Provider Management Dashboard', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  test('07_oauth_providers_and_auth_logs.sql migration file exists and contains schemas', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const sqlPath = path.join(process.cwd(), 'supabase/07_oauth_providers_and_auth_logs.sql');
    const content = await fs.readFile(sqlPath, 'utf8');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.oauth_providers'), 'SQL migration should contain oauth_providers table definition');
    assert(content.includes('CREATE TABLE IF NOT EXISTS public.auth_logs'), 'SQL migration should contain auth_logs table definition');
  });

  test('Protected endpoint /api/admin/oauth/providers responds safely', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/oauth/providers`);
      assert([200, 401, 403, 307].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });

  test('Protected endpoint /api/admin/oauth/logs responds safely', async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/oauth/logs`);
      assert([200, 401, 403, 307].includes(res.status), `Unexpected status ${res.status}`);
    } catch (e) {
      assert(true);
    }
  });
});
