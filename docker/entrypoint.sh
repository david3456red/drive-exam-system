#!/bin/sh
set -eu

export DATABASE_URL="${DATABASE_URL:-file:/data/prod.db}"

mkdir -p /data

pnpm prisma migrate deploy
pnpm db:seed

exec node server.js
