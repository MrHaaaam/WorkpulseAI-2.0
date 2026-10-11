// Isolated Edge smoke test: mocked API, real service worker and IndexedDB.
// Does not connect to Render, MongoDB, or the installed user's browser profile.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ts from 'typescript';

const receipts = new Map(); let mutations = 0; let loseNextResponse = false;
const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const session = { authenticated: true, role: 'supervisor', csrfToken: 'test-only-csrf', offlineOwner: 'employee:smoke-e1', expiresAt: expiry };
const workspace = { profile: { id: 'E1', name: 'Offline Smoke Employee', role: 'supervisor', status: 'active', biometricStatus: 'none', phone: '', address: '' }, attendance: [], leaveRequests: [], payroll: [], cashAdvanceMax: 1000, cashAdvanceRequests: [], cashAdvance: { advanced: 0, repaid: 0, balance: 0, advances: [], repayments: [] }, attendanceFlag: { tier: 'green', absenceDays: 0, periodStart: '2026-10-01', periodEnd: '2026-10-15' }, workSchedule: { workWeekdays: [1, 2, 3, 4, 5], scheduleOverrides: [] } };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__test/')) {
      const name = path.basename(url.pathname).replace('.js', '');
      if (!['api', 'offline', 'adminPasswordRetry'].includes(name)) { res.writeHead(404).end(); return; }
      if (name === 'adminPasswordRetry') { res.setHeader('Content-Type', 'text/javascript'); res.end('export function recordAdminPasswordRetry() {}'); return; }
      const source = await readFile(`src/lib/${name}.ts`, 'utf8');
      res.setHeader('Content-Type', 'text/javascript'); res.end(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText); return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/api/auth/session') return res.end(JSON.stringify(session));
      if (url.pathname === '/api/employee/me') return res.end(JSON.stringify(workspace));
      if (url.pathname === '/api/admin/account-security') return res.end(JSON.stringify({ name: 'Offline Smoke Admin', email: 'test-admin@example.invalid' }));
      if (url.pathname === '/api/overview') return res.end(JSON.stringify({ employees: [], payroll: [], attendance: [], leaveRequests: [], auditEvents: [] }));
      if (url.pathname === '/api/employees') return res.end(JSON.stringify([{ id: 'E1', name: 'Offline Smoke Employee', role: 'supervisor', status: 'active', passwordHash: 'NEVER-CACHE-THIS', fingerprintSamples: ['NEVER-CACHE-THIS'] }]));
      if (url.pathname === '/api/attendance/correction') return res.end(JSON.stringify({ employee: { id: 'E1', name: 'Offline Smoke Employee' }, sessions: [], version: 'test-empty-version' }));
      if (url.pathname === '/api/offline/sync') {
        let input = ''; for await (const chunk of req) input += chunk;
        const { operation } = JSON.parse(input);
        if (!receipts.has(operation.id)) { mutations++; receipts.set(operation.id, { id: `saved-${operation.id}`, status: 'pending', employeeId: 'E1' }); }
        if (loseNextResponse) { req.socket.destroy(); return; }
        return res.end(JSON.stringify(receipts.get(operation.id)));
      }
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
  console.log('Online portal and offline shell loaded.');
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); window.apiModule = await import('/__test/api.js'); return true; })()`);
  await waitFor(`(async () => !!(await window.offlineModule.cachedRead('/api/employee/me')))()`);
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const queued = await evaluate(`(async () => { const response = await window.apiModule.apiFetch('/api/employee/me/leave-requests', { method: 'POST', body: JSON.stringify({ leaveType: 'Personal Leave', requestedDates: ['2026-12-01'], reason: 'Offline smoke test' }) }); return { status: response.status, value: await response.json(), records: await window.offlineModule.offlineItems() }; })()`);
  assert.equal(queued.status, 202); assert.equal(queued.records.length, 1); assert.equal(queued.records[0].status, 'pending');
  assert.equal(mutations, 0);
  assert.ok(await evaluate(`document.body?.innerText.includes('Saved locally')`), 'pending-sync toast visible');
  assert.equal(await evaluate(`(async () => { try { await window.apiModule.apiFetch('/api/payroll-requests/P1/confirm-payment', { method: 'PATCH', body: '{}' }); return false; } catch { return (await window.offlineModule.offlineItems()).length === 1; } })()`), true, 'payment cannot be queued offline');
  assert.equal(await evaluate(`(async () => { try { await window.offlineModule.queueOffline('attendance', { password: 'DO-NOT-STORE' }); return false; } catch { return true; } })()`), true, 'password never stored');
  assert.equal(await evaluate(`(async () => { const response = await window.apiModule.apiFetch('/api/employee/me'); return response.headers.get('X-WorkPulse-Offline') === 'true'; })()`), true, 'cached response marked offline');
  const ownerIsolation = await evaluate(`(async () => { sessionStorage.setItem('workpulse_offline_owner', 'employee:another-account'); const isolated = (await window.offlineModule.offlineItems()).length === 0 && await window.offlineModule.cachedRead('/api/employee/me') === undefined; sessionStorage.setItem('workpulse_offline_owner', 'employee:smoke-e1'); return isolated; })()`);
  assert.equal(ownerIsolation, true, 'queue and reads isolated by account');
  const quotaFailure = await evaluate(`(async () => { const original = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function(name, mode) { if (mode === 'readwrite') throw new DOMException('Storage is full', 'QuotaExceededError'); return original.call(this, name, mode); }; try { await window.offlineModule.queueOffline('leave', { reason: 'Storage failure test' }); return false; } catch { return true; } finally { IDBDatabase.prototype.transaction = original; } })()`);
  assert.equal(quotaFailure, true, 'storage failure surfaced');
  console.log('Queue, storage errors, unsafe actions and account isolation checked.');
  await call('Page.reload');
  await waitFor(`document.body?.innerText.includes('Offline Smoke Employee') && document.body?.innerText.includes('Offline - cached data')`);
  // Test modules are not shell assets; normal cached UI must reopen without them.
  assert.equal(await evaluate(`!!document.querySelector('button')`), true);
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); window.apiModule = await import('/__test/api.js'); return true; })()`);
  await waitFor(`(async () => (await window.offlineModule.offlineItems()).every(item => item.status === 'synced'))()`);
  assert.equal(mutations, 1, 'queued request automatically synchronized once');
  console.log('Offline reload and automatic reconnect sync checked.');
  loseNextResponse = true;
  const ambiguous = await evaluate(`(async () => { const response = await window.apiModule.apiFetch('/api/employee/me/leave-requests', { method: 'POST', body: JSON.stringify({ leaveType: 'Personal Leave', requestedDates: ['2026-12-02'], reason: 'Lost response smoke test' }) }); return await response.json(); })()`);
  assert.equal(ambiguous.queued, true, 'lost response retained locally');
  loseNextResponse = false;
  const beforeRetry = mutations;
  await evaluate(`(async () => { const item = (await window.offlineModule.offlineItems()).find(item => item.id === ${JSON.stringify(ambiguous.operationId)}); const response = await window.apiModule.apiNetworkFetch('/api/offline/sync', { method: 'POST', body: JSON.stringify({ operation: { id: item.id, kind: item.kind, payload: item.payload } }) }); return response.ok; })()`);
  assert.equal(mutations, beforeRetry, 'retry uses original operation ID');
  session.role = 'admin'; session.offlineOwner = 'admin:smoke-a1';
  await call('Page.navigate', { url: `${origin}/overview?admin-test=1` });
  await waitFor(`sessionStorage.getItem('workpulse_offline_owner') === 'admin:smoke-a1'`);
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); return true; })()`);
  await waitFor(`(async () => Array.isArray(await window.offlineModule.cachedRead('/api/employees')))()`);
  assert.equal(await evaluate(`(async () => !JSON.stringify(await window.offlineModule.cachedRead('/api/employees')).includes('NEVER-CACHE-THIS'))()`), true, 'directory cache excludes secrets and biometric samples');
  await waitFor(`Array.from(document.querySelectorAll('button')).some(button => /Offline records|Offline - cached data/.test(button.textContent))`);
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`window.dispatchEvent(new Event('offline')); Array.from(document.querySelectorAll('button')).find(button => /Offline records|Offline - cached data/.test(button.textContent)).click();`);
  await waitFor(`document.body?.innerText.includes('Capture manual attendance locally')`);
  await evaluate(`(() => { const set = (label, value) => { const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith(label)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; set('Employee ID', 'E1'); set('Time-in', '09:00'); set('Time-out', '17:00'); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save locally').click()`);
  await waitFor(`(async () => (await window.offlineModule.offlineItems()).some(item => item.kind === 'attendance' && item.status === 'pending'))()`);
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
  console.log('PASS: combined management role, settings and directory; real IndexedDB, offline shell reload, cached read markers, queue persistence, account isolation, unsafe-action blocking, storage failure, auto sync and lost-response idempotency.');
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
  // Isolated profile is deliberately left in the OS temp directory for diagnostics.
}
