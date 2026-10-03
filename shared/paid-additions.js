export function isOwnerFunded(item, employee) {
  const label = String(item.label || '').trim();
  if (!label || /bonus/i.test(label)) return false;
  if (item.quarter || item.sourceKey === 'owner-funded-addition' || label.startsWith('Owner-funded addition')) return true;
  const name = label.replace(/ allowance \(Q[1-4] \d{4}\)$/, '').toLowerCase();
  if (/^(sss|philhealth|pag-ibig|tin)$/.test(name)) return true;
  return (employee?.identifiers || []).some(identifier => String(identifier.type || '').trim().toLowerCase() === name);
}

export function paidAdditionEntries(records, employees = []) {
  const paid = records.filter(record => ['paid', 'approved'].includes(record.status));
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const carriedByPayment = new Map();
  for (const record of paid) {
    if (!record.settledBy) continue;
    const sources = carriedByPayment.get(record.settledBy) || [];
    sources.push(record);
    carriedByPayment.set(record.settledBy, sources);
  }
  return paid.filter(record => !record.settledBy && record.paidAt).map(record => {
    const sources = carriedByPayment.get(record.id) || [];
    const allowances = [];
    const employee = employeesById.get(record.employeeId);
    for (const source of [record, ...sources]) {
      const items = source.additions?.length ? source.additions : source.quarterlyAdditions || [];
      for (const item of items) {
        if (!isOwnerFunded(item, employee) || !(Number(item.value) > 0)) continue;
        allowances.push({ label: item.label, value: Number(item.value), fromEarlierPayroll: source.id !== record.id, sourceId: source.id, sourcePeriodStart: source.periodStart });
      }
    }
    for (const item of record.carriedQuarterlyAdditions || []) {
      if (!(Number(item.value) > 0) || allowances.some(existing => existing.label === item.label && existing.value === Number(item.value))) continue;
      allowances.push({ label: item.label, value: Number(item.value), fromEarlierPayroll: true, sourceId: record.id });
    }
    const total = Math.round(allowances.reduce((sum, item) => sum + item.value, 0) * 100) / 100;
    return { id: record.id, employeeId: record.employeeId, employeeName: record.employeeName, periodStart: record.periodStart, paidAt: record.paidAt,
      allowances: total > 0 ? [{ label: 'Salary addition', value: total }] : [], total };
  }).filter(entry => entry.allowances.length).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)) || a.employeeName.localeCompare(b.employeeName));
}
