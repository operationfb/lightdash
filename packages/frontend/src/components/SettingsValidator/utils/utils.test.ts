import {
    ValidationSourceType,
    type ValidationResponse,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBrowserLinkToResource, getLinkToResource } from './utils';

const chartError = {
    source: ValidationSourceType.Chart,
    chartUuid: 'chart-1',
} as unknown as ValidationResponse;

const dashboardError = {
    source: ValidationSourceType.Dashboard,
    dashboardUuid: 'dashboard-1',
    dashboardSlug: 'weekly-revenue',
} as unknown as ValidationResponse;

// KONTALA: the validator's links are real anchors, which the browser resolves
// against the origin rather than through the router's basename.
describe('validator resource links', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('links anchors under the base path the app is served from', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(getBrowserLinkToResource(chartError, 'project-1')).toBe(
            '/analytics/projects/project-1/saved/chart-1',
        );
        expect(getBrowserLinkToResource(dashboardError, 'project-1')).toBe(
            '/analytics/projects/project-1/dashboards/weekly-revenue/view',
        );
    });

    // useRenameResource adds the base path to this one itself, so it has to
    // stay a router path: prefixing it too would give /analytics/analytics.
    it('keeps the router path for callers that add the base path themselves', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(getLinkToResource(chartError, 'project-1')).toBe(
            '/projects/project-1/saved/chart-1',
        );
    });

    it('has no link for an error that names no resource', () => {
        const orphan = {
            source: ValidationSourceType.Table,
        } as unknown as ValidationResponse;

        expect(getBrowserLinkToResource(orphan, 'project-1')).toBeUndefined();
    });
});
