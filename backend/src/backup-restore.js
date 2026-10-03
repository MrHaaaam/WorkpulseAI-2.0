import { BACKUP_COLLECTIONS, parseBackup } from './backup-format.js';

export async function restoreBackup(db, contents, { apply = false } = {}) {
  const backup = parseBackup(contents);
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of existing) {
    if (await db.collection(name).estimatedDocumentCount() > 0) {
      throw new Error(`Destination is not empty (${name} contains records). Use a new database.`);
    }
  }
  const counts = Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, backup.collections[name].length]));
  if (!apply) return { applied: false, counts, createdAt: backup.createdAt };
  for (const name of BACKUP_COLLECTIONS) {
    const records = backup.collections[name];
    for (let offset = 0; offset < records.length; offset += 500) {
      await db.collection(name).insertMany(records.slice(offset, offset + 500));
    }
  }
  for (const name of BACKUP_COLLECTIONS) {
    const actual = await db.collection(name).countDocuments();
    if (actual !== counts[name]) throw new Error(`Restore count mismatch in ${name}: expected ${counts[name]}, found ${actual}.`);
  }
  return { applied: true, counts, createdAt: backup.createdAt };
}
