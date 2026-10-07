# Deployed demo accounts

Use a **separate Render backend service and Vercel frontend project** for this demo. Point the demo frontend's existing `/api` proxy at the demo Render service. Leave the company deployment unchanged.

In the demo frontend checkout, change only the `/api/:path*` destination in `vercel.json` from the company Render URL to `https://<demo-render-service>.onrender.com/api/:path*`. Deploy that checkout to the separate Vercel project; do not merge that destination into the company deployment configuration.

Set these environment variables on the demo Render service:

```env
DEMO_DEPLOYMENT=true
DEMO_LOGIN_ENABLED=true
DEMO_DATABASE_NAME=workpulse_demo_testing
MONGODB_URI=<MongoDB connection string>
FRONTEND_ORIGIN=https://<your-demo-frontend-domain>
NODE_ENV=production
```

Use a MongoDB user restricted to the demo database when possible. The backend explicitly selects `DEMO_DATABASE_NAME`; it refuses names outside `workpulse_demo_*` and refuses a populated database on its first initialization. No company records are copied. An isolated sample employee and two hashed accounts are created at startup. Existing demo records are retained across restarts.

| Username | Password | Access |
| --- | --- | --- |
| admin | admin123 | Demo admin workspace |
| employee | employee123 | Sample employee portal |

Complete the login CAPTCHA. Only these demo accounts skip OTP. Normal login and OTP behavior are unchanged on the company deployment. A demo banner is visible on the demo site.

To stop access, set `DEMO_LOGIN_ENABLED=false` and restart/redeploy the demo backend. Existing demo sessions are denied and removed on startup. Keep `DEMO_DEPLOYMENT=true` and the same demo database name, even when disabling login. Remove email-provider credentials from this public test service to avoid sending real email. Do not enter real employee information or connect real biometric devices to the public demo.

These variables must never be added to the company backend. Enabling demo login without the separate deployment flag stops startup.
