# syntax=docker/dockerfile:1
# Pulsar Tracker API — build from the REPO ROOT context:
#   docker compose build   # or: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app

# node-gyp toolchain, used by better-sqlite3 when no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Workspace manifests first (layer caching). apps/web/package.json is included
# only so `npm ci` sees the same workspace set the root lockfile was made with.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# npm 11+ blocks dependency install scripts by default — approve them so
# better-sqlite3's (and esbuild's) native builds actually run during install.
# node:22 ships npm 10, which has no `install-scripts` subcommand and runs
# scripts by default; the `|| true` keeps the step valid for both.
RUN npm ci \
 && { npm install-scripts approve --all || echo "note: npm without install-scripts subcommand (npm < 11) — scripts already ran"; } \
 && npm rebuild

COPY tsconfig.base.json ./
COPY packages/shared packages/shared/
COPY apps/api apps/api/

RUN npm run build -w @pulsar/shared \
 && npm run build -w @pulsar/api \
 && npm prune --omit=dev

# Stage only what the runtime needs.
RUN mkdir -p /deploy/apps/api /deploy/packages/shared \
 && cp package.json /deploy/package.json \
 && cp -a node_modules /deploy/node_modules \
 && cp packages/shared/package.json /deploy/packages/shared/package.json \
 && cp -a packages/shared/dist /deploy/packages/shared/dist \
 && cp apps/api/package.json /deploy/apps/api/package.json \
 && cp -a apps/api/dist /deploy/apps/api/dist \
 && if [ -d apps/api/node_modules ]; then cp -a apps/api/node_modules /deploy/apps/api/node_modules; fi

# Sanity-check the staged runtime tree: the native binding resolves and the
# bundle parses as ESM from the directory the container starts in.
RUN cd /deploy/apps/api \
 && node --check dist/server.js \
 && node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('CREATE TABLE t(a)'); console.log('better-sqlite3 OK')"

# --- runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/pulsar.db \
    REDIS_URL=redis://redis:6379 \
    NTFY_MODE=http

WORKDIR /app
COPY --from=build --chown=node:node /deploy/ /app/
RUN mkdir -p /data && chown node:node /data

# Entrypoint starts as root only to hand /data to `node` (the compose bind
# mount is created root-owned by the daemon), then drops privileges via setpriv.
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["dist/server.js"]
