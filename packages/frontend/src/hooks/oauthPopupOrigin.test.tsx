import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../testing/testUtils';
import { useGoogleLoginPopup } from './gdrive/useGdrive';
import { useDatabricksLoginPopup } from './useDatabricks';
import { useSnowflakeLoginPopup } from './useSnowflake';

/**
 * KONTALA: the sign-in popups report back over a BroadcastChannel, and each
 * hook checked the message's origin against health's siteUrl. Served under
 * /analytics, siteUrl is `https://konta.la/analytics` while an origin is only
 * ever `https://konta.la`, so every message was ignored: Google Sheets,
 * BigQuery, Snowflake and Databricks sign-in all left the promise pending
 * after the popup closed itself.
 */

const SITE_URL = `${window.location.origin}/analytics`;

vi.mock('./health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: SITE_URL,
            auth: {
                snowflake: { enabled: true },
                databricks: { enabled: true },
            },
        },
    }),
}));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));

class FakeChannel {
    static opened: FakeChannel[] = [];

    listeners = new Set<(event: MessageEvent) => void>();

    constructor(public name: string) {
        FakeChannel.opened.push(this);
    }

    addEventListener(
        _type: 'message',
        listener: (event: MessageEvent) => void,
    ) {
        this.listeners.add(listener);
    }

    removeEventListener(
        _type: 'message',
        listener: (event: MessageEvent) => void,
    ) {
        this.listeners.delete(listener);
    }

    close() {}

    deliver(data: string, origin: string) {
        const event = new MessageEvent('message', { data, origin });
        this.listeners.forEach((listener) => listener(event));
    }
}

describe('sign-in popups served under a base path', () => {
    beforeEach(() => {
        FakeChannel.opened = [];
        vi.stubGlobal('BroadcastChannel', FakeChannel);
        vi.spyOn(window, 'open').mockReturnValue({
            close: vi.fn(),
        } as unknown as Window);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const succeedFromThisOrigin = async () => {
        await waitFor(() => expect(FakeChannel.opened).toHaveLength(1));
        act(() => {
            FakeChannel.opened[0].deliver('success', window.location.origin);
        });
    };

    it('completes Google sign-in', async () => {
        const onLogin = vi.fn();
        const { result } = renderHookWithProviders(() =>
            useGoogleLoginPopup('gdrive', onLogin),
        );

        act(() => result.current.mutate());
        await succeedFromThisOrigin();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(onLogin).toHaveBeenCalled();
    });

    it('completes Snowflake sign-in', async () => {
        const onLogin = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHookWithProviders(() =>
            useSnowflakeLoginPopup({ onLogin }),
        );

        act(() => result.current.mutate());
        await succeedFromThisOrigin();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(onLogin).toHaveBeenCalled();
    });

    it('completes Databricks sign-in', async () => {
        const onLogin = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHookWithProviders(() =>
            useDatabricksLoginPopup({ onLogin }),
        );

        act(() => result.current.mutate());
        await succeedFromThisOrigin();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(onLogin).toHaveBeenCalled();
    });

    it('still ignores a message from another origin', async () => {
        const onLogin = vi.fn();
        const { result } = renderHookWithProviders(() =>
            useGoogleLoginPopup('gdrive', onLogin),
        );

        act(() => result.current.mutate());
        await waitFor(() => expect(FakeChannel.opened).toHaveLength(1));
        act(() => {
            FakeChannel.opened[0].deliver('success', 'https://evil.example');
        });

        expect(result.current.isSuccess).toBe(false);
        expect(onLogin).not.toHaveBeenCalled();
    });
});
