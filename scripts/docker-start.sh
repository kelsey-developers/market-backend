#!/bin/sh
set -eu

echo "[docker-start] Applying database schema..."
if npx prisma migrate deploy; then
  echo "[docker-start] Prisma migrations applied."
else
  echo "[docker-start] migrate deploy failed, falling back to prisma db push..."
  npx prisma db push
fi

echo "[docker-start] Starting market-backend on port ${PORT:-4000}..."
exec node dist/server.js
