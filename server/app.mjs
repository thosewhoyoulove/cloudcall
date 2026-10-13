import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyPassword, hashPassword } from './auth.mjs';
import { createMemoryStore } from './session-store.mjs';
import { createLogger } from './logger.mjs';

export function createApi(config) {
  const users = JSON.parse(readFileSync(config.usersFile, 'utf8'));
  if (!Array.isArray(users) || !users.length)
    throw new Error('At least one provisioned user is required');
  const publicOrigin = new URL(config.publicOrigin);
  if (publicOrigin.protocol !== 'https:') throw new Error('PUBLIC_ORIGIN must be HTTPS');
  if (new URL(config.sipServer).protocol !== 'wss:') throw new Error('SIP_SERVER must be WSS');
  if (!config.turnSecret || !config.turnUrls?.length)
    throw new Error('TURN configuration is required');
  const names = new Set();
  for (const user of users) {
    if (
      !user.username ||
      names.has(user.username) ||
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash ?? '') ||
      !/^sip:[^@\s]+@[^@\s]+$/.test(user.aor ?? '') ||
      !user.authorizationUsername ||
      !user.authorizationPassword
    )
      throw new Error('Invalid or duplicate user configuration');
    names.add(user.username);
  }
  const sessions = config.sessionStore ?? createMemoryStore();
  const attempts = config.attemptStore ?? createMemoryStore();
  const logger = config.logger ?? createLogger();
  const startedAt = Date.now();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const cookieName = '__Host-cloudcall';
  const lifetime = 8 * 60 * 60 * 1000;
  function usersReady() {
    try {
      const parsed = JSON.parse(readFileSync(config.usersFile, 'utf8'));
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  function health() {
    const sessionStoreReady = sessions.ready() !== false;
    const attemptStoreReady = attempts.ready() !== false;
    const usersOk = usersReady();
    const ready = usersOk && sessionStoreReady && attemptStoreReady;
    return {
      status: ready ? 'ok' : 'degraded',
      ready,
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      checks: {
        users: usersOk,
        sipServerConfigured: true,
        turnConfigured: true,
        publicOriginConfigured: true,
        sessionStore: sessions.kind,
        sessionStoreReady,
        attemptStore: attempts.kind,
        attemptStoreReady,
      },
    };
  }
  function respond(response, status, data, headers = {}) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    response.end(JSON.stringify(data));
  }
  function session(request) {
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!token) return undefined;
    const key = digest(token);
    const record = sessions.get(key);
    if (!record || record.expires <= Date.now()) {
      if (record) sessions.delete(key);
      return undefined;
    }
    const user = users.find((candidate) => candidate.username === record.username);
    if (!user) return undefined;
    return { key, user };
  }
  async function readJson(request) {
    if (!request.headers['content-type']?.startsWith('application/json'))
      throw new Error('JSON required');
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > 4096) throw new Error('Body too large');
    }
    return JSON.parse(body);
  }
  return createServer(
    { requestTimeout: 10_000, headersTimeout: 10_000 },
    async (request, response) => {
      try {
        const now = Date.now();
        sessions.sweep((value) => value.expires <= now);
        attempts.sweep((value) => value.until <= now);
        const path = new URL(request.url ?? '/', config.publicOrigin).pathname;
        if (request.method === 'GET' && path === '/api/health')
          return respond(response, 200, health());
        if (request.method === 'POST' && request.headers.origin !== publicOrigin.origin)
          return respond(response, 403, { error: 'Invalid origin' });
        if (request.method === 'POST' && path === '/api/login') {
          // API is private behind Caddy. Key by account as well as proxy connection address.
          const input = await readJson(request);
          if (
            typeof input.username !== 'string' ||
            typeof input.password !== 'string' ||
            input.username.length > 100 ||
            input.password.length > 256
          )
            return respond(response, 400, { error: 'Invalid credentials' });
          const keys = [`ip:${request.socket.remoteAddress}`, `user:${input.username}`];
          for (const key of keys) {
            const limit = attempts.update(key, (current) => {
              const fresh = !current || current.until <= now;
              const next = fresh ? { count: 0, until: now + 60_000 } : current;
              next.count += 1;
              return next;
            });
            if (limit.count > (key.startsWith('ip:') ? 60 : 5)) {
              logger.warn('rate_limited', { scope: key.startsWith('ip:') ? 'ip' : 'user' });
              return respond(response, 429, { error: 'Try later' }, { 'Retry-After': '60' });
            }
          }
          const user = users.find((candidate) => candidate.username === input.username);
          const valid = verifyPassword(input.password, user?.passwordHash ?? dummyHash);
          if (!user || !valid) {
            logger.warn('login_failed', { username: input.username });
            return respond(response, 401, { error: 'Invalid credentials' });
          }
          if (sessions.size() >= 10_000)
            return respond(response, 503, { error: 'Capacity reached' });
          const token = randomBytes(32).toString('hex');
          sessions.set(digest(token), { username: user.username, expires: now + lifetime });
          logger.info('login_succeeded', { username: user.username });
          return respond(
            response,
            200,
            { username: user.username },
            {
              'Set-Cookie': `${cookieName}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}`,
            },
          );
        }
        const current = session(request);
        if (!current) return respond(response, 401, { error: 'Authentication required' });
        if (request.method === 'GET' && path === '/api/session')
          return respond(response, 200, { username: current.user.username });
        if (request.method === 'POST' && path === '/api/logout') {
          sessions.delete(current.key);
          logger.info('logout', { username: current.user.username });
          return respond(
            response,
            200,
            { status: 'ok' },
            {
              'Set-Cookie': `${cookieName}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
            },
          );
        }
        if (request.method === 'GET' && path === '/api/telephony/config') {
          const { user } = current;
          const turnUsername = `${Math.floor(now / 1000) + 3600}:${user.username}`;
          const credential = createHmac('sha1', config.turnSecret)
            .update(turnUsername)
            .digest('base64');
          logger.info('telephony_config', { username: user.username });
          return respond(response, 200, {
            server: config.sipServer,
            aor: user.aor,
            authorizationUsername: user.authorizationUsername,
            authorizationPassword: user.authorizationPassword,
            iceServers: [{ urls: config.turnUrls, username: turnUsername, credential }],
          });
        }
        respond(response, 404, { error: 'Not found' });
      } catch (error) {
        logger.warn('request_failed', {
          message: error instanceof Error ? error.message : 'invalid',
        });
        respond(response, 400, { error: 'Invalid request' });
      }
    },
  );
}
