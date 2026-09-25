import { subject } from '@casl/ability';
import { DbtProjectType, ProjectType } from '@lightdash/common';
import { Stack } from '@mantine/core';
import {
    lazy,
    Suspense,
    useEffect,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { HomepageContentPanel } from '../components/Home/HomepageContentPanel';
import LandingPanel from '../components/Home/LandingPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import PageSpinner from '../components/PageSpinner';
import PinnedAndFavoritesSection from '../components/PinnedAndFavoritesSection';
import AiSearchBox from '../ee/components/Home/AiSearchBox';
import { useAiAgentButtonVisibility } from '../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { AdminHomepageControls } from '../ee/features/homepageBuilder/AdminHomepageControls';
import { PersonalFavoritesBar } from '../ee/features/homepageBuilder/blocks/FavoritesBlock';
import {
    useHomepageBuilderFlag,
    useResolvedHomepage,
} from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import {
    TryNewHomepageCard,
    TryNewHomepageModal,
} from '../ee/features/homepageBuilder/TryNewHomepagePromo';
import { ManagedAgentHomeCard } from '../ee/features/managedAgent/ManagedAgentHomeCard';
import { useFavorites } from '../hooks/favorites/useFavorites';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import { useProjectUuid } from '../hooks/useProjectUuid';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
import { PinnedItemsProvider } from '../providers/PinnedItems/PinnedItemsProvider';
import { getProjectUrlIdentifier } from '../utils/projectUrl';

// KONTALA: the homepage builder renders only for an organization that turned
// it on, yet its blocks brought echarts, tiptap and markdown-it (~0.8 MB gzip)
// to every Home visit. Loaded once the flag says it is on.
const loadPublishedHomepage = () =>
    import('../ee/features/homepageBuilder/PublishedHomepage').then(
        (module) => module.PublishedHomepage,
    );
const loadDayOneHomepage = () =>
    import('../ee/features/homepageBuilder/DayOneHomepage').then(
        (module) => module.DayOneHomepage,
    );
const PublishedHomepage = lazy(() =>
    loadPublishedHomepage().then((component) => ({ default: component })),
);
const DayOneHomepage = lazy(() =>
    loadDayOneHomepage().then((component) => ({ default: component })),
);

const Home: FC = () => {
    const [isTryNewHomepageOpen, setIsTryNewHomepageOpen] = useState(false);
    const selectedProjectUuid = useProjectUuid();
    const project = useProject(selectedProjectUuid);
    const onboarding = useOnboardingStatus();
    const pinnedItems = usePinnedItems(
        selectedProjectUuid,
        project.data?.pinnedListUuid,
    );
    const favorites = useFavorites(selectedProjectUuid);
    const {
        data: mostPopularAndRecentlyUpdated,
        isInitialLoading: isMostPopularAndRecentlyUpdatedLoading,
    } = useMostPopularAndRecentlyUpdated(selectedProjectUuid);

    const { user } = useApp();
    const isAiAgentsEnabled = useAiAgentButtonVisibility();
    // The commercial flag (per-org, default-off) is the only gate — AI-less
    // orgs get the day-0/builder experience with the non-AI hero variant.
    const {
        isEnabled: isHomepageBuilderEnabled,
        isLoading: isHomepageBuilderFlagLoading,
    } = useHomepageBuilderFlag();
    const resolvedHomepage = useResolvedHomepage(selectedProjectUuid, {
        enabled: isHomepageBuilderEnabled,
    });

    // KONTALA: fetched alongside the resolved homepage rather than after it.
    useEffect(() => {
        if (!isHomepageBuilderEnabled) return;
        void loadPublishedHomepage();
        void loadDayOneHomepage();
    }, [isHomepageBuilderEnabled]);

    const isLoading =
        onboarding.isInitialLoading ||
        project.isInitialLoading ||
        isMostPopularAndRecentlyUpdatedLoading ||
        pinnedItems.isInitialLoading ||
        favorites.isInitialLoading ||
        isHomepageBuilderFlagLoading ||
        resolvedHomepage.isInitialLoading;

    const error = onboarding.error || project.error;

    useUnmount(() => onboarding.remove());

    // Rendered in the loading state too: opting in triggers the resolved
    // homepage's first fetch, which sends Home through this spinner — the
    // modal must survive that or its success screen is lost mid-flow.
    const tryNewHomepageModal = selectedProjectUuid ? (
        <TryNewHomepageModal
            opened={isTryNewHomepageOpen}
            onClose={() => setIsTryNewHomepageOpen(false)}
            projectUuid={selectedProjectUuid}
        />
    ) : null;

    if (isLoading) {
        return (
            <>
                <PageSpinner />
                {tryNewHomepageModal}
            </>
        );
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!project.data || !onboarding.data) {
        return <ErrorState />;
    }

    if (user.data?.ability?.cannot('view', subject('Project', project.data))) {
        return <ForbiddenPanel />;
    }

    const isGitHubProject =
        project.data.type !== ProjectType.PREVIEW &&
        project.data.dbtConnection.type === DbtProjectType.GITHUB;
    const projectUrlIdentifier = getProjectUrlIdentifier(project.data);

    let body: ReactNode;
    if (
        isHomepageBuilderEnabled &&
        resolvedHomepage.data?.type === 'homepage'
    ) {
        const { homepage } = resolvedHomepage.data;
        const hasFavoritesBlock = homepage.config.rows.some((row) =>
            row.blocks.some((block) => block.type === 'favorites'),
        );
        body = (
            <Suspense fallback={<PageSpinner />}>
                <Page withFooter noContentPadding>
                    <AdminHomepageControls
                        projectUuid={project.data.projectUuid}
                        organizationUuid={project.data.organizationUuid}
                        showNewHomepage
                    />
                    <PublishedHomepage
                        config={homepage.config}
                        projectUuid={project.data.projectUuid}
                        topBar={
                            !hasFavoritesBlock ? (
                                <PersonalFavoritesBar
                                    projectUuid={project.data.projectUuid}
                                />
                            ) : null
                        }
                    />
                </Page>
            </Suspense>
        );
    } else if (
        isHomepageBuilderEnabled &&
        resolvedHomepage.data === null &&
        onboarding.data.ranQuery
    ) {
        body = (
            <Suspense fallback={<PageSpinner />}>
                <Page withFooter noContentPadding>
                    <AdminHomepageControls
                        projectUuid={project.data.projectUuid}
                        organizationUuid={project.data.organizationUuid}
                    />
                    <FavoritesProvider projectUuid={project.data.projectUuid}>
                        <PinnedItemsProvider
                            organizationUuid={project.data.organizationUuid}
                            projectUuid={project.data.projectUuid}
                            pinnedListUuid={project.data.pinnedListUuid || ''}
                            allowDelete={false}
                        >
                            <DayOneHomepage
                                projectUuid={project.data.projectUuid}
                                pinnedItems={pinnedItems.data ?? []}
                            />
                        </PinnedItemsProvider>
                    </FavoritesProvider>
                </Page>
            </Suspense>
        );
    } else {
        body = (
            <Page withFixedContent withPaddedContent withFooter>
                <Stack gap="xl">
                    {!onboarding.data.ranQuery ? (
                        <OnboardingPanel
                            projectUrlIdentifier={projectUrlIdentifier}
                            userName={user.data?.firstName}
                        />
                    ) : (
                        <FavoritesProvider
                            projectUuid={project.data.projectUuid}
                        >
                            <LandingPanel
                                userName={user.data?.firstName}
                                projectUuid={project.data.projectUuid}
                                projectUrlIdentifier={projectUrlIdentifier}
                            />
                            {/* Below the greeting on purpose: an admin-only promo
                            shouldn't outrank the page's own hero */}
                            {!isHomepageBuilderEnabled && (
                                <TryNewHomepageCard
                                    organizationUuid={
                                        project.data.organizationUuid
                                    }
                                    onTryNow={() =>
                                        setIsTryNewHomepageOpen(true)
                                    }
                                />
                            )}
                            {project.data.type !== ProjectType.PREVIEW && (
                                <ManagedAgentHomeCard
                                    projectUuid={project.data.projectUuid}
                                />
                            )}
                            {isAiAgentsEnabled && (
                                <AiSearchBox
                                    projectUuid={project.data.projectUuid}
                                    showAiReviewsPromo={isGitHubProject}
                                />
                            )}
                            <PinnedItemsProvider
                                organizationUuid={project.data.organizationUuid}
                                projectUuid={project.data.projectUuid}
                                pinnedListUuid={
                                    project.data.pinnedListUuid || ''
                                }
                                allowDelete={false}
                            >
                                <PinnedAndFavoritesSection
                                    pinnedItems={pinnedItems.data ?? []}
                                    favoriteItems={favorites.data ?? []}
                                    pinnedIsEnabled={Boolean(
                                        mostPopularAndRecentlyUpdated
                                            ?.mostPopular.length ||
                                        mostPopularAndRecentlyUpdated
                                            ?.recentlyUpdated.length,
                                    )}
                                />
                            </PinnedItemsProvider>
                            <HomepageContentPanel
                                data={mostPopularAndRecentlyUpdated}
                                projectUuid={project.data.projectUuid}
                                projectUrlIdentifier={projectUrlIdentifier}
                            />
                        </FavoritesProvider>
                    )}
                </Stack>
            </Page>
        );
    }

    return (
        <>
            {body}
            {/* Page-level so it survives the org-wide flip: the success
                screen then shows over the new homepage it is describing */}
            {tryNewHomepageModal}
        </>
    );
};

export default Home;
