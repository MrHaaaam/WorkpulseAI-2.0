const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual hook and App effects against browser history and session
// doubles. No backend accounts or live logout requests are used.
function harness(file, initialUrl, { expires = '', navigationType = 'navigate' } = {}) {
  const listeners = new Map();
  const entries = [new URL(initialUrl, 'https://workpulse.test')];
  let cursor = 0;
  let hookIndex = 0;
  const states = [];
  const effects = [];
  const calls = { logout: 0, clear: 0, reload: 0, replace: [] };
  const location = {
    get href() { return entries[cursor].href; },
    get pathname() { return entries[cursor].pathname; },
    get search() { return entries[cursor].search; },
    reload() { calls.reload++; },
    replace(url) { calls.replace.push(url); },
  };
  const window = {
    location,
    history: {
      state: null,
      pushState(state, _, url) {
        entries.splice(cursor + 1);
        entries.push(new URL(url, location.href));
        cursor++;
        this.state = state;
      },
    },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = value; }];
    },
    useRef(initial) { return { current: initial }; },
    useCallback(callback) { return callback; },
    useEffect(effect) { effects.push(effect); },
  };
  const api = {
    restoreSession: async () => ({ response: { ok: true }, data: { role: 'admin' } }),
    storeSession() {},
    apiFetch: async route => {
      assert.equal(route, '/api/auth/logout');
      calls.logout++;
      return { ok: true };
    },
    clearSession() { calls.clear++; },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, window, URL, URLSearchParams, queueMicrotask,
    sessionStorage: { getItem: key => key === 'workpulse_session_expires' ? expires : null },
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === './lib/api') return api;
      return {};
    },
  });
  return {
    exports, calls, entries, listeners,
    render(fn) { hookIndex = 0; return fn(); },
    mountEffects() { effects.splice(0).forEach(effect => effect()); },
    move(offset) { cursor += offset; listeners.get('popstate')?.(); },
    get url() { return location.href; },
  };
}

test('sidebar visits support Back, Forward, no duplicate entries, and branching', () => {
  const browser = harness('src/hooks/usePortalNavigation.ts', '/overview?view=overview');
  const views = ['overview', 'leave', 'payroll'];
  const render = () => browser.render(() => browser.exports.usePortalNavigation(views, 'overview'));
  let [view, navigate] = render();
  browser.mountEffects();
  assert.equal(view, 'overview');
  navigate('leave');
  [view, navigate] = render();
  assert.equal(view, 'leave');
  navigate('leave');
  assert.equal(browser.entries.length, 2);
  navigate('payroll');
  browser.move(-1);
  assert.equal(render()[0], 'leave');
  browser.move(-1);
  assert.equal(render()[0], 'overview');
  browser.move(1);
  assert.equal(render()[0], 'leave');
  browser.move(-1);
  render()[1]('payroll');
  assert.equal(browser.entries.length, 2);
  assert.match(browser.url, /view=payroll$/);
});

test('protected history navigation keeps the session; cached Forward rechecks it', () => {
  const browser = harness('src/App.tsx', '/overview?view=leave', { expires: 'active', navigationType: 'back_forward' });
  browser.render(() => browser.exports.default());
  browser.mountEffects();
  assert.equal(browser.calls.logout, 0);
  assert.equal(browser.listeners.has('popstate'), false);
  browser.listeners.get('pageshow')({ persisted: true });
  assert.equal(browser.calls.reload, 1);
  assert.equal(browser.calls.logout, 0);
});

test('returning to login revokes the server session and clears local credentials', async () => {
  const browser = harness('src/App.tsx', '/', { expires: 'active', navigationType: 'back_forward' });
  browser.render(() => browser.exports.default());
  browser.mountEffects();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(browser.calls.logout, 1);
  assert.equal(browser.calls.clear, 1);
  assert.deepEqual(browser.calls.replace, ['/']);
});

test('a fresh login page does not start a logout request', () => {
  const browser = harness('src/App.tsx', '/');
  browser.render(() => browser.exports.default());
  browser.mountEffects();
  assert.equal(browser.calls.logout, 0);
});
