#!/bin/sh
# Applies pending migrations and the reference data (service areas, packages,
# parameters), then starts the API. Both steps are safe to repeat on every start.
set -e
prisma migrate deploy
ts-node --transpile-only prisma/seed.ts
exec node dist/main.js
