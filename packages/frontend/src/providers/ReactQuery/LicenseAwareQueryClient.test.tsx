import { type HealthState } from '@lightdash/common';
import {
    QueryClientProvider,
    useQuery,
    type QueryClient,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../../api';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useAiRouterConfig } from '../../ee/features/aiCopilot/hooks/useAiRouter';
import { useGetUserAgentPreferences } from '../../ee/features/aiCopilot/hooks/useUserAgentPreferences';
import { useOrgHomepageSettings } from '../../ee/features/homepageBuilder/hooks/useOrgHomepageSettings';
import { createQueryClient } from './createQueryClient';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

const mockApi = lightdashApi as unknown as Mock;

const createWrapper = (queryClient: QueryClient) =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };

// The real hooks, so a renamed query key fails here rather than in production.
const useEnterpriseQueries = () => ({
    settings: useAiOrganizationSettings(),
    router: useAiRouterConfig(),
    preferences: useGetUserAgentPreferences('project-uuid'),
    homepage: useOrgHomepageSettings(),
});

const ENTERPRISE_URLS = [
    '/aiAgents/settings',
    '/org/aiRouter',
    '/org/homepage-settings',
    '/projects/project-uuid/aiAgents/preferences',
];

const withHealth = (valid: boolean) => {
    const queryClient = createQueryClient();
    // Only the part of health the client reads.
    queryClient.setQueryData(['health'], {
        license: { hasLicenseKey: valid, valid },
    } satisfies Partial<HealthState>);
    return queryClient;
};

describe('LicenseAwareQueryClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockResolvedValue({});
    });

    it('fails Enterprise queries without a request when the licence is not valid', async () => {
        const { result } = renderHook(useEnterpriseQueries, {
            wrapper: createWrapper(withHealth(false)),
        });

        await waitFor(() => {
            Object.values(result.current).forEach((query) =>
                expect(query.isError).toBe(true),
            );
        });
        Object.values(result.current).forEach((query) =>
            expect(query.error?.error).toMatchObject({
                name: 'MissingConfigError',
                statusCode: 422,
            }),
        );
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('does not run a refused query again for components mounted later', async () => {
        const queryClient = withHealth(false);
        const wrapper = createWrapper(queryClient);
        const first = renderHook(useAiOrganizationSettings, { wrapper });
        await waitFor(() => expect(first.result.current.isError).toBe(true));

        const second = renderHook(useAiOrganizationSettings, { wrapper });
        // Long enough for a re-run, had there been one, to have failed too.
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

        expect(second.result.current.isError).toBe(true);
        expect(
            queryClient.getQueryState(['ai-organization-runtime-settings'])
                ?.fetchStatus,
        ).toBe('idle');
        expect(
            queryClient.getQueryState(['ai-organization-runtime-settings'])
                ?.errorUpdateCount,
        ).toBe(1);
    });

    it('leaves other queries alone when the licence is not valid', async () => {
        const queryFn = vi.fn().mockResolvedValue(['a project']);
        const { result } = renderHook(
            () => useQuery({ queryKey: ['projects'], queryFn }),
            { wrapper: createWrapper(withHealth(false)) },
        );

        await waitFor(() => expect(result.current.data).toEqual(['a project']));
        expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['the licence is valid', () => withHealth(true)],
        ['health has not answered yet', () => createQueryClient()],
    ])('sends Enterprise queries as before when %s', async (_, create) => {
        const { result } = renderHook(useEnterpriseQueries, {
            wrapper: createWrapper(create()),
        });

        await waitFor(() => {
            Object.values(result.current).forEach((query) =>
                expect(query.isSuccess).toBe(true),
            );
        });
        expect(mockApi).toHaveBeenCalledTimes(ENTERPRISE_URLS.length);
        ENTERPRISE_URLS.forEach((url) =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url }),
            ),
        );
    });
});
