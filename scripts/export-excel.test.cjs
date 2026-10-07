const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const ExcelJS = require('exceljs');

function loadExporter() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/exportExcel.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require, Intl, Date, Set });
  return exports;
}

test('employee workbook keeps phone numbers as text and formats columns and dates', async () => {
  const { createReportWorkbook } = loadExporter();
  const workbook = await createReportWorkbook('employees', ['id', 'name', 'role', 'status', 'email', 'phone', 'archived', 'createdAt'], [{
    id: 'EMP-008', name: 'Miguel Fernandez', role: 'extra', status: 'on-leave',
    email: 'miguel.fernandez@example.com', phone: '+639123712783', archived: false,
    createdAt: '2026-08-02T01:59:07.140Z',
  }]);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet('Employees');
  assert.equal(sheet.getCell('A1').value, 'Employee ID');
  assert.equal(sheet.getCell('B2').value, 'Miguel Fernandez');
  assert.equal(sheet.getCell('F2').value, '+639123712783');
  assert.equal(sheet.getCell('F2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('F2').numFmt, '@');
  assert.equal(sheet.getCell('G2').value, 'No');
  assert.equal(sheet.getCell('D2').value, 'On Leave');
  assert.match(sheet.getCell('H2').value, /9:59 AM/);
  assert.ok(sheet.getColumn('E').width >= 32);
  assert.equal(sheet.getRow(1).font, undefined);
  assert.equal(sheet.getCell('A1').font.bold, true);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.ok(sheet.autoFilter);
});

test('payroll amounts stay numeric and formula-like user text stays literal', async () => {
  const { createReportWorkbook } = loadExporter();
  const workbook = await createReportWorkbook('payroll_requests', ['id', 'name', 'amount', 'paidAt'], [{
    id: 'PAY-001', name: '=1+1', amount: '1500.50', paidAt: null,
  }]);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet('Payroll');
  assert.equal(sheet.getCell('B2').value, '=1+1');
  assert.equal(sheet.getCell('B2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('C2').value, 1500.5);
  assert.equal(sheet.getCell('C2').numFmt, '#,##0.00');
});

test('leave export lists separate requested and approved days without filling gaps', async () => {
  const { createReportWorkbook } = loadExporter();
  const workbook = await createReportWorkbook('leave_requests', ['requestedDates', 'approvedDates', 'startDate', 'endDate', 'totalDays', 'createdAt'], [{
    requestedDates: ['2026-10-05', '2026-10-07', '2026-10-09'], approvedDates: ['2026-10-05', '2026-10-07'],
    startDate: '2026-10-05', endDate: '2026-10-09', totalDays: 2, createdAt: '2026-10-01T00:00:00Z',
  }, { startDate: '2026-08-10', endDate: '2026-08-12', totalDays: 3, status: 'approved' }]);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet('Leave Requests');
  assert.equal(sheet.columnCount, 6);
  assert.match(sheet.getCell('A2').value, /Mon, Oct 5, 2026\nWed, Oct 7, 2026\nFri, Oct 9, 2026/);
  assert.doesNotMatch(sheet.getCell('A2').value, /Oct 6|Oct 8/);
  assert.doesNotMatch(sheet.getCell('B2').value, /Oct 9/);
  assert.match(sheet.getCell('C2').value, /Fri, Oct 9, 2026/);
  assert.equal(sheet.getCell('D2').value, 3);
  assert.equal(sheet.getCell('E2').value, 2);
  assert.equal(sheet.getCell('F1').value, 'Requested At (PH Time)');
  assert.ok(sheet.getRow(2).height >= 54);
  assert.match(sheet.getCell('A3').value, /Exact selected dates not recorded/);
  assert.equal(sheet.getCell('B3').value, 'Exact approved dates not recorded');
});

test('leave separates partial approval, undo, pending review, and full decline', async () => {
  const { createReportWorkbook } = loadExporter();
  const requestedDates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
  const approvedDates = requestedDates.slice(0, 3);
  const workbook = await createReportWorkbook('leave_requests', ['status', 'requestedDates', 'approvedDates', 'totalDays'], [
    { status: 'approved', requestedDates, approvedDates },
    { status: 'approved', requestedDates, approvedDates, approvalUndoneAt: '2026-10-07T00:00:00Z' },
    { status: 'pending', requestedDates, approvedDates: [] },
    { status: 'rejected', requestedDates, approvedDates: [] },
  ]);
  const sheet = workbook.getWorksheet('Leave Requests');
  assert.equal(sheet.getCell('A2').value, 'Partially Approved (3 approved, 3 not approved)');
  assert.equal(sheet.getCell('E2').value, 6);
  assert.equal(sheet.getCell('F2').value, 3);
  assert.equal(sheet.getCell('A3').value, 'Approval Updated (3 approved, 3 not approved)');
  assert.equal(sheet.getCell('D4').value, 'Awaiting review');
  assert.equal(sheet.getCell('A5').value, 'Declined');
  assert.equal(sheet.getCell('F5').value, 0);
});

test('payroll uses payment statuses rather than leave decision labels', async () => {
  const { createReportWorkbook } = loadExporter();
  const workbook = await createReportWorkbook('payroll_requests', ['status'], ['rejected', 'processing', 'carried_over', 'paid', 'approved'].map(status => ({ status })));
  const sheet = workbook.getWorksheet('Payroll');
  assert.equal(sheet.getCell('A1').value, 'Payment Status');
  assert.deepEqual([2, 3, 4, 5, 6].map(row => sheet.getCell(`A${row}`).value), ['Payment On Hold', 'Unpaid', 'Carried To Next Payroll', 'Paid', 'Paid']);
});
