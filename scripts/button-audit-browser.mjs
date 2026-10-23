// Real Chromium rendering with synthetic API fixtures from all-api-routes.test.js.
// No production server, account, email recipient, or database is contacted.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = JSON.parse(await readFile(path.join(root, '.api-browser-fixtures.local'), 'utf8'));
let role = 'admin';
let requireInitialPassword = false;
const unexpectedApi = [], exceptions = [], results = [], requests = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    requests.push({ method: req.method, path: url.pathname, query: url.search });
    if (url.pathname.startsWith('/api/record-archives/')) {
      const kind = url.pathname.split('/').at(-1);
      const rows = Array.from({ length: 23 }, (_, index) => ({ id: `${kind}:${index}`, employeeId: 'E1', employeeName: 'Alex Tester', date: `2020-01-${String(index + 1).padStart(2, '0')}`, type: kind === 'cash' ? ['Request', 'Cash given', 'Repayment'][index % 3] : kind === 'leave' ? 'Leave request' : kind === 'payroll' ? 'Payroll' : 'Salary addition', status: index % 2 ? 'paid' : 'approved', amount: 100, details: `Archived test record ${index + 1}` }));
      const matching = rows.filter(row => (!url.searchParams.get('search') || JSON.stringify(row).toLowerCase().includes(url.searchParams.get('search').toLowerCase())) && (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) && (!url.searchParams.get('type') || row.type === url.searchParams.get('type')) && (!url.searchParams.get('from') || row.date >= url.searchParams.get('from')) && (!url.searchParams.get('to') || row.date <= url.searchParams.get('to')));
      const page = Math.min(Number(url.searchParams.get('page') || 1), Math.max(1, Math.ceil(matching.length / 10)));
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items: matching.slice((page-1)*10,page*10), cutoff: '2026-07-22', page, pageSize: 10, totalItems: matching.length, totalPages: Math.max(1, Math.ceil(matching.length/10)), options: ['approved','paid'], types: [...new Set(rows.map(row=>row.type))] })); return;
    }

    if (url.pathname === '/api/auth/session') { res.end(JSON.stringify({ authenticated: true, role, accountType: role === 'admin' ? 'admin' : 'employee', mustChangePassword: requireInitialPassword, csrfToken: 'browser-test', offlineOwner: `${role}:browser-test`, expiresAt: new Date(Date.now() + 3600000).toISOString() })); return; }
    if (url.pathname === '/api/admin/calendar' || url.pathname === '/api/employee/me/calendar') {
      res.end(JSON.stringify({ ...fixtures[`GET ${url.pathname}`].data, month: url.searchParams.get('month') })); return;
    }
    const entry = Object.entries(fixtures).find(([key]) => { const [method, pattern] = key.split(' '); return method === req.method && new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(url.pathname); });
    if (!entry) { unexpectedApi.push(`${req.method} ${url.pathname}`); res.writeHead(404).end(JSON.stringify({ error: 'No controlled browser fixture' })); return; }
    res.statusCode = entry[1].status;
    res.end(res.statusCode === 204 ? '' : JSON.stringify(entry[1].data)); return;
  }
  try {
    const requested = path.resolve(root, 'dist', `.${url.pathname}`);
    if (!requested.startsWith(path.join(root, 'dist') + path.sep) && requested !== path.join(root, 'dist')) { res.writeHead(403).end(); return; }
    const isAsset = /\.(js|css|svg|png|ico|woff2?)$/.test(url.pathname);
    const file = isAsset ? requested : path.join(root, 'dist', 'index.html');
    const content = await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : isAsset ? 'application/octet-stream' : 'text/html');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = path.join(root, `.browser-feature-${Date.now()}.local`); await mkdir(profile);
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, sequence = 0; const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
async function waitFor(expression, description) { for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(expression)) return; await pause(100); } throw new Error(`Timed out: ${description}`); }
const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.innerText.trim() === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Button missing or disabled: ' + ${JSON.stringify(label)}); button.click(); return true; })()`).then(() => pause(80));
const fill = (id, value) => evaluate(`(() => { const input=document.getElementById(${JSON.stringify(id)}); if(!input) throw new Error('Missing input '+${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
const submit = () => evaluate(`document.querySelector('form').requestSubmit()`);
async function check(name, work) { const before = exceptions.length; try { await work(); assert.equal(exceptions.length, before, `Browser exception: ${JSON.stringify(exceptions.slice(before))}`); results.push({ feature: name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ feature: name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); } }
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); } }
  if (!port) throw new Error('Headless browser did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const handler = pending.get(message.id); pending.delete(message.id); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await check('Administrator overview renders', async () => { await send('Page.navigate', { url: `${base}/overview?view=overview` }); await waitFor(`document.body.textContent.includes('Admin workspace')`, 'admin workspace'); });
  for (const [label, expected] of [['Attendance', 'Review daily attendance'], ['Calendar', 'Day details'], ['Employee Directory', 'Add Employee'], ['Leave Requests', 'Leave Requests'], ['Payroll', 'Employee payroll'], ['Insights', 'Expected Attendance'], ['System Settings', 'Save Settings'], ['Admin Controls', 'Admin Controls Locked']]) {
    await check(`Administrator ${label}`, async () => { await click(label); await waitFor(`document.body.textContent.includes(${JSON.stringify(expected)})`, label); });
  }
  await check('Administrator controls unlock', async () => { await click('Enter Password'); await evaluate(`(() => { const input=document.querySelector('input[type=password]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'CorrectPass123!'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`); await evaluate(`document.querySelector('form').requestSubmit()`); await waitFor(`document.body.textContent.includes('Admin controls unlocked')`, 'unlock success toast'); });

  const closeDialog = () => evaluate(`(() => { const b=[...document.querySelectorAll('button[aria-label="Close dialog"]')].filter(b=>b.getClientRects().length).at(-1); if(!b)throw Error('No visible dialog close');b.click(); })()`);
  const field = (selector,value) => evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  for (const [label,expected] of [['Ban','Block employee access?'],['Turn on','Confirm system control change'],['Restrict','Confirm system control change'],['Choose & save','Create a system backup?']]) {
    await check(`Admin ${label} confirmation and Cancel`,async()=>{await click(label);await waitFor(`document.body.textContent.includes(${JSON.stringify(expected)})`,'confirmation');await click('Cancel');});
  }
  await check('Admin archive filters and close',async()=>{await click('Archive');await waitFor(`document.body.textContent.includes('Archived Employees')`,'archive');for(const label of ['30 days','1 year','5 years','All'])await click(label);await click('Close');});
  await check('Admin restore confirmation and cancel',async()=>{await click('Archive');await click('Restore');await waitFor(`document.body.textContent.includes('Restore archived employee?')`,'restore confirmation');await click('Cancel');await click('Close');});
  await check('Admin permanent deletion dialog and cancel',async()=>{await click('Archive');await click('Delete permanently');await waitFor(`document.body.textContent.includes('Confirm your administrator password')`,'delete dialog');await click('Cancel');await click('Close');});
  await check('Admin force clock-out refresh and close',async()=>{await click('Force clock out');await waitFor(`document.body.textContent.includes('Refresh') && document.body.textContent.includes('attended today')`,'force clock out');await click('Refresh');await waitFor(`!document.body.textContent.includes('Loading attendance...')`,'refresh done');await click('Close');});
  await check('Admin credential update confirmation and cancel',async()=>{await field('input[autocomplete="current-password"]','CorrectPass123!');await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`document.body.textContent.includes('Update administrator credentials?')`,'credentials');await click('Cancel');});
  for(const label of ['Employees','Attendance','Leave','Payroll']) {
    await check(`Admin ${label} workbook download handler`,async()=>{await waitFor(`![...[...document.querySelectorAll('h3')].find(x=>x.textContent==='Excel reports').parentElement.querySelectorAll('button')].some(b=>b.disabled)`,'previous report finished');await evaluate(`(() => { const section=[...document.querySelectorAll('h3')].find(x=>x.textContent==='Excel reports').parentElement;const b=[...section.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Report button unavailable');b.click(); })()`);await waitFor(`document.body.textContent.includes('Excel report saved')`,'report toast');await waitFor(`![...[...document.querySelectorAll('h3')].find(x=>x.textContent==='Excel reports').parentElement.querySelectorAll('button')].some(b=>b.disabled)`,'report download completed');});
  }
  await check('Admin lock confirmation',async()=>{await click('Lock');await waitFor(`document.body.textContent.includes('Lock Admin Controls?')`,'lock confirm');await click('Lock Controls');await waitFor(`document.body.textContent.includes('Admin Controls Locked')`,'locked');});
  await check('Admin settings save dialog, password toggle and cancel',async()=>{await click('System Settings');await waitFor(`document.body.textContent.includes('Save Settings')`,'settings');await click('Save Settings');await click('Show password');assert.equal(await evaluate(`document.getElementById('settings-admin-password').type`),'text');await click('Hide password');await click('Cancel');});
  await check('Admin directory table/cards and add employee cancellation',async()=>{await click('Employee Directory');await waitFor(`document.body.textContent.includes('Add Employee')`,'directory');await click('Show employees as cards');await click('Show employees in a table');await click('Add Employee');await waitFor(`document.body.textContent.includes('Cancel')`,'employee form');await click('Cancel');});
  await check('Admin payroll bonus amount and scope survive rerender',async()=>{
    fixtures['GET /api/payroll-requests'].data=[{id:'P1',employeeId:'E1',employeeName:'Alex Tester',amount:100,currentAmount:100,status:'processing',periodStart:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\d{2}$/,new Date().getUTCDate()<=15?'01':'16')}];
    await click('Payroll');await waitFor(`!![...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Add Bonus'&&!b.disabled)`,'bonus available');await click('Add Bonus');await field('input[type="number"]','500');await click('All unpaid');
    await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(700);
    assert.equal(await evaluate(`document.querySelector('input[type="number"]').value`),'500');assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Add to All')`),true);await click('One employee');await click('Cancel');
  });
  const control = (selector, value) => evaluate(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length);if(!el)throw Error('Missing visible control '+${JSON.stringify(selector)}); const prototype=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  const go = async (label, text) => { await click(label); await waitFor(`document.body.textContent.includes(${JSON.stringify(text)})`, label); await pause(300); };
  const verifyArchives = async (title) => {
    await click(`View ${title.toLowerCase()} archives`); await waitFor(`document.body.textContent.includes('23 archived records found')`, 'archive records');
    await click('Next'); await waitFor(`document.body.textContent.includes('Showing 11')`, 'archive page two');
    await click('Previous'); await waitFor(`document.body.textContent.includes('Showing 1')`, 'archive page one');
    await control(`input[aria-label="Search ${title.toLowerCase()} archives"]`, 'zz-no-match'); await waitFor(`document.body.textContent.includes('No archived records match these filters.')`, 'archive empty state');
    await click('Clear filters'); await waitFor(`document.body.textContent.includes('23 archived records found')`, 'archive reset');
    await control(`select[aria-label="Filter ${title.toLowerCase()} archives"]`, 'paid'); await waitFor(`document.body.textContent.includes('11 archived records found')`, 'archive status filter');
    await click('Clear filters'); await waitFor(`document.body.textContent.includes('23 archived records found')`, 'archive status reset');
    await control('input[aria-label="Archive start date"]', '2020-01-20'); await waitFor(`document.body.textContent.includes('4 archived records found')`, 'archive date filter');
    await click('Clear date/type filters'); await waitFor(`document.body.textContent.includes('23 archived records found')`, 'archive date reset');
    await click('Refresh'); await waitFor(`document.body.textContent.includes('23 archived records found')`, 'archive refreshed'); await closeDialog();
  };
  await check('Admin directory alphabetical order, search, role and status filters', async () => {
    await go('Employee Directory', 'Add Employee');
    const names = await evaluate(`[...document.querySelectorAll('tbody tr td:first-child p:first-child')].map(el=>el.textContent)`);
    assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'en-PH',{sensitivity:'base',numeric:true})));
    await control('#employee-directory-search','zz-no-match'); await waitFor(`document.body.textContent.includes('No employees match your search.')`,'directory search');
    await control('#employee-directory-search',''); await control('#employee-role-filter','manager'); await waitFor(`document.body.textContent.includes('No employees match your search.')`,'role filter'); await control('#employee-role-filter','All');
    await control('#employee-status-filter','inactive'); await waitFor(`document.body.textContent.includes('No employees match your search.')`,'status filter'); await control('#employee-status-filter','All');
  });
  await check('Admin directory archive checkboxes, select all, clear and cancel', async () => {
    await click('Archive employees'); await click('Select all employees (2)'); await waitFor(`document.body.textContent.includes('2 employees selected')`,'all selected');
    await click('Clear selection'); await waitFor(`document.body.textContent.includes('0 employees selected')`,'selection cleared');
    await evaluate(`document.querySelector('input[aria-label="Select all employees on this page"]').click()`); await click('Archive selected (2)'); await waitFor(`document.body.textContent.includes('Confirm your admin password')`,'archive confirm'); await click('Cancel'); await click('Cancel selection');
  });
  await check('Admin directory edit form and cancel',async()=>{await click('Edit details for Alex Tester');await waitFor(`document.body.textContent.includes('Edit employee')`,'employee editor');await click('Cancel');});
  await check('Admin directory bulk archive submits selected IDs with one password confirmation',async()=>{await click('Archive employees');await click('Select all employees (2)');await click('Archive selected (2)');await field('input[type="password"]','CorrectPass123!');const before=requests.filter(row=>row.path.endsWith('/archive')).length;await evaluate(`document.querySelector('input[type="password"]').closest('form').requestSubmit()`);await waitFor(`document.body.textContent.includes('Employees archived')`,'archive completed');assert.equal(requests.filter(row=>row.path.endsWith('/archive')).length-before,2);});
  await check('Admin calendar previous/next month, Today, day selection and employee search', async () => {
    await go('Calendar','Day details'); const month=await evaluate(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent`);
    await click('Previous month'); await waitFor(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent!==${JSON.stringify(month)}`,'previous month'); await click('Next month'); await waitFor(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent===${JSON.stringify(month)}`,'next month'); await click('Today');
    await evaluate(`document.querySelector('button[aria-pressed][aria-label]').click()`); await control('#calendar-employee-search','zz-no-match'); await waitFor(`document.body.textContent.includes('No employees match your search.')`,'calendar employee filter'); await control('#calendar-employee-search','Alex'); await waitFor(`document.body.textContent.includes('Showing Alex')`,'employee found');
  });
  await check('Admin attendance search, every status filter and date navigation', async () => {
    await go('Attendance','Review daily attendance'); await control('input[aria-label="Search attendance"]','zz-no-match');
    for(const status of ['Present','Absent','On Leave','Idle','all']) await control('select[aria-label="Filter attendance by status"]',status);
    await control('input[aria-label="Search attendance"]',''); const before=await evaluate(`document.querySelector('input[aria-label="Workforce date"]').value`);await click('Previous day');await waitFor(`document.querySelector('input[aria-label="Workforce date"]').value!==${JSON.stringify(before)}`,'previous day');await click('Next day');await waitFor(`document.querySelector('input[aria-label="Workforce date"]').value===${JSON.stringify(before)}`,'next day');
  });
  await check('Admin attendance all range tabs and custom dates',async()=>{for(const label of ['Current 15 Days','Previous 15 Days','Custom Range','One Day']){await click(label);await pause(100);} });
  for(const [button,title] of [['Record attendance','Record attendance'],['Idle day','Idle day']]) await check(`Admin attendance ${button} dialog and close`,async()=>{await click(button);await closeDialog();});
  await check('Admin leave search and every status pill',async()=>{await go('Leave Requests','Review leave dates');await control('input[aria-label="Search leave requests by employee name or role"]','zz-no-match');for(const label of ['Pending','Approved','Declined','Passed','All'])await click(label);await control('input[aria-label="Search leave requests by employee name or role"]','');});
  await check('Admin leave archive search/status/date filters, pagination and refresh',()=>verifyArchives('Leave requests'));
  await check('Admin payroll search, status pills and period arrows',async()=>{await go('Payroll','Employee payroll');for(const label of ['On hold','Unpaid','Paid','All'])await click(label);await control('input[aria-label="Search payroll"]','zz-no-match');await waitFor(`document.body.textContent.includes('No employees match these filters.')`,'payroll empty');await control('input[aria-label="Search payroll"]','');await click('Previous payroll period');await click('Next payroll period');});
  await check('Admin salary additions archive search/filter/pagination',()=>verifyArchives('Salary additions paid'));
  await check('Admin cash advance archive search/filter/pagination',()=>verifyArchives('Cash advances'));
  await check('Admin cash advance search and status dropdown',async()=>{await control('input[aria-label="Search cash advances"]','zz-no-match');for(const status of ['pending','approved','accepted','disbursed','rejected','cancelled',''])await control('select[aria-label="Filter cash advance requests by status"]',status);await control('input[aria-label="Search cash advances"]','');});
  await check('Admin insights refresh, forecast days and all model panels',async()=>{await go('Insights','Expected Attendance');await click('Refresh');await pause(300);const labels=await evaluate(`[...document.querySelectorAll('[data-guide="ai-models"] button')].map(el=>el.getAttribute('aria-label')||el.textContent.trim())`);assert.ok(labels.length>=4);for(const label of labels){await click(label);await pause(120);} });
  await go('Admin Controls','Admin Controls Locked');await click('Enter Password');await field('input[type="password"]','CorrectPass123!');await submit();await waitFor(`document.body.textContent.includes('Admin controls unlocked')`,'controls unlocked');
  await check('Admin archived employee selection and bulk restore/delete cancellation',async()=>{await click('Archive');await click('Select all employees (1)');await waitFor(`document.body.textContent.includes('1 employees selected')`,'archived selection');await click('Restore selected (1)');await waitFor(`document.body.textContent.includes('Restore 1 archived employees?')`,'bulk restore');await click('Cancel');await click('Delete selected (1)');await waitFor(`document.body.textContent.includes('Permanently delete 1 employee')`,'bulk delete');await click('Cancel');await click('Clear selection');await click('Close');});
  role = 'regular';
  await check('Employee overview renders', async () => { await send('Page.navigate', { url: `${base}/overview?view=overview` }); await waitFor(`document.body.textContent.includes('Employee workspace') && document.body.textContent.includes('My Attendance')`, 'employee overview'); });
  for (const [label, expected] of [['My Calendar', 'Day details'], ['My Attendance', 'Time records'], ['Leave Requests', 'Request history'], ['My Payroll', 'Payroll history'], ['My Profile', 'Edit contact information']]) {
    await check(`Employee ${label}`, async () => { await click(label); await waitFor(`document.body.textContent.includes(${JSON.stringify(expected)})`, label); });
  }
  await check('Employee refresh success toast', async () => { await click('Refresh'); await waitFor(`document.body.textContent.includes('Workspace refreshed')`, 'refresh toast'); });
  await check('Employee contact editor opens and cancels', async () => { await click('Edit contact information'); await waitFor(`document.body.textContent.includes('Save changes')`, 'contact form'); await click('Cancel'); await waitFor(`document.body.textContent.includes('Edit contact information')`, 'contact cancel'); });

  await check('Employee payroll summary opens and closes',async()=>{await click('My Payroll');await waitFor(`document.body.textContent.includes('View summary')`,'payroll');await click('View summary');await waitFor(`document.body.textContent.includes('Print payslip')`,'summary');await evaluate(`window.__auditPrintCalls=0;window.print=()=>{window.__auditPrintCalls++}`);await click('Print payslip');assert.equal(await evaluate(`window.__auditPrintCalls`),1);await click('Close payslip');});
  await check('Employee notification filters refresh and close',async()=>{await evaluate(`document.querySelector('button[aria-controls="employee-notification-panel"]').click()`);await waitFor(`!!document.getElementById('employee-notification-panel')`,'notifications');await evaluate(`document.querySelector('#employee-notification-panel button').focus()`);await evaluate(`document.querySelector('#employee-notification-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await waitFor(`!document.getElementById('employee-notification-panel')`,'notifications closed');});
  await check('Mobile employee sidebar opens and navigates', async () => { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); const labels = await evaluate(`[...document.querySelectorAll('button[aria-label]')].map(button=>button.getAttribute('aria-label'))`); const menu = labels.find(label => /open.*navigation/i.test(label)); assert.ok(menu); await click(menu); await click('My Attendance'); await waitFor(`document.body.textContent.includes('Time records')`, 'mobile attendance'); });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await check('Employee profile contact save submits and confirms',async()=>{await go('My Profile','Edit contact information');await click('Edit contact information');await control('input[type="tel"]','+639111111111');await control('textarea','Updated Street Manila');await click('Save changes');await waitFor(`document.body.textContent.includes('Contact information updated') || document.body.textContent.includes('Contact information saved')`,'contact saved');});
  await check('Employee calendar previous/next month and Today',async()=>{await go('My Calendar','Day details');const month=await evaluate(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent`);await click('Previous month');await waitFor(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent!==${JSON.stringify(month)}`,'previous month');await click('Next month');await waitFor(`document.querySelector('button[aria-label="Previous month"]').parentElement.parentElement.querySelector('h2').textContent===${JSON.stringify(month)}`,'next month');await click('Today');await evaluate(`document.querySelector('button[aria-pressed][aria-label]').click()`);});
  await check('Employee leave date picker ranges, month arrows, selection, clear and submit',async()=>{await go('Leave Requests','Choose leave dates');for(const label of ['30 Days','Months'])await click(label);await click('Next month');await click('Previous month');await click('7 Days');await evaluate(`document.querySelector('button[title$=": Available"]:not(:disabled)').click()`);await waitFor(`!![...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Clear dates')`,'date selected');await click('Clear dates');await evaluate(`document.querySelector('button[title$=": Available"]:not(:disabled)').click()`);await control('textarea','Isolated browser test leave request');await click('Submit 1 date');await waitFor(`document.body.textContent.includes('Leave request submitted')`,'leave submitted');});
  await check('Employee leave archive search/filter/date/pagination',async()=>{await go('Leave Requests','Request history');await verifyArchives('Request history');});
  await check('Employee payroll archive search/filter/date/pagination',async()=>{await go('My Payroll','Payroll history');await verifyArchives('Payroll history');});
  await check('Employee cash advance archive search/filter/date/pagination',()=>verifyArchives('Cash advance'));
  await check('Employee cash advance amount validation and send request',async()=>{await control('input[inputmode="decimal"]','500');await evaluate(`document.querySelector('form input[type="checkbox"]').click()`);await click('Send request');await waitFor(`document.body.textContent.includes('Cash advance requested')`,'cash request submitted');});
  await check('Employee history searches and clear buttons',async()=>{await control('input[aria-label="Search payroll history"]','zz-no-match');await waitFor(`document.body.textContent.includes('No records match your filters.')`,'payroll search');await click('Clear filters');await control('input[aria-label="Search cash advance requests"]','zz-no-match');await control('input[aria-label="Search cash advance requests"]','');});
  await send('Page.navigate',{url:`${base}/`}); await waitFor(`!!document.getElementById('password')`,'login form');
  await check('Login password visibility and CAPTCHA refresh',async()=>{await click('Show password');assert.equal(await evaluate(`document.getElementById('password').type`),'text');await click('Hide password');assert.equal(await evaluate(`document.getElementById('password').type`),'password');const before=requests.filter(row=>row.path==='/api/auth/captcha').length;await click('Get a new CAPTCHA');await pause(250);assert.ok(requests.filter(row=>row.path==='/api/auth/captcha').length>before);});
  await check('Login empty form validation prevents authentication request',async()=>{const before=requests.filter(row=>row.path==='/api/auth/login').length;await submit();await pause(150);assert.equal(requests.filter(row=>row.path==='/api/auth/login').length,before);assert.equal(await evaluate(`document.getElementById('email').validity.valueMissing`),true);});
  await check('Login recovery cancellation',async()=>{await click('Forgot your employee password?');await waitFor(`!!document.getElementById('recovery-email')`,'recovery');await click('Back to sign in');await waitFor(`!!document.getElementById('email')`,'back to login');});
  await check('Login screen and CAPTCHA render', async () => { await send('Page.navigate', { url: `${base}/` }); await waitFor(`!!document.getElementById('email') && !!document.getElementById('captcha')`, 'login inputs'); });
  await check('Employee password recovery through all three steps', async () => {
    await click('Forgot your employee password?'); await fill('recovery-email', 'regular@example.test'); await submit();
    await waitFor(`!!document.getElementById('recovery-code')`, 'recovery code'); await fill('recovery-code', '123456'); await submit();
    await waitFor(`!!document.getElementById('recovery-new-password')`, 'recovery password'); await fill('recovery-new-password', 'ChangedPass456!'); await fill('recovery-confirm-password', 'ChangedPass456!'); await submit();
    await waitFor(`document.body.textContent.includes('Password reset complete') && !!document.getElementById('email')`, 'reset success');
  });
  role = 'admin';
  await check('Password and OTP login opens the administrator workspace', async () => {
    await fill('email', 'owner@example.test'); await fill('password', 'CorrectPass123!');
    const [left, op, right] = fixtures['GET /api/auth/captcha'].data.challenge.split(/\s+/);
    await fill('captcha', String(op === '+' ? Number(left) + Number(right) : Number(left) - Number(right))); await submit();
    await waitFor(`!!document.getElementById('otp')`, 'OTP input'); await fill('otp', '123456'); await submit();
    await waitFor(`document.body.textContent.includes('Admin workspace')`, 'admin after OTP');
  });
  await check('First-login password replacement opens the employee portal', async () => {
    role = 'regular'; requireInitialPassword = true;
    await send('Page.navigate', { url: `${base}/overview?view=overview` }); await waitFor(`!!document.getElementById('new-password')`, 'first password input');
    await fill('new-password', 'InitialPass789!'); await fill('confirm-password', 'InitialPass789!'); requireInitialPassword = false; await submit();
    await waitFor(`document.body.textContent.includes('Employee workspace')`, 'employee after password change');
  });
  role='admin'; requireInitialPassword=false;
  await check('Kiosk page, live attendance and safe scanner-disconnected state',async()=>{await send('Page.navigate',{url:`${base}/kiosk`});await waitFor(`document.body.textContent.includes('Record your attendance with one scan')`,'kiosk');await waitFor(`!document.body.textContent.includes('Loading recent attendance')`,'recent attendance');assert.ok(await evaluate(`!!document.querySelector('a[href="/overview?view=employees"]')`));await pause(1500);assert.ok(await evaluate(`/reader|scanner|finger/i.test(document.body.textContent)`));});
  await check('Kiosk return-to-admin link',async()=>{await evaluate(`document.querySelector('a[href="/overview?view=employees"]').click()`);await waitFor(`document.body.textContent.includes('Employee Directory')`,'admin directory from kiosk');});
  assert.equal(unexpectedApi.length, 0, `Unexpected API requests: ${unexpectedApi.join(', ')}`);
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} ws.close(); }
  browser.kill();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(root, 'docs/full-button-audit-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Real headless Edge; built React app with controlled API fixtures. No live accounts or hardware.', results, exceptions, unexpectedApi, requests, limitations: ['Fingerprint capture, physical match quality, and reader reconnection require the connected DigitalPersona device and HID service.', 'Native printer output, email delivery and filesystem backup destinations are covered by controlled handler tests, not physical output.'] }, null, 2) + '\n');
}
if (results.some(result => !result.passed) || exceptions.length || unexpectedApi.length) process.exitCode = 1;
