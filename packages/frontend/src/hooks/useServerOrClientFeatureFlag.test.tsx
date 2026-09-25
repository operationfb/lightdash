import { FeatureFlags } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
    refetchFeatureFlags,
    useServerFeatureFlag,
} from './useServerOrClientFeatureFlag';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../api';

const mockApi = lightdashApi as unknown as Mock;

const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: 30000 },
            mutations: { retry: false },
        },
    });

const createWrapper = (queryClient: QueryClient) =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };

describe('refetchFeatureFlags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Flags resolve per org on the server, so a value cached before the org (or
    // its first project) existed is wrong for the rest of the session. Because
    // the query sets refetchOnMount: false, invalidating is not enough — the
    // next page to mount would still read the stale value.
    it('refreshes flags cached by an unmounted consumer', async () => {
        const queryClient = createQueryClient();
        const wrapper = createWrapper(queryClient);

        mockApi.mockResolvedValueOnce({ id: 'a-flag', enabled: false });
        const first = renderHook(() => useServerFeatureFlag('a-flag'), {
            wrapper,
        });
        await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
        first.unmount();

        mockApi.mockResolvedValueOnce({ id: 'a-flag', enabled: true });
        await refetchFeatureFlags(queryClient);

        const second = renderHook(() => useServerFeatureFlag('a-flag'), {
            wrapper,
        });
        await waitFor(() =>
            expect(second.result.current.data?.enabled).toBe(true),
        );
        expect(mockApi).toHaveBeenCalledTimes(2);
    });
});

// KONTALA: known flags are read from one request for all of them.
describe('useServerFeatureFlag with known flags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fetches the flags a page mounts together in one request', async () => {
        const queryClient = createQueryClient();
        mockApi.mockResolvedValue([
            { id: FeatureFlags.NewOnboarding, enabled: true },
            { id: FeatureFlags.Documents, enabled: false },
        ]);

        const { result } = renderHook(
            () => ({
                onboarding: useServerFeatureFlag(FeatureFlags.NewOnboarding),
                documents: useServerFeatureFlag(FeatureFlags.Documents),
            }),
            { wrapper: createWrapper(queryClient) },
        );

        await waitFor(() => {
            expect(result.current.onboarding.data?.enabled).toBe(true);
            expect(result.current.documents.data?.enabled).toBe(false);
        });
        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/feature-flag/resolved',
                version: 'v2',
            }),
        );
    });

    it('reads a known flag the response leaves out as disabled', async () => {
        const queryClient = createQueryClient();
        mockApi.mockResolvedValue([]);

        const { result } = renderHook(
            () => useServerFeatureFlag(FeatureFlags.Documents),
            { wrapper: createWrapper(queryClient) },
        );

        await waitFor(() =>
            expect(result.current.data).toEqual({
                id: FeatureFlags.Documents,
                enabled: false,
            }),
        );
    });

    it('refreshes known flags with one new request', async () => {
        const queryClient = createQueryClient();
        const wrapper = createWrapper(queryClient);

        mockApi.mockResolvedValueOnce([
            { id: FeatureFlags.Documents, enabled: false },
        ]);
        const first = renderHook(
            () => useServerFeatureFlag(FeatureFlags.Documents),
            { wrapper },
        );
        await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
        first.unmount();

        mockApi.mockResolvedValueOnce([
            { id: FeatureFlags.Documents, enabled: true },
        ]);
        await refetchFeatureFlags(queryClient);

        const second = renderHook(
            () => useServerFeatureFlag(FeatureFlags.Documents),
            { wrapper },
        );
        await waitFor(() =>
            expect(second.result.current.data?.enabled).toBe(true),
        );
        expect(mockApi).toHaveBeenCalledTimes(2);
    });
});
