import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeRole, employeeRoleLabel, managementHourlyRate } from '../../shared/employee-roles.js';

test('legacy and current management roles normalize without changing admin access', () => {
  for (const role of ['manager', 'supervisor', 'Supervisor', 'Manager / Supervisor']) {
    assert.equal(employeeRole(role), 'manager');
    assert.equal(employeeRoleLabel(role), 'Manager / Supervisor');
  }
  for (const role of ['admin', 'regular', 'extra']) assert.equal(employeeRole(role), role);
});

test('one management rate uses the manager setting with legacy fallback', () => {
  assert.equal(managementHourlyRate({ manager: 90, supervisor: 70, regular: 50 }), 90);
  assert.equal(managementHourlyRate({ supervisor: 70, regular: 50 }), 70);
  assert.equal(managementHourlyRate({ regular: 50 }), 50);
  assert.equal(managementHourlyRate(undefined), 50);
});
