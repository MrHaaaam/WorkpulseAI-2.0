import test from 'node:test';
import assert from 'node:assert/strict';
import { BSON } from 'mongodb';
import { BACKUP_COLLECTIONS, parseBackup, serializeBackup } from './backup-format.js';
import { restoreBackup } from './backup-restore.js';

function sample() {
  return serializeBackup({
    format: 'workpulse-json-backup', version: 2, createdAt: new Date('2026-10-01T00:00:00Z'),
    collections: Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, name === 'employees' ? [{ _id: new BSON.ObjectId(), id: 'E1', createdAt: new Date('2026-09-01T00:00:00Z') }] : []])),
  });
}

test('backup preserves MongoDB IDs and dates', () => {
  const record = parseBackup(sample()).collections.employees[0];
  assert.ok(record._id instanceof BSON.ObjectId);
  assert.ok(record.createdAt instanceof Date);
});

test('restore rejects incomplete and legacy backups', () => {
  assert.throws(() => parseBackup(JSON.stringify({ format: 'workpulse-json-backup', version: 1, collections: {} })), /version 2/);
  const incomplete = JSON.parse(sample());
  delete incomplete.collections.attendance;
  assert.throws(() => parseBackup(JSON.stringify(incomplete)), /collections/);
});

test('restore previews and refuses a populated destination', async () => {
  const inserted = [];
  const db = {
    listCollections: () => ({ toArray: async () => [] }),
    collection: () => ({ insertMany: async (rows) => inserted.push(...rows), countDocuments: async () => inserted.length }),
  };
  const preview = await restoreBackup(db, sample());
  assert.equal(preview.applied, false);
  assert.equal(preview.counts.employees, 1);
  assert.equal(inserted.length, 0);
  await assert.rejects(() => restoreBackup({
    listCollections: () => ({ toArray: async () => [{ name: 'employees' }] }),
    collection: () => ({ estimatedDocumentCount: async () => 1 }),
  }, sample(), { apply: true }), /not empty/);
});

test('restore inserts every backed up collection and verifies counts', async () => {
  const records = new Map();
  const db = {
    listCollections: () => ({ toArray: async () => [] }),
    collection: (name) => ({
      insertMany: async (rows) => records.set(name, [...(records.get(name) || []), ...rows]),
      countDocuments: async () => records.get(name)?.length || 0,
    }),
  };
  const result = await restoreBackup(db, sample(), { apply: true });
  assert.equal(result.applied, true);
  assert.equal(records.get('employees').length, 1);
});
