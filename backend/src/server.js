import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

// 1) Load environment variables at the very top.
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// 2) Grab your Atlas connection string from the .env file
const MONGODB_URI = process.env.MONGODB_URI;

// 👇 ADD THIS LINE RIGHT HERE:
console.log('🔌 What Node is reading:', MONGODB_URI);

if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment variables (.env).');
  process.exit(1);
}

// 3) Connect to MongoDB Atlas
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('🎉 Successfully connected to MongoDB Atlas!');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});