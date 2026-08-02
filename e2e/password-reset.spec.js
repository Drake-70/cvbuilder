const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backendRoot = path.resolve(__dirname, '..', 'backend');
const mongoose = require(path.join(backendRoot, 'node_modules', 'mongoose'));

function readEnv(key) {
  const content = fs.readFileSync(path.join(backendRoot, '.env'), 'utf8');
  const m = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

test.describe('password reset', () => {
  test('forgot-password is privacy-safe and reset-password updates the password', async ({ request }) => {
    const ctx = request;
    const email = `pw-${Date.now()}@test.com`;

    const missing = await ctx.post('/api/auth/forgot-password', { data: {} });
    expect(missing.status()).toBe(400);

    const badFormat = await ctx.post('/api/auth/forgot-password', { data: { email: 'nope' } });
    expect(badFormat.status()).toBe(400);

    await ctx.post('/api/auth/register', {
      data: { name: 'Reset Tester', email, password: 'pw-test-123' }
    });
    expect((await ctx.post('/api/auth/forgot-password', { data: { email } })).ok()).toBeTruthy();

    const knownMsg = await (await ctx.post('/api/auth/forgot-password', { data: { email } })).json();
    const unknownMsg = await (await ctx.post('/api/auth/forgot-password', { data: { email: 'nobody-' + Date.now() + '@test.com' } })).json();
    expect(knownMsg.message).toBe(unknownMsg.message);

    const noToken = await ctx.post('/api/auth/reset-password', { data: { password: 'pw-new-456' } });
    expect(noToken.status()).toBe(400);

    const bogus = await ctx.post('/api/auth/reset-password', { data: { token: 'forged-token', password: 'pw-new-456' } });
    expect(bogus.status()).toBe(400);

    const rawToken = crypto.randomBytes(32).toString('hex');
    await mongoose.connect(readEnv('MONGODB_URI'), { serverSelectionTimeoutMS: 15000 });
    await mongoose.connection.db.collection('users').updateOne(
      { email },
      {
        $set: {
          resetPasswordToken: hashToken(rawToken),
          resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000)
        }
      }
    );

    const shortPw = await ctx.post('/api/auth/reset-password', { data: { token: rawToken, password: '123' } });
    expect(shortPw.status()).toBe(400);

    const reset = await ctx.post('/api/auth/reset-password', { data: { token: rawToken, password: 'pw-new-456' } });
    expect(reset.ok()).toBeTruthy();

    await mongoose.disconnect();

    const login = await ctx.post('/api/auth/login', {
      data: { email, password: 'pw-new-456' }
    });
    expect(login.ok()).toBeTruthy();

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
  });
});
