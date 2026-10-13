import { createApi } from './app.mjs';
import { createLogger } from './logger.mjs';
import { createFileStore, createMemoryStore } from './session-store.mjs';

const fileStore = (name) => {
  const path = process.env[name]?.trim();
  return path ? createFileStore(path) : createMemoryStore();
};

const server = createApi({
  usersFile: process.env.USERS_FILE ?? '/run/secrets/users.json',
  publicOrigin: process.env.PUBLIC_ORIGIN,
  sipServer: process.env.SIP_SERVER,
  turnSecret: process.env.TURN_SECRET,
  turnUrls: process.env.TURN_URLS?.split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  sessionStore: fileStore('SESSION_STORE_PATH'),
  attemptStore: fileStore('ATTEMPT_STORE_PATH'),
  logger: createLogger(),
});
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
process.on('SIGTERM', () => server.close());
