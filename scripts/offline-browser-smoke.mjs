// Isolated Edge smoke test: mocked API, real service worker and IndexedDB.
// Does not connect to Render, MongoDB, or the installed user's browser profile.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ts from 'typescript';

const apiFixtures = JSON.parse(await readFile('.api-browser-fixtures.local', 'utf8'));
const receipts = new Map(); let mutations = 0; let loseNextResponse = false;
let syncStatus = 200; let syncCalls = 0;
const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const session = { authenticated: true, role: 'supervisor', csrfToken: 'test-only-csrf', offlineOwner: 'employee:smoke-e1', expiresAt: expiry };
const workspace = { profile: { id: 'E1', name: 'Offline Smoke Employee', role: 'supervisor', status: 'active', biometricStatus: 'none', phone: '', address: '' }, attendance: [], leaveRequests: [], payroll: [], cashAdvanceMax: 1000, cashAdvanceRequests: [], cashAdvance: { advanced: 0, repaid: 0, balance: 0, advances: [], repayments: [] }, attendanceFlag: { tier: 'green', absenceDays: 0, periodStart: '2026-10-01', periodEnd: '2026-10-15' }, workSchedule: { workWeekdays: [1, 2, 3, 4, 5], scheduleOverrides: [] } };
const attendanceDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
workspace.attendance = [
  { date: attendanceDate, status: 'Present', sessions: [{ checkIn: '09:30 AM', checkOut: '05:00 PM', captureMethod: 'admin-manual', correctedAt: `${attendanceDate}T02:00:00Z` }],
    correctionHistory: [
      { sessionNumber: 1, correctedBy: 'test-admin@example.invalid', correctedAt: `${attendanceDate}T01:00:00Z`, reason: 'Forgot to scan; arrival verified by manager.', before: [], after: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }] },
      { sessionNumber: 1, correctedBy: 'test-admin@example.invalid', correctedAt: `${attendanceDate}T02:00:00Z`, reason: 'Arrival corrected after checking the shift log.', before: [{ checkIn: '09:00 AM', checkOut: '05:00 PM' }], after: [{ checkIn: '09:30 AM', checkOut: '05:00 PM' }] },
    ] },
  { date: '2026-10-09', status: 'Present', sessions: [{ checkIn: '08:00 AM', checkOut: '05:00 PM', correctedAt: '2026-10-10T01:00:00Z', manualNote: 'Legacy correction: verified by supervisor.', manualRecordedBy: 'test-admin@example.invalid' }] },
];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__test/')) {
      const name = path.basename(url.pathname).replace('.js', '');
      if (!['api', 'offline', 'adminPasswordRetry', 'pageCache'].includes(name)) { res.writeHead(404).end(); return; }
      if (name === 'adminPasswordRetry') { res.setHeader('Content-Type', 'text/javascript'); res.end('export function recordAdminPasswordRetry() {}'); return; }
      const source = await readFile(`src/lib/${name}.ts`, 'utf8');
      res.setHeader('Content-Type', 'text/javascript'); res.end(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText); return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/auth/session') return res.end(JSON.stringify(session));
      if (url.pathname === '/api/employee/me') return res.end(JSON.stringify(workspace));
      if (url.pathname === '/api/admin/account-security') return res.end(JSON.stringify({ name: 'Offline Smoke Admin', email: 'test-admin@example.invalid' }));
      if (url.pathname === '/api/overview') return res.end(JSON.stringify(apiFixtures['GET /api/overview'].data));
      if (url.pathname === '/api/employees') return res.end(JSON.stringify([{ id: 'E1', name: 'Offline Smoke Employee', role: 'supervisor', status: 'active', passwordHash: 'NEVER-CACHE-THIS', fingerprintSamples: ['NEVER-CACHE-THIS'] }]));
      if (url.pathname === '/api/attendance/correction') return res.end(JSON.stringify({ employee: { id: 'E1', name: 'Offline Smoke Employee' }, sessions: [], version: 'test-empty-version' }));
      if (url.pathname === '/api/offline/sync') {
        syncCalls++;
        let input = ''; for await (const chunk of req) input += chunk;
        const { operation } = JSON.parse(input);
        if (syncStatus !== 200) { res.statusCode = syncStatus; return res.end(JSON.stringify({ error: syncStatus === 409 ? 'Controlled conflict: record changed.' : 'Controlled service outage.' })); }
        if (!receipts.has(operation.id)) { mutations++; receipts.set(operation.id, { id: `saved-${operation.id}`, status: 'pending', employeeId: 'E1' }); }
        if (loseNextResponse) { req.socket.destroy(); return; }
        return res.end(JSON.stringify(receipts.get(operation.id)));
      }
      const fixture = apiFixtures[`${req.method} ${url.pathname}`];
      if (fixture) return res.end(JSON.stringify(fixture.data));
      return res.end('[]');
    }
    const file = ['/overview', '/', '/kiosk'].includes(url.pathname) ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..')) { res.writeHead(400).end(); return; }
    const contents = await readFile(path.join('dist', file));
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(contents);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'workpulse-offline-smoke-'));
const browser = spawn(process.env.WORKPULSE_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(String.fromCharCode(10))[0]; break; } catch { await delay(100); } }
  assert.ok(port, 'Edge debugging port available');
  console.log('Browser launched; connecting to isolated test page.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json();
  const target = targets.find(item => item.type === 'page');
  console.log('Test target:', target.type, target.url);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.addEventListener('error', event => console.log('Debug socket error:', String(event.message)));
  socket.addEventListener('close', event => console.log('Debug socket closed:', event.code));
  let nextId = 0; const callbacks = new Map();
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const pending = callbacks.get(message.id); if (!pending) return; callbacks.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { callbacks.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 15000); callbacks.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const waitFor = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); };
  console.log('Debug socket ready.');
  console.log('Browser version:', await call('Browser.getVersion'));
  await call('Network.enable'); await call('Page.enable'); await call('Page.navigate', { url: `${origin}/overview` });
  await waitFor(`document.body?.innerText.includes('Offline Smoke Employee') && !!sessionStorage.getItem('workpulse_offline_owner')`);
  await waitFor(`!!navigator.serviceWorker.controller`);
  assert.ok(await evaluate(`document.body?.innerText.includes('Manager / Supervisor')`), 'legacy supervisor displays the combined role in portal');
  assert.ok(await evaluate(`document.body?.innerText.includes('Arrival corrected after checking the shift log.')`), 'latest correction reason visible on attendance record, outside notifications');
  await evaluate(`Array.from(document.querySelectorAll('details')).find(node => node.textContent.includes('Admin attendance changes')).open = true`);
  assert.ok(await evaluate(`document.body?.innerText.includes('Time-in changed') && document.body?.innerText.includes('Session added by admin') && document.body?.innerText.includes('test-admin@example.invalid') && document.body?.innerText.includes('Manila time')`), 'all corrections show action, administrator and timestamp');
  assert.ok(await evaluate(`/before change/i.test(document.body?.innerText) && /after change/i.test(document.body?.innerText) && document.body?.innerText.includes('9:00 AM') && document.body?.innerText.includes('9:30 AM')`), 'original and updated time-in are visible');
  await evaluate(`Array.from(document.querySelectorAll('details')).find(node => node.textContent.includes('Legacy correction')).open = true`);
  assert.ok(await evaluate(`document.body?.innerText.includes('Original times were not retained in this older record.')`), 'legacy correction does not invent original times');
  await call('Page.navigate', { url: `${origin}/overview?view=attendance` });
  await waitFor(`document.body?.innerText.includes('Reason for change') && document.body?.innerText.includes('Arrival corrected after checking the shift log.')`);
  assert.ok(await evaluate(`document.body?.innerText.includes('Time-in changed') && document.body?.innerText.includes('Forgot to scan; arrival verified by manager.')`), 'My Attendance opens complete correction history by default');
  console.log('Online portal and offline shell loaded.');
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); window.apiModule = await import('/__test/api.js'); return true; })()`);
  // Employee portals require an online session; offline storage and attendance capture are admin-only.
  assert.equal(await evaluate(`(async()=> await window.offlineModule.cachedRead('/api/employee/me') === undefined)()`), true, 'employee workspace is not cached offline');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const path of ['/api/employee/me', '/api/employee/me/leave-requests', '/api/employee/me/cash-advance-requests']) {
    assert.equal(await evaluate(`(async()=>{try{await window.apiModule.apiFetch(${JSON.stringify(path)}, ${JSON.stringify(path.endsWith('/me') ? {} : { method: 'POST', body: '{}' })});return false}catch{return true}})()`), true, 'employee actions require internet');
  }
  assert.equal(await evaluate(`(async()=> (await window.offlineModule.offlineItems()).length)()`), 0, 'employee offline actions did not queue records');
  assert.equal(mutations, 0, 'employee offline actions did not reach the server');
  console.log('PASS: employee offline reads and submissions are rejected without caching or queueing personal records.');
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  session.role = 'admin'; session.offlineOwner = 'admin:smoke-a1';
  await call('Page.navigate', { url: `${origin}/overview?admin-test=1` });
  await waitFor(`sessionStorage.getItem('workpulse_offline_owner') === 'admin:smoke-a1'`);
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); return true; })()`);
  await waitFor(`(async () => Array.isArray(await window.offlineModule.cachedRead('/api/employees')))()`);
  assert.equal(await evaluate(`(async () => !JSON.stringify(await window.offlineModule.cachedRead('/api/employees')).includes('NEVER-CACHE-THIS'))()`), true, 'directory cache excludes secrets and biometric samples');
  await evaluate(`(async()=>{window.apiModule=await import('/__test/api.js');await window.offlineModule.cacheRead('/api/attendance?from=2026-10-01&to=2026-10-15',[{employeeId:'E1',date:'2026-10-01',status:'Present'}]);await window.offlineModule.cacheRead('/api/attendance/correction?employeeId=E1&date=2026-10-01',{employee:{id:'E1',name:'Test'},sessions:[],version:'v1'})})()`);
  await evaluate(`window.dispatchEvent(new Event('workpulse-offline-change'))`);
  try {
  await waitFor(`Array.from(document.querySelectorAll('button')).some(button => /Offline records|Offline - cached data/.test(button.textContent))`);
  } catch(error) { console.log('Offline control diagnostic:', await evaluate(`({storage:Object.fromEntries(Object.entries(sessionStorage)),text:document.body.innerText})`)); throw error; }
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.equal(await evaluate(`(async()=>{for(const path of ['/api/employees','/api/attendance?from=2026-10-01&to=2026-10-15','/api/attendance/correction?employeeId=E1&date=2026-10-01']){const r=await window.apiModule.apiFetch(path);if(r.headers.get('X-WorkPulse-Offline')!=='true')return false}return true})()`),true);
  console.log('PASS: prepared administrator directory, attendance range and correction preview available offline.');
  await evaluate(`window.dispatchEvent(new Event('offline')); Array.from(document.querySelectorAll('button')).find(button => /Offline records|Offline - cached data/.test(button.textContent)).click();`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Add attendance'))`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Add attendance')).click()`);
  await waitFor(`document.body?.innerText.includes('Add manual attendance')`);
  await evaluate(`window.setCapture = (label, value) => { const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith(label)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; window.submitCapture = () => document.querySelector('form button[type="submit"]').closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));`);
  const today = attendanceDate;
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('label')).find(node=>node.textContent.startsWith('Date')).querySelector('input').disabled`), true, 'capture date is locked to today');
  await evaluate(`window.setCapture('Employee ID', 'E1');`);
  await evaluate(`window.setCapture('Date', ${JSON.stringify(today)}); window.setCapture('Time-in', '23:59');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Attendance times cannot be in the future.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'future time rejected locally');
  await evaluate(`window.setCapture('Date', ${JSON.stringify(today)}); window.setCapture('Time-in', '00:01'); window.setCapture('Time-out', '00:01');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Time-out must be after time-in.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'equal times rejected locally');
  await evaluate(`(() => { const set = (label, value) => { const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith(label)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; set('Employee ID', 'E1'); set('Time-in', '00:01'); set('Time-out', '00:02'); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save locally').click()`);
  await waitFor(`(async () => (await window.offlineModule.offlineItems()).some(item => item.kind === 'attendance' && item.status === 'pending'))()`);
  await evaluate(`window.setCapture('Time-in', '00:01'); window.setCapture('Time-out', '00:02');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('already has an unsynced Session')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 1, 'duplicate attendance rejected');
  await evaluate(`(() => { const input = document.querySelector('input[aria-label="Search local records"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'not-found'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Search').click()`);
  await waitFor(`document.body.innerText.includes('No matching records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await waitFor(`document.body.innerText.includes('Showing 1 of 1 records')`);
  await evaluate(`(() => { const select = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith('Status')).querySelector('select'); select.value = 'synced'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.body.innerText.includes('Showing 0 of 1 records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await evaluate(`(() => { const input = Array.from(document.querySelectorAll('label')).filter(node => node.textContent.startsWith('Date')).at(-1).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(tomorrow)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`document.body.innerText.includes('Showing 0 of 1 records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await waitFor(`document.body.innerText.includes('Showing 1 of 1 records')`);
  console.log('PASS: local today-only dates, future times, equal times and duplicate rejection; search, status/date filters and All reset.');
  const beforeAttendanceSync = mutations;
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await delay(300);
  assert.equal(mutations, beforeAttendanceSync, 'attendance does not auto-sync without admin confirmation');
  await evaluate(`(() => { const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith('Admin password for attendance sync')).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'test-only-password'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sync pending records').click()`);
  await waitFor(`(async () => (await window.offlineModule.offlineItems()).some(item => item.kind === 'attendance' && item.status === 'synced'))()`);
  assert.equal(mutations, beforeAttendanceSync + 1, 'admin confirmed attendance sync applies once');
  assert.equal(await evaluate(`(async () => !JSON.stringify(await window.offlineModule.offlineItems()).includes('test-only-password'))()`), true, 'confirmation password never persists in queue');
  assert.equal(await evaluate(`!document.querySelector('input[type="password"]') || document.querySelector('input[type="password"]').value === ''`), true, 'confirmation password cleared after sync');
  await call('Page.navigate', { url: `${origin}/overview?view=settings` });
  await waitFor(`!!document.getElementById('manager-hourly-rate')`);
  assert.ok(await evaluate(`document.body?.innerText.includes('Manager / Supervisor rate') && !document.getElementById('supervisor-hourly-rate')`), 'settings exposes one combined management rate');
  await call('Page.navigate', { url: `${origin}/overview?view=employees` });
  await waitFor(`!!document.getElementById('employee-role-filter')`);
  assert.deepEqual(await evaluate(`Array.from(document.getElementById('employee-role-filter').options).map(option => option.value)`), ['All', 'regular', 'extra', 'manager'], 'directory exposes three employee classifications');
  assert.ok(await evaluate(`document.body?.innerText.includes('Manager / Supervisor')`), 'legacy directory entry displays combined label');
  console.log('PASS: employee correction history and online-only controls; admin IndexedDB attendance capture, validation, filters, confirmed sync, secret-free caching, combined management settings and directory.');
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
  // Isolated profile is deliberately left in the OS temp directory for diagnostics.
}
