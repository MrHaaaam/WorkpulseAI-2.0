import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveCutoff, isArchivedRecord, keepActiveRecord, recordArchiveDate } from './record-archives.js';

test('three calendar months use Manila dates and clamp month ends', () => {
  assert.equal(archiveCutoff(new Date('2026-10-22T00:00:00Z')), '2026-07-22');
  assert.equal(archiveCutoff(new Date('2026-05-31T00:00:00Z')), '2026-02-28');
  assert.equal(archiveCutoff(new Date('2024-05-31T00:00:00Z')), '2024-02-29');
  assert.equal(archiveCutoff(new Date('2026-10-21T16:00:00Z')), '2026-07-22');
  assert.equal(archiveCutoff(new Date('2026-01-01T00:00:00Z')), '2025-10-01');
});

test('cutoff is inclusive and future leave dates keep a request recent', () => {
  assert.equal(isArchivedRecord('leave', { endDate: '2026-07-22' }, '2026-07-22'), true);
  assert.equal(isArchivedRecord('leave', { endDate: '2026-07-23' }, '2026-07-22'), false);
  assert.equal(isArchivedRecord('leave', { endDate: '2026-07-01', requestedDates: ['2026-11-01'] }, '2026-07-22'), false);
  assert.equal(isArchivedRecord('cash', { requestedAt: 'invalid' }, '2026-07-22'), false);
});

test('old unresolved work stays active and is also available in archives', () => {
  const cutoff = '2026-07-22';
  const request = { requestedAt: '2026-01-01', status: 'accepted' };
  assert.equal(isArchivedRecord('cash', request, cutoff), true);
  assert.equal(keepActiveRecord('cash', request, cutoff), true);
  assert.equal(keepActiveRecord('cash', { ...request, status: 'disbursed' }, cutoff), false);
  assert.equal(keepActiveRecord('payroll', { periodStart: '2026-01-01', status: 'processing' }, cutoff), true);
  assert.equal(keepActiveRecord('payroll', { periodStart: '2026-01-01', status: 'paid' }, cutoff), false);
  assert.equal(keepActiveRecord('leave', { endDate: '2026-01-01', status: 'pending' }, cutoff), true);
});

test('payroll uses period end; additions use payment date; timestamps use Manila time', () => {
  assert.equal(recordArchiveDate('payroll', { periodStart: '2026-07-01' }), '2026-07-15');
  assert.equal(recordArchiveDate('payroll', { periodStart: '2024-02-16' }), '2024-02-29');
  assert.equal(recordArchiveDate('payroll', {}), '');
  assert.equal(recordArchiveDate('additions', { paidAt: '2026-07-22T17:00:00Z' }), '2026-07-23');
  assert.equal(recordArchiveDate('cash-given', { date: '2026-07-22' }), '2026-07-22');
});
