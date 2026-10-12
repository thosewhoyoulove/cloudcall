import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createApi } from './app.mjs';
import { hashPassword, verifyPassword } from './auth.mjs';

test('password hashes are salted and reject incorrect/malformed passwords', () => {
  const hashed = hashPassword('a-long-test-password');
  assert.notEqual(hashed, hashPassword('a-long-test-password'));
  assert.equal(verifyPassword('a-long-test-password', hashed), true);
  assert.equal(verifyPassword('wrong-password', hashed), false);
  assert.equal(verifyPassword('anything', 'broken'), false);
});

test('API isolates credentials, checks origins, signs TURN credentials and revokes logout', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudcall-api-'));
  const usersFile = join(directory, 'users.json');
  writeFileSync(
    usersFile,
    JSON.stringify([
      {
        username: 'alice',
        passwordHash: hashPassword('test-password-long'),
        aor: 'sip:1001@pbx.example.com',
        authorizationUsername: '1001',
        authorizationPassword: 'private-sip-password',
      },
    ]),
  );
  const server = createApi({
    usersFile,
    publicOrigin: 'https://call.example.com',
    sipServer: 'wss://pbx.example.com/ws',
    turnSecret: 'test-turn-secret',
    turnUrls: ['turn:turn.example.com:3478'],
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const post = (path, body, origin = 'https://call.example.com', cookie = '') =>
    fetch(`${url}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${url}/api/telephony/config`)).status, 401);
    assert.equal(
      (
        await post(
          '/api/login',
          { username: 'alice', password: 'test-password-long' },
          'https://evil.example.com',
        )
      ).status,
      403,
    );
    const unknown = await post('/api/login', { username: 'unknown', password: 'wrong' });
    const wrong = await post('/api/login', { username: 'alice', password: 'wrong' });
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), await wrong.json());
    const login = await post('/api/login', { username: 'alice', password: 'test-password-long' });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    const response = await fetch(`${url}/api/telephony/config`, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const configuration = await response.json();
    assert.equal(configuration.authorizationUsername, '1001');
    const turn = configuration.iceServers[0];
    assert.equal(
      turn.credential,
      createHmac('sha1', 'test-turn-secret').update(turn.username).digest('base64'),
    );
    assert.ok(Number(turn.username.split(':')[0]) > Date.now() / 1000 + 3500);
    assert.equal((await post('/api/logout', {}, 'https://call.example.com', cookie)).status, 200);
    assert.equal(
      (await fetch(`${url}/api/telephony/config`, { headers: { Cookie: cookie } })).status,
      401,
    );
    for (let index = 0; index < 6; index++) {
      const failed = await post('/api/login', { username: 'victim', password: 'wrong' });
      assert.equal(failed.status, index < 5 ? 401 : 429);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
