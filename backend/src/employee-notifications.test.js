import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeActionCopy, notifyAdminAction } from './employee-notifications.js';
import { buildNotifications } from './notifications.js';

function database() {
  const events = []; const queries = [];
  return { events, queries, collection(name) { return { insertOne: async event => events.push(event), find: query => { queries.push({ name, query }); return { toArray: async () => [{ employeeId: 'E1' }] }; } }; } };
}

test('clock-in and clock-out notify admins and only the employee who scanned', async () => {
  const db = database();
  for (const action of ['time-in', 'time-out']) {
    await notifyAdminAction(db, { path: '/attendance/kiosk', actorRole: 'admin', body: { employeeId: 'OTHER' }, meta: { employeeId: 'E1', attendanceRecorded: true, kioskAction: action, date: '2026-10-10', eventTime: action === 'time-in' ? '09:00 AM' : '05:00 PM' } });
  }
  assert.deepEqual(db.events.map(event => event.employeeId), ['E1', 'E1']);
  assert.deepEqual(db.events.map(event => event.title), ['You clocked in', 'You clocked out']);
  assert.ok(db.events.every(event => event.date === '2026-10-10'));
  assert.match(db.events[0].description, /09:00 AM/);
  assert.match(db.events[1].description, /05:00 PM/);
  const adminEvents = buildNotifications({ now: new Date('2026-10-10T10:00:00Z'), attendance: [{ employeeId: 'E1', name: 'Alex', date: '2026-10-10', sessions: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }] }] });
  assert.deepEqual(adminEvents.map(event => event.title), ['Alex clocked out', 'Alex clocked in']);
});

test('saved scans still notify after follow-up failure, rejected scans do not', async () => {
  const db = database();
  for (const statusCode of [400, 409, 500]) await notifyAdminAction(db, { path: '/attendance/kiosk', actorRole: 'admin', statusCode, meta: { employeeId: 'E1', attendanceRecorded: false, kioskAction: 'fingerprint scan' } });
  assert.equal(db.events.length, 0);
  await notifyAdminAction(db, { path: '/attendance/kiosk', actorRole: 'admin', statusCode: 500, meta: { employeeId: 'E1', attendanceRecorded: true, kioskAction: 'time-out' } });
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].title, 'You clocked out');
});
test('all employee business categories have actionable notification text', () => {
  for (const [path, category, section] of [['/employees/E1', 'profile', 'profile'], ['/employees/E1/fingerprint', 'profile', 'profile'], ['/employees/E1/send-login-email', 'profile', 'profile'], ['/admin/employees/E1/access', 'profile', 'profile'], ['/attendance/manual', 'attendance', 'attendance'], ['/admin/force-clock-out', 'attendance', 'attendance'], ['/attendance/idle-day', 'attendance', 'calendar'], ['/leave-requests/L1/status', 'leave', 'leave'], ['/leave-requests/L1/undo-approval', 'leave', 'leave'], ['/payroll-requests/P1/confirm-payment', 'payroll', 'payroll'], ['/payroll-requests/bonus', 'payroll', 'payroll'], ['/cash-advance-requests/C1/decision', 'cash-advance', 'payroll'], ['/cash-advances', 'cash-advance', 'payroll'], ['/settings', 'profile', 'calendar']]) {
    const event = employeeActionCopy(path); assert.equal(event.category, category); assert.equal(event.section, section);
  }
  for (const path of ['/admin/notifications/read', '/employee/me/notifications/read', '/fingerprints/identify', '/attendance/audit-export', '/payroll/audit-print', '/payroll-requests/prepare-bulk', '/payroll-requests/quarterly-additions/preview']) assert.equal(employeeActionCopy(path), null);
});
test('failed actions, employee actions, background refresh and correction do not double-notify', async () => {
  const db = database();
  for (const change of [{ statusCode: 409 }, { actorRole: 'regular' }, { skip: true }, { path: '/attendance/correction' }]) await notifyAdminAction(db, { path: '/employees/E1', actorRole: 'admin', ...change });
  assert.equal(db.events.length, 0);
});
test('messages never copy secrets, other employees, or aggregate payroll amounts', async () => {
  const db = database();
  await notifyAdminAction(db, { path: '/payroll-requests/pay-bulk', actorRole: 'admin', body: { password: 'PRIVATE', fingerprintSamples: ['BIOMETRIC'], amount: 99999 }, meta: { employeeNotificationIds: ['E1', 'E2', 'E1'], payrollAction: 'bulk-paid', total: 99999, targetName: 'OTHER PERSON', periodStart: '2026-10-01' } });
  assert.deepEqual(db.events.map(item => item.employeeId), ['E1', 'E2']);
  for (const event of db.events) { assert.equal(event.title, 'Payroll payment confirmed'); assert.doesNotMatch(JSON.stringify(event), /PRIVATE|BIOMETRIC|99999|OTHER PERSON/); }
});
test('partial manual and leave bulk actions notify only successful employees', async () => {
  const db = database();
  await notifyAdminAction(db, { path: '/attendance/manual/bulk', actorRole: 'admin', body: { employeeIds: ['E1', 'E2', 'E3'] }, payload: { results: [{ ok: true, employeeId: 'E1' }, { ok: false, employeeId: 'E2' }] } });
  await notifyAdminAction(db, { path: '/leave-requests/bulk-status', actorRole: 'admin', body: { ids: ['L1', 'L2'], status: 'approved' }, payload: { successful: [{ request: { employeeId: 'E3' } }], failed: [{ id: 'L2' }] } });
  assert.deepEqual(db.events.map(item => item.employeeId), ['E1', 'E3']);
});
test('quarterly inclusion resolves only included payroll IDs to their owners', async () => {
  const db = database();
  await notifyAdminAction(db, { path: '/payroll-requests/quarterly-additions/include', actorRole: 'admin', payload: { results: [{ requestId: 'P1', included: true }, { requestId: 'P2', included: false }] } });
  assert.deepEqual(db.queries[0], { name: 'payroll_requests', query: { id: { $in: ['P1'] } } });
  assert.deepEqual(db.events.map(item => item.employeeId), ['E1']);
});
test('explicit partial-success targets survive an overall failed bulk action', async () => {
  const db = database();
  await notifyAdminAction(db, { path: '/admin/force-clock-out', actorRole: 'admin', statusCode: 500, meta: { employeeNotificationPartial: true, employeeNotificationIds: ['E1'], eventTime: '05:00 PM' } });
  assert.equal(db.events[0].employeeId, 'E1');
});
