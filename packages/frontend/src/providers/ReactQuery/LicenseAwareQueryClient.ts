import { type ApiError, type HealthState } from '@lightdash/common';
import {
    hashQueryKey,
    QueryClient,
    type DefaultedQueryObserverOptions,
    type QueryKey,
    type QueryObserverOptions,
} from '@tanstack/react-query';

// KONTALA: queries of Enterprise-only endpoints that ordinary pages mount, by
// the first element of their key. Without a valid licence the backend
// registers none of the Enterprise services, so these can only answer 422.
const ENTERPRISE_QUERY_KEYS: ReadonlySet<unknown> = new Set([
    'ai-organization-runtime-settings', // GET /aiAgents/settings
    'ai-router', // GET /org/aiRouter
    'userAgentPreferences', // GET /projects/:projectUuid/aiAgents/preferences
    'org_homepage_settings', // GET /org/homepage-settings
]);

const HEALTH_QUERY_HASH = hashQueryKey(['health']);

// The server's own answer, so callers take the path they already take for it.
const refuseEnterpriseQuery = (): Promise<never> => {
    const refusal: ApiError = {
        status: 'error',
        error: {
            name: 'MissingConfigError',
            statusCode: 422,
            message: 'Not available without an Enterprise licence',
            data: {},
        },
    };
    return Promise.reject(refusal);
};

/**
 * KONTALA: fails the Enterprise-only queries without sending them once health
 * says this instance has no valid licence. Failing rather than disabling them
 * matters: a disabled query reports `isLoading` for good, and callers in ee/
 * wait on that where they would otherwise take their error path.
 */
export class LicenseAwareQueryClient extends QueryClient {
    override defaultQueryOptions<
        TQueryFnData,
        TError,
        TData,
        TQueryData,
        TQueryKey extends QueryKey,
    >(
        options?:
            | QueryObserverOptions<
                  TQueryFnData,
                  TError,
                  TData,
                  TQueryData,
                  TQueryKey
              >
            | DefaultedQueryObserverOptions<
                  TQueryFnData,
                  TError,
                  TData,
                  TQueryData,
                  TQueryKey
              >,
    ): DefaultedQueryObserverOptions<
        TQueryFnData,
        TError,
        TData,
        TQueryData,
        TQueryKey
    > {
        const defaulted = super.defaultQueryOptions(options);
        if (!this.isRefused(defaulted.queryKey)) return defaulted;
        return {
            ...defaulted,
            queryFn: refuseEnterpriseQuery,
            retry: false,
            // Refused once, not again for every component that mounts it.
            retryOnMount: false,
        };
    }

    private isRefused(queryKey: QueryKey | undefined): boolean {
        if (!queryKey || !ENTERPRISE_QUERY_KEYS.has(queryKey[0])) return false;
        // Nothing is refused before health answers, and PrivateRoute renders
        // nothing that mounts these until it has.
        const health =
            this.getQueryCache().get<HealthState>(HEALTH_QUERY_HASH)?.state
                .data;
        return health !== undefined && !health.license?.valid;
    }
}
