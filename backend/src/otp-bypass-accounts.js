const accounts = [
  { email: 'admin@gmail.com', password: 'admin123', role: 'admin', collection: 'admin_accounts' },
  { email: 'employee@gmail.com', password: 'employee123', role: 'regular', collection: 'employee_accounts' },
];

export function canBypassOtp(account, accountType) {
  if (account?.otpBypass !== true || account.active !== true) return false;
  return (accountType === 'admin' && account.role === 'admin' && account.email === 'admin@gmail.com')
    || (accountType === 'employee' && account.role === 'regular' && account.email === 'employee@gmail.com');
}

// Explicitly requested real accounts. Create once; never reset an existing password on restart.
export async function ensureOtpBypassAccounts(db, hashSecret) {
  for (const spec of accounts) {
    const otherCollection = spec.collection === 'admin_accounts' ? 'employee_accounts' : 'admin_accounts';
    if (await db.collection(otherCollection).findOne({ email: spec.email })) throw new Error(`Account role conflict for ${spec.email}. Existing account was not changed.`);
    const existing = await db.collection(spec.collection).findOne({ email: spec.email });
    if (existing) {
      if (existing.otpBypass !== true || existing.role !== spec.role) throw new Error(`Existing account ${spec.email} was not changed; provision OTP bypass explicitly before restarting.`);
      continue;
    }
    const now = new Date();
    let employeeId;
    if (spec.role === 'regular') {
      let employee = await db.collection('employees').findOne({ email: spec.email });
      if (employee && (employee.role !== 'regular' || employee.archived || employee.banned || employee.status === 'inactive')) throw new Error('Existing employee@gmail.com profile cannot be used without changing its access. No profile was changed.');
      if (!employee) {
        employeeId = 'EMP-OTP-001';
        if (await db.collection('employees').findOne({ id: employeeId })) throw new Error('Employee ID EMP-OTP-001 already exists. No profile was replaced.');
        employee = { id: employeeId, name: 'Test Employee', email: spec.email, role: 'regular', status: 'active', phone: '', address: '', hourlyRate: 0, grossSalary: 0, biometricStatus: 'none', identifiers: [], casualLeave: { total: 10, used: 0 }, sickLeave: { total: 10, used: 0 }, createdAt: now, updatedAt: now };
        await db.collection('employees').updateOne({ email: spec.email }, { $setOnInsert: employee }, { upsert: true });
      }
      employeeId = employee.id;
    }
    await db.collection(spec.collection).updateOne({ email: spec.email }, { $setOnInsert: {
      email: spec.email, name: spec.role === 'admin' ? 'Test Admin' : 'Test Employee',
      role: spec.role, active: true, otpBypass: true, passwordHash: await hashSecret(spec.password),
      mustChangePassword: false, ...(employeeId ? { employeeId } : {}), createdAt: now, updatedAt: now,
    } }, { upsert: true });
  }
}
