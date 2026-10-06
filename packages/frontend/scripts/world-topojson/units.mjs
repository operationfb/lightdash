// KONTALA: the first half of build.sh. Reads Natural Earth's admin-0 map
// units and writes them back as GeoJSON features carrying only what the world
// map needs: the ISO 3166-1 codes a feature is coloured by (a2, a3) and the
// name its tooltip shows. build.sh then dissolves the units of one code into
// one feature.
//
// usage: node units.mjs <ne_50m_admin_0_map_units.geojson> <sha256> <out.geojson>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , source, expectedSha256, target] = process.argv;

// Units Natural Earth gives no ISO 3166-1 code, by its own code for the unit
// (SU_A3), and the code each is coloured by instead. A visitor's country comes
// from IP geolocation, which files Somaliland under Somalia and Northern
// Cyprus under Cyprus. Siachen Glacier has no visitors; it goes with India, as
// every one of Natural Earth's points of view but Pakistan's, Turkey's and the
// US's has it, so that the map shows no hole between India, Pakistan and China.
// Kosovo has XK, the code geolocation uses, but no alpha-3, so it takes XKX,
// as the file the map used before did.
const CODES = {
    SOL: ['SO', 'SOM'],
    CYN: ['CY', 'CYP'],
    KAS: ['IN', 'IND'],
    KOS: ['XK', 'XKX'],
};

const bytes = readFileSync(source);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== expectedSha256) {
    throw new Error(`${source} has sha256 ${sha256}, not ${expectedSha256}`);
}
const { features } = JSON.parse(bytes.toString('utf8'));

// Area in square degrees, which is enough to tell a country from its islands.
const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    return Math.abs(sum) / 2;
};
const polygonArea = ([outer, ...holes]) =>
    holes.reduce((area, hole) => area - ringArea(hole), ringArea(outer));
const areaOf = ({ type, coordinates }) =>
    type === 'Polygon'
        ? polygonArea(coordinates)
        : coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);

const units = features.map((feature) => {
    const unit = feature.properties;
    // The _EH codes are Natural Earth's ISO codes with its own exceptions
    // undone: France and Norway have FR and NO there, and Taiwan TW, where
    // ISO_A2 has -99 for the first two and CN-TW for Taiwan.
    const [a2, a3] = CODES[unit.SU_A3] ?? [unit.ISO_A2_EH, unit.ISO_A3_EH];
    if (!/^[A-Z]{2}$/.test(a2) || !/^[A-Z]{3}$/.test(a3)) {
        throw new Error(`${unit.SU_A3} (${unit.NAME}) has no code: ${a2}/${a3}`);
    }
    return { feature, unit, a2, a3, area: areaOf(feature.geometry) };
});

const codes = new Map();
for (const unit of units) {
    codes.set(unit.a2, [...(codes.get(unit.a2) ?? []), unit]);
}

// A code is named after its largest unit's country (ADMIN), so the United
// Kingdom is not named after England, nor Australia after Ashmore and Cartier.
const largest = new Map(
    [...codes].map(([a2, group]) => {
        const a3s = new Set(group.map(({ a3 }) => a3));
        if (a3s.size > 1) throw new Error(`${a2} has two alpha-3 codes: ${[...a3s]}`);
        return [a2, group.reduce((a, b) => (b.area > a.area ? b : a)).unit];
    }),
);

// Natural Earth names a unit with a code of its own after the country it files
// it under, so French Guiana's country is France. Where two codes would share a
// name, every code but the country's own takes its unit's name.
const codesByAdmin = new Map();
for (const [a2, unit] of largest) {
    codesByAdmin.set(unit.ADMIN, [...(codesByAdmin.get(unit.ADMIN) ?? []), a2]);
}
const names = new Map(
    [...largest].map(([a2, unit]) => [
        a2,
        codesByAdmin.get(unit.ADMIN).length > 1 && unit.GEOUNIT !== unit.ADMIN
            ? unit.SUBUNIT
            : unit.ADMIN,
    ]),
);
const codeByName = new Map();
for (const [a2, name] of names) {
    if (codeByName.has(name)) {
        throw new Error(`${codeByName.get(name)} and ${a2} are both named ${name}`);
    }
    codeByName.set(name, a2);
}

writeFileSync(
    target,
    JSON.stringify({
        type: 'FeatureCollection',
        features: units.map(({ feature, a2, a3 }) => ({
            type: 'Feature',
            properties: { a2, a3, name: names.get(a2) },
            geometry: feature.geometry,
        })),
    }),
);
console.log(`${units.length} map units, ${codes.size} countries`);
