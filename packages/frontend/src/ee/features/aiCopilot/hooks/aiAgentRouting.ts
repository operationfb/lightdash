import { toBrowserPath } from '../../../../utils/url';

// KONTALA: `window.location.pathname` carries the base path this build is
// served under; the router's paths do not. See utils/url.ts.
export const isEmbedAiAgentRoute = () =>
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith(toBrowserPath('/embed/'));

export const getAiAgentApiBase = (projectUuid: string) =>
    `/projects/${projectUuid}/aiAgents`;

export const getAiAgentPageBase = (projectUuid: string) =>
    isEmbedAiAgentRoute()
        ? `/embed/${projectUuid}/ai-agents`
        : `/projects/${projectUuid}/ai-agents`;

export const getAiAgentThreadPath = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) => `${getAiAgentPageBase(projectUuid)}/${agentUuid}/threads/${threadUuid}`;

/** The thread on a full-page thread route, or null elsewhere. */
export const getThreadUuidFromPathname = (pathname: string): string | null =>
    pathname.match(/\/ai-agents\/[^/]+\/threads\/([^/]+)/)?.[1] ?? null;
