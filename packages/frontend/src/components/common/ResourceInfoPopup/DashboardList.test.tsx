import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { DashboardList } from './DashboardList';

vi.mock('../../../hooks/dashboard/useDashboards', () => ({
    useDashboardsContainingChart: () => ({
        data: [{ uuid: 'dashboard-1', slug: 'weekly-revenue', name: 'Weekly' }],
    }),
}));

// KONTALA: these are real anchors, which the browser resolves against the
// origin rather than through the router's basename. Served under /analytics,
// "Used in N dashboards" linked every dashboard to the 404 of the app sharing
// the origin.
describe('DashboardList', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const renderList = () =>
        renderWithProviders(
            <DashboardList resourceItemId="chart-1" projectUuid="project-1" />,
        );

    it('links each dashboard under the base path the app is served from', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        renderList();

        expect(screen.getByRole('link', { name: 'Weekly' })).toHaveAttribute(
            'href',
            '/analytics/projects/project-1/dashboards/weekly-revenue/view/',
        );
    });

    it('links each dashboard at the origin root when there is no base path', () => {
        renderList();

        expect(screen.getByRole('link', { name: 'Weekly' })).toHaveAttribute(
            'href',
            '/projects/project-1/dashboards/weekly-revenue/view/',
        );
    });
});
