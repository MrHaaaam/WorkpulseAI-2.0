// Real, isolated local replica set. No configured production connection is used.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { MongoClient, BSON } from 'mongodb';
import { BACKUP_COLLECTIONS, serializeBackup } from '../backend/src/backup-format.js';
import { previewRecovery, applyRecovery } from '../backend/src/backup-recovery.js';

const directory = await mkdtemp(path.join(tmpdir(), 'workpulse-recovery-test-'));
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const server = spawn(process.env.WORKPULSE_TEST_MONGOD || 'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe',
  ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'recoveryTest', '--logpath', path.join(directory, 'mongo.log')],
  { windowsHide: true, stdio: 'ignore' });
let spawnError;
server.on('error', error => { spawnError = error; });
const delay = () => new Promise(resolve => setTimeout(resolve, 100));
let client;
try {
  const bootstrap = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    try { await bootstrap.connect(); break; } catch { await delay(); }
  }
  await bootstrap.db('admin').command({ replSetInitiate: { _id: 'recoveryTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  await bootstrap.close();
  client = new MongoClient(`mongodb://127.0.0.1:${port}/?replicaSet=recoveryTest`, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db('synthetic_recovery');
  await db.collection('employees').createIndex({ id: 1 }, { unique: true });
  await db.collection('attendance').createIndex({ employeeId: 1, date: 1 }, { unique: true });
  const employee = { _id: new BSON.ObjectId(), id: 'E1', name: 'Synthetic Employee', status: 'active' };
  const newer = { ...employee, status: 'inactive', newerData: true };
  await db.collection('employees').insertOne(newer);
  const attendance = Array.from({ length: 1000 }, (_, index) => ({ _id: new BSON.ObjectId(), employeeId: 'E1', date: `synthetic-${index}`, checkIn: '09:00 AM', createdAt: new Date() }));
  const source = serializeBackup({ format: 'workpulse-json-backup', version: 2, createdAt: new Date(),
    collections: Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, name === 'employees' ? [employee] : name === 'attendance' ? attendance : []])) });
  const { plan } = await previewRecovery(db, source);
  assert.equal(plan.counts.restore, 1000);
  assert.equal(await db.collection('attendance').countDocuments(), 0, 'preview makes no writes');
  const result = await applyRecovery(db, source, plan);
  assert.equal(result.restored, 1000);
  assert.equal(await db.collection('attendance').countDocuments(), 1000);
  assert.deepEqual(await db.collection('employees').findOne({ id: 'E1' }), newer);
  assert.equal((await previewRecovery(db, source)).plan.counts.restore, 0);

  // A source collision within one collection must abort all earlier writes.
  const rollback = client.db('synthetic_rollback');
  await rollback.collection('attendance').createIndex({ employeeId: 1, date: 1 }, { unique: true });
  const collision = serializeBackup({ format: 'workpulse-json-backup', version: 2, createdAt: new Date(),
    collections: Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, name === 'employees' ? [employee] : name === 'attendance' ? [attendance[0], { ...attendance[0], _id: new BSON.ObjectId() }] : []])) });
  const reviewed = (await previewRecovery(rollback, collision)).plan;
  await assert.rejects(applyRecovery(rollback, collision, reviewed), /duplicate key/);
  assert.equal(await rollback.collection('employees').countDocuments(), 0);
  assert.equal(await rollback.collection('attendance').countDocuments(), 0);
  const sourceFile = path.join(directory, 'synthetic-backup.json');
  const previewFile = path.join(directory, 'recovery-preview.json');
  await writeFile(sourceFile, source);
  const runCli = extra => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('backend/recover-backup.js'), sourceFile, '--db=synthetic_cli', `--plan=${previewFile}`, ...extra], {
      cwd: directory, windowsHide: true, env: { ...process.env, MONGODB_URI: `mongodb://127.0.0.1:${port}/?replicaSet=recoveryTest` },
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output)));
  });
  assert.match(await runCli([]), /Preview only/);
  assert.equal(await client.db('synthetic_cli').collection('employees').countDocuments(), 0);
  assert.match(await runCli(['--apply']), /"applied": true/);
  assert.equal(await client.db('synthetic_cli').collection('attendance').countDocuments(), 1000);
  assert.ok((await readdir(directory)).some(name => name.startsWith('pre-recovery-synthetic_cli-')));
  console.log('PASS: real MongoDB preview, 1,000-record transactional recovery, newer-data preservation, repeat preview and duplicate-key rollback.');
  console.log('PASS: actual CLI preview/plan/apply and automatic current-data safety backup against isolated MongoDB.');
} finally {
  await client?.close();
  server.kill();
}
