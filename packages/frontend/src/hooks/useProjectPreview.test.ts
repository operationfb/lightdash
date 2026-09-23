import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../testing/testUtils';
import { useCreatePreviewMutation } from './useProjectPreview';

const { showToastSuccess } = vi.hoisted(() => ({
    showToastSuccess: vi.fn(),
}));

vi.mock('../api', () => ({
    lightdashApi: vi.fn().mockResolvedValue({
        projectUuid: 'preview-1',
        compileJobUuid: 'job-1',
    }),
}));

vi.mock('../providers/ActiveJob/useActiveJob', () => ({
    default: () => ({ setActiveJobId: vi.fn() }),
}));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({ showToastSuccess, showToastApiError: vi.fn() }),
}));

// KONTALA: the toast opens the preview in a new tab, which starts outside the
// router, so a bare /projects/... there named a page of the app sharing the
// origin.
describe('useCreatePreviewMutation', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        showToastSuccess.mockReset();
    });

    it('opens the new preview project under the base path', async () => {
        vi.stubEnv('BASE_URL', '/analytics/');
        const open = vi.spyOn(window, 'open').mockReturnValue(null);

        const { result } = renderHookWithProviders(() =>
            useCreatePreviewMutation(),
        );
        result.current.mutate({ projectUuid: 'project-1', name: 'preview' });

        await waitFor(() => expect(showToastSuccess).toHaveBeenCalled());
        const [{ action }] = showToastSuccess.mock.calls[0] as [
            { action: { onClick: () => void } },
        ];
        action.onClick();

        expect(open).toHaveBeenCalledWith(
            '/analytics/projects/preview-1/home',
            '_blank',
        );
    });
});
