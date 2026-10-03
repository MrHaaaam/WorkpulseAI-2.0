import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { emailConfigured, createEmailTransport } from './email.js';

test('Gmail remains default; Brevo uses HTTPS and rejects failed sends', async (t) => {
  const names = ['EMAIL_PROVIDER', 'SMTP_USER', 'SMTP_APP_PASSWORD', 'BREVO_API_KEY', 'EMAIL_FROM_ADDRESS'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const originalTransport = nodemailer.createTransport;
  t.after(() => {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    globalThis.fetch = originalFetch;
    nodemailer.createTransport = originalTransport;
  });
  delete process.env.EMAIL_PROVIDER;
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_APP_PASSWORD = 'test-password';
  nodemailer.createTransport = options => { assert.equal(options.service, 'gmail'); return { gmail: true }; };
  assert.equal(createEmailTransport().gmail, true);
  process.env.EMAIL_PROVIDER = 'brevo';
  delete process.env.BREVO_API_KEY;
  assert.equal(emailConfigured(), false);
  assert.throws(() => createEmailTransport(), /not configured/);
  process.env.BREVO_API_KEY = 'test-key';
  process.env.EMAIL_FROM_ADDRESS = 'sender@example.test';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(options.headers['api-key'], 'test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.sender.email, 'sender@example.test');
    assert.deepEqual(body.to, [{ email: 'recipient@example.test' }]);
    assert.equal(body.textContent, 'test message');
    return new Response(JSON.stringify({ messageId: 'queued' }), { status: 201 });
  };
  const message = { to: 'recipient@example.test', subject: 'Test', text: 'test message' };
  assert.deepEqual(await createEmailTransport().sendMail(message), { accepted: [message.to], messageId: 'queued' });
  for (const status of [401, 403, 429, 500, 201]) {
    globalThis.fetch = async () => new Response('{}', { status });
    await assert.rejects(createEmailTransport().sendMail(message), /Brevo rejected/);
  }
  globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
  await assert.rejects(createEmailTransport().sendMail(message), /timed out/);
  process.env.EMAIL_PROVIDER = 'invalid';
  assert.equal(emailConfigured(), false);
});
