import {
    defineUserAbility,
    OrganizationMemberRole,
    ProjectMemberRole,
    type ProjectAbilityProfile,
} from '@lightdash/common';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsRoute from './SettingsRoute';

const ORGANIZATION_UUID = 'organization-uuid';
const USER_UUID = 'user-uuid';

const mocks = vi.hoisted(() => ({
    user: { data: undefined as unknown },
}));

vi.mock('../providers/App/useApp', () => ({
    default: () => ({ user: mocks.user }),
}));

const signInAs = (
    role: OrganizationMemberRole,
    projectProfiles: ProjectAbilityProfile[] = [],
) => {
    mocks.user = {
        data: {
            userUuid: USER_UUID,
            organizationUuid: ORGANIZATION_UUID,
            ability: defineUserAbility(
                {
                    role,
                    organizationUuid: ORGANIZATION_UUID,
                    userUuid: USER_UUID,
                    roleUuid: undefined,
                },
                projectProfiles,
            ),
        },
    };
};

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/generalSettings/*"
                    element={
                        <SettingsRoute>
                            <div>Settings page</div>
                        </SettingsRoute>
                    }
                />
                <Route path="/projects" element={<div>Projects</div>} />
            </Routes>
        </MemoryRouter>,
    );

describe('SettingsRoute', () => {
    beforeEach(() => {
        mocks.user = { data: undefined };
    });

    it('opens Settings to an organization admin', () => {
        signInAs(OrganizationMemberRole.ADMIN);
        renderAt('/generalSettings/personalAccessTokens');
        expect(screen.getByText('Settings page')).toBeInTheDocument();
    });

    it.each([
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.VIEWER,
        OrganizationMemberRole.MEMBER,
    ])('sends an organization %s away as if Settings did not exist', (role) => {
        signInAs(role);
        renderAt('/generalSettings/profile');
        expect(screen.getByText('Projects')).toBeInTheDocument();
        expect(screen.queryByText('Settings page')).not.toBeInTheDocument();
    });

    it('sends a project admin away when they are not an organization admin', () => {
        signInAs(OrganizationMemberRole.EDITOR, [
            {
                projectUuid: 'project-uuid',
                role: ProjectMemberRole.ADMIN,
                userUuid: USER_UUID,
                roleUuid: undefined,
            },
        ]);
        renderAt('/generalSettings/projectManagement/project-uuid/settings');
        expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    it('sends a signed-out visitor away', () => {
        renderAt('/generalSettings');
        expect(screen.getByText('Projects')).toBeInTheDocument();
    });
});
