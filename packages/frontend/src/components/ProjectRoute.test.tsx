import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import MantineProvider from '../providers/MantineProvider';
import ProjectRoute from './ProjectRoute';

const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const state = vi.hoisted(() => ({
    useActiveProjectUuid: vi.fn(),
    useProject: vi.fn(),
    useProjects: vi.fn(),
}));

vi.mock('../hooks/useActiveProject', () => ({
    useActiveProjectUuid: state.useActiveProjectUuid,
}));

vi.mock('../hooks/useProject', () => ({
    useProject: state.useProject,
}));

vi.mock('../hooks/useProjects', () => ({
    useProjects: state.useProjects,
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationUuid: 'org-uuid' } },
        health: {
            data: {
                auth: { oidc: { enabled: true, loginPath: '/login/oidc' } },
            },
        },
    }),
}));

vi.mock('../providers/Ability', () => ({
    Can: ({ children }: { children: (allowed: boolean) => React.ReactNode }) =>
        children(true),
}));

const ProjectDetails = () => {
    const projectRoute = useOptionalProjectRoute();

    return (
        <div>
            {projectRoute?.projectUuid}:{projectRoute?.projectUrlIdentifier}
        </div>
    );
};

const renderProjectRoute = (projectIdentifier: string) =>
    render(
        <MemoryRouter initialEntries={[`/projects/${projectIdentifier}`]}>
            <Routes>
                <Route
                    path="/projects/:projectUuid"
                    element={
                        <ProjectRoute>
                            <ProjectDetails />
                        </ProjectRoute>
                    }
                />
                <Route path="/projects" element={<div>project fallback</div>} />
            </Routes>
        </MemoryRouter>,
        {
            wrapper: ({ children }) => (
                <MantineProvider env="test">{children}</MantineProvider>
            ),
        },
    );

describe('ProjectRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.useActiveProjectUuid.mockReturnValue({
            activeProjectUuid: PROJECT_UUID,
            isLoading: false,
        });
        state.useProject.mockReturnValue({
            data: {
                projectUuid: PROJECT_UUID,
                slug: 'jaffle-shop',
            },
            isError: false,
        });
        state.useProjects.mockReturnValue({
            data: [{ projectUuid: PROJECT_UUID, slug: 'jaffle-shop' }],
            isInitialLoading: false,
            isError: false,
        });
    });

    it('keeps UUID routes working without resolving the project list', () => {
        renderProjectRoute(PROJECT_UUID);

        expect(
            screen.getByText(`${PROJECT_UUID}:jaffle-shop`),
        ).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: false });
        expect(state.useProject).toHaveBeenCalledWith(PROJECT_UUID);
    });

    it('resolves a project slug to the canonical project UUID', () => {
        renderProjectRoute('jaffle-shop');

        expect(
            screen.getByText(`${PROJECT_UUID}:jaffle-shop`),
        ).toBeInTheDocument();
        expect(state.useProjects).toHaveBeenCalledWith({ enabled: true });
        expect(state.useProject).toHaveBeenCalledWith(PROJECT_UUID);
    });

    describe("a project in another of the user's organizations", () => {
        const OTHER_ORG_UUID = '371c115d-9530-484b-a617-f19dae37ecb9';
        const assign = vi.fn();

        beforeEach(() => {
            window.sessionStorage.clear();
            vi.stubGlobal('location', {
                href: `http://localhost/projects/${PROJECT_UUID}/home`,
                assign,
            });
            state.useProject.mockReturnValue({
                data: undefined,
                isError: true,
                error: {
                    error: {
                        name: 'OtherOrganizationError',
                        statusCode: 403,
                        message:
                            'This project belongs to another of your organizations',
                        data: { organizationUuid: OTHER_ORG_UUID },
                    },
                },
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('signs in again for that organization', () => {
            renderProjectRoute(PROJECT_UUID);

            expect(assign).toHaveBeenCalledTimes(1);
            const target = new URL(assign.mock.calls[0][0], 'http://localhost');
            expect(target.pathname).toBe('/api/v1/login/oidc');
            expect(target.searchParams.get('organization')).toBe(
                OTHER_ORG_UUID,
            );
            expect(target.searchParams.get('redirect')).toBe(
                `http://localhost/projects/${PROJECT_UUID}/home`,
            );
        });

        it('explains instead of looping when the sign-in did not switch', () => {
            renderProjectRoute(PROJECT_UUID);
            assign.mockClear();

            renderProjectRoute(PROJECT_UUID);

            expect(assign).not.toHaveBeenCalled();
            expect(
                screen.getByText('This project is in another organization'),
            ).toBeInTheDocument();
        });
    });

    it('redirects when a project slug cannot be resolved', () => {
        state.useProjects.mockReturnValue({
            data: [],
            isInitialLoading: false,
            isError: false,
        });

        renderProjectRoute('missing-project');

        expect(screen.getByText('project fallback')).toBeInTheDocument();
        expect(state.useProject).not.toHaveBeenCalled();
    });
});
