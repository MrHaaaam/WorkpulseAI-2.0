# Email delivery

Gmail is the default when EMAIL_PROVIDER is absent. Existing localhost SMTP_USER
and SMTP_APP_PASSWORD settings continue to work, even with Brevo credentials present.
All seven email flows share src/email.js, including registration, password recovery,
replacement credentials and payroll emails. Existing account rollback protections remain.

Add these backend-only variables on Render:

```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=your-private-api-key
EMAIL_FROM_ADDRESS=your-verified-sender@gmail.com
EMAIL_FROM_NAME=WORKPULSE MVL
APP_URL=https://workpulsmvl.vercel.app
FRONTEND_ORIGIN=https://workpulsmvl.vercel.app
```

Keep the existing MongoDB settings. Deploy the updated backend before testing login.
Never add the API key to frontend/VITE variables or commit backend/.env.

To test Brevo without changing localhost's provider, from the project root run:

```powershell
node backend/test-email.js
```

This sends one real message to EMAIL_FROM_ADDRESS using the credentials in backend/.env.
Supply a recipient as the first argument to test another inbox. It writes no database data.
Check the inbox, spam folder and Brevo transactional logs: acceptance means queued,
not confirmed delivery. The API request times out after 15 seconds and is not retried.
If Brevo rejects it, inspect the reported HTTP status and provider code plus account
activation, sender verification, quota and any IP authorization notification.

After deploying, test login OTP, reset OTP, registration verification, new-account
credentials, replacement credentials and payroll emails with test accounts.
Vercel API routing must also work: /api/auth/captcha must return JSON, not Hello, world!.
