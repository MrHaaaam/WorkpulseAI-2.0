const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the real React action handlers with controlled state and API responses.
// These tests never contact an account, send email, or modify live records.
function harness(file, component, { state = {}, props = {}, section = 'overview', api, extra = '' } = {}) {
  const values = new Map(Object.entries(state));
  const refs = []; let refIndex = 0;
  const effects = [], timers = [], toasts = [], replacements = [], assignments = [];
  let clears = 0;
  const useState = (name, initial) => {
    if (!values.has(name)) values.set(name, typeof initial === 'function' ? initial() : initial);
    return [values.get(name), next => values.set(name, typeof next === 'function' ? next(values.get(name)) : next)];
  };
  const react = {
    useState: initial => useState(`unnamed:${values.size}`, initial),
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useMemo: callback => callback(), useCallback: callback => callback, useEffect: callback => effects.push(callback), Fragment: 'Fragment',
  };
  const window = {
    location: { pathname: '/overview', replace: url => replacements.push(url), assign: url => assignments.push(url) },
    history: { replaceState(_, __, url) { window.location.pathname = url; } },
    setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {},
    setInterval() {}, clearInterval() {}, addEventListener() {}, removeEventListener() {},
  };
  const absolute = path.join(__dirname, '..', file);
  const source = fs.readFileSync(absolute, 'utf8') + extra;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    transformers: { before: [context => {
      const visit = node => {
        if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
          const call = node.initializer;
          const hook = call.expression.getText();
          if (['useState', 'useCachedState'].includes(hook)) {
            const name = node.name.elements[0].name.getText();
            const args = hook === 'useCachedState' ? [call.arguments[1]] : [...call.arguments];
            return context.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type,
              context.factory.createCallExpression(context.factory.createIdentifier('__state'), undefined, [context.factory.createStringLiteral(name), ...args]));
          }
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }] },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __state: useState, window, console, Date, Set, Map, Promise, Error, URL, AbortController, queueMicrotask,
    document: { visibilityState: 'visible', hidden: false, body: { style: {} }, addEventListener() {}, removeEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-dom') return { createPortal: value => value };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name.includes('/ui/Toast')) return { useToast: () => ({ toast: value => toasts.push(value) }) };
      if (name.endsWith('/api') || name.endsWith('/api.ts')) return { apiFetch: (...args) => api(...args), clearSession: () => { clears++; }, storeSession() {} };
      if (name.includes('usePortalNavigation')) return { usePortalNavigation: () => [section, () => {}] };
      if (name.includes('useArchiveCutoff')) return { useArchiveCutoff: () => require('../shared/record-archives.js').archiveCutoff() };
      if (name.includes('useRecordFilters')) return { useRecordFilters: items => ({ items, search: '', filter: '', options: [], resetKey: '', setSearch() {}, setFilter() {} }) };
      if (name.includes('usePagination')) return { usePagination: items => ({ pageItems: items, page: 1, totalPages: 1 }) };
      if (name.includes('adminPasswordRetry')) return { useAdminPasswordRetry: () => 0 };
      if (name.includes('/lib/pageCache')) return { readPageCache: () => undefined, writePageCache() {}, pageCacheGeneration: () => 0 };
      if (name.includes('/shared/')) return require(path.resolve(path.dirname(absolute), name));
      if (name.includes('/lib/payrollPeriod') || name.includes('/lib/cashAdvancePreview')) {
        return { currentPayrollPeriod: () => '2026-10-16', nextPayrollPeriod: () => '2026-11-01', payrollPeriodForDate: date => date?.slice(0, 8) + '16', payrollPeriodRange: value => value, nextCashAdvanceRepayment: () => null };
      }
      return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key });
    },
  }, { filename: file });
  return {
    values, effects, timers, toasts, replacements, assignments, exports, window,
    get clears() { return clears; },
    render() { refIndex = 0; return exports[component](props); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children;
  return [tree, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '');
const click = (tree, label) => {
  const node = nodes(tree).find(node => ['button', 'Button'].includes(node.type) && (text(node) === label || node.props['aria-label'] === label));
  assert.ok(node, `Missing button ${label}`);
  return node.props.onClick();
};
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, headers: new Map() });
const event = { preventDefault() {} };
const workspace = () => ({ profile: { id: 'E1', name: 'Alex', role: 'regular', status: 'active', biometricStatus: 'enrolled' }, attendance: [], leaveRequests: [], payroll: [], attendanceFlag: { tier: 'green', absenceDays: 0 }, workSchedule: { workWeekdays: [], scheduleOverrides: [] } });

test('employee cash request, acceptance, cancellation and API failures give useful toasts', async () => {
  const requests = [];
  const h = harness('src/views/EmployeeCashAdvancePanel.tsx', 'EmployeeCashAdvancePanel', {
    state: { amount: '500', agreed: true },
    props: { payroll: [], requests: [], onChanged: async () => {} },
    api: async (url, options) => { requests.push([url, options]); return reply({}); },
  });
  await nodes(h.render()).find(node => node.type === 'form').props.onSubmit(event);
  assert.equal(h.toasts.at(-1).title, 'Cash advance requested');
  assert.equal(h.values.get('amount'), '');
  assert.equal(JSON.parse(requests[0][1].body).repaymentAgreed, true);

  for (const action of ['accept', 'cancel']) {
    const view = harness('src/views/EmployeeCashAdvancePanel.tsx', 'EmployeeCashAdvancePanel', {
      props: { payroll: [], requests: [{ id: 'R1', amount: 500, status: 'approved', requestedAt: '2026-10-16' }], onChanged: async () => {} },
      api: async url => { assert.ok(url.endsWith(`/${action}`)); return reply({}); },
    });
    const button = nodes(view.render()).find(node => node.props?.onClick?.toString().includes(`"${action}"`) || node.props?.onClick?.toString().includes(`'${action}'`));
    assert.ok(button, `Missing ${action} action`);
    await button.props.onClick(); await flush();
    assert.equal(view.toasts.at(-1).variant, 'success');
  }
});

test('a saved cash advance is not reported as failed when balance refresh fails', async () => {
  const h = harness('src/views/EmployeeCashAdvancePanel.tsx', 'EmployeeCashAdvancePanel', {
    state: { amount: '500', agreed: true }, props: { payroll: [], requests: [], onChanged: async () => { throw new Error('Refresh failed'); } }, api: async () => reply({}),
  });
  await nodes(h.render()).find(node => node.type === 'form').props.onSubmit(event);
  assert.deepEqual(h.toasts.map(toast => toast.variant), ['success', 'info']);
  assert.equal(h.toasts.at(-1).title, 'Request saved; refresh needed');
});

test('cash advance server failures retain the draft and show inline and toast errors', async () => {
  const h = harness('src/views/EmployeeCashAdvancePanel.tsx', 'EmployeeCashAdvancePanel', {
    state: { amount: '500', agreed: true }, props: { payroll: [], requests: [], onChanged: async () => {} }, api: async () => reply({ error: 'An advance already exists' }, 409),
  });
  await nodes(h.render()).find(node => node.type === 'form').props.onSubmit(event);
  assert.equal(h.values.get('amount'), '500');
  assert.equal(h.values.get('error'), 'An advance already exists');
  assert.equal(h.toasts.at(-1).variant, 'error');
});

test('employee logout keeps the session when revocation fails, and clears it on success', async () => {
  for (const status of [500, 200]) {
    const h = harness('src/views/EmployeePortal.tsx', 'EmployeePortal', { state: { workspace: workspace(), loading: false }, api: async () => reply({}, status) });
    await click(h.render(), 'Log out'); await flush();
    assert.equal(h.clears, status === 200 ? 1 : 0);
    assert.equal(h.replacements.length, status === 200 ? 1 : 0);
    if (status === 500) assert.equal(h.toasts.at(-1).title, 'Unable to log out');
  }
});

test('manual employee refresh reports success and failures without blanking existing records', async () => {
  for (const status of [200, 503]) {
    const h = harness('src/views/EmployeePortal.tsx', 'EmployeePortal', { state: { workspace: workspace(), loading: false }, api: async () => reply(status === 200 ? workspace() : { error: 'Service unavailable' }, status) });
    await click(h.render(), 'Refresh'); await flush();
    assert.equal(h.toasts.at(-1).variant, status === 200 ? 'success' : 'error');
    assert.equal(h.values.get('workspace').profile.id, 'E1');
    assert.equal(h.values.get('refreshing'), false);
  }
});

test('a rejected leave request never uses the payroll hold label', () => {
  const h = harness('src/views/EmployeePortal.tsx', 'EmployeePortal', { api: async () => reply({}), extra: '\nexports.__Status = Status;' });
  assert.equal(text(h.exports.__Status({ value: 'rejected' })), 'Rejected');
  assert.equal(text(h.exports.__Status({ value: 'rejected', payroll: true })), 'Payment on hold');
});

test('admin block-access network failures are caught and shown as toasts', async () => {
  const h = harness('src/views/AdminView.tsx', 'AdminView', {
    state: { adminUnlocked: true, localEmployees: [{ id: 'E1', name: 'Alex', role: 'regular' }] },
    api: async () => { throw new Error('Connection lost'); },
  });
  click(h.render(), 'Block access');
  h.values.get('confirmation').resolve(true);
  await flush();
  assert.equal(h.toasts.at(-1).title, 'Access was not updated');
  assert.equal(h.values.get('localEmployees')[0].banned, undefined);
  assert.equal(h.values.get('controlBusy'), null);
});

test('quarterly allowance success remains success when the follow-up preview fails', async () => {
  const h = harness('src/components/QuarterlyAdditionsDialog.tsx', 'QuarterlyAdditionsDialog', {
    state: { entries: [{ employeeId: 'E1', employeeName: 'Alex', eligible: true, requestId: 'P1', total: 500, status: 'eligible', items: [], claimedItems: [], history: [] }], selected: ['P1'] },
    props: { period: '2026-10-16', onClose() {}, onChanged: async () => {} },
    api: async url => url.endsWith('/include') ? reply({ included: 1 }) : reply({ error: 'Preview unavailable' }, 503),
  });
  click(h.render(), 'Add to payroll'); await flush();
  assert.deepEqual(h.toasts.map(toast => toast.variant), ['success', 'info']);
  assert.equal(h.toasts.at(-1).title, 'Allowances saved; refresh needed');
});

test('admin restoration failures preserve the archive and show an error toast', async () => {
  const h = harness('src/views/AdminView.tsx', 'AdminView', {
    state: { adminUnlocked: true, archiveOpen: true, archivedAccounts: [{ id: 'E1', name: 'Alex', record: { id: 'E1', role: 'regular' } }] },
    api: async () => reply({ error: 'Employee account is unavailable' }, 409),
  });
  click(h.render(), ' Restore');
  h.values.get('confirmation').resolve(true);
  await flush();
  assert.equal(h.toasts.at(-1).title, 'Account was not restored');
  assert.equal(h.values.get('archivedAccounts').length, 1);
  assert.equal(h.values.get('controlBusy'), null);
});

test('direct sign-in preserves the kiosk destination before replacing browser history', async () => {
  const h = harness('src/components/LoginSplitPage.tsx', 'default', {
    state: { email: 'admin@example.test', password: 'CorrectPass123!', captchaId: 'C1', captchaAnswer: '2', captchaChallenge: '1 + 1' },
    api: async url => { assert.equal(url, '/api/auth/login'); return reply({ authenticated: true }); },
  });
  h.window.location.pathname = '/kiosk';
  nodes(h.render()).find(node => node.type === 'form').props.onSubmit(event); await flush();
  assert.deepEqual(h.assignments, ['/kiosk']);
});

test('successful OTP verification stays busy until navigation, preventing duplicate submissions', async () => {
  const h = harness('src/components/LoginSplitPage.tsx', 'default', {
    state: { verificationId: 'OTP1', otp: '123456' },
    api: async url => { assert.equal(url, '/api/auth/verify-otp'); return reply({ authenticated: true }); },
  });
  nodes(h.render()).find(node => node.type === 'form').props.onSubmit(event); await flush();
  assert.equal(h.values.get('loading'), true);
  assert.equal(h.toasts.at(-1).title, 'Welcome back');
  h.timers.at(-1)();
  assert.deepEqual(h.assignments, ['/overview?view=overview']);
});

test('employee initial load failure offers retry with the actual error', async () => {
  const h = harness('src/views/EmployeePortal.tsx', 'EmployeePortal', {
    state: { workspace: null, loading: false, refreshError: 'Service unavailable' }, api: async () => reply(workspace()),
  });
  const tree = h.render();
  assert.match(text(tree), /Service unavailable/);
  click(tree, 'Try again'); await flush();
  assert.equal(h.values.get('workspace').profile.id, 'E1');
  assert.equal(h.toasts.at(-1).variant, 'success');
});

test('settings cannot save placeholder values while loading or after a failed load', async () => {
  let requests = 0;
  const h = harness('src/views/SettingsView.tsx', 'SettingsView', {
    state: { adminPassword: 'CorrectPass123!' },
    api: async url => { requests++; assert.equal(url, '/api/settings'); return reply({ error: 'Service unavailable' }, 503); },
  });
  const tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'fieldset').props.disabled, true);
  nodes(tree).find(node => node.type === 'form').props.onSubmit(event); await flush();
  assert.equal(requests, 0);
  assert.equal(h.toasts.at(-1).title, 'Settings unavailable');
  h.effects[0](); await flush();
  assert.equal(h.values.get('loadingSettings'), false);
  assert.ok(h.values.get('loadError'));
  assert.equal(nodes(h.render()).find(node => node.type === 'fieldset').props.disabled, true);
  assert.equal(requests, 1);
});


test('directory has one select-all action that includes employees hidden by filters', () => {
  const employees = [
    { id: 'E1', name: 'Alex', role: 'regular', status: 'active' },
    { id: 'E2', name: 'Sam', role: 'regular', status: 'active' },
  ];
  const h = harness('src/views/EmployeeDirectoryView.tsx', 'EmployeeDirectoryView', {
    state: { employees, archiveSelection: true, search: 'Alex' }, api: async () => reply({}),
  });
  assert.equal(nodes(h.render()).filter(node => text(node).startsWith('Select all matching')).length, 0);
  click(h.render(), 'Select all employees (2)');
  assert.deepEqual([...h.values.get('selectedEmployeeIds')], ['E1', 'E2']);
  click(h.render(), 'Archive selected (2)');
  assert.equal(h.values.get('archiveTargets').length, 2);
});

test('bulk employee archive removes successes and retains failures for retry', async () => {
  const employees = ['E1', 'E2', 'E3'].map(id => ({ id, name: id, role: 'regular', status: 'active' }));
  const calls = [];
  const h = harness('src/views/EmployeeDirectoryView.tsx', 'EmployeeDirectoryView', {
    state: { employees, archiveSelection: true, archiveTargets: employees, selectedEmployeeIds: ['E1', 'E2', 'E3'], archivePassword: 'ConfirmedPassword' },
    api: async url => { calls.push(url); return url.includes('/E2/') ? reply({ error: 'Temporarily unavailable' }, 500) : reply({}); },
  });
  const form = nodes(h.render()).find(node => node.type === 'form' && node.props.onSubmit.name === 'archiveEmployee');
  await form.props.onSubmit(event);
  assert.equal(calls.length, 3);
  assert.deepEqual([...h.values.get('employees')].map(item => item.id), ['E2']);
  assert.deepEqual([...h.values.get('selectedEmployeeIds')], ['E2']);
  assert.deepEqual([...h.values.get('archiveTargets')].map(item => item.id), ['E2']);
  assert.match(h.values.get('archiveError'), /2 of 3 archived/);
  assert.equal(h.values.get('archivePassword'), '');
});

test('bulk employee archive stops immediately after a password rejection', async () => {
  const employees = ['E1', 'E2'].map(id => ({ id, name: id, role: 'regular', status: 'active' }));
  const calls = [];
  const h = harness('src/views/EmployeeDirectoryView.tsx', 'EmployeeDirectoryView', {
    state: { employees, archiveTargets: employees, selectedEmployeeIds: ['E1', 'E2'], archivePassword: 'IncorrectPassword' },
    api: async url => { calls.push(url); return reply({ error: 'Incorrect admin password' }, 401); },
  });
  await nodes(h.render()).find(node => node.type === 'form' && node.props.onSubmit.name === 'archiveEmployee').props.onSubmit(event);
  assert.equal(calls.length, 1);
  assert.equal(h.values.get('employees').length, 2);
  assert.equal(h.values.get('selectedEmployeeIds').length, 2);
  assert.equal(h.values.get('archiving'), false);
});


test('admin archives select all across filters and restore selected employees together', async () => {
  const accounts = ['E1', 'E2'].map(id => ({ id, name: id, record: { id, role: 'regular' } }));
  const calls = [];
  const h = harness('src/views/AdminView.tsx', 'AdminView', {
    state: { adminUnlocked: true, archiveOpen: true, archivedAccounts: accounts, archiveSearch: 'E1' },
    api: async url => { calls.push(url); return reply({ id: url.includes('/E1/') ? 'E1' : 'E2', name: 'Restored' }); },
  });
  click(h.render(), 'Select all employees (2)');
  assert.deepEqual([...h.values.get('selectedArchiveIds')], ['E1', 'E2']);
  click(h.render(), 'Restore selected (2)');
  h.values.get('confirmation').resolve(true);
  await flush(); await flush();
  assert.equal(calls.length, 2);
  assert.equal(h.values.get('archivedAccounts').length, 0);
  assert.equal(h.values.get('localEmployees').length, 2);
  assert.equal(h.values.get('selectedArchiveIds').length, 0);
});

test('admin bulk permanent deletion retains failed accounts and clears successful selections', async () => {
  const accounts = ['E1', 'E2'].map(id => ({ id, name: id, record: { id, role: 'regular' } }));
  const h = harness('src/views/AdminView.tsx', 'AdminView', {
    state: { adminUnlocked: true, archiveOpen: true, archivedAccounts: accounts, selectedArchiveIds: ['E1', 'E2'], deleteTargets: accounts, deletePassword: 'ConfirmedPassword' },
    api: async url => url.includes('/E2/') ? reply({ error: 'Deletion failed' }, 500) : reply({}),
  });
  await nodes(h.render()).find(node => node.type === 'form' && node.props.onSubmit.name === 'permanentlyDeleteAccount').props.onSubmit(event);
  assert.deepEqual([...h.values.get('archivedAccounts')].map(item => item.id), ['E2']);
  assert.deepEqual([...h.values.get('selectedArchiveIds')], ['E2']);
  assert.deepEqual([...h.values.get('deleteTargets')].map(item => item.id), ['E2']);
  assert.equal(h.values.get('deletePassword'), '');
  assert.match(h.values.get('deleteError'), /1 of 2 deleted/);
});

test('bulk permanent deletion stops on a rejected password before trying another account', async () => {
  const accounts = ['E1', 'E2'].map(id => ({ id, name: id, record: { id, role: 'regular' } }));
  const calls = [];
  const h = harness('src/views/AdminView.tsx', 'AdminView', {
    state: { adminUnlocked: true, archivedAccounts: accounts, selectedArchiveIds: ['E1', 'E2'], deleteTargets: accounts, deletePassword: 'WrongPassword' },
    api: async url => { calls.push(url); return reply({ error: 'Incorrect password' }, 403); },
  });
  await nodes(h.render()).find(node => node.type === 'form' && node.props.onSubmit.name === 'permanentlyDeleteAccount').props.onSubmit(event);
  assert.equal(calls.length, 1);
  assert.equal(h.values.get('archivedAccounts').length, 2);
  assert.equal(h.values.get('selectedArchiveIds').length, 2);
});
