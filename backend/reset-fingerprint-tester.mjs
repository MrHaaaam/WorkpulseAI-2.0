import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
const before = new Date(process.argv.find(arg => arg.startsWith('--before='))?.slice(9) || '');
if (!Number.isFinite(before.getTime())) throw new Error('Provide --before=<ISO timestamp> to bound the old test records.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
const apply = process.argv.includes('--apply');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db();
  const targets = [
    ['biometric_evaluation_trials', { createdAt: { $lte: before } }],
    ['biometric_verification_attempts', { source: 'admin-identification', createdAt: { $lte: before } }],
  ];
  for (const [name, filter] of targets) {
    const count = await db.collection(name).countDocuments(filter);
    console.log(`${name}: ${count} old tester records ${apply ? 'selected for deletion' : '(preview)'}`);
    if (apply) {
      const result = await db.collection(name).deleteMany(filter);
      console.log(`${name}: deleted ${result.deletedCount}; remaining in cutoff: ${await db.collection(name).countDocuments(filter)}`);
    }
  }
} finally { await client.close(); }
