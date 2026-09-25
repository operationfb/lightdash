#!/bin/bash
set -e

# KONTALA: optionally read the files the server loads at boot, many at a time,
# before it asks for them one at a time (LIGHTDASH_BOOT_READAHEAD=true).
#
# Cloud Run streams the image lazily, so on a fresh instance each first read of
# a file waits for a fetch, and require() reads ~10k of them strictly in
# sequence: 20-33s of every cold start was the server loading its own modules,
# against about 9s when a restart found the image already cached. Reading the
# same list 32 at a time, in the order the server wants it, keeps the fetches
# ahead of the server. The list is recorded at image build
# (docker/record-boot-files.cjs). It only warms a cache: if it fails or falls
# behind, the server reads the files itself, as it always did.
#
# At nice 19 it runs on the CPU the server leaves idle while it waits for a
# read, which is the only time it helps. It is still opt-in, because where
# reads are already fast it has nothing to hide. The node binary gets a reader
# of its own, so its 117 MB never sits in front of the small files. Each
# subshell orphans its job to dumb-init, which reaps it; left as a child of
# this script it would outlive the exec below as a child node never waits for.
BOOT_FILES=/usr/app/boot-files.txt
if [ "${LIGHTDASH_BOOT_READAHEAD:-false}" = "true" ] && [ -r "$BOOT_FILES" ]; then
    (nice -n 19 cat "$(command -v node)" > /dev/null 2>&1 &)
    (UV_THREADPOOL_SIZE=32 nice -n 19 node /usr/bin/read-ahead.cjs "$BOOT_FILES" > /dev/null 2>&1 &)
fi

# Migrate db
#
# KONTALA: a deployment that migrates out of band sets
# LIGHTDASH_MIGRATE_ON_BOOT=false (Kontala runs the migrate job before each
# deploy) and so skips a second Node boot and the migration lease on every cold
# start. /api/v1/readyz still answers schema_pending if a migration is missing.
if [ "${LIGHTDASH_MIGRATE_ON_BOOT:-true}" != "false" ]; then
    export LIGHTDASH_MIGRATION_EXECUTION_MODE="${LIGHTDASH_MIGRATION_EXECUTION_MODE:-boot-winner}"
    # KONTALA: what `pnpm -F backend migrate-production` runs, without a pnpm
    # process start and workspace scan in front of it.
    (cd /usr/app/packages/backend && NODE_ENV=production node dist/scripts/migrate/index.js up)
fi

# Run prod
exec "$@"
