import { BSON } from 'mongodb';
const { EJSON } = BSON;

// Ephemeral sessions, OTPs, and captcha challenges are intentionally excluded.
export const BACKUP_COLLECTIONS = Object.freeze([
  'admin_accounts', 'employee_accounts', 'employees', 'attendance', 'employee_notifications', 'offline_operations', 'leave_requests',
  'payroll_requests', 'cash_advances', 'cash_advance_requests', 'settings',
  'system_controls', 'idle_days', 'admin_notifications', 'audit_events',
  'employee_email_verifications', 'biometric_templates',
  'biometric_verification_attempts', 'biometric_evaluation_trials',
]);

export function serializeBackup(backup) {
  return EJSON.stringify(backup, null, 2, { relaxed: false });
}

export function parseBackup(contents) {
  const backup = EJSON.parse(contents, { relaxed: false });
  if (!backup || backup.format !== 'workpulse-json-backup' || Number(backup.version) !== 2 ||
      !backup.collections || typeof backup.collections !== 'object' || Array.isArray(backup.collections)) {
    throw new Error('This file is not a supported WorkPulse version 2 backup.');
  }
  const names = Object.keys(backup.collections).sort();
  const optional = ['employee_notifications', 'offline_operations'];
  const required = BACKUP_COLLECTIONS.filter(name => !optional.includes(name)).sort();
  if (JSON.stringify(names.filter(name => !optional.includes(name))) !== JSON.stringify(required)) {
    throw new Error('Backup collections do not match the expected version 2 set.');
  }
  for (const name of optional) if (!(name in backup.collections)) backup.collections[name] = [];
  for (const name of BACKUP_COLLECTIONS) {
    const records = backup.collections[name];
    if (!Array.isArray(records) || records.some((record) => !record || typeof record !== 'object' || Array.isArray(record))) {
      throw new Error(`Invalid records in ${name}.`);
    }
  }
  return backup;
}
