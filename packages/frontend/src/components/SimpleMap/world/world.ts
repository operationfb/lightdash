// KONTALA: the world map's countries, a bundled asset rather than upstream's
// public/geojson/countries.geojson. See the README beside this file.
import worldTopoJsonUrl from './world-50m.topo.json?url';

/**
 * The path to request a bundled asset by.
 *
 * vite's `?url` already carries the base path this build is served under
 * (`/analytics/assets/world-50m.topo-<hash>.json`), and `resolveRequestUrl`,
 * which every map fetch goes through, resolves a path against that base path,
 * so it is taken off here to be put back there exactly once. Read at call time,
 * so that a test can stub `BASE_URL`.
 */
export const toRequestPath = (
    assetUrl: string,
    baseUrl: string = import.meta.env.BASE_URL,
): string =>
    assetUrl.startsWith(baseUrl)
        ? `/${assetUrl.slice(baseUrl.length)}`
        : assetUrl;

/** The world map's countries, for `MapChartLocation.WORLD` and `EUROPE`. */
export const getWorldGeoJsonUrl = (): string => toRequestPath(worldTopoJsonUrl);
