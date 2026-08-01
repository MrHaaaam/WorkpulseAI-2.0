import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', apiRouter);
app.use('/api/auth', authRouter);

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
    app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));
  } catch (error) {
    console.error('MongoDB connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

startServer();
