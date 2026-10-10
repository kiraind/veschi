#!/bin/sh
# Applies pending database migrations, then replaces itself with the app
# process (exec), so the app is PID 1 and receives SIGTERM/SIGINT directly.
# The storage bucket and the first user are created by the app on startup.
set -eu

./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma

exec "$@"
