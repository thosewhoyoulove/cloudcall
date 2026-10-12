FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @cloudcall/playground build

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/playground/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:22-bookworm-slim AS api
WORKDIR /app
COPY server ./server
USER node
CMD ["node", "server/index.mjs"]
