import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAIInsights } from './ai-insights.js';

test('fingerprint metrics distinguish wrong identities and exclude unlabeled scan timing', () => {
  const evaluationTrials = [
    { expectedType: 'automatic', classification: null, responseTimeMs: 9999 },
    { expectedType: 'genuine', classification: 'TA', responseTimeMs: 100 },
    { expectedType: 'genuine', classification: 'FR', responseTimeMs: 100 },
    { expectedType: 'genuine', classification: 'FA', wrongEmployeeMatch: true, responseTimeMs: 100 },
    { expectedType: 'impostor', classification: 'FA', responseTimeMs: 100 },
    { expectedType: 'impostor', classification: 'TR', responseTimeMs: 100 },
  ];
  const { evaluation } = buildAIInsights({ evaluationTrials }).verification;
  assert.equal(evaluation.totalTrials, 5);
  assert.equal(evaluation.accuracy, 40);
  assert.equal(evaluation.far, 50);
  assert.equal(evaluation.frr, 33.3);
  assert.equal(evaluation.genuineTrialCount, 3);
  assert.equal(evaluation.wrongIdentificationCount, 1);
  assert.equal(evaluation.averageResponseTimeMs, 100);
});

test('empty fingerprint evaluation reports no accuracy rather than 100 percent', () => {
  const { evaluation } = buildAIInsights().verification;
  assert.equal(evaluation.totalTrials, 0);
  assert.equal(evaluation.accuracy, null);
  assert.equal(evaluation.far, null);
  assert.equal(evaluation.frr, null);
});

test('reviewer assessments determine accuracy while preserving scanner error metrics', () => {
  const evaluationTrials = [
    { expectedType: 'genuine', classification: 'TA', assessment: 'wrong' },
    { expectedType: 'genuine', classification: 'FR', assessment: 'correct' },
    { expectedType: 'impostor', classification: 'TR', assessment: 'correct' },
    { expectedType: 'genuine', classification: 'TA', confirmationPending: true },
  ];
  const { evaluation } = buildAIInsights({ evaluationTrials }).verification;
  assert.equal(evaluation.totalTrials, 3);
  assert.equal(evaluation.correctTrialCount, 2);
  assert.equal(evaluation.accuracy, 66.7);
  assert.equal(evaluation.frr, 50);
  assert.equal(evaluation.recentTrials[0].assessment, 'wrong');
  assert.equal(evaluation.recentTrials.length, 3);
});

test('all wrong assessments give zero accuracy and all correct give 100', () => {
  for (const [assessment, accuracy] of [['wrong', 0], ['correct', 100]]) {
    const { evaluation } = buildAIInsights({ evaluationTrials: [
      { expectedType: 'genuine', classification: 'TA', assessment },
      { expectedType: 'impostor', classification: 'FA', assessment },
    ] }).verification;
    assert.equal(evaluation.accuracy, accuracy);
  }
});

test('automatic scans count only after assessment, with no invented ground truth', () => {
  const { evaluation } = buildAIInsights({ evaluationTrials: [
    { expectedType: 'automatic', classification: null, assessment: 'correct', responseTimeMs: 100 },
    { expectedType: 'automatic', classification: null, assessment: 'wrong', responseTimeMs: 300 },
    { expectedType: 'automatic', classification: null, responseTimeMs: 9000 },
    { expectedType: 'automatic', classification: null, confirmationPending: true, responseTimeMs: 9000 },
  ] }).verification;
  assert.equal(evaluation.totalTrials, 2);
  assert.equal(evaluation.correctTrialCount, 1);
  assert.equal(evaluation.accuracy, 50);
  assert.equal(evaluation.averageResponseTimeMs, 200);
  assert.equal(evaluation.far, null);
  assert.equal(evaluation.frr, null);
  assert.deepEqual(evaluation.counts, { TA: 0, TR: 0, FA: 0, FR: 0 });
});
