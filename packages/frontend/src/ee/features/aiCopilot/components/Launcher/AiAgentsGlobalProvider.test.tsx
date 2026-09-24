import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ActiveProject from '../../../../../hooks/useActiveProject';
import useApp from '../../../../../providers/App/useApp';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiAgentsGlobalProvider } from './AiAgentsGlobalProvider';

const { useActiveProjectUuid } = vi.hoisted(() => ({
    useActiveProjectUuid: vi.fn(() => ({ activeProjectUuid: 'project-uuid' })),
}));

vi.mock('../../../../../hooks/useActiveProject', async (importOriginal) => ({
    ...(await importOriginal<typeof ActiveProject>()),
    useActiveProjectUuid,
}));

vi.mock('./useIsLauncherMounted', () => ({
    useIsLauncherMounted: () => true,
}));

vi.mock('./AiAgentsLauncher', () => ({
    AiAgentsLauncher: () => <div data-testid="ai-agents-launcher" />,
}));

const HealthLoaded: FC = () => {
    const { health } = useApp();
    return health.data ? <div data-testid="health-loaded" /> : null;
};

const renderProvider = (isAuthenticated: boolean) => {
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: (
                    <AiAgentsGlobalProvider>
                        <HealthLoaded />
                    </AiAgentsGlobalProvider>
                ),
            },
        ],
        { initialEntries: ['/login'] },
    );
    return renderWithProviders(<RouterProvider router={router} />, {
        health: { isAuthenticated },
    });
};

describe('AiAgentsGlobalProvider', () => {
    beforeEach(() => {
        useActiveProjectUuid.mockClear();
    });

    it('mounts the launcher for a signed-in session', async () => {
        renderProvider(true);

        expect(
            await screen.findByTestId('ai-agents-launcher'),
        ).toBeInTheDocument();
    });

    it('skips the launcher and its project lookups while signed out', async () => {
        renderProvider(false);

        await screen.findByTestId('health-loaded');
        expect(useActiveProjectUuid).not.toHaveBeenCalled();
        expect(
            screen.queryByTestId('ai-agents-launcher'),
        ).not.toBeInTheDocument();
    });
});
