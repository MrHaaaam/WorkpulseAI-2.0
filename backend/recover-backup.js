import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { BACKUP_COLLECTIONS, serializeBackup } from './src/backup-format.js';
import { previewRecovery, applyRecovery, RECOVERY_COLLECTIONS } from './src/backup-recovery.js';

const [file, ...args] = process.argv.slice(2);
const option = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const database = option('db');
const planFile = option('plan') || 'recovery-preview.json';
const apply = args.includes('--apply');
const employeeIds = option('employees')?.split(',').filter(Boolean) || [];
const collections = option('collections')?.split(',').filter(Boolean) || [...RECOVERY_COLLECTIONS];
const valid = file && database && /^[a-zA-Z0-9_-]+$/.test(database) && args.every(arg => arg === '--apply' || /^--(db|plan|employees|collections)=.+$/.test(arg));
if (!valid || !process.env.MONGODB_URI) {
  console.error('Usage: node recover-backup.js <backup.json> --db=<LIVE_DATABASE> [--employees=ID1,ID2] [--collections=attendance,payroll_requests] [--plan=recovery-preview.json] [--apply]\nMONGODB_URI must be configured. Preview is the default; no live records are overwritten.');
  process.exitCode = 1;
} else if (path.resolve(file) === path.resolve(planFile)) {
  console.error('The preview file must not replace your backup.'); process.exitCode = 1;
} else {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    const contents = await readFile(file, 'utf8');
    await client.connect();
    const db = client.db(database);
    if (!apply) {
      const { plan } = await previewRecovery(db, contents, { employeeIds, collections });
      await writeFile(planFile, serializeBackup(plan));
      console.log(JSON.stringify({ database, applied: false, backupCreatedAt: plan.backupCreatedAt, counts: plan.counts, problems: plan.problems, planFile }, null, 2));
      console.log('Preview only. Review every restore row: missing records may have been deliberately deleted. Apply uses the scope recorded in this plan.');
    } else {
      const { BSON } = await import('mongodb');
      const plan = BSON.EJSON.parse(await readFile(planFile, 'utf8'), { relaxed: false });
      const { plan: current } = await previewRecovery(db, contents, plan.scope);
      if (current.fingerprint !== plan.fingerprint || current.problems.length) throw new Error('The preview changed or has unresolved dependencies. Generate a new preview before applying.');
      // Preserve the current database before recovery, including newer changes.
      const safetyFile = path.resolve(`pre-recovery-${database}-${Date.now()}.json`);
      const saved = {};
      for (const name of BACKUP_COLLECTIONS) saved[name] = await db.collection(name).find({}).toArray();
      await writeFile(safetyFile, serializeBackup({ format: 'workpulse-json-backup', version: 2, createdAt: new Date(), collections: saved }), { flag: 'wx', mode: 0o600 });
      console.log('Current-data safety backup:', safetyFile);
      console.log(JSON.stringify(await applyRecovery(db, contents, plan), null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  } finally { await client.close(); }
}
