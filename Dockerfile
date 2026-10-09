# Multi-stage build of the Veschi image (SvelteKit + adapter-node).
# The build needs neither PostgreSQL nor MinIO: migrations are applied and the
# bucket is created when the container starts (docker/entrypoint.sh, src/lib/server/init.ts).

ARG NODE_IMAGE=node:22-alpine

# libssl3 from the base image is enough for the Prisma engines (linux-musl-openssl-3.0.x).
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# All dependencies, for the build.
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Application build and the generated Prisma client (with the musl query engine).
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# Production dependencies only. The Prisma CLI (for `prisma migrate deploy` at
# startup) stays: it is an optional peer of @prisma/client, so npm keeps it with
# --omit=dev ("devOptional" in package-lock.json). The test guards that.
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
    && test -x node_modules/.bin/prisma

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=52M
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/build ./build
COPY package.json ./
COPY prisma ./prisma
COPY assets ./assets
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "build"]
