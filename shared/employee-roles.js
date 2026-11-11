// "supervisor" remains a supported legacy value; new records use "manager".
export function employeeRole(role) {
  const value = String(role ?? '').toLowerCase();
  return value === 'supervisor' || value === 'manager / supervisor' ? 'manager' : value;
}

export function employeeRoleLabel(role) {
  const value = employeeRole(role);
  return ({ regular: 'Regular', extra: 'Extra', manager: 'Manager / Supervisor', admin: 'Admin' })[value] ?? String(role ?? 'Regular');
}

export function managementHourlyRate(rates, fallback = 50) {
  return Number(rates?.manager ?? rates?.supervisor ?? rates?.regular ?? fallback);
}
