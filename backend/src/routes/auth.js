import { Router } from 'express';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';

const router = Router();
const scrypt = promisify(crypto.scrypt);
let operationIndex = 0;
const operations = ['+', '-', '×', '÷'];

export async function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(secret, salt, 64);
  return `${salt}:${Buffer.from(derived).toString('hex')}`;
}

async function verifySecret(secret, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !key) return false;
  const derived = Buffer.from(await scrypt(secret, salt, 64));
  const storedKey = Buffer.from(key, 'hex');
  return derived.length === storedKey.length && crypto.timingSafeEqual(derived, storedKey);
}

function makeCaptcha() {
  const operation = operations[operationIndex++ % operations.length];
  let left = crypto.randomInt(2, 13);
  let right = crypto.randomInt(1, 10);
  if (operation === '-' && right > left) [left, right] = [right, left];
  if (operation === '÷') left *= right;
  const answer = operation === '+' ? left + right : operation === '-' ? left - right : operation === '×' ? left * right : left / right;
  return { challenge: `${left} ${operation} ${right}`, answer: String(answer) };
}

router.get('/captcha', async (_request, response) => {
  const db = mongoose.connection.db;
  if (!db) return response.status(503).json({ error: 'Database is unavailable' });
  const captchaId = crypto.randomUUID();
  const { challenge, answer } = makeCaptcha();
  await db.collection('login_captchas').insertOne({ captchaId, answerHash: await hashSecret(answer), expiresAt: new Date(Date.now() + 5 * 60_000) });
  response.json({ captchaId, challenge });
});

router.post('/login', async (request, response) => {
  try {
    const { email, password, captchaId, captchaAnswer } = request.body ?? {};
    if (!email || !password || !captchaId || captchaAnswer === undefined) return response.status(400).json({ error: 'Complete all login fields' });
    const db = mongoose.connection.db;
    const captcha = await db.collection('login_captchas').findOneAndDelete({ captchaId });
    if (!captcha || captcha.expiresAt < new Date() || !(await verifySecret(String(captchaAnswer).trim(), captcha.answerHash))) return response.status(400).json({ error: 'Invalid or expired CAPTCHA' });

    const admin = await db.collection('admin_accounts').findOne({ email: String(email).trim().toLowerCase(), active: true });
    if (!admin || !(await verifySecret(password, admin.passwordHash))) return response.status(401).json({ error: 'Invalid email or password' });

    if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return response.status(503).json({ error: 'Email OTP is not configured on the server' });
    const otp = String(crypto.randomInt(100000, 1_000_000));
    const verificationId = crypto.randomUUID();
    await db.collection('login_otps').insertOne({ verificationId, adminId: admin._id, otpHash: await hashSecret(otp), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0 });

    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } });
    await transport.sendMail({ from: `Workpulse AI <${process.env.SMTP_USER}>`, to: admin.email, subject: 'Your Workpulse AI login code', text: `Your Workpulse AI verification code is ${otp}. It expires in 10 minutes.` });
    response.json({ verificationId, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Login failed:', error instanceof Error ? error.message : error);
    response.status(500).json({ error: 'Unable to complete login' });
  }
});

router.post('/verify-otp', async (request, response) => {
  const { verificationId, otp } = request.body ?? {};
  const db = mongoose.connection.db;
  const record = await db.collection('login_otps').findOne({ verificationId });
  if (!record || record.expiresAt < new Date() || record.attempts >= 5) return response.status(401).json({ error: 'Invalid or expired verification code' });
  const valid = await verifySecret(String(otp ?? '').trim(), record.otpHash);
  if (!valid) {
    await db.collection('login_otps').updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return response.status(401).json({ error: 'Invalid or expired verification code' });
  }
  await db.collection('login_otps').deleteOne({ _id: record._id });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenDigest = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection('admin_sessions').insertOne({ tokenDigest, adminId: record.adminId, createdAt: new Date(), expiresAt: new Date(Date.now() + 8 * 60 * 60_000) });
  response.json({ token });
});

router.get('/session', async (request, response) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return response.status(401).json({ authenticated: false });
  const tokenDigest = crypto.createHash('sha256').update(token).digest('hex');
  const session = await mongoose.connection.db.collection('admin_sessions').findOne({ tokenDigest, expiresAt: { $gt: new Date() } });
  if (!session) return response.status(401).json({ authenticated: false });
  response.json({ authenticated: true });
});

router.post('/verify-password', async (request, response) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  const password = request.body?.password;
  if (!token || !password) return response.status(400).json({ error: 'Password is required' });
  const db = mongoose.connection.db;
  const tokenDigest = crypto.createHash('sha256').update(token).digest('hex');
  const session = await db.collection('admin_sessions').findOne({ tokenDigest, expiresAt: { $gt: new Date() } });
  if (!session) return response.status(401).json({ error: 'Your session has expired' });
  const admin = await db.collection('admin_accounts').findOne({ _id: session.adminId, active: true });
  if (!admin || !(await verifySecret(password, admin.passwordHash))) return response.status(401).json({ error: 'Incorrect admin password' });
  response.json({ verified: true });
});

router.post('/logout', async (request, response) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    const tokenDigest = crypto.createHash('sha256').update(token).digest('hex');
    await mongoose.connection.db.collection('admin_sessions').deleteOne({ tokenDigest });
  }
  response.status(204).end();
});

export default router;
