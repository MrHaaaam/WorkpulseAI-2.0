import test from 'node:test';
import assert from 'node:assert/strict';
import { identifierInput, identifiersValidationError, validNumberInput, settingsNumbersValidationError } from '../../shared/field-limits.js';

test('ID typing and paste preserve leading zeros and block letters and overflow', () => {
  assert.equal(identifierInput('SSS', '01-2345678-9ssss'), '0123456789');
  assert.equal(identifierInput('Pag-IBIG', '012345678901ssss999'), '012345678901');
  assert.equal(identifierInput('PhilHealth', '0123 4567 8901'), '012345678901');
  assert.equal(identifierInput('Custom card', 'AB-001<>'), 'AB-001');
  assert.equal(identifierInput('constructor', 'AB-001'), 'AB-001');
});

test('server rejects malformed IDs and invalid additions before normalization', () => {
  const record = { type: 'SSS', value: '01-2345678-9', amount: 12.34 };
  assert.equal(identifiersValidationError([record]), null);
  assert.equal(identifiersValidationError([]), null);
  for (const value of ['', '012345678', '01234567890', '0123456789ssss']) assert.ok(identifiersValidationError([{ ...record, value }]));
  for (const amount of [-1, 1000000.01, 1e60, Infinity, NaN, null, '', 12.345]) assert.ok(identifiersValidationError([{ ...record, amount }]));
  for (const amount of [0, 1000000, 19.99]) assert.equal(identifiersValidationError([{ ...record, amount }]), null);
  for (const value of ['012345678', '012345678000', '01234567800000']) assert.equal(identifiersValidationError([{ ...record, type: 'TIN', value }]), null);
});

test('number editing supports decimals and deletion, blocks huge values, exponents and signs', () => {
  for (const value of ['', '.', '0.', '12.', '12.30', '10000', '10000.00']) assert.ok(validNumberInput(value, 10000));
  for (const value of ['10000.01', '555555555555555', '-1', '+1', '1e3', '12.345', '1 2', 'NaN', 'Infinity', '00000000000000000']) assert.equal(validNumberInput(value, 10000), false);
  for (const value of ['', '0', '180']) assert.ok(validNumberInput(value, 180, 0));
  for (const value of ['181', '5.5', '1e2', '-1', '5777777777777777']) assert.equal(validNumberInput(value, 180, 0), false);
});

test('settings server validation rejects rather than clamps invalid payroll and grace values', () => {
  const settings = { shift: { lateGraceMinutes: 180 }, payroll: { hourlyRates: { regular: 10000, extra: 1.25, manager: 80, supervisor: 70 } } };
  assert.equal(settingsNumbersValidationError(settings), null);
  for (const lateGraceMinutes of [181, -1, 1.5, '', null, Infinity]) assert.ok(settingsNumbersValidationError({ ...settings, shift: { lateGraceMinutes } }));
  for (const regular of [0, -1, 10000.01, 10.001, '', null, 1e60]) assert.ok(settingsNumbersValidationError({ ...settings, payroll: { hourlyRates: { ...settings.payroll.hourlyRates, regular } } }));
  for (const role of ['manager', 'supervisor']) assert.ok(settingsNumbersValidationError({ ...settings, payroll: { hourlyRates: { ...settings.payroll.hourlyRates, [role]: 0 } } }));
});
