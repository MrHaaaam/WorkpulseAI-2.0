import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createEmailTransport } from './src/email.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
const recipient = process.argv[2] || process.env.EMAIL_FROM_ADDRESS;
if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error('Provide a valid test recipient: node backend/test-email.js recipient@example.com');
  process.exitCode = 1;
} else {
  try {
    const result = await createEmailTransport('brevo').sendMail({ to: recipient, subject: 'WORKPULSE MVL email delivery test', text: 'This is a Brevo HTTPS delivery test for WORKPULSE MVL. No account or attendance data was changed.' });
    console.log(`Brevo accepted the test email. Message ID: ${result.messageId}. Check your inbox, spam folder and Brevo logs.`);
  } catch (error) {
    console.error('Test email failed:', error.message);
    process.exitCode = 1;
  }
}
