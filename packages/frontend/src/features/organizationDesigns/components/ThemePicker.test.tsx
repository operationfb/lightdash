import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ThemePicker } from './ThemePicker';

const mocks = vi.hoisted(() => ({ canAccessSettings: true }));

vi.mock('../hooks/useOrganizationDesigns', () => ({
    useOrganizationDesigns: () => ({ data: [] }),
}));
vi.mock('../../../hooks/settings/useCanAccessSettings', () => ({
    useCanAccessSettings: () => mocks.canAccessSettings,
}));

const renderPicker = (
    props: Partial<React.ComponentProps<typeof ThemePicker>> = {},
) =>
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <ThemePicker value={null} onChange={vi.fn()} {...props} />
            </MantineProvider>
        </MemoryRouter>,
    );

describe('ThemePicker compact', () => {
    beforeEach(() => {
        mocks.canAccessSettings = true;
    });

    it('shows the saved theme name when it is missing from the list', () => {
        renderPicker({
            compact: true,
            value: 'deleted-theme',
            fallbackLabel: 'Saved theme',
        });
        expect(
            screen.getByRole('button', { name: 'Theme: Saved theme' }),
        ).toBeInTheDocument();
    });

    it('allows an external control to open the standard theme menu', async () => {
        const onChange = vi.fn();
        const onOpenedChange = vi.fn();
        renderPicker({ compact: true, opened: true, onChange, onOpenedChange });
        await userEvent.click(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        );
        expect(onChange).toHaveBeenCalledWith(null);
        expect(onOpenedChange).toHaveBeenCalledWith(false);
    });

    it('prevents selection when an open picker becomes disabled', async () => {
        const onChange = vi.fn();
        renderPicker({ compact: true, opened: true, disabled: true, onChange });
        const option = screen.getByRole('menuitem', { name: /^No theme/ });
        expect(option).toBeDisabled();
        await userEvent.click(option);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('collapses to an "Apply theme" call to action when none is selected', () => {
        renderPicker({ compact: true });
        const trigger = screen.getByRole('button', {
            name: /Apply theme/i,
        });
        expect(trigger).toBeInTheDocument();
        // Description line is suppressed in compact mode.
        expect(
            screen.queryByText(
                'No shared design assets - prompt any style you want',
            ),
        ).not.toBeInTheDocument();
    });

    it('links to theme settings only for those who can reach Settings', () => {
        renderPicker({ compact: true, opened: true });
        expect(
            screen.getByRole('menuitem', { name: 'Manage themes' }),
        ).toBeInTheDocument();
    });

    it('hides the theme settings link from everyone else', () => {
        mocks.canAccessSettings = false;
        renderPicker({ compact: true, opened: true });
        expect(
            screen.getByRole('menuitem', { name: /^No theme/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Manage themes' }),
        ).not.toBeInTheDocument();
    });
});
