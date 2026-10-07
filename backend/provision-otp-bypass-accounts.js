import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { hashSecret } from './src/routes/auth.js';
import { ensureOtpBypassAccounts } from './src/otp-bypass-accounts.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
try {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  await ensureOtpBypassAccounts(mongoose.connection.db, hashSecret);
  if (process.argv.includes('--remove-demo')) {
    const demo = mongoose.connection.getClient().db('workpulse_demo_local');
    if (mongoose.connection.db.databaseName === demo.databaseName) throw new Error('Refusing to remove the connected account database.');
    if (await demo.collection('demo_workspace').findOne({ id: 'demo' })) {
      try {
        await demo.dropDatabase();
        console.log('Removed the previously created workpulse_demo_local database.');
      } catch (error) {
        if (error.code !== 13 && !/not allowed.*dropDatabase/i.test(error.message)) throw error;
        const collections = await demo.listCollections({}, { nameOnly: true }).toArray();
        for (const { name } of collections.filter(item => item.name !== 'demo_workspace')) await demo.collection(name).deleteMany({});
        await demo.collection('demo_workspace').deleteMany({});
        console.log('Cleared all demo records. The empty database remains because MongoDB denies dropDatabase.');
      }
    }
  }
  console.log('Real OTP-bypass accounts are ready: admin@gmail.com and employee@gmail.com.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
