import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../testing/testUtils';
import { useGeoJsonProperties } from './useGeoJsonProperties';

const PROXIED = `/api/v1/geojson-proxy?url=${encodeURIComponent(
    'https://example.com/regions.geojson',
)}`;

// KONTALA: the map config asks for GeoJSON through our own proxy, and a
// root-relative request resolves against the origin, not the base path. Served
// under /analytics it reached the API of the app sharing the origin, so the
// property dropdown for a custom map stayed empty.
describe('useGeoJsonProperties', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const fetchReturning = (body: unknown) =>
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => body,
            text: async () => '',
        } as unknown as Response);

    it('fetches the proxy under the base path the app is served from', async () => {
        vi.stubEnv('BASE_URL', '/analytics/');
        const fetchSpy = fetchReturning({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: { name: 'North' } }],
        });

        const { result } = renderHookWithProviders(() =>
            useGeoJsonProperties(PROXIED),
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(fetchSpy).toHaveBeenCalledWith(
            `${window.location.origin}/analytics${PROXIED}`,
            { credentials: 'include' },
        );
        expect(result.current.data?.properties).toEqual(['name']);
    });
});
