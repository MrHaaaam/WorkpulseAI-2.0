// Keep local demo settings separate from the regular backend/.env deployment.
process.env.DEMO_DEPLOYMENT = 'true';
process.env.DEMO_LOGIN_ENABLED = 'true';
process.env.DEMO_DATABASE_NAME = 'workpulse_demo_local';
process.env.PORT = '5001';
process.env.FRONTEND_ORIGIN = 'http://localhost:5174';
process.env.NODE_ENV = 'development';
// Public demo accounts should not send email through company credentials.
process.env.EMAIL_PROVIDER = 'disabled';
await import('./server.js');
