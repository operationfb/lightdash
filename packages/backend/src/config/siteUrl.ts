import { type LightdashConfig } from './parseConfig';

/**
 * KONTALA: an absolute URL for a path inside this instance.
 *
 * ⚠ A LEADING SLASH RESOLVES AGAINST THE ORIGIN, which silently discards
 * SITE_URL's path: `new URL('/api/v1/login/oidc', 'https://konta.la/analytics')`
 * is `https://konta.la/api/v1/login/oidc`, a URL belonging to whatever else
 * shares that origin - here, Kontala Marketing's own API. Mounting the express
 * app under a base path fixes every route the app *serves*; it cannot fix a URL
 * the app *writes* for itself. Those go through here, so the base path is
 * applied in one place rather than remembered at each of them.
 *
 * `path` is spelled the way the mounted app spells it - `/api/v1/...` for the
 * backend, a router path for the frontend - always with a leading slash. At the
 * origin root `basePath` is '' and this is exactly what the call sites did by
 * hand before.
 */
export const siteUrlFor = (
    config: Pick<LightdashConfig, 'siteUrl' | 'basePath'>,
    path: string,
): string => new URL(`${config.basePath}${path}`, config.siteUrl).href;

/**
 * KONTALA: `siteUrlFor` as a path on the origin rather than an absolute URL,
 * for a redirect: the same base path, and at the origin root exactly the path
 * the call site wrote, so a root-relative `Location` stays what it was.
 */
export const sitePathFor = (
    config: Pick<LightdashConfig, 'basePath'>,
    path: string,
): string => `${config.basePath}${path}`;

/**
 * KONTALA: the path a request names, spelled the way the mounted app spells it.
 *
 * `req.originalUrl` still carries the base path the app is mounted under
 * (`/analytics/api/v1/oauth/authorize?...`). That is the wrong spelling for a
 * `/login?redirect=` value, which the frontend reads as a router path and puts
 * the base path back onto itself (utils/url.ts there): passing it as it is
 * would come back as `/analytics/analytics/...`. A path outside the base path
 * cannot be one of ours and is returned unchanged.
 */
export const appPathOf = (
    config: Pick<LightdashConfig, 'basePath'>,
    originalUrl: string,
): string => {
    const { basePath } = config;
    if (!basePath || !originalUrl.startsWith(basePath)) return originalUrl;
    const rest = originalUrl.slice(basePath.length);
    if (rest === '') return '/';
    if (rest.startsWith('/')) return rest;
    if (rest.startsWith('?') || rest.startsWith('#')) return `/${rest}`;
    // `/analyticsfoo`: another path that merely shares the prefix.
    return originalUrl;
};
