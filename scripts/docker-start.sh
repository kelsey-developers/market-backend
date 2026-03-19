#!/bin/sh
set -eu

echo "[docker-start] Applying database schema..."
if npx prisma migrate deploy; then
  echo "[docker-start] Prisma migrations applied."
else
  echo "[docker-start] migrate deploy failed, falling back to prisma db push..."
  if npx prisma db push; then
    echo "[docker-start] prisma db push applied."
  else
    echo "[docker-start] prisma db push failed (likely data-loss warning). Retrying with --accept-data-loss..."
    npx prisma db push --accept-data-loss
    echo "[docker-start] prisma db push --accept-data-loss applied."
  fi
fi

echo "[docker-start] Starting market-backend on port ${PORT:-4000}..."
exec node dist/server.js
