const labels: Record<string, string> = {
  id: 'Request ID', employeeId: 'Employee ID', name: 'Employee Name',
  employeeName: 'Employee Name', role: 'Role', status: 'Status', email: 'Email Address',
  phone: 'Phone Number', archived: 'Archived', createdAt: 'Created At (Manila)',
  date: 'Attendance Date', checkIn: 'Time In', checkOut: 'Time Out',
  startDate: 'Start Date', endDate: 'End Date', totalDays: 'Total Days',
  requestedDates: 'Requested Leave Dates', approvedDates: 'Approved Leave Dates',
  notApprovedDates: 'Not Approved Dates', requestedDayCount: 'Requested Days', approvedDayCount: 'Approved Days',
  periodStart: 'Period Start', periodEnd: 'Period End', hoursWorked: 'Hours Worked',
  grossAmount: 'Gross Amount (PHP)', amount: 'Amount (PHP)', paidAt: 'Paid At (Manila)',
};
const dateFields = new Set(['date', 'startDate', 'endDate', 'periodStart', 'periodEnd']);
const timestampFields = new Set(['createdAt', 'paidAt']);
const numericFields = new Set(['totalDays', 'requestedDayCount', 'approvedDayCount', 'hoursWorked', 'grossAmount', 'amount']);

function readableValue(field: string, value: unknown) {
  if (field === 'archived') return value === true ? 'Yes' : 'No';
  if (value == null || value === '') return '';
  if (field === 'requestedDates' || field === 'approvedDates' || field === 'notApprovedDates') {
    return Array.isArray(value) ? value.map(date => {
      const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
      return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString('en-PH', {
        timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      });
    }).join('\n') : String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (numericFields.has(field) && Number.isFinite(Number(value))) return Number(value);
  if (dateFields.has(field) || timestampFields.has(field)) {
    const raw = String(value);
    const date = new Date(dateFields.has(field) ? `${raw.slice(0, 10)}T00:00:00Z` : raw);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-PH', {
      timeZone: dateFields.has(field) ? 'UTC' : 'Asia/Manila',
      year: 'numeric', month: 'short', day: 'numeric',
      ...(timestampFields.has(field) ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
    });
  }
  if (field === 'role' || field === 'status') return String(value).replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export async function createReportWorkbook(name: string, inputFields: string[], records: Record<string, unknown>[]) {
  // Retain range metadata for older records without implying every day in the
  // range was selected. New requests export the actual individual dates.
  const fields = name === 'leave_requests' ? inputFields.filter(field => !['startDate', 'endDate', 'approvalUndoneAt'].includes(field)).flatMap(field =>
    field === 'approvedDates' ? [field, 'notApprovedDates'] : field === 'totalDays' ? ['requestedDayCount', 'approvedDayCount'] : [field]
  ) : inputFields;
  // Load the workbook library only when a report is requested.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'WORKPULSE MVL';
  workbook.created = new Date();
  const titles: Record<string, string> = { employees: 'Employees', attendance: 'Attendance', leave_requests: 'Leave Requests', payroll_requests: 'Payroll' };
  const sheet = workbook.addWorksheet(titles[name] ?? 'Report', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const headers = fields.map(field => field === 'id' && name === 'employees' ? 'Employee ID' : field === 'status' && name === 'payroll_requests' ? 'Payment Status' : field === 'createdAt' && name === 'leave_requests' ? 'Requested At (PH Time)' : labels[field] ?? field);
  sheet.addRow(headers);
  records.forEach(record => sheet.addRow(fields.map(field => {
    const requested = Array.isArray(record.requestedDates) ? [...new Set(record.requestedDates.map(String))] : [];
    const approved = Array.isArray(record.approvedDates) ? [...new Set(record.approvedDates.map(String))] : [];
    if (name === 'payroll_requests' && field === 'status') {
      const statuses: Record<string, string> = { rejected: 'Payment On Hold', processing: 'Unpaid', carried_over: 'Carried To Next Payroll', paid: 'Paid', approved: 'Paid' };
      return statuses[String(record.status)] ?? readableValue(field, record.status);
    }
    if (name === 'leave_requests') {
      const remaining = requested.filter(date => !approved.includes(date));
      if (field === 'requestedDayCount') return requested.length || 'Not recorded';
      if (field === 'approvedDayCount') return approved.length || (record.status === 'approved' ? record.totalDays ?? 'Not recorded' : 0);
      if (field === 'notApprovedDates') {
        if (record.status === 'pending') return 'Awaiting review';
        if (!requested.length) return 'Exact dates not recorded';
        return remaining.length ? readableValue(field, remaining) : 'None';
      }
      if (field === 'status') {
        if (record.status === 'approved' && requested.length && approved.length && remaining.length) {
          return `${record.approvalUndoneAt ? 'Approval Updated' : 'Partially Approved'} (${approved.length} approved, ${remaining.length} not approved)`;
        }
        if (record.status === 'rejected') return 'Declined';
        if (record.status === 'pending') return 'Pending Review';
      }
    }
    if (name === 'leave_requests' && field === 'requestedDates' && !(Array.isArray(record.requestedDates) && record.requestedDates.length)) {
      return record.startDate && record.endDate
        ? `Older record: ${readableValue('startDate', record.startDate)} to ${readableValue('endDate', record.endDate)}. Exact selected dates not recorded.`
        : 'Exact selected dates not recorded';
    }
    if (name === 'leave_requests' && field === 'approvedDates' && !(Array.isArray(record.approvedDates) && record.approvedDates.length)) {
      return record.status === 'approved' ? 'Exact approved dates not recorded' : 'None';
    }
    return readableValue(field, record[field]);
  })));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: fields.length } };
  sheet.getRow(1).height = 30;
  fields.forEach((field, index) => {
    const column = sheet.getColumn(index + 1);
    let longest = headers[index].length;
    column.eachCell(cell => { longest = Math.max(longest, ...String(cell.value ?? '').split('\n').map(line => line.length)); });
    column.width = Math.min(55, Math.max(field === 'email' ? 32 : field === 'name' || field === 'employeeName' ? 24 : 16, longest + 3));
    column.numFmt = numericFields.has(field) ? ['totalDays', 'requestedDayCount', 'approvedDayCount'].includes(field) ? '0' : '#,##0.00' : '@';
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 24;
    row.eachCell({ includeEmpty: true }, cell => {
      if (rowNumber > 1) {
        const width = sheet.getColumn(cell.col).width ?? 16;
        const lines = String(cell.value ?? '').split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(1, width - 3))), 0);
        row.height = Math.max(row.height ?? 24, lines * 15 + 9);
      }
      cell.font = { name: 'Calibri', size: 11, ...(rowNumber === 1 ? { bold: true, color: { argb: 'FFFFFFFF' } } : { color: { argb: 'FF0F172A' } }) };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber === 1 ? 'FF7C3AED' : rowNumber % 2 === 0 ? 'FFF5F3FF' : 'FFFFFFFF' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    });
  });
  return workbook;
}

export async function downloadExcelReport(name: string, fields: string[], records: Record<string, unknown>[]) {
  const workbook = await createReportWorkbook(name, fields, records);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  link.download = `workpulse-${name}-${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
