import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import { type PropsWithChildren } from 'react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../api';
import useUser from './useUser';

const USER_UUID = 'b264d83a-9000-426a-85ec-3f9c20f368ce';

const renderUseUser = (isAuthenticated: boolean) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return renderHook(() => useUser(isAuthenticated), { wrapper });
};

describe('useUser', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    afterEach(() => {
        fetchSpy.mockClear();
    });

    afterAll(() => {
        fetchSpy.mockRestore();
    });

    it('makes no request while signed out', async () => {
        const { result } = renderUseUser(false);
        await act(async () => {});

        expect(result.current.fetchStatus).toBe('idle');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('loads the account, then the registered user, once signed in', async () => {
        const scope = nock(BASE_API_URL)
            .get('/api/v1/user/account')
            .reply(200, {
                status: 'ok',
                results: {
                    authentication: { type: 'session' },
                    user: {
                        id: USER_UUID,
                        type: 'registered',
                        abilityRules: [],
                    },
                },
            })
            .get('/api/v1/user')
            .reply(200, {
                status: 'ok',
                results: { userUuid: USER_UUID, abilityRules: [] },
            });

        const { result } = renderUseUser(true);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.userUuid).toBe(USER_UUID);
        expect(scope.isDone()).toBe(true);
    });
});
