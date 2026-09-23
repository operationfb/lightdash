import { ContentType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ContentSlugRenameModal from './ContentSlugRenameModal';

// KONTALA: the modal previews the address the content will have. Served under
// /analytics, a bare /projects/... there was an address of the app sharing the
// origin, not of the chart.
describe('ContentSlugRenameModal URL preview', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('shows the new address under the base path the app is served from', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        renderWithProviders(
            <ContentSlugRenameModal
                opened
                onClose={vi.fn()}
                onRenamed={vi.fn()}
                projectUuid="project-1"
                projectUrlIdentifier="jaffle-shop"
                currentSlug="weekly-revenue"
                resourceType={ContentType.CHART}
            />,
        );

        expect(
            screen.getByText(
                `${window.location.origin}/analytics/projects/jaffle-shop/saved/weekly-revenue/view`,
            ),
        ).toBeInTheDocument();
    });
});
