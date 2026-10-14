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
        syncCalls++;
        let input = ''; for await (const chunk of req) input += chunk;
        const { operation } = JSON.parse(input);
        if (syncStatus !== 200) { res.statusCode = syncStatus; return res.end(JSON.stringify({ error: syncStatus === 409 ? 'Controlled conflict: record changed.' : 'Controlled service outage.' })); }
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
  // Additional success, rejection, and recovery paths using real browser storage.
  await evaluate(`(async()=>{window.sessionModules=await Promise.all(['/__test/api.js?valid-offline','/__test/api.js?expired-offline','/__test/api.js?missing-offline'].map(path=>import(path)))})()`);
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const offlineReadPaths = ['/api/employee/me', '/api/employee/me/calendar?month=2026-10', '/api/employee/me/notifications'];
  const readCopies = await evaluate(`(async () => {
    await window.offlineModule.cacheRead('/api/employee/me/calendar?month=2026-10', { month: '2026-10', attendance: [] });
    await window.offlineModule.cacheRead('/api/employee/me/notifications', [{ id: 'my-notice' }]);
    const results = [];
    for (const path of ${JSON.stringify(offlineReadPaths)}) { const response = await window.apiModule.apiFetch(path); results.push(response.ok && response.headers.get('X-WorkPulse-Offline') === 'true'); }
    return results;
  })()`);
  assert.deepEqual(readCopies, [true, true, true], 'employee workspace, calendar, and notifications use prepared cached copies');
  assert.equal(await evaluate(`(async () => { const response = await window.apiModule.apiFetch('/api/employee/me'); const data = await response.json(); return ['profile','attendance','payroll','leaveRequests','cashAdvance','cashAdvanceRequests'].every(key => key in data); })()`), true, 'cached workspace retains personal record categories');
  console.log('PASS: employee cached profile, attendance, payroll, leave, advances, calendar and notifications.');
  const cashQueued = await evaluate(`(async () => { const r = await window.apiModule.apiFetch('/api/employee/me/cash-advance-requests', { method: 'POST', body: JSON.stringify({ amount: 100, repaymentAgreed: true, reason: 'Offline transport' }) }); const value = await r.json(); const item = (await window.offlineModule.offlineItems()).find(x => x.id === value.operationId); return { status: r.status, kind: item.kind, statusLabel: item.status, period: item.payload.requestPeriod }; })()`);
  assert.equal(cashQueued.status, 202); assert.equal(cashQueued.kind, 'cash-advance'); assert.equal(cashQueued.statusLabel, 'pending'); assert.match(cashQueued.period, /^\d{4}-\d{2}-(01|16)$/);
  console.log('PASS: offline cash advance request is pending, not approved/disbursed.');
  const unsupported = await evaluate(`(async () => {
    const paths = [ ['/api/auth/login','POST'], ['/api/auth/verify-otp','POST'], ['/api/attendance/kiosk','POST'], ['/api/fingerprints/identify','POST'], ['/api/leave-requests/L1','PATCH'], ['/api/cash-advance-requests/C1','PATCH'], ['/api/cash-advance-requests/C1/disburse','POST'], ['/api/payroll-requests/P1/confirm-payment','PATCH'], ['/api/employees','POST'], ['/api/settings','PUT'] ];
    const before = (await window.offlineModule.offlineItems()).length;
    const results = [];
    for (const [path, method] of paths) { try { await window.apiModule.apiFetch(path, { method, body: '{}' }); results.push(false); } catch (e) { results.push(e.message.includes('online connection')); } }
    return { results, unchanged: before === (await window.offlineModule.offlineItems()).length };
  })()`);
  assert.ok(unsupported.results.every(Boolean)); assert.equal(unsupported.unchanged, true);
  console.log('PASS: offline login, OTP, fingerprint, approvals, disbursement, payroll, employee creation and settings writes blocked without queueing.');
  const rejectedLocally = await evaluate(`(async () => {
    const owner = sessionStorage.getItem('workpulse_offline_owner'); const expiry = sessionStorage.getItem('workpulse_session_expires');
    const results = [];
    try {
      sessionStorage.removeItem('workpulse_offline_owner'); try { await window.offlineModule.queueOffline('leave', {}); results.push(false); } catch(e) { results.push(e.message.includes('sign in')); }
      sessionStorage.setItem('workpulse_offline_owner', owner); sessionStorage.setItem('workpulse_session_expires', new Date(0).toISOString());
      try { await window.offlineModule.queueOffline('leave', {}); results.push(false); } catch(e) { results.push(e.message.includes('expired')); }
      sessionStorage.setItem('workpulse_session_expires', expiry);
      for (const payload of [{ password: 'secret' }, { token: 'secret' }, { fingerprintSamples: ['scan'] }, { reason: 'x'.repeat(21000) }]) { try { await window.offlineModule.queueOffline('leave', payload); results.push(false); } catch(e) { results.push(e.message.includes('cannot be stored')); } }
    } finally { sessionStorage.setItem('workpulse_offline_owner', owner); sessionStorage.setItem('workpulse_session_expires', expiry); }
    return results;
  })()`);
  assert.ok(rejectedLocally.every(Boolean));
  console.log('PASS: missing login preparation, expired session, sensitive data and oversized queued payloads rejected.');
  const cacheFailures = await evaluate(`(async () => {
    const path = '/api/employee/me/calendar?month=2026-09';
    await window.offlineModule.cacheRead(path, { marker: 'stale' });
    await new Promise((resolve,reject) => { const open = indexedDB.open('workpulse-offline-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db=open.result; const tx=db.transaction('reads','readwrite'); const store=tx.objectStore('reads'); const get=store.get(window.offlineModule.offlineOwner()+':'+path); get.onsuccess=()=>store.put({...get.result,savedAt:Date.now()-8*24*60*60*1000}); tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=()=>reject(tx.error); }; });
    const staleMissing = await window.offlineModule.cachedRead(path) === undefined;
    const unprepared = await window.offlineModule.cachedRead('/api/employee/me/calendar?month=2020-01') === undefined;
    let surfaced=false; try { await window.apiModule.apiFetch(path); } catch(e) { surfaced=e.message.includes('no recent local copy'); }
    await window.offlineModule.cacheRead('/api/settings',{secret:'not-cacheable'});
    return { staleMissing, unprepared, surfaced, blocked: await window.offlineModule.cachedRead('/api/settings') === undefined };
  })()`);
  assert.deepEqual(cacheFailures, { staleMissing: true, unprepared: true, surfaced: true, blocked: true });
  console.log('PASS: stale (eight-day) and missing cache rejected; unsupported settings data not cached.');
  const limits = await evaluate(`(async () => {
    const owner = sessionStorage.getItem('workpulse_offline_owner'); sessionStorage.setItem('workpulse_offline_owner','employee:capacity-test');
    try {
      await new Promise((resolve,reject)=>{const open=indexedDB.open('workpulse-offline-v1');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('queue','readwrite');for(let i=0;i<200;i++)tx.objectStore('queue').put({id:'capacity-'+i,owner:'employee:capacity-test',kind:'leave',payload:{leaveType:'Personal Leave',requestedDates:['2026-12-01'],reason:'Capacity test'},createdAt:new Date().toISOString(),status:'pending'});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error)});
      try { await window.offlineModule.queueOffline('leave',{reason:'201st'}); return false; } catch(e) { return e.message.includes('200 unsynced'); }
    } finally { for(const item of await window.offlineModule.offlineItems())await window.offlineModule.deleteOfflineItem(item.id); sessionStorage.setItem('workpulse_offline_owner',owner); }
  })()`);
  assert.equal(limits, true);
  console.log('PASS: 200-record unsynced queue limit enforced; original account records preserved.');
  const sessionRecovery = await evaluate(`(async () => {
    const saved=Object.fromEntries(Object.entries(sessionStorage)); const before=(await window.offlineModule.offlineItems()).length; const outcomes=[];
    try {
      const valid=await window.sessionModules[0].restoreSession();outcomes.push(valid.data.authenticated===true);
      sessionStorage.setItem('workpulse_session_expires',new Date(0).toISOString());try{await window.sessionModules[1].restoreSession();outcomes.push(false)}catch{outcomes.push(true)}
      sessionStorage.clear();try{await window.sessionModules[2].restoreSession();outcomes.push(false)}catch{outcomes.push(true)}
    } finally { sessionStorage.clear();for(const [key,value] of Object.entries(saved))sessionStorage.setItem(key,value); }
    return {outcomes,preserved:(await window.offlineModule.offlineItems()).length===before};
  })()`);
  assert.deepEqual(sessionRecovery, { outcomes: [true,true,true], preserved:true });
  console.log('PASS: valid offline session restored; expired/missing session refused while durable queue survives session loss.');
  // Controlled server failures: retryable outages stay pending, validation conflicts require review.
  syncStatus = 503;
  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  try { await waitFor(`document.body.innerText.includes('Synchronization paused')`); }
  catch (error) { console.log('Recovery diagnostic:', { syncCalls, state: await evaluate(`({owner:sessionStorage.getItem('workpulse_offline_owner'),role:sessionStorage.getItem('workpulse_role'),online:navigator.onLine,text:document.body.innerText})`) }); throw error; }
  assert.equal(await evaluate(`(async()=> (await window.offlineModule.offlineItems()).some(x=>x.kind==='cash-advance'&&x.status==='pending'))()`),true);
  syncStatus = 409;
  await evaluate(`window.dispatchEvent(new Event('online'))`);
  await waitFor(`(async()=> (await window.offlineModule.offlineItems()).filter(x=>x.status==='pending').length===0)()`);
  assert.equal(await evaluate(`(async()=> (await window.offlineModule.offlineItems()).some(x=>x.status==='review'&&x.error.includes('Controlled conflict')) )()`),true);
  syncStatus = 200;
  await evaluate(`(async()=>{for(const item of await window.offlineModule.offlineItems())if(item.status==='review')await window.offlineModule.updateOfflineItem({...item,status:'pending',error:undefined});window.dispatchEvent(new Event('online'))})()`);
  await waitFor(`(async()=> (await window.offlineModule.offlineItems()).every(x=>x.status==='synced'))()`);
  console.log('PASS: HTTP 503 retains pending items; HTTP 409 produces Needs review; reviewed retry successfully syncs.');
  session.role = 'admin'; session.offlineOwner = 'admin:smoke-a1';
  await call('Page.navigate', { url: `${origin}/overview?admin-test=1` });
  await waitFor(`sessionStorage.getItem('workpulse_offline_owner') === 'admin:smoke-a1'`);
  await evaluate(`(async () => { window.offlineModule = await import('/__test/offline.js'); return true; })()`);
  await waitFor(`(async () => Array.isArray(await window.offlineModule.cachedRead('/api/employees')))()`);
  assert.equal(await evaluate(`(async () => !JSON.stringify(await window.offlineModule.cachedRead('/api/employees')).includes('NEVER-CACHE-THIS'))()`), true, 'directory cache excludes secrets and biometric samples');
  await evaluate(`(async()=>{window.apiModule=await import('/__test/api.js');await window.offlineModule.cacheRead('/api/attendance?from=2026-10-01&to=2026-10-15',[{employeeId:'E1',date:'2026-10-01',status:'Present'}]);await window.offlineModule.cacheRead('/api/attendance/correction?employeeId=E1&date=2026-10-01',{employee:{id:'E1',name:'Test'},sessions:[],version:'v1'})})()`);
  await waitFor(`Array.from(document.querySelectorAll('button')).some(button => /Offline records|Offline - cached data/.test(button.textContent))`);
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
  await evaluate(`window.setCapture('Employee ID', 'E1'); window.setCapture('Date', ${JSON.stringify(tomorrow)}); window.setCapture('Time-in', '09:00');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Choose today or a valid past date.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'future date rejected before local storage, even bypassing native form validation');
  await evaluate(`window.setCapture('Date', ${JSON.stringify(yesterday)}); window.setCapture('Time-out', '');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Past attendance needs both time-in and time-out.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'past open session rejected locally');
  await evaluate(`window.setCapture('Date', ${JSON.stringify(today)}); window.setCapture('Time-in', '23:59');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Attendance times cannot be in the future.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'future time rejected locally');
  await evaluate(`window.setCapture('Date', ${JSON.stringify(yesterday)}); window.setCapture('Time-in', '09:00'); window.setCapture('Time-out', '09:00');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('Time-out must be after time-in.')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 0, 'equal times rejected locally');
  await evaluate(`(() => { const set = (label, value) => { const input = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith(label)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; set('Employee ID', 'E1'); set('Time-in', '09:00'); set('Time-out', '17:00'); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save locally').click()`);
  await waitFor(`(async () => (await window.offlineModule.offlineItems()).some(item => item.kind === 'attendance' && item.status === 'pending'))()`);
  await evaluate(`window.setCapture('Time-in', '09:00'); window.setCapture('Time-out', '17:00');`);
  await evaluate(`window.submitCapture()`);
  await waitFor(`document.body.innerText.includes('A local attendance record already exists')`);
  assert.equal(await evaluate(`(async () => (await window.offlineModule.offlineItems()).length)()`), 1, 'duplicate attendance rejected');
  await evaluate(`(() => { const input = document.querySelector('input[aria-label="Search local records"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'not-found'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Search').click()`);
  await waitFor(`document.body.innerText.includes('No matching records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await waitFor(`document.body.innerText.includes('Showing 1 of 1 records')`);
  await evaluate(`(() => { const select = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith('Status')).querySelector('select'); select.value = 'synced'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.body.innerText.includes('Showing 0 of 1 records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await evaluate(`(() => { const select = Array.from(document.querySelectorAll('label')).find(node => node.textContent.startsWith('Record type')).querySelector('select'); select.value = 'leave'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.body.innerText.includes('Showing 0 of 1 records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await evaluate(`(() => { const input = Array.from(document.querySelectorAll('label')).filter(node => node.textContent.startsWith('Date')).at(-1).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(tomorrow)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`document.body.innerText.includes('Showing 0 of 1 records')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('All records')).click()`);
  await waitFor(`document.body.innerText.includes('Showing 1 of 1 records')`);
  console.log('PASS: local future date/time, past missing time-out, equal times and duplicate rejection; search, status/type/date filters and All reset.');
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
  console.log('PASS: employee correction reasons/actions/before-after history and legacy fallback; combined management role, settings and directory; real IndexedDB, offline shell reload, cached read markers, queue persistence, account isolation, unsafe-action blocking, storage failure, auto sync and lost-response idempotency.');
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
  // Isolated profile is deliberately left in the OS temp directory for diagnostics.
}
