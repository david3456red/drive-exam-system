# syntax=docker/dockerfile:1.6
# ----- Stage 1: deps -----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ----- Stage 2: build -----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ----- Stage 3: runner -----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache openssl

# Non-root user
RUN addgroup -S app && adduser -S app -G app

# Standalone-friendly copy
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Data directory for SQLite (mount a volume here)
RUN mkdir -p /app/data && chown -R app:app /app
ENV DATABASE_URL="file:/app/data/prod.db"

USER app
EXPOSE 3000

# Apply migrations + seed (idempotent) then start Next
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run start -- -p 3000 -H 0.0.0.0"]
