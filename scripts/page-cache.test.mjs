import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPageCache, pageCacheGeneration, readPageCache, writePageCache } from '../src/lib/pageCache.ts';

test('cached attendance keeps employee/date filters separate and supports empty results', () => {
  clearPageCache();
  writePageCache('attendance:2026-10-01:2026-10-01', [{ employeeId: 'E1' }]);
  writePageCache('attendance:2026-10-02:2026-10-02', []);
  assert.deepEqual(readPageCache('attendance:2026-10-01:2026-10-01'), [{ employeeId: 'E1' }]);
  assert.deepEqual(readPageCache('attendance:2026-10-02:2026-10-02'), []);
  assert.equal(readPageCache('attendance:2026-10-03:2026-10-03'), undefined);
});

test('fresh server results replace the saved display records', () => {
  clearPageCache();
  writePageCache('payroll', [{ id: 'P1', status: 'processing' }]);
  writePageCache('payroll', [{ id: 'P1', status: 'paid' }]);
  assert.deepEqual(readPageCache('payroll'), [{ id: 'P1', status: 'paid' }]);
});

test('logout clears data and late requests from the previous account cannot refill the cache', () => {
  clearPageCache();
  const oldSession = pageCacheGeneration();
  writePageCache('employees', ['old-account']);
  clearPageCache();
  assert.equal(readPageCache('employees'), undefined);
  writePageCache('employees', ['new-account']);
  writePageCache('employees', ['late-old-response'], oldSession);
  assert.deepEqual(readPageCache('employees'), ['new-account']);
});

test('calendar cache separates employees and months', () => {
  clearPageCache();
  writePageCache('calendar:true:2026-10:E1', { employeeId: 'E1' });
  writePageCache('calendar:true:2026-10:E2', { employeeId: 'E2' });
  assert.deepEqual(readPageCache('calendar:true:2026-10:E1'), { employeeId: 'E1' });
  assert.equal(readPageCache('calendar:true:2026-11:E1'), undefined);
});

test('large numbers of date filters do not retain unlimited records', () => {
  clearPageCache();
  for (let i = 0; i < 101; i++) writePageCache(`range:${i}`, i);
  assert.equal(readPageCache('range:0'), undefined);
  assert.equal(readPageCache('range:100'), 100);
});
