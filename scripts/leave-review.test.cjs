const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadPicker() {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/LeaveDatePicker.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, Date, Set,
    require(name) {
      if (name === 'react') return { useMemo: callback => callback(), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      return {};
    },
  });
  return exports.LeaveDatePicker;
}

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  const children = element.props?.children;
  return [element, ...(Array.isArray(children) ? children.flat(Infinity) : [children]).flatMap(nodes)];
}

test('employee picker blocks an eleventh day while allowing deselection', () => {
  const picker = loadPicker();
  const today = new Date();
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const selected = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - index);
    return iso(date);
  });
  let selection;
  const tree = picker({ selected, maxDates: 10, onChange: dates => { selection = dates; } });
  const dates = nodes(tree).filter(node => node.type === 'button' && /^\d{4}-\d{2}-\d{2}$/.test(node.key));
  const active = dates.find(node => node.key === iso(today));
  const unselected = dates.find(node => !selected.includes(node.key));
  assert.equal(active.props.disabled, false);
  assert.equal(unselected.props.disabled, true);
  unselected.props.onClick();
  assert.equal(selection, undefined);
  active.props.onClick();
  assert.equal(selection.length, 9);
});

test('admin review still supports existing requests over ten days', () => {
  const picker = loadPicker();
  const allowedDates = Array.from({ length: 11 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
  let selection;
  const tree = picker({ selected: [], allowedDates, onChange: dates => { selection = dates; } });
  nodes(tree).find(node => node.type === 'button' && node.props.children === 'Include available dates').props.onClick();
  assert.equal(selection.length, 11);
});

test('review picker exposes attendance conflicts and Include available never selects blocked dates', () => {
  let selection;
  const picker = loadPicker();
  const tree = picker({
    allowedDates: ['2026-10-05', '2026-10-07', '2026-10-09'], selected: [], onChange: dates => { selection = dates; },
    dateDetails: {
      '2026-10-05': { detail: 'Past date · Absent', disabledReason: 'Past date—requires correction.' },
      '2026-10-07': { detail: 'Today · Present', disabledReason: 'Time-in recorded.' },
      '2026-10-09': { detail: 'No record' },
    },
  });
  const buttons = nodes(tree).filter(node => node.type === 'button');
  assert.equal(buttons.find(node => node.key === '2026-10-05').props.disabled, true);
  assert.equal(buttons.find(node => node.key === '2026-10-07').props.disabled, true);
  assert.equal(buttons.find(node => node.key === '2026-10-09').props.disabled, false);
  buttons.find(node => node.props.children === 'Include available dates').props.onClick();
  assert.equal(selection.join(','), '2026-10-09');
});

test('past date becomes selectable only when its correction restriction is removed', () => {
  let selection;
  const picker = loadPicker();
  const tree = picker({ allowedDates: ['2026-10-05'], selected: [], onChange: dates => { selection = dates; }, dateDetails: { '2026-10-05': { detail: 'Past date · Absent' } } });
  const button = nodes(tree).find(node => node.type === 'button' && node.key === '2026-10-05');
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.equal(selection.join(','), '2026-10-05');
});
