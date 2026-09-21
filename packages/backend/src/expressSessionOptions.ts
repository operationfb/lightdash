import { SessionOptions, Store } from 'express-session';
import { LightdashConfig } from './config/parseConfig';

type SessionRelevantConfig = Pick<
    LightdashConfig,
    | 'lightdashSecrets'
    | 'trustProxy'
    | 'cookiesMaxAgeHours'
    | 'secureCookies'
    | 'cookieSameSite'
    // KONTALA: the path this instance is served under.
    | 'basePath'
>;

export const buildExpressSessionOptions = (
    lightdashConfig: SessionRelevantConfig,
    store: Store,
    port: string | number,
): SessionOptions => ({
    name:
        process.env.NODE_ENV === 'development' &&
        process.env.DEV_SCOPED_COOKIE_NAMES_ENABLED === 'true'
            ? `connect.sid.${port}`
            : 'connect.sid',
    // Active secret signs new cookies; fallbacks keep sessions
    // signed before a secret rotation verifiable until expiry
    secret: [...lightdashConfig.lightdashSecrets.all],
    proxy: lightdashConfig.trustProxy,
    rolling: true,
    cookie: {
        maxAge: (lightdashConfig.cookiesMaxAgeHours || 24) * 60 * 60 * 1000, // in ms
        secure: lightdashConfig.secureCookies,
        httpOnly: true,
        sameSite: lightdashConfig.cookieSameSite,
        // KONTALA: scoped to the path this instance is served under, so that
        // on a shared origin our session cookie is not sent to the other app
        // living at '/' on every one of its requests. '' means the root, and
        // express-session wants '/' for that.
        path: lightdashConfig.basePath || '/',
    },
    resave: false,
    saveUninitialized: false,
    store,
});
