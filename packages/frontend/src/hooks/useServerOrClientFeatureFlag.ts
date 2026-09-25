import {
    isKnownFeatureFlagId,
    type ApiError,
    type FeatureFlag,
} from '@lightdash/common';
import {
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';

const FEATURE_FLAG_QUERY_KEY = 'feature-flag';

// KONTALA: every known flag, resolved in one request. A first page load used
// to ask for its ~20 flags one request each. Each flag keeps its own query and
// cache key, so callers, seeded caches and refetches work as before; its fetch
// reads from this query instead, which React Query shares between the flags a
// page mounts together.
const RESOLVED_FEATURE_FLAGS = '@resolved';
const RESOLVED_FEATURE_FLAGS_QUERY_KEY = [
    FEATURE_FLAG_QUERY_KEY,
    RESOLVED_FEATURE_FLAGS,
];

const fetchResolvedFeatureFlags = () =>
    lightdashApi<FeatureFlag[]>({
        url: '/feature-flag/resolved',
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

const fetchFeatureFlag = async (
    queryClient: QueryClient,
    featureFlagId: string,
): Promise<FeatureFlag> => {
    if (!isKnownFeatureFlagId(featureFlagId)) {
        return lightdashApi<FeatureFlag>({
            url: `/feature-flag/${featureFlagId}`,
            version: 'v2',
            method: 'GET',
            body: undefined,
        });
    }
    const flags = await queryClient.fetchQuery(
        RESOLVED_FEATURE_FLAGS_QUERY_KEY,
        fetchResolvedFeatureFlags,
    );
    // A flag the server did not resolve is off, as an unknown one always was.
    return (
        (Array.isArray(flags) ? flags : []).find(
            (flag) => flag.id === featureFlagId,
        ) ?? {
            id: featureFlagId,
            enabled: false,
        }
    );
};

/**
 * Flags resolve per user/organization on the server, so anything that changes
 * that context (creating or joining an org, creating the first project — which
 * enables org overrides) has to refresh them. This refetches rather than
 * invalidates because `refetchOnMount: false` means a stale cached flag would
 * otherwise be served to the next page that mounts.
 */
export const refetchFeatureFlags = async (queryClient: QueryClient) => {
    // KONTALA: the resolved flags first, because each flag's fetch reads them
    // and would otherwise read the copy being replaced.
    await queryClient.refetchQueries({
        queryKey: RESOLVED_FEATURE_FLAGS_QUERY_KEY,
        type: 'all',
    });
    await queryClient.refetchQueries({
        queryKey: [FEATURE_FLAG_QUERY_KEY],
        type: 'all',
        predicate: (query) => query.queryKey[1] !== RESOLVED_FEATURE_FLAGS,
    });
};

/**
 * Get a feature flag value from the backend, which resolves through the
 * unified DB-backed flag system (env-var allowlists → per-flag config
 * handlers → DB).
 */
export const useServerFeatureFlag = (
    featureFlagId: string,
    options?: { retry?: number | boolean; enabled?: boolean },
) => {
    const queryClient = useQueryClient();
    return useQuery<FeatureFlag, ApiError>(
        [FEATURE_FLAG_QUERY_KEY, featureFlagId],
        () => fetchFeatureFlag(queryClient, featureFlagId),
        {
            retry: options?.retry ?? false,
            enabled: options?.enabled ?? true,
            refetchOnMount: false,
        },
    );
};
