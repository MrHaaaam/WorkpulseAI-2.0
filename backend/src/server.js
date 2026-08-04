import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import apiRouter, { enforceAutomaticClockOut, getSettings } from './routes/api.js';
import authRouter from './routes/auth.js';
import { securityHeaders } from './security.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'] }));
app.use(securityHeaders);
app.use((req, res, next) => { req.requestId = crypto.randomUUID(); res.setHeader('X-Request-ID', req.requestId); next(); });
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https' && !req.secure) return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'Invalid JSON request body' });
  }
  console.error('Unhandled API error:', error instanceof Error ? error.message : error);
  response.status(500).json({ error: 'Unexpected server error' });
});

async function startServer() {
  if (!mongoUri) {
    console.error('Missing MONGODB_URI. Create backend/.env from backend/.env.example.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas.');
    try {
      const db = mongoose.connection.db;
      await Promise.all([
        db.collection('login_captchas').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('login_otps').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('admin_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('admin_sessions').createIndex({ tokenDigest: 1 }, { unique: true }),
        db.collection('admin_accounts').createIndex({ email: 1 }, { unique: true }),
        db.collection('employee_accounts').createIndex({ email: 1 }, { unique: true }),
        db.collection('employee_accounts').createIndex({ employeeId: 1 }, { unique: true }),
        db.collection('audit_events').createIndex({ occurredAt: -1 }),
      ]);
    } catch (error) {
      console.error('Security index setup failed:', error instanceof Error ? error.message : error);
    }
    const enforceAttendanceLimits = async () => {
      try {
        const settings = await getSettings(mongoose.connection.db);
        await enforceAutomaticClockOut(mongoose.connection.db, settings);
      } catch (error) {
        console.error('Automatic clock-out check failed:', error instanceof Error ? error.message : error);
      }
    };
    await enforceAttendanceLimits();
    setInterval(enforceAttendanceLimits, 60_000);
    app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));
  } catch (error) {
    console.error('MongoDB connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

startServer();
