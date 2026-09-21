import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TO_ANALYTICS = 'km.handover-to-analytics.v1';

const writeCrossing = (returnTo = '/properties/abc', age = 0) => {
    window.sessionStorage.setItem(
        TO_ANALYTICS,
        JSON.stringify({
            version: 1,
            sourceApp: 'kontala',
            timestamp: Date.now() - age,
            returnTo,
        }),
    );
};

// Fresh module registry per test: the component remembers its answer for the
// life of the document, and each test is a different document.
const loadButton = async () => {
    vi.resetModules();
    const module = await import('./KontalaReturnButton');
    return module.default;
};

const show = (Button: Awaited<ReturnType<typeof loadButton>>) =>
    render(
        <MantineProvider>
            <Button withLabel />
        </MantineProvider>,
    );

describe('KontalaReturnButton', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('offers the way back that Kontala wrote before crossing over', async () => {
        writeCrossing();
        const Button = await loadButton();

        show(Button);

        expect(
            screen.getByRole('button', { name: /back to kontala/i }),
        ).toBeTruthy();
    });

    // ⚠ THE REGRESSION. This module is in the entry chunk, so it is imported on
    // every page load - including the login page a crossing passes through when
    // single sign-on has not happened yet. Reading the payload at import time
    // consumed it there, on a page that never renders this button, and the
    // button was gone by the time the reader actually arrived.
    it('does not consume the crossing merely by being imported', async () => {
        writeCrossing();

        await loadButton();

        expect(window.sessionStorage.getItem(TO_ANALYTICS)).not.toBeNull();
    });

    it('consumes the crossing once it has rendered, so a later visit is an ordinary one', async () => {
        writeCrossing();
        const Button = await loadButton();

        show(Button);

        expect(window.sessionStorage.getItem(TO_ANALYTICS)).toBeNull();
    });

    // The payload is consumed on the first read, so every render after that
    // finds nothing. Without the remembered answer the button would appear and
    // then vanish - twice over under StrictMode, which renders everything twice.
    it('stays put across re-renders, which have nothing left to read', async () => {
        writeCrossing();
        const Button = await loadButton();

        const { rerender } = show(Button);
        rerender(
            <MantineProvider>
                <Button withLabel />
            </MantineProvider>,
        );

        expect(
            screen.getByRole('button', { name: /back to kontala/i }),
        ).toBeTruthy();
    });

    it('renders nothing when this was not a crossing', async () => {
        const Button = await loadButton();

        show(Button);

        expect(screen.queryByRole('button')).toBeNull();
    });

    // A crossing that has to sign in on the way is a page load, a redirect out
    // to the provider, a token exchange and a redirect back, against two
    // services that may both be cold. See HANDOVER_MAX_AGE_MS.
    it('survives a crossing that had to sign in on the way', async () => {
        writeCrossing('/properties/abc', 90_000);
        const Button = await loadButton();

        show(Button);

        expect(
            screen.getByRole('button', { name: /back to kontala/i }),
        ).toBeTruthy();
    });

    it('forgets a crossing nobody came back to', async () => {
        writeCrossing('/properties/abc', 10 * 60_000);
        const Button = await loadButton();

        show(Button);

        expect(screen.queryByRole('button')).toBeNull();
    });
});
