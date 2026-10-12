import { createApi } from './app.mjs';

const server = createApi({
  usersFile: process.env.USERS_FILE ?? '/run/secrets/users.json',
  publicOrigin: process.env.PUBLIC_ORIGIN,
  sipServer: process.env.SIP_SERVER,
  turnSecret: process.env.TURN_SECRET,
  turnUrls: process.env.TURN_URLS?.split(',')
    .map((url) => url.trim())
    .filter(Boolean),
});
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
process.on('SIGTERM', () => server.close());
