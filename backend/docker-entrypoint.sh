#!/bin/sh
# Apply pending migrations, optionally seed demo listings, then start the API.
set -e
node_modules/.bin/prisma migrate deploy
if [ "${SEED_DEMO:-false}" = "true" ]; then
  node dist/seed/run.js || echo "seed failed (continuing)"
fi
exec node dist/main.js
