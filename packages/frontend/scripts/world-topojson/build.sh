#!/usr/bin/env bash
# KONTALA: builds the world map's countries,
# src/components/SimpleMap/world/world-50m.topo.json, from Natural Earth's
# 1:50m admin-0 map units. The README beside that file says what it holds and
# why; this script is how it is made, and running it again rewrites the
# committed file byte for byte.
#
# It needs node, curl and network access to GitHub and the npm registry, and
# adds no dependency to the project: mapshaper runs through npx at the pinned
# version below.
#
#   packages/frontend/scripts/world-topojson/build.sh
set -euo pipefail

# The map units layer rather than the countries one: there, France's overseas
# departments, Svalbard, the Caribbean Netherlands, Christmas Island, the Cocos
# Islands and Tokelau are units of their own, as ISO 3166-1 codes them, where
# the countries layer folds them into France, Norway, the Netherlands, New
# Zealand and Australia. The units it splits a country into, such as the
# United Kingdom's England, Scotland, Wales and Northern Ireland, are
# dissolved back into one feature below.
NE_URL='https://github.com/nvkelso/natural-earth-vector/raw/v5.1.2/geojson/ne_50m_admin_0_map_units.geojson'
NE_SHA256='b8d421aca6e9e08e8cdf09cc26af111cc3e0deba4fe915611d58ade71e8a4db0'
# Published more than three days before it was pinned, as the repository's
# .npmrc (min-release-age) requires of anything npm installs.
MAPSHAPER='mapshaper@0.7.72'

# Half the vertices: 430 KB raw and 125 KB brotli against 750 KB and 205 KB
# for all of them, with no visible difference up to zoom 5. Every country
# keeps its shape (keep-shapes), however small; islands of about a pixel or
# less at zoom 3 can go.
SIMPLIFY='50%'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(cd "$here/../../src/components/SimpleMap/world" && pwd)/world-50m.topo.json"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl -fsSL --retry 3 -o "$work/map_units.geojson" "$NE_URL"
node "$here/units.mjs" "$work/map_units.geojson" "$NE_SHA256" "$work/units.geojson"

npx -y "$MAPSHAPER" "$work/units.geojson" -quiet \
    -dissolve a2 copy-fields=a3,name \
    -simplify weighted "$SIMPLIFY" keep-shapes \
    -sort a2 \
    -rename-fields 'ISO3166-1-Alpha-2=a2,ISO3166-1-Alpha-3=a3' \
    -rename-layers countries \
    -o "$out" format=topojson quantization=1e5

echo "wrote $out ($(wc -c <"$out" | tr -d ' ') bytes)"
