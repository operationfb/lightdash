import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';

/**
 * KONTALA: a Vega spec's data URLs are fetched by Vega's own loader, which
 * resolves a root-relative one such as the Map template's
 * '/vega-world-map.json' against the ORIGIN. Served under /analytics that
 * missed our public/ folder and the map rendered empty, so the loader is given
 * the base path to prefix. Same capture technique as index.csp.test.tsx.
 */

const { captured } = vi.hoisted(() => ({
    captured: { current: null as { options?: Record<string, unknown> } | null },
}));

vi.mock('react-vega', () => ({
    VegaEmbed: (props: { options?: Record<string, unknown> }) => {
        captured.current = props;
        return null;
    },
}));

vi.mock('../LightdashVisualization/types', () => ({
    isCustomVisualizationConfig: () => true,
}));

vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        isLoading: false,
        visualizationConfig: {
            chartConfig: {
                validConfig: { spec: { mark: 'bar' } },
                series: [{ x: 'a', y: 1 }],
            },
        },
        resultsData: { setFetchAll: vi.fn() },
        containerWidth: 400,
        containerHeight: 300,
    }),
}));

// eslint-disable-next-line import/first
import CustomVisualization from './index';

describe('CustomVisualization data URLs', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        captured.current = null;
    });

    it('loads them under the base path the app is served from', async () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        renderWithProviders(<CustomVisualization />);

        await waitFor(() => expect(captured.current).not.toBeNull());
        expect(captured.current?.options).toMatchObject({
            loader: { baseURL: '/analytics' },
        });
    });

    it('leaves them to the origin at the root, where vega-loader ignores an empty base', async () => {
        renderWithProviders(<CustomVisualization />);

        await waitFor(() => expect(captured.current).not.toBeNull());
        expect(captured.current?.options).toMatchObject({
            loader: { baseURL: '' },
        });
    });
});
