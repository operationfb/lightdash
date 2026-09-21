#!/usr/bin/env bash
# KONTALA: parse every turbo.json in the workspace.
#
# Turbo rejects unknown keys and fails the whole file at parse time, but turbo.json is only
# read when a task actually runs through turbo - so a bad key survives tsc and lint locally
# and first surfaces ~40 minutes into Cloud Build. A dry run parses every workspace config
# in well under a second, so lint-staged runs this whenever a turbo.json is staged.
#
# lint-staged appends the staged paths as arguments; the dry run already covers the whole
# workspace, so they are ignored.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

pnpm exec turbo build --dry=json >/dev/null
