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
