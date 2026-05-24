# syntax=docker/dockerfile:1.6

# ----- Stage 1: deps -----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack prepare pnpm@9.15.4 --activate \
 && pnpm install --frozen-lockfile

# ----- Stage 2: build -----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack prepare pnpm@9.15.4 --activate \
 && pnpm exec prisma generate \
 && pnpm build

# ----- Stage 3: runner -----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/.npmrc ./.npmrc
COPY --from=builder /app/prisma ./prisma

# Pin the pnpm version
RUN corepack prepare pnpm@9.15.4 --activate

# SQLite data directory (mount a volume here)
RUN mkdir -p /app/data && chown -R app:app /app
ENV DATABASE_URL="file:/app/data/prod.db"

USER app
EXPOSE 3000

# Apply migrations + seed (idempotent), then start Next.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts && pnpm start -- -p 3000 -H 0.0.0.0"]
