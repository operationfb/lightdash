import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestUrl } from '../../../utils/request';
import { getWorldGeoJsonUrl, toRequestPath } from './world';

// KONTALA: the committed world map, as build.sh wrote it. A rebuild that
// loses a country the map has to colour, or brings back a code no visitor's
// country can match, fails here.
const WORLD_FILE = join(
    dirname(fileURLToPath(import.meta.url)),
    'world-50m.topo.json',
);

const readCountries = () => {
    const topology = JSON.parse(readFileSync(WORLD_FILE, 'utf8')) as Topology;
    const [key] = Object.keys(topology.objects);
    return (
        topojson.feature(
            topology,
            topology.objects[key],
        ) as GeoJSON.FeatureCollection
    ).features;
};

const ALPHA_2 = 'ISO3166-1-Alpha-2';
const ALPHA_3 = 'ISO3166-1-Alpha-3';

describe('the world map', () => {
    const countries = readCountries();
    const codes = countries.map((country) => country.properties?.[ALPHA_2]);

    it('has a feature for every country', () => {
        expect(countries.length).toBeGreaterThanOrEqual(240);
        countries.forEach((country) => expect(country.geometry).toBeTruthy());
    });

    it('colours the countries IP geolocation names that the old file could not, and the smallest', () => {
        [
            // Taiwan, coded CN-TW before
            'TW',
            // France and its overseas departments, one feature before
            'FR',
            'GF',
            'GP',
            'MQ',
            'RE',
            'YT',
            // Somalia with Somaliland, Cyprus with Northern Cyprus, Kosovo
            'SO',
            'CY',
            'XK',
            // the smallest, which simplification must not lose
            'SG',
            'LU',
            'MT',
            'BH',
            'HK',
            'MO',
        ].forEach((code) => expect(codes).toContain(code));
    });

    it('gives every feature a code of its own', () => {
        expect(codes).not.toContain('CN-TW');
        countries.forEach((country) => {
            expect(country.properties?.[ALPHA_2]).toMatch(/^[A-Z]{2}$/);
            expect(country.properties?.[ALPHA_3]).toMatch(/^[A-Z]{3}$/);
        });
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('carries the three properties the map may match on, and no others', () => {
        countries.forEach((country) =>
            expect(Object.keys(country.properties ?? {}).sort()).toEqual([
                ALPHA_2,
                ALPHA_3,
                'name',
            ]),
        );
    });

    it('stays under a megabyte', () => {
        expect(statSync(WORLD_FILE).size).toBeLessThan(1024 * 1024);
    });
});

describe('toRequestPath', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('puts the base path on the asset exactly once', () => {
        vi.stubEnv('BASE_URL', '/analytics/');
        // What vite's ?url gives for the asset in a build served there.
        const path = toRequestPath(
            '/analytics/assets/world-50m.topo-AbC12-_x.json',
        );

        expect(path).toBe('/assets/world-50m.topo-AbC12-_x.json');
        expect(resolveRequestUrl(path)).toBe(
            `${window.location.origin}/analytics/assets/world-50m.topo-AbC12-_x.json`,
        );
    });

    it('leaves the path alone at the origin root', () => {
        expect(toRequestPath('/assets/world-50m.topo-AbC12-_x.json')).toBe(
            '/assets/world-50m.topo-AbC12-_x.json',
        );
    });

    it('names the world file for the world map', () => {
        expect(getWorldGeoJsonUrl()).toMatch(/^\/.*world-50m\.topo.*\.json$/);
    });
});
