# Multi-stage build of the Veschi image (SvelteKit + adapter-node).
# The build needs neither PostgreSQL nor MinIO: migrations are applied and the
# bucket is created when the container starts (docker/entrypoint.sh, src/lib/server/init.ts).

# The runtime stage is plain Alpine with the node binary copied from NODE_IMAGE:
# npm, yarn, corepack and C headers are needed only for the build. The C++ runtime
# node links against comes from NODE_IMAGE too; both images are on one Alpine release.
ARG NODE_IMAGE=node:22-alpine3.24
ARG ALPINE_IMAGE=alpine:3.24

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
# Then files nothing in the container reads are removed:
# - typescript: an optional peer of @prisma/client that npm keeps for the same reason;
# - sharp builds for glibc and WebAssembly: the lockfile has no libc field, so npm
#   installs them next to the musl build;
# - the query engine in @prisma/engines: the generated client has its own copy,
#   the runtime stage links it back for the CLI;
# - the CLI's copy of the new `prisma-client` generator, Prisma client runtimes for
#   other databases, edge and WebAssembly (the generated client loads only
#   runtime/library.js);
# - source maps, type declarations and the TypeScript sources of effect.
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
    && test -x node_modules/.bin/prisma \
    && rm -rf node_modules/typescript \
        node_modules/@img/sharp-linux-* node_modules/@img/sharp-libvips-linux-* \
        node_modules/@img/sharp-wasm32 \
        node_modules/@prisma/engines/libquery_engine-* \
        node_modules/prisma/prisma-client \
        node_modules/effect/src \
    && find node_modules/@prisma/client/runtime -type f \
        ! -name 'library.js' ! -name 'index-browser.js' -delete \
    && find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) -delete

FROM ${ALPINE_IMAGE} AS runtime
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=base /usr/lib/libstdc++.so.6 /usr/lib/libgcc_s.so.1 /usr/lib/
RUN addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=52M
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# The CLI needs the query engine in @prisma/engines too: a link instead of a second copy.
RUN for f in node_modules/.prisma/client/libquery_engine-*; do \
        ln -s "../../.prisma/client/${f##*/}" node_modules/@prisma/engines/; \
    done
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
