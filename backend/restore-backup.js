import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { restoreBackup } from './src/backup-restore.js';

const [file, ...options] = process.argv.slice(2);
const apply = options.includes('--apply');
const databaseName = options.find((option) => option.startsWith('--db='))?.slice(5);
if (!file || !databaseName || !/^[a-zA-Z0-9_-]+$/.test(databaseName) || options.some((option) => option !== '--apply' && !option.startsWith('--db='))) {
  console.error('Usage: node restore-backup.js <local-backup.json> --db=<NEW_DATABASE_NAME> [--apply]');
  process.exitCode = 1;
} else if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required in backend/.env.');
  process.exitCode = 1;
} else {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    const contents = await readFile(file, 'utf8');
    await client.connect();
    const db = client.db(databaseName);
    const result = await restoreBackup(db, contents, { apply });
    console.log(JSON.stringify({ database: databaseName, ...result }, null, 2));
    if (!apply) console.log('Preview only. Repeat with --apply to write into this empty database.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
