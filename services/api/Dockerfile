# API image for Cloud Run. Build from the repository root:
#   docker build -f services/api/Dockerfile -t astro-api .
# Stage 1 builds the bundle; stage 2 installs only the API's production dependencies from the
# lockfile; the final image holds the bundle plus those dependencies and runs as a non-root user.
# Node is pinned to the dev version so the tz database (birth-time offsets) matches the tests.
# TODO(T10.2): also pin by digest once a registry is reachable from the build machine.
FROM node:24.13.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/mobile/package.json apps/mobile/
COPY infra/firebase/package.json infra/firebase/
RUN npm ci --workspace @astro/api --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/api services/api
RUN npm run build --workspace @astro/api

FROM node:24.13.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY apps/mobile/package.json apps/mobile/
COPY infra/firebase/package.json infra/firebase/
RUN npm ci --omit=dev --workspace @astro/api --ignore-scripts --no-audit --no-fund

FROM node:24.13.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/services/api/dist services/api/dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "services/api/dist/server.js"]
