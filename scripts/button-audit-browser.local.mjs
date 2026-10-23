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
const unexpectedApi = [], exceptions = [], results = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/auth/session') { res.end(JSON.stringify({ authenticated: true, role, accountType: role === 'admin' ? 'admin' : 'employee', mustChangePassword: requireInitialPassword, csrfToken: 'browser-test', offlineOwner: `${role}:browser-test`, expiresAt: new Date(Date.now() + 3600000).toISOString() })); return; }
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
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; };
async function waitFor(expression, description) { for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(expression)) return; await pause(100); } throw new Error(`Timed out: ${description}`); }
const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.innerText.trim() === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Button missing or disabled: ' + ${JSON.stringify(label)}); button.click(); return true; })()`);
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
    await check(`Admin ${label} workbook download handler`,async()=>{await evaluate(`(() => { const section=[...document.querySelectorAll('h3')].find(x=>x.textContent==='Excel reports').parentElement;const b=[...section.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Report button unavailable');b.click(); })()`);await waitFor(`document.body.textContent.includes('Excel report saved')`,'report toast');});
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
  role = 'regular';
  await check('Employee overview renders', async () => { await send('Page.navigate', { url: `${base}/overview?view=overview` }); await waitFor(`document.body.textContent.includes('Employee workspace') && document.body.textContent.includes('My Attendance')`, 'employee overview'); });
  for (const [label, expected] of [['My Calendar', 'Day details'], ['My Attendance', 'Time records'], ['Leave Requests', 'Request history'], ['My Payroll', 'Payroll history'], ['My Profile', 'Edit contact information']]) {
    await check(`Employee ${label}`, async () => { await click(label); await waitFor(`document.body.textContent.includes(${JSON.stringify(expected)})`, label); });
  }
  await check('Employee refresh success toast', async () => { await click('Refresh'); await waitFor(`document.body.textContent.includes('Workspace refreshed')`, 'refresh toast'); });
  await check('Employee contact editor opens and cancels', async () => { await click('Edit contact information'); await waitFor(`document.body.textContent.includes('Save changes')`, 'contact form'); await click('Cancel'); await waitFor(`document.body.textContent.includes('Edit contact information')`, 'contact cancel'); });

  await check('Employee payroll summary opens and closes',async()=>{await click('My Payroll');await waitFor(`document.body.textContent.includes('View summary')`,'payroll');await click('View summary');await waitFor(`document.body.textContent.includes('Print payslip')`,'summary');await click('Close payslip');});
  await check('Employee notification filters refresh and close',async()=>{await evaluate(`document.querySelector('button[aria-controls="employee-notification-panel"]').click()`);await waitFor(`!!document.getElementById('employee-notification-panel')`,'notifications');await evaluate(`document.querySelector('#employee-notification-panel button').focus()`);await evaluate(`document.querySelector('#employee-notification-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await waitFor(`!document.getElementById('employee-notification-panel')`,'notifications closed');});
  await check('Mobile employee sidebar opens and navigates', async () => { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); const labels = await evaluate(`[...document.querySelectorAll('button[aria-label]')].map(button=>button.getAttribute('aria-label'))`); const menu = labels.find(label => /open.*navigation/i.test(label)); assert.ok(menu); await click(menu); await click('My Attendance'); await waitFor(`document.body.textContent.includes('Time records')`, 'mobile attendance'); });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
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
  assert.equal(unexpectedApi.length, 0, `Unexpected API requests: ${unexpectedApi.join(', ')}`);
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} ws.close(); }
  browser.kill();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(root, 'docs/button-audit-browser-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Real headless Edge; built React app with controlled API fixtures. No live accounts or hardware.', results, exceptions, unexpectedApi }, null, 2) + '\n');
}
if (results.some(result => !result.passed) || exceptions.length || unexpectedApi.length) process.exitCode = 1;
