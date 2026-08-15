import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getKeys(obj[key], prefix ? `${prefix}.${key}` : key));
    } else {
      keys.push(prefix ? `${prefix}.${key}` : key);
    }
  }
  return keys;
}

describe('Suite 7: Internationalization (i18n) Parity & Algorithm Edge Cases', () => {
  test('Localization files (en.json vs hi.json) have matching translation keys', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const enRaw = await fs.readFile(path.join(process.cwd(), 'messages/en.json'), 'utf8');
    const hiRaw = await fs.readFile(path.join(process.cwd(), 'messages/hi.json'), 'utf8');

    const enObj = JSON.parse(enRaw);
    const hiObj = JSON.parse(hiRaw);

    const enKeys = new Set(getKeys(enObj));
    const hiKeys = new Set(getKeys(hiObj));

    const missingInHi = [...enKeys].filter(k => !hiKeys.has(k));
    const missingInEn = [...hiKeys].filter(k => !enKeys.has(k));

    assert.strictEqual(missingInHi.length, 0, `Keys in en.json missing from hi.json: ${missingInHi.join(', ')}`);
    assert.strictEqual(missingInEn.length, 0, `Keys in hi.json missing from en.json: ${missingInEn.join(', ')}`);
  });

  test('predictNextPeriod handles edge cases safely', async () => {
    const { predictNextPeriod } = await import('../lib/api-helpers.js');

    const emptyResult = await predictNextPeriod([]);
    assert(typeof emptyResult.nextPeriodDate === 'string', 'Should return estimated date string');

    const singleResult = await predictNextPeriod([{ start_date: '2026-07-01', cycle_length: 28 }]);
    assert(typeof singleResult.nextPeriodDate === 'string', 'Should return predicted date for single cycle');
  });

  test('calculatePCODRisk handles empty inputs safely without crashing', async () => {
    const { calculatePCODRisk } = await import('../lib/api-helpers.js');

    const emptyRisk = await calculatePCODRisk([], []);
    assert.strictEqual(emptyRisk.score, 0);
    assert.strictEqual(emptyRisk.tier, 'LOW RISK');
  });

  test('calculatePCODRisk deduplicates symptoms to prevent duplicate symptoms from artificially increasing the risk score', async () => {
    const { calculatePCODRisk } = await import('../lib/api-helpers.js');
    const mockCycles = [
      { start_date: '2026-04-01', cycle_length: 28 },
      { start_date: '2026-04-29', cycle_length: 28 },
      { start_date: '2026-05-27', cycle_length: 28 }
    ];

    // Case 1: Flat legacy symptoms array
    const singleFlat = await calculatePCODRisk(mockCycles, ['acne']);
    const duplicateFlat = await calculatePCODRisk(mockCycles, ['acne', 'acne']);
    assert.strictEqual(duplicateFlat.score, singleFlat.score);

    // Case 2: Daily log entries with duplicates in the symptoms array
    const singleDailySyms = await calculatePCODRisk(mockCycles, [{ date: '2026-07-20', symptoms: ['acne'] }]);
    const duplicateDailySyms = await calculatePCODRisk(mockCycles, [{ date: '2026-07-20', symptoms: ['acne', 'acne'] }]);
    assert.strictEqual(duplicateDailySyms.score, singleDailySyms.score);

    // Case 3: Multiple daily log entries for the same day with duplicate symptoms
    const duplicateLogs = await calculatePCODRisk(mockCycles, [
      { date: '2026-07-20', symptoms: ['acne'] },
      { date: '2026-07-20', symptoms: ['acne'] }
    ]);
    assert.strictEqual(duplicateLogs.score, singleDailySyms.score);
  });
});
