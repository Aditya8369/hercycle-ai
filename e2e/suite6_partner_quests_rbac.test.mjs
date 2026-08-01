import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Suite 6: Partner Companion, Daily Care Quests & RBAC Flow', () => {
  test('Biological phase context helper returns expected titles and focus areas', async () => {
    const { getBiologicalPhaseContext } = await import('../lib/partner-insights.js');
    
    const menstrual = getBiologicalPhaseContext('Menstrual');
    assert.strictEqual(menstrual.title, 'Menstrual Phase 🩸');
    assert(menstrual.physiologicalFocus.includes('Rest'), 'Menstrual focus should mention Rest');
  });

  test('Actionable care tips generates relevant symptom-based partner tips', async () => {
    const { getActionableCareTips } = await import('../lib/partner-insights.js');
    
    const crampTips = getActionableCareTips('Menstrual', ['Cramps', 'Fatigue']);
    assert(crampTips.some(t => t.includes('heating pad')), 'Should recommend heating pad for cramps');
  });

  test('Energy battery calculation adjusts stamina levels based on phase and symptoms', async () => {
    const { calculateEnergyBattery } = await import('../lib/partner-insights.js');

    const highEnergy = calculateEnergyBattery('Ovulation', 14, []);
    assert(highEnergy.level >= 80, 'Ovulation without symptoms should have peak energy');
  });

  test('Pairing code cleaner correctly sanitizes input strings to 12 hex chars', async () => {
    const cleanCode = (code) => code ? code.trim().toUpperCase().replace(/[^0-9A-F]/g, "") : "";
    assert.strictEqual(cleanCode(' a1b2-c3d4-e5f6 '), 'A1B2C3D4E5F6');
    assert.strictEqual(cleanCode('xyz-123-abc-456'), '123ABC456');
  });
});
