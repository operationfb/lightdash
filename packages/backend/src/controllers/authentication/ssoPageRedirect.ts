import { type Request, type RequestHandler } from 'express';

/**
 * KONTALA: sends a signed-out visit to an app page straight to single sign-on
 * when SSO is the only way in, instead of booting the app to find that out.
 *
 * Without it such a visit (a bookmark, a shared link, an expired session)
 * loaded the whole bundle, asked the API whether it was signed in, moved to
 * /login, loaded that page, asked for the login options and the flash, and
 * only then left for the provider: a blank page and three spinners to reach a
 * redirect the server could have answered at once. The login page keeps doing
 * all of that for every visit this does not handle, so nothing depends on it.
 *
 * ⚠ IT MUST NEVER BECOME A LOOP. /login is never redirected, so a failed
 * sign-in still lands on the login page and its error. A visit whose session
 * cookie did not stick would come straight back without one, so every redirect
 * leaves a short-lived marker, and a visit carrying it is served the app
 * instead: a misconfigured cookie costs one bounce, not a loop.
 */

// Where signed-in people land and links point; anything else is left to the
// app's own login flow.
const APP_PAGE = /^\/(?:$|projects(?:\/|$)|share\/|generalSettings(?:\/|$))/;

export const SSO_PAGE_REDIRECT_MARKER = 'ld.sso_page_redirect';
const MARKER_MAX_AGE_MS = 30_000;

const cookieNames = (header: string | undefined): Set<string> =>
    new Set(
        (header ?? '')
            .split(';')
            .map((pair) => pair.split('=')[0].trim())
            .filter((name) => name !== ''),
    );

// A browser navigation rather than a fetch, a probe or a crawler asking for
// JSON. Sec-Fetch-Dest is the precise signal; Accept covers browsers without it.
const isDocumentRequest = (req: Request): boolean => {
    const destination = req.get('sec-fetch-dest');
    if (destination !== undefined) return destination === 'document';
    return (req.get('accept') ?? '').includes('text/html');
};

export const createSsoPageRedirect = ({
    sessionCookieName,
    cookiePath,
    secureCookies,
    getForcedSsoLoginUrl,
}: {
    sessionCookieName: string;
    cookiePath: string;
    secureCookies: boolean;
    getForcedSsoLoginUrl: () => Promise<string | null>;
}): RequestHandler =>
    async function ssoPageRedirect(req, res, next) {
        if (
            req.method !== 'GET' ||
            !APP_PAGE.test(req.path) ||
            !isDocumentRequest(req)
        ) {
            next();
            return;
        }
        const cookies = cookieNames(req.headers.cookie);
        if (
            cookies.has(sessionCookieName) ||
            cookies.has(SSO_PAGE_REDIRECT_MARKER)
        ) {
            next();
            return;
        }
        try {
            const loginUrl = await getForcedSsoLoginUrl();
            if (!loginUrl) {
                next();
                return;
            }
            const target = new URL(loginUrl);
            // The page asked for, base path included: the login route resolves
            // it against SITE_URL and keeps it as the place to come back to.
            target.searchParams.set('redirect', req.originalUrl);
            res.cookie(SSO_PAGE_REDIRECT_MARKER, '1', {
                maxAge: MARKER_MAX_AGE_MS,
                httpOnly: true,
                sameSite: 'lax',
                secure: secureCookies,
                path: cookiePath,
            });
            res.redirect(target.href);
        } catch (e) {
            next(e);
        }
    };
