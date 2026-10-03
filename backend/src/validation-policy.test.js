import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, validName, validEmail, validAddress } from './input-validation.js';
import { createLoginCooldown } from './login-cooldown.js';
import { checkoutIsChronological } from './attendance-validation.js';
import { forcedClockOutUpdate } from './force-clock-out.js';

test('names support Unicode and normalize spaces without truncating oversized input', () => {
  assert.equal(normalizeName('  Peña   Muñoz  '), 'Peña Muñoz');
  for (const name of ['Peña', '李明', 'Anne-Marie', "O’Neil", 'Jose\u0301']) assert.ok(validName(normalizeName(name)));
  for (const name of ['', 'A', 'John123', '<script>', '---', 'A'.repeat(51)]) assert.equal(validName(name), false);
  assert.ok(validName('A'.repeat(50)));
  assert.equal(normalizeName('A'.repeat(61)).length, 61);
});

test('email and address boundaries are consistent', () => {
  assert.ok(validEmail('person@example.com'));
  assert.ok(validEmail('first.last+tag@example.com'));
  for (const email of ['bad', '.a@example.com', 'a..b@example.com', 'a@exam!ple.com', 'a@-example.com', '<a>@example.com', 'a@@b.com', 'a b@example.com', 'a'.repeat(243) + '@example.com']) assert.equal(validEmail(email), false);
  assert.ok(validEmail('a'.repeat(242) + '@example.com'));
  for (const size of [5, 255, 500]) assert.ok(validAddress('a'.repeat(size)));
  for (const size of [0, 4, 501]) assert.equal(validAddress('a'.repeat(size)), false);
});

test('fifth failure waits 10 seconds, subsequent failures add 10, success resets', () => {
  const cooldown = createLoginCooldown();
  for (let attempt = 1; attempt <= 4; attempt++) assert.equal(cooldown.fail('user', 0), 0);
  assert.equal(cooldown.fail('user', 0), 10);
  assert.equal(cooldown.remaining('user', 9001), 1);
  assert.equal(cooldown.remaining('user', 10000), 0);
  assert.equal(cooldown.fail('user', 10000), 20);
  assert.equal(cooldown.fail('user', 30000), 30);
  assert.equal(cooldown.remaining('other', 30000), 0);
  cooldown.reset('user');
  assert.equal(cooldown.fail('user', 30000), 0);
});

test('checkout rejects equal, earlier, and invalid times, including forced checkout', () => {
  const date = '2026-09-24';
  const session = { checkIn: '09:00 AM', checkOut: null };
  for (const now of ['2026-09-24T00:59:00Z', '2026-09-24T01:00:00Z', 'invalid']) {
    assert.equal(checkoutIsChronological(date, session, now), false);
    assert.equal(forcedClockOutUpdate({ date, sessions: [session] }, { date, time: '09:00 AM', now: new Date(now) }, 'admin'), null);
  }
  assert.ok(checkoutIsChronological(date, session, '2026-09-24T01:01:00Z'));
  assert.ok(checkoutIsChronological(date, { checkIn: '10:00 PM' }, '2026-09-24T22:00:00Z'));
  assert.equal(checkoutIsChronological(date, { checkIn: 'invalid' }, new Date()), false);
  assert.equal(checkoutIsChronological(date, { ...session, checkInAt: '2026-09-24T01:00:59Z' }, '2026-09-24T01:00:30Z'), false);
});
