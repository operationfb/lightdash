import { isRootRelativePath } from './redirectUrl';

/**
 * Resolve a configured URL to a client-routable path, or null when it points at
 * another origin. Lets same-origin targets navigate through react-router while
 * absolute external ones (e.g. a cloud `signupUrl`) stay real document links.
 *
 * Unlike `sanitizeRedirectUrl` this accepts an absolute same-origin URL, because
 * configured links are usually written that way — it resolves one to its path
 * rather than rejecting it. The resulting path is then checked by the same
 * `isRootRelativePath` guard, so both share one definition of what is safe.
 */
export const resolveInternalPath = (url: string): string | null => {
    try {
        const resolved = new URL(url, window.location.origin);
        if (resolved.origin !== window.location.origin) return null;

        const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        return isRootRelativePath(path) ? path : null;
    } catch {
        return null;
    }
};

/**
 * KONTALA: a router path as the BROWSER has to spell it.
 *
 * ⚠ THE TWO ARE NOT THE SAME STRING when this build is served under a base
 * path. react-router is configured with `basename` (see App.tsx), so every path
 * it hands out - `useLocation().pathname`, the `from` a redirected route
 * records - has that prefix stripped: the page at
 * `https://konta.la/analytics/projects/x/home` is `/projects/x/home` to the
 * router. A value that stays inside the router is right as it is. One that
 * leaves it - assigned to `window.location`, put in an `href`, or handed to the
 * server as `?redirect=` - is a path on the origin, and without the prefix it
 * names a page belonging to whatever else shares that origin.
 *
 * `import.meta.env.BASE_URL` is vite's base, the same value the router's
 * basename is built from, and it always ends in a slash ('/' at the origin
 * root, where this returns the path unchanged).
 */
export const toBrowserPath = (routerPath: string): string =>
    `${import.meta.env.BASE_URL.replace(/\/+$/, '')}${routerPath}`;

/**
 * KONTALA: `toBrowserPath` for an `href` that may instead be an absolute URL.
 *
 * The shared link components take either - a path into this app or a link off
 * to somewhere else - and only the first has a base path to put back on.
 * Prefixing an absolute URL would corrupt it, so external ones pass through.
 */
export const toBrowserHref = (href: string): string =>
    isRootRelativePath(href) ? toBrowserPath(href) : href;
