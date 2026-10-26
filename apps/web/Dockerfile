# syntax=docker/dockerfile:1
# Build from the repo ROOT context:  docker build -f apps/web/Dockerfile .

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# `npm ci` installs every workspace — including better-sqlite3 (native, node-gyp).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Workspace manifests first for layer caching (npm ci needs every workspace).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# shared first: web imports @pulsar/shared's built types/exports.
RUN npm run build -w @pulsar/shared \
 && npm run build -w @pulsar/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
