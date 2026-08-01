import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suites = [
  { id: 1, name: 'Suite 1: Authentication, Onboarding & Route Security', file: 'suite1_auth_routes.test.mjs' },
  { id: 2, name: 'Suite 2: Cycle Tracker & Daily Logging Flow', file: 'suite2_tracker_logging.test.mjs' },
  { id: 3, name: 'Suite 3: Self-Care & Personalized Recommendations', file: 'suite3_self_care.test.mjs' },
  { id: 4, name: 'Suite 4: Health Insights, Analytics & Data Export', file: 'suite4_insights_analytics.test.mjs' },
  { id: 5, name: 'Suite 5: Daily Challenges, Badges & Monthly Recap', file: 'suite5_challenges_badges.test.mjs' },
  { id: 6, name: 'Suite 6: Partner Companion, Daily Care Quests & RBAC Flow', file: 'suite6_partner_quests_rbac.test.mjs' },
  { id: 7, name: 'Suite 7: Internationalization (i18n) Parity & Algorithm Edge Cases', file: 'suite7_i18n_resilience_edgecases.test.mjs' }
];

async function runSuite(suite) {
  const filePath = path.join(__dirname, suite.file);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('node', ['--test', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        id: suite.id,
        name: suite.name,
        file: suite.file,
        passed: code === 0,
        duration,
        stdout,
        stderr
      });
    });
  });
}

async function main() {
  console.log('====================================================');
  console.log('🚀 Running Complete 7-Part E2E Test Suite Framework');
  console.log('====================================================\n');

  const results = [];
  for (const suite of suites) {
    console.log(`▶ Executing ${suite.name}...`);
    const res = await runSuite(suite);
    results.push(res);
    if (res.passed) {
      console.log(`  ✅ ${suite.name} PASSED (${res.duration}ms)\n`);
    } else {
      console.log(`  ❌ ${suite.name} FAILED (${res.duration}ms)`);
      if (res.stderr) console.error(res.stderr);
      console.log('');
    }
  }

  console.log('====================================================');
  console.log('📊 E2E Test Execution Summary Report');
  console.log('====================================================');
  
  let totalPassed = 0;
  for (const res of results) {
    const statusStr = res.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`• [Suite ${res.id}] ${res.name}: ${statusStr} (${res.duration}ms)`);
    if (res.passed) totalPassed++;
  }

  console.log(`\nOverall Result: ${totalPassed} / ${results.length} Test Suites Passed (${Math.round((totalPassed/results.length)*100)}% Success Rate)`);
  console.log('====================================================\n');

  if (totalPassed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal E2E test runner error:', err);
  process.exit(1);
});
