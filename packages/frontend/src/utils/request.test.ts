import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRequestUrl } from './request';

const RESULTS_PATH = '/api/v2/projects/abc/query/def/results';

// KONTALA: a request path is resolved relative to the base this build is
// served under, never against the bare origin. vitest gives BASE_URL '/', so
// the base-path cases stub it.
describe('resolveRequestUrl', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        sessionStorage.clear();
    });

    it('resolves against the origin when served at the origin root', () => {
        expect(resolveRequestUrl(RESULTS_PATH)).toBe(
            `${window.location.origin}${RESULTS_PATH}`,
        );
    });

    it('keeps the base path instead of resolving against the origin', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(resolveRequestUrl(RESULTS_PATH)).toBe(
            `${window.location.origin}/analytics${RESULTS_PATH}`,
        );
    });

    it('leaves an absolute URL alone', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(resolveRequestUrl('https://example.com/shapes.geojson')).toBe(
            'https://example.com/shapes.geojson',
        );
    });

    it('prefers the SDK instance URL over this origin', () => {
        vi.stubEnv('BASE_URL', '/analytics/');
        sessionStorage.setItem(
            '__lightdash_sdk_instance_url',
            'https://app.lightdash.cloud/',
        );

        expect(resolveRequestUrl(RESULTS_PATH)).toBe(
            `https://app.lightdash.cloud${RESULTS_PATH}`,
        );
    });

    it('keeps a path the SDK instance URL is served under', () => {
        sessionStorage.setItem(
            '__lightdash_sdk_instance_url',
            'https://konta.la/analytics',
        );

        expect(resolveRequestUrl(RESULTS_PATH)).toBe(
            `https://konta.la/analytics${RESULTS_PATH}`,
        );
    });
});
