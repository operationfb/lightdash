import { ModalsProvider } from '@mantine/modals';
import { wrapCreateBrowserRouterV7 } from '@sentry/react';
import { lazy, Suspense, type FC } from 'react';
import { flushSync } from 'react-dom';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { APP_ROUTES } from './AppRoutes';
import { DocumentTitle } from './components/common/DocumentTitle';
import PageSpinner from './components/PageSpinner';
import VersionAutoUpdater from './components/VersionAutoUpdater/VersionAutoUpdater';
import { AiAgentsGlobalProvider } from './ee/features/aiCopilot/components/Launcher/AiAgentsGlobalProvider';
import { parseEmbedThemeParams } from './ee/providers/Embed/parseEmbedThemeParams';
import BuildSkewRefresher from './features/buildHashHandshake/BuildSkewRefresher';
import { installChunkLoadErrorHandler } from './features/chunkErrorHandler/chunkErrorHandler';
import ChunkErrorRouteBoundary from './features/errorBoundary/ChunkErrorRouteBoundary';
import ErrorBoundary from './features/errorBoundary/ErrorBoundary';
import { SourceCodeEditorProvider } from './features/sourceCodeEditor';
import ChartColorMappingContextProvider from './hooks/useChartColorConfig/ChartColorMappingContextProvider';
import AbilityProvider from './providers/Ability/AbilityProvider';
import ActiveJobProvider from './providers/ActiveJob/ActiveJobProvider';
import AppProvider from './providers/App/AppProvider';
import useApp from './providers/App/useApp';
import FullscreenProvider from './providers/Fullscreen/FullscreenProvider';
import MantineProvider from './providers/MantineProvider';
import ReactQueryProvider from './providers/ReactQuery/ReactQueryProvider';
import SchedulerJobsProvider from './providers/SchedulerJobs/SchedulerJobsProvider';
import ThirdPartyProvider from './providers/ThirdPartyServicesProvider';
import TrackingProvider from './providers/Tracking/TrackingProvider';
import { toBrowserPath } from './utils/url';

installChunkLoadErrorHandler();

// Renders nothing — it only watches for a finished onboarding run and
// redirects. Keeping it off the entry graph means a signed-out visitor never
// pays for the agent-onboarding hooks just to see the login page.
const AgentOnboardingCompletionWatcher = lazy(() =>
    import('./ee/features/agentOnboarding/AgentOnboardingCompletionWatcher').then(
        (module) => ({ default: module.AgentOnboardingCompletionWatcher }),
    ),
);

// KONTALA: agent onboarding is an enterprise AI flow. Without a valid licence
// there is never a run to watch, yet the watcher's chunk was fetched on every
// page load.
const LicensedAgentOnboardingCompletionWatcher: FC = () => {
    const { health } = useApp();
    if (!health.data?.license?.valid) return null;
    return (
        <Suspense fallback={null}>
            <AgentOnboardingCompletionWatcher />
        </Suspense>
    );
};

// KONTALA: `window.location.pathname` carries the base path this build is
// served under; the router's paths do not. Both sides of the test have to be
// in the same space. See utils/url.ts.
const isMinimalPage = window.location.pathname.startsWith(
    toBrowserPath('/minimal'),
);

// On embed routes, force the color scheme from the ?theme= URL param without
// persisting it to localStorage. This keeps the embed in its configured theme
// while never overriding the viewer's own (shared, cross-tab) theme preference.
// `undefined` everywhere else, so non-embed routes are unaffected.
const embedForcedColorScheme = window.location.pathname.startsWith(
    toBrowserPath('/embed'),
)
    ? parseEmbedThemeParams().theme
    : undefined;

// Sentry wrapper for createBrowserRouter
const sentryCreateBrowserRouter =
    wrapCreateBrowserRouterV7(createBrowserRouter);

const router = sentryCreateBrowserRouter(
    [
        {
            path: '/',
            errorElement: <ChunkErrorRouteBoundary />,
            // Routes are lazy, so the first render waits for a route chunk.
            // KONTALA: show the loading mark meanwhile, the same one index.html
            // draws before the bundle runs and PageSpinner draws after, so the
            // wait reads as one instead of a mark, a blank page and a mark.
            HydrateFallback: PageSpinner,
            element: (
                <AppProvider>
                    <FullscreenProvider enabled={!isMinimalPage}>
                        <VersionAutoUpdater />
                        <BuildSkewRefresher />
                        <ThirdPartyProvider enabled={!isMinimalPage}>
                            <ErrorBoundary wrapper={{ mt: '4xl' }}>
                                <TrackingProvider>
                                    <AbilityProvider>
                                        <ActiveJobProvider>
                                            <SchedulerJobsProvider>
                                                <ChartColorMappingContextProvider>
                                                    <SourceCodeEditorProvider>
                                                        <AiAgentsGlobalProvider>
                                                            {!isMinimalPage && (
                                                                <LicensedAgentOnboardingCompletionWatcher />
                                                            )}
                                                            <Outlet />
                                                        </AiAgentsGlobalProvider>
                                                    </SourceCodeEditorProvider>
                                                </ChartColorMappingContextProvider>
                                            </SchedulerJobsProvider>
                                        </ActiveJobProvider>
                                    </AbilityProvider>
                                </TrackingProvider>
                            </ErrorBoundary>
                        </ThirdPartyProvider>
                    </FullscreenProvider>
                </AppProvider>
            ),
            children: APP_ROUTES,
        },
    ],
    // KONTALA: the prefix this build is served under (vite's base). Without it
    // every route in the table above would be matched against a path that still
    // carries the prefix, and nothing would match.
    { basename: import.meta.env.BASE_URL },
);

const flushRouterUpdate = (callback: () => unknown) => {
    flushSync(callback);
    return undefined;
};

const App = () => (
    <>
        <DocumentTitle />

        <ReactQueryProvider>
            <MantineProvider forceColorScheme={embedForcedColorScheme}>
                <ModalsProvider>
                    <RouterProvider
                        router={router}
                        flushSync={flushRouterUpdate}
                    />
                </ModalsProvider>
            </MantineProvider>
        </ReactQueryProvider>
    </>
);

export default App;
