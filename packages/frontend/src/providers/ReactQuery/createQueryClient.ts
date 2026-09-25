import { type ApiError } from '@lightdash/common';
import { type DefaultOptions } from '@tanstack/react-query';
import { LicenseAwareQueryClient } from './LicenseAwareQueryClient';

const MAX_QUERY_RETRIES = 5;

// Retry transient transport failures (dropped/misrouted requests during
// rollouts, brief gateway timeouts) so a single blip doesn't surface an error.
// Real API errors and synthesized terminal query failures still surface at once.
//
// A NetworkError carrying a 4xx was answered by a server that will answer the
// same way again (an unauthenticated request is the common case), so it is
// terminal. Only failures with no answer at all, and gateway 5xx, are retried.
export const shouldRetryQuery = (
    failureCount: number,
    error: unknown,
): boolean => {
    const apiError = (error as Partial<ApiError>)?.error;
    if (apiError?.name !== 'NetworkError') return false;
    if (apiError.statusCode < 500) return false;
    return failureCount < MAX_QUERY_RETRIES;
};

export const getQueryRetryDelay = (attemptIndex: number): number =>
    Math.min(1000 * 2 ** attemptIndex, 8000);

export const createQueryClient = (options?: DefaultOptions) => {
    // KONTALA: see LicenseAwareQueryClient.
    const queryClient = new LicenseAwareQueryClient({
        defaultOptions: {
            queries: {
                retry: shouldRetryQuery,
                retryDelay: getQueryRetryDelay,
                staleTime: 30000, // 30 seconds
                refetchOnWindowFocus: false,
                onError: async (result) => {
                    // @ts-ignore
                    const { error: { statusCode } = {} } = result;
                    if (statusCode === 401) {
                        await queryClient.invalidateQueries(['health']);
                    }
                },
                networkMode: 'always',
                ...options?.queries,
            },
            mutations: {
                networkMode: 'always',
                ...options?.mutations,
            },
        },
    });

    return queryClient;
};
