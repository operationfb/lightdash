# The world map's countries

`world-50m.topo.json` is what a map chart of the world or of Europe (`MapChartLocation.WORLD`, `EUROPE`) draws its countries from.
It is a Kontala change: upstream draws them from `public/geojson/countries.geojson`, which stays in place for smaller upstream merges, and which the SDK build still reads (`rollup.config.mjs`).

Each of its 247 features is one ISO 3166-1 country or territory, with three properties, the same three upstream's file has, so a chart's `geoJsonPropertyKey` keeps matching:

| Property            | Example |
| ------------------- | ------- |
| `name`              | Taiwan  |
| `ISO3166-1-Alpha-2` | TW      |
| `ISO3166-1-Alpha-3` | TWN     |

## Why it replaced upstream's file

Upstream's file is Natural Earth's 1:10m countries, 13.5 MB of GeoJSON with 548,000 vertices.
It is served from `public/` uncompressed and revalidated on every view, and Leaflet draws every vertex as SVG.
This one is 429 KB with 51,000 vertices, and as a hashed asset (`world.ts` imports it with vite's `?url`) it is served from `/assets` precompressed (124 KB brotli, 139 KB gzip) and cached for a year.

It also colours countries upstream's file cannot.
Taiwan is `CN-TW` there, where IP geolocation, and so Kontala, says `TW`.
France's overseas departments are part of France's feature there, so a visitor from Réunion coloured nothing.
Nineteen features are coded `-99` there, Somaliland and Northern Cyprus among them.

## Source and licence

[Natural Earth](https://www.naturalearthdata.com/) 5.1.2, 1:50m Cultural Vectors, Admin 0 - Details, map units (`ne_50m_admin_0_map_units`), from [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson).
Natural Earth is in the public domain: it may be used, modified and published without permission or attribution ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)).

## What the build does to it

The map units layer rather than the countries layer, because it has France's overseas departments (GF, GP, MQ, RE, YT), Svalbard (SJ), the Caribbean Netherlands (BQ), Christmas Island (CX), the Cocos Islands (CC) and Tokelau (TK) as units of their own, as ISO 3166-1 codes them.
The units it splits a single country into are dissolved back into one feature: the United Kingdom's four nations, Belgium's three regions, Bosnia and Herzegovina's two entities, Serbia and Vojvodina, Portugal with the Azores and Madeira, Tanzania with Zanzibar, Papua New Guinea with Bougainville, Palestine's Gaza and West Bank, Antigua and Barbuda, Norway with Jan Mayen, and Australia with the Ashmore and Cartier Islands.

The codes are Natural Earth's `ISO_A2_EH` and `ISO_A3_EH`, which give France `FR`, Norway `NO` and Taiwan `TW` where `ISO_A2` has `-99`, `-99` and `CN-TW`.
Four units have no code there and are given one (`units.mjs`):

- Somaliland is Somalia (SO) and Northern Cyprus is Cyprus (CY), as IP geolocation files them.
- Siachen Glacier is India (IN), as all of Natural Earth's points of view but Pakistan's, Turkey's and the US's have it, so that the map has no hole between India, Pakistan and China.
  Nobody visits from it.
- Kosovo keeps XK and takes XKX as its alpha-3, as upstream's file had it.

No feature is left without a code, and no two features share one.
A feature is named after its country (Natural Earth's `ADMIN`), the largest unit's where it was dissolved from several, and a unit with a code of its own is named after the unit (French Guiana, not France).
Every name the two files share a code for is the same in both.

Gibraltar (GI) and the United States Minor Outlying Islands (UM) are too small for the 1:50m scale and are not in it, so a visitor from Gibraltar has no country to colour.

The geometry is simplified to half its vertices with weighted Visvalingam (mapshaper's default), keeping every country's shape however small, so Singapore, Luxembourg, Malta, Bahrain, Hong Kong and Macau are all drawn.
Islands of about a pixel or less at zoom 3 can go.
The TopoJSON is quantized to 100,000 steps a side, about 400 m.

## Rebuilding it

```sh
packages/frontend/scripts/world-topojson/build.sh
```

It downloads the pinned Natural Earth release, checks its sha256, runs `units.mjs` and then mapshaper through `npx` at the version the script pins, and rewrites `world-50m.topo.json` byte for byte when nothing has changed.
It needs node, curl and network access, and adds no dependency to the project.
`world.test.ts` checks the result: the countries the map has to colour are there, every feature has codes of its own, and the file stays under a megabyte.
