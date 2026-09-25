import type { NextFunction, Request, Response } from 'express';
import {
    createSsoPageRedirect,
    SSO_PAGE_REDIRECT_MARKER,
} from './ssoPageRedirect';

const LOGIN_URL = 'https://konta.la/analytics/api/v1/login/oidc';

const request = ({
    method = 'GET',
    path = '/projects/p1/home',
    originalUrl = `/analytics${path}`,
    headers = {},
}: {
    method?: string;
    path?: string;
    originalUrl?: string;
    headers?: Record<string, string>;
} = {}) => {
    const lowered: Record<string, string> = {
        'sec-fetch-dest': 'document',
        ...Object.fromEntries(
            Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
        ),
    };
    return {
        method,
        path,
        originalUrl,
        headers: lowered,
        get: (name: string) => lowered[name.toLowerCase()],
    } as unknown as Request;
};

const run = async (
    req: Request,
    getForcedSsoLoginUrl: () => Promise<string | null> = async () => LOGIN_URL,
) => {
    const res = {
        cookie: vi.fn(),
        redirect: vi.fn(),
    };
    const next = vi.fn();
    await createSsoPageRedirect({
        sessionCookieName: 'connect.sid',
        cookiePath: '/analytics',
        secureCookies: true,
        getForcedSsoLoginUrl,
    })(req, res as unknown as Response, next as NextFunction);
    return { res, next };
};

describe('createSsoPageRedirect', () => {
    it('sends a signed-out page visit straight to SSO, remembering the page', async () => {
        const { res, next } = await run(
            request({
                path: '/projects/p1/home',
                originalUrl: '/analytics/projects/p1/home?tab=a',
            }),
        );

        expect(next).not.toHaveBeenCalled();
        const target = new URL(res.redirect.mock.calls[0][0]);
        expect(`${target.origin}${target.pathname}`).toBe(LOGIN_URL);
        expect(target.searchParams.get('redirect')).toBe(
            '/analytics/projects/p1/home?tab=a',
        );
        expect(res.cookie).toHaveBeenCalledWith(
            SSO_PAGE_REDIRECT_MARKER,
            '1',
            expect.objectContaining({
                httpOnly: true,
                path: '/analytics',
                secure: true,
            }),
        );
    });

    it.each(['/', '/projects', '/share/abc', '/generalSettings/users'])(
        'handles the app page %s',
        async (path) => {
            const { res } = await run(request({ path }));
            expect(res.redirect).toHaveBeenCalled();
        },
    );

    it.each([
        '/login',
        '/register',
        '/invite/abc',
        '/embed/p1',
        '/minimal/projects/p1/saved/c1',
        '/api/v1/health',
        '/assets/index.js',
        '/projectsx',
    ])('leaves %s to the app', async (path) => {
        const { res, next } = await run(request({ path }));
        expect(res.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    it('serves the app to a visit that has a session cookie', async () => {
        const { res, next } = await run(
            request({ headers: { cookie: 'a=1; connect.sid=s%3Aabc.def' } }),
        );
        expect(res.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    it('serves the app to a visit it redirected moments ago, so it cannot loop', async () => {
        const { res, next } = await run(
            request({ headers: { cookie: `${SSO_PAGE_REDIRECT_MARKER}=1` } }),
        );
        expect(res.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    it('leaves requests that are not page navigations alone', async () => {
        for (const req of [
            request({ method: 'POST' }),
            request({ headers: { 'sec-fetch-dest': 'empty' } }),
        ]) {
            // eslint-disable-next-line no-await-in-loop
            const { res, next } = await run(req);
            expect(res.redirect).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledWith();
        }
    });

    it('falls back to the Accept header when Sec-Fetch-Dest is absent', async () => {
        const withoutFetchDest = (accept: string) => {
            const req = request({ headers: { accept } });
            delete (req.headers as Record<string, string>)['sec-fetch-dest'];
            return req;
        };
        expect(
            (await run(withoutFetchDest('text/html,application/xhtml+xml'))).res
                .redirect,
        ).toHaveBeenCalled();
        expect(
            (await run(withoutFetchDest('application/json'))).res.redirect,
        ).not.toHaveBeenCalled();
    });

    it('does nothing when SSO is not the only way in', async () => {
        const { res, next } = await run(request(), async () => null);
        expect(res.redirect).not.toHaveBeenCalled();
        expect(res.cookie).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith();
    });

    it('passes a failure to decide on to the error handler', async () => {
        const failure = new Error('config unavailable');
        const { next } = await run(request(), async () => {
            throw failure;
        });
        expect(next).toHaveBeenCalledWith(failure);
    });
});
