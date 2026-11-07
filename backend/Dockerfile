# syntax=docker/dockerfile:1
# Pratala API: deps -> build (prisma generate + nest build) -> runner (prod deps only, non-root).

FROM node:24-alpine AS base
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# --- all dependencies (dev included) for the build -------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pratala-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# --- compile ---------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm prisma generate && pnpm build

# --- production dependencies only -----------------------------------------
# Scripts off (our postinstall `prisma generate` is not needed: dist/ already
# contains the compiled client), then rebuild only Prisma so @prisma/engines
# downloads the schema engine that `prisma migrate deploy` uses at start-up.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pratala-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --store-dir /pnpm/store && \
    pnpm rebuild @prisma/engines prisma

# --- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production PORT=4100 UPLOAD_DIR=/app/data/uploads
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
