import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { Webhook } from 'svix';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const CLERK_WEBHOOK_SECRET = 'whsec_dummysecret';

let serverProcess;

function log(msg) {
  console.log(`[E2E Runner] ${msg}`);
}

// Ensure the server process is killed on exit
function cleanup() {
  if (serverProcess) {
    log('Terminating Next.js server...');
    try {
      // Force kill the process tree on Windows
      execSync(`taskkill /pid ${serverProcess.pid} /f /t`, { stdio: 'ignore' });
    } catch (e) {
      try {
        serverProcess.kill('SIGKILL');
      } catch (err) {
        // ignore
      }
    }
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
  cleanup();
  process.exit(1);
});

async function main() {
  log('Starting Next.js test server with Webpack...');
  
  // Set up mock env vars
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_MOCK_AUTH: 'true',
    NEXT_PUBLIC_MOCK_DB: 'true',
    NODE_ENV: 'test',
    // Dummy values for required configuration env vars to pass validateEnv checks
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy_anon_key',
    SUPABASE_SERVICE_ROLE_KEY: 'dummy_service_role_key',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'dummy_publishable_key',
    CLERK_SECRET_KEY: 'dummy_secret_key',
    GEMINI_API_KEY: 'dummy_gemini_key',
    GROQ_API_KEY: 'dummy_groq_key',
    CLERK_WEBHOOK_SECRET,
    DISCORD_WEBHOOK_URL: `http://localhost:${PORT}/mock-discord-webhook`
  };

  // Spawn Next.js dev server with Webpack on port 3001
  serverProcess = spawn('npx', ['next', 'dev', '--webpack', '--port', String(PORT)], {
    shell: true,
    env,
    stdio: 'pipe'
  });

  // Handle server process logging for debugging
  serverProcess.stderr.on('data', (data) => {
    const errorText = data.toString();
    if (errorText.trim()) {
      console.error(`[Server Error] ${errorText.trim()}`);
    }
  });

  // Wait for server to boot (poll base URL)
  log('Waiting for Next.js server to become ready...');
  const maxRetries = 60;
  let isReady = false;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok || res.status === 404 || res.status === 200) {
        isReady = true;
        break;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!isReady) {
    log('❌ Next.js server failed to start or respond in time.');
    cleanup();
    process.exit(1);
  }

  log('✅ Next.js test server is ready. Running API route integration tests...');

  // Mock svix payload for clerk webhook test
  const wh = new Webhook(CLERK_WEBHOOK_SECRET);
  const svixPayload = JSON.stringify({ type: 'user.created', data: { id: 'mock_user_12345' } });
  const svixHeaders = wh.sign(svixPayload);

  // Define E2E API Route Scenarios
  const testScenarios = [
    // 1. Cycles Endpoint
    {
      name: 'GET /api/cycles (Authenticated Success)',
      path: '/api/cycles',
      method: 'GET',
      headers: {},
      expectedStatus: 200
    },
    {
      name: 'GET /api/cycles (Unauthorized Failure)',
      path: '/api/cycles',
      method: 'GET',
      headers: { 'x-mock-unauthorized': 'true' },
      expectedStatus: 401
    },
    {
      name: 'POST /api/cycles (Valid Payload Success)',
      path: '/api/cycles',
      method: 'POST',
      body: { start_date: '2026-07-01', end_date: '2026-07-05', cycle_length: 28 },
      expectedStatus: 200
    },
    {
      name: 'POST /api/cycles (Invalid Date format - Validation Failure)',
      path: '/api/cycles',
      method: 'POST',
      body: { start_date: '2026-07-35' }, // Invalid calendar date (out of range/future)
      expectedStatus: 400
    },
    {
      name: 'POST /api/cycles (Invalid Cycle Length - Validation Failure)',
      path: '/api/cycles',
      method: 'POST',
      body: { start_date: '2026-07-01', cycle_length: 10 }, // 10 days is physiologically invalid (min: 15)
      expectedStatus: 400
    },

    // 2. Log-day Endpoint
    {
      name: 'GET /api/log-day (Authenticated Success)',
      path: '/api/log-day',
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'POST /api/log-day (Valid Payload Success)',
      path: '/api/log-day',
      method: 'POST',
      body: { date: '2026-07-01', symptoms: ['cramps'], mood: '😊', flow: 'f2' },
      expectedStatus: 200
    },
    {
      name: 'POST /api/log-day (Invalid Date - Validation Failure)',
      path: '/api/log-day',
      method: 'POST',
      body: { date: '2026/07/01' }, // Bad format
      expectedStatus: 400
    },

    // 3. Log-day all Endpoint
    {
      name: 'GET /api/log-day/all (Authenticated Success)',
      path: '/api/log-day/all',
      method: 'GET',
      expectedStatus: 200
    },

    // 4. Weight Endpoint
    {
      name: 'GET /api/weight (Authenticated Success)',
      path: '/api/weight',
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'POST /api/weight (Valid Payload Success)',
      path: '/api/weight',
      method: 'POST',
      body: { recorded_date: '2026-07-01', weight_kg: 65, height_cm: 165 },
      expectedStatus: 200
    },
    {
      name: 'POST /api/weight (Invalid Weight - Validation Failure)',
      path: '/api/weight',
      method: 'POST',
      body: { recorded_date: '2026-07-01', weight_kg: 5, height_cm: 165 }, // Too low
      expectedStatus: 400
    },

    // 5. User Profile Endpoint
    {
      name: 'GET /api/profile (Authenticated Success)',
      path: '/api/profile',
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'POST /api/profile (Valid Payload Success)',
      path: '/api/profile',
      method: 'POST',
      body: { age: 25, weight_kg: 65, height_cm: 165, allow_ai_analysis: true },
      expectedStatus: 200
    },

    // 6. Predict Cycle Endpoint
    {
      name: 'GET /api/predict-cycle (Authenticated Success)',
      path: '/api/predict-cycle',
      method: 'GET',
      expectedStatus: 200
    },

    // 7. PCOD Risk Endpoint
    {
      name: 'GET /api/pcod-risk (Authenticated Success)',
      path: '/api/pcod-risk',
      method: 'GET',
      expectedStatus: 200
    },

    // 8. Partner Coach Endpoint
    {
      name: 'POST /api/partner-coach (Valid Briefing Success)',
      path: '/api/partner-coach',
      method: 'POST',
      body: { phase: 'Follicular', cycleDay: 5, symptoms: [] },
      expectedStatus: 200
    },
    {
      name: 'POST /api/partner-coach (Valid Query Success)',
      path: '/api/partner-coach',
      method: 'POST',
      body: { phase: 'Follicular', cycleDay: 5, symptoms: [], query: 'what treats are good?' },
      expectedStatus: 200
    },

    // 9. Feedback Endpoint
    {
      name: 'POST /api/feedback (Valid Success)',
      path: '/api/feedback',
      method: 'POST',
      body: { message: 'Amazing work!', type: 'feedback' },
      expectedStatus: 200
    },
    {
      name: 'POST /api/feedback (Validation Failure)',
      path: '/api/feedback',
      method: 'POST',
      body: { message: '', type: 'feedback' },
      expectedStatus: 400
    },

    // 10. Delete Account Endpoint
    {
      name: 'POST /api/delete-account (Authenticated Success)',
      path: '/api/delete-account',
      method: 'POST',
      expectedStatus: 200
    },

    // 11. Chat Assistant Endpoint
    {
      name: 'POST /api/chat (Valid Success)',
      path: '/api/chat',
      method: 'POST',
      body: { message: 'Hello' },
      expectedStatus: 200
    },
    {
      name: 'POST /api/chat (Validation Failure)',
      path: '/api/chat',
      method: 'POST',
      body: { message: '' },
      expectedStatus: 400
    },

    // 12. Challenges Endpoint
    {
      name: 'GET /api/challenges (Success)',
      path: '/api/challenges',
      method: 'GET',
      expectedStatus: 200
    },
    {
      name: 'POST /api/challenges (Valid Success)',
      path: '/api/challenges',
      method: 'POST',
      body: { challengeId: 'water' },
      expectedStatus: 200
    },

    // 13. Challenges Heatmap
    {
      name: 'GET /api/challenges/heatmap (Success)',
      path: '/api/challenges/heatmap',
      method: 'GET',
      expectedStatus: 200
    },

    // 14. Challenges Progress
    {
      name: 'GET /api/challenges/progress (Success)',
      path: '/api/challenges/progress',
      method: 'GET',
      expectedStatus: 200
    },

    // 15. Challenges Monthly Recap
    {
      name: 'GET /api/challenges/monthly-recap (Success)',
      path: '/api/challenges/monthly-recap',
      method: 'GET',
      expectedStatus: 200
    },

    // 16. Export Data
    {
      name: 'GET /api/export-data (Success)',
      path: '/api/export-data',
      method: 'GET',
      expectedStatus: 200
    },

    // 17. Forum Categories
    {
      name: 'GET /api/forum/categories (Success)',
      path: '/api/forum/categories',
      method: 'GET',
      expectedStatus: 200
    },

    // 18. Forum Posts
    {
      name: 'POST /api/forum/posts (Valid Success)',
      path: '/api/forum/posts',
      method: 'POST',
      body: { categoryId: 'mock-cat-12345', title: 'Hello', content: 'World content' },
      expectedStatus: 201
    },
    {
      name: 'POST /api/forum/posts (Validation Failure)',
      path: '/api/forum/posts',
      method: 'POST',
      body: { title: 'Hello' },
      expectedStatus: 400
    },

    // 19. Forum Comments
    {
      name: 'POST /api/forum/comments (Valid Success)',
      path: '/api/forum/comments',
      method: 'POST',
      body: { postId: 'mock-uuid-12345', content: 'This is a comment.' },
      expectedStatus: 201
    },

    // 20. Forum Vote
    {
      name: 'POST /api/forum/vote (Valid Success)',
      path: '/api/forum/vote',
      method: 'POST',
      body: { itemType: 'post', itemId: 'mock-uuid-12345', voteValue: 1 },
      expectedStatus: 201
    },

    // 21. Clerk Webhooks Signature Verification
    {
      name: 'POST /api/webhooks/clerk (Valid Signature Success)',
      path: '/api/webhooks/clerk',
      method: 'POST',
      headers: {
        'svix-id': svixHeaders['svix-id'],
        'svix-timestamp': svixHeaders['svix-timestamp'],
        'svix-signature': svixHeaders['svix-signature'],
      },
      rawBody: svixPayload,
      expectedStatus: 200
    },
    {
      name: 'POST /api/webhooks/clerk (Invalid Signature Failure)',
      path: '/api/webhooks/clerk',
      method: 'POST',
      headers: {
        'svix-id': 'bad-id',
        'svix-timestamp': 'bad-time',
        'svix-signature': 'bad-sig',
      },
      rawBody: svixPayload,
      expectedStatus: 400
    },

    // 22. Seed DB Endpoint
    {
      name: 'GET /api/seed (Success)',
      path: '/api/seed',
      method: 'GET',
      expectedStatus: 200
    },

    // 23. Test DB Endpoint
    {
      name: 'GET /api/test-db (Success)',
      path: '/api/test-db',
      method: 'GET',
      expectedStatus: 200
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const test of testScenarios) {
    const url = `${BASE_URL}${test.path}`;
    const options = {
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        ...test.headers
      }
    };

    if (test.rawBody) {
      options.body = test.rawBody;
    } else if (test.body) {
      options.body = JSON.stringify(test.body);
    }

    try {
      const res = await fetch(url, options);
      if (res.status === test.expectedStatus) {
        log(`🟢 [PASS] ${test.name} (Expected: ${test.expectedStatus}, Actual: ${res.status})`);
        passedTests++;
      } else {
        log(`🔴 [FAIL] ${test.name} (Expected: ${test.expectedStatus}, Actual: ${res.status})`);
        // Log the response text to help debugging
        try {
          const bodyText = await res.text();
          console.error(`          Response Body: ${bodyText}`);
        } catch (_) {}
        failedTests++;
      }
    } catch (err) {
      log(`🔴 [FAIL] ${test.name} (Request Error: ${err.message})`);
      failedTests++;
    }
  }

  log(`\n========================================`);
  log(`E2E API Test Execution Complete:`);
  log(`Passed: ${passedTests}`);
  log(`Failed: ${failedTests}`);
  log(`========================================\n`);

  cleanup();

  if (failedTests > 0) {
    process.exit(1);
  } else {
    log('🎉 All integration tests passed successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  log(`Fatal runner error: ${err.message}`);
  cleanup();
  process.exit(1);
});
