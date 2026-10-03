import test from 'node:test';
import assert from 'node:assert/strict';
import { paidAdditionEntries } from '../../shared/paid-additions.js';

test('older named additions appear only after their carried payroll is paid', () => {
  const source = { id: 'sep-01', employeeId: 'EMP-004', employeeName: 'Carlos Mendoza', status: 'carried_over', periodStart: '2026-09-01', additions: [
    { label: 'SSS', value: 145 }, { label: 'Pag-IBIG', value: 105 },
  ] };
  const destination = { id: 'sep-16', employeeId: 'EMP-004', employeeName: 'Carlos Mendoza', status: 'processing', periodStart: '2026-09-16', additions: [], carriedQuarterlyAdditions: [] };
  assert.deepEqual(paidAdditionEntries([source, destination]), []);
  source.status = 'paid'; source.settledBy = destination.id; source.paidAt = '2026-09-30T02:00:00Z';
  destination.status = 'paid'; destination.paidAt = source.paidAt;
  const [entry] = paidAdditionEntries([source, destination]);
  assert.equal(entry.employeeName, 'Carlos Mendoza');
  assert.equal(entry.total, 250);
  assert.deepEqual(entry.allowances.map(item => item.label), ['Salary addition']);
  assert.equal(entry.allowances[0].value, 250);
  assert.equal(entry.periodStart, '2026-09-16');
  destination.status = 'processing'; source.status = 'carried_over';
  assert.deepEqual(paidAdditionEntries([source, destination]), []);
});

test('a paid quarterly addition is counted once when carried to a later payment', () => {
  const item = { label: 'Owner-funded addition (Q3 2026)', value: 250, quarter: '2026-Q3' };
  const source = { id: 'sep-16', employeeId: 'E1', employeeName: 'Juan', status: 'paid', settledBy: 'oct-01', paidAt: '2026-10-15T00:00:00Z', additions: [item], quarterlyAdditions: [item] };
  const destination = { id: 'oct-01', employeeId: 'E1', employeeName: 'Juan', status: 'paid', paidAt: source.paidAt, additions: [], carriedQuarterlyAdditions: [item] };
  const [entry] = paidAdditionEntries([source, destination]);
  assert.equal(entry.total, 250);
  assert.equal(entry.allowances.length, 1);
});

test('older additions appear as one total in the payroll that actually paid them; bonuses stay out', () => {
  const paidAt = '2026-09-30T02:00:00Z';
  const records = [
    { id: 'aug-16', employeeId: 'E1', employeeName: 'Carlos', status: 'paid', settledBy: 'sep-16', periodStart: '2026-08-16', paidAt, additions: [{ label: 'SSS', value: 145 }] },
    { id: 'sep-01', employeeId: 'E1', employeeName: 'Carlos', status: 'paid', settledBy: 'sep-16', periodStart: '2026-09-01', paidAt, additions: [{ label: 'SSS', value: 145 }] },
    { id: 'sep-16', employeeId: 'E1', employeeName: 'Carlos', status: 'paid', periodStart: '2026-09-16', paidAt, additions: [{ label: 'Demo performance bonus', value: 500 }] },
  ];
  const [entry] = paidAdditionEntries(records);
  assert.equal(entry.total, 290);
  assert.deepEqual(entry.allowances, [{ label: 'Salary addition', value: 290 }]);
  assert.equal(entry.periodStart, '2026-09-16');
});
