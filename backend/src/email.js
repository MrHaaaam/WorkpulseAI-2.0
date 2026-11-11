import nodemailer from 'nodemailer';

export function emailConfigured(provider = process.env.EMAIL_PROVIDER || 'gmail') {
  if (provider === 'brevo') return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.EMAIL_FROM_ADDRESS?.trim());
  return provider === 'gmail' && Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

export function createEmailTransport(provider = process.env.EMAIL_PROVIDER || 'gmail') {
  if (!emailConfigured(provider)) throw new Error('Email provider is not configured');
  if (provider === 'gmail') return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  return {
    async verify() { return true; }, // Configuration preflight; send checks provider acceptance.
    async sendMail({ to, subject, text }) {
      const recipients = Array.isArray(to) ? to : [to];
      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': process.env.BREVO_API_KEY.trim(), 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: process.env.EMAIL_FROM_NAME || 'WORKPULSE MVL', email: process.env.EMAIL_FROM_ADDRESS.trim() }, to: recipients.map(email => ({ email })), subject, textContent: text }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.messageId) throw new Error(`Brevo rejected email (HTTP ${response.status}, code ${String(data?.code || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)})`);
        return { accepted: recipients, messageId: data.messageId }; // Queued, not guaranteed delivered.
      } catch (error) {
        if (error.name === 'TimeoutError') throw new Error('Email delivery timed out');
        throw error;
      }
    },
  };
}
