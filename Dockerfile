# Multi-stage build of the Veschi image (SvelteKit + adapter-node).
# The build needs neither PostgreSQL nor MinIO: migrations are applied and the
# bucket is created when the app starts (src/lib/server/init.ts).

# The runtime stage is plain Alpine with Node.js from Alpine's own `nodejs` package:
# it uses the system ICU, OpenSSL and other libraries instead of bundling them, so it
# is ~60 MB smaller than the official binary. npm, yarn and C headers are needed only
# for the build. NODE_IMAGE must have the same Node.js major as that package
# (Alpine 3.24: Node.js 24) and the same Alpine release.
ARG NODE_IMAGE=node:24-alpine3.24
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
# The runtime stage copies both; removed from them first: the server's source maps
# (node runs without --enable-source-maps) and the client's type declarations,
# edge and WebAssembly builds (on Node.js it loads index.js and the native engine).
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build \
    && find build -name '*.map' -delete \
    && cd node_modules/.prisma/client \
    && rm -f ./*.d.ts edge.js wasm.js wasm-*-loader.mjs query_engine_bg.js query_engine_bg.wasm

# Production dependencies only. Migrations are applied by the app itself
# (src/lib/server/migrate.ts), so the Prisma CLI is not needed: npm keeps it with
# --omit=dev because it is an optional peer of @prisma/client ("devOptional" in
# package-lock.json), so it is dropped from package.json and pruned with its
# dependencies (~70 MB with the schema engine). The test guards that.
# Then files nothing in the container reads are removed:
# - typescript and jiti, which npm leaves behind as extraneous, and their links in .bin;
# - sharp builds for glibc and WebAssembly: the lockfile has no libc field, so npm
#   installs them next to the musl build;
# - Prisma client runtimes for other databases, edge and WebAssembly (the generated
#   client loads only runtime/library.js);
# - source maps, type declarations and the TypeScript sources of zod;
# - files that npm packages ship by mistake or only for browsers: the yarn release
#   inside pdfkit, its browser and standalone builds, xml2js.bc.js (nothing requires it),
#   browser builds and sources of fontkit, pngjs and pako, test coverage of pngjs;
# - code nothing on the server loads: the brotli encoder (fontkit only decompresses),
#   zod v3 (the app imports zod v4), the sources of @swc/helpers and its legacy
#   `_` stubs (its package exports point to esm/ and cjs/).
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
    && npm pkg delete devDependencies.prisma devDependencies.typescript \
    && npm prune --omit=dev \
    && test ! -e node_modules/prisma && test ! -e node_modules/@prisma/engines \
    && rm -rf node_modules/typescript node_modules/jiti node_modules/.prisma \
        node_modules/@img/sharp-linux-* node_modules/@img/sharp-libvips-linux-* \
        node_modules/@img/sharp-wasm32 \
        node_modules/zod/src \
        node_modules/pdfkit/.yarn node_modules/pdfkit/js/pdfkit.standalone.js \
        node_modules/pdfkit/js/pdfkit.browser.* \
        node_modules/xml2js/lib/xml2js.bc.js \
        node_modules/fontkit/src node_modules/fontkit/dist/browser* \
        node_modules/brotli/build node_modules/pngjs/coverage node_modules/pngjs/browser.js \
        node_modules/pako/dist node_modules/zod/v3 \
        node_modules/@swc/helpers/_ node_modules/@swc/helpers/src node_modules/@swc/helpers/scripts \
    && for l in node_modules/.bin/*; do [ -e "$l" ] || rm "$l"; done \
    && find node_modules/@prisma/client/runtime -type f \
        ! -name 'library.js' ! -name 'index-browser.js' -delete \
    && find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) -delete

FROM ${ALPINE_IMAGE} AS runtime
# icu-data-en: the server only sorts and lower-cases in Russian (localeCompare(..., 'ru'),
# Intl.Collator('ru')), which the root collation in the English data already covers;
# docker/smoke-test.sh checks it. Russian dates or numbers via Intl on the server
# would need icu-data-full (+31 MB).
RUN apk add --no-cache nodejs icu-data-en \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node
# Native modules and the build were made with NODE_IMAGE's node: the majors must match.
RUN --mount=type=bind,from=base,source=/usr/local/bin/node,target=/tmp/build-node \
    test "$(/tmp/build-node -p 'process.versions.node.split(".")[0]')" \
        = "$(node -p 'process.versions.node.split(".")[0]')"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=52M
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/build ./build
COPY package.json ./
COPY prisma ./prisma
COPY assets ./assets

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "build"]
