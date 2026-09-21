/// <reference path="../../../@types/passport-openidconnect.d.ts" />
/// <reference path="../../../@types/express-session.d.ts" />
import {
    ArgumentsOf,
    GenericOidcSsoConfig,
    LightdashError,
    OpenIdIdentityIssuerType,
    OpenIdUser,
    OrganizationSsoProvider,
} from '@lightdash/common';
import {
    custom,
    Issuer,
    Strategy as OpenIdClientStrategy,
    StrategyVerifyCallback,
    type BaseClient,
} from 'openid-client';
import type { Profile as PassportProfile } from 'passport';
import { VerifyFunctionWithRequest } from 'passport-openidconnect';
import { URL } from 'url';
import { buildJwtKeySet } from '../../../config/jwtKeySet';
import { lightdashConfig } from '../../../config/lightdashConfig';
import Logger from '../../../logging/logger';

export const isGenericOidcPassportStrategyAvailableToUse =
    lightdashConfig.auth.oidc.clientId &&
    lightdashConfig.auth.oidc.metadataDocumentEndpoint;

// KONTALA: openid-client defaults every HTTP call it makes to a 3500ms timeout,
// discovery and token exchange alike.
//
// ⚠ DISCOVERY IS A BOOT DEPENDENCY. createGenericOidcPassportStrategy below is
// awaited inside App.initExpress, so a discovery that times out does not
// degrade single sign-on: it stops the process from ever listening, and the
// platform then reports a container that failed its health check rather than
// anything about OIDC. This service and the provider it discovers both scale to
// zero, so a cold start on one routinely races a cold start on the other.
// Measured on three consecutive boots against Kontala, that request took 2.9s,
// 2.9s and 3.4s, every one of them answered 200, and the third one lost the
// race. Warm, the same call is about 1.5ms.
//
// setHttpOptionsDefaults is global to openid-client, which is what we want: the
// same argument applies to the token exchange on every login, where the request
// is on a person's critical path and 3.5s is just as arbitrary. It runs at
// import time, and App.ts imports every strategy module before it builds any of
// them, so it is in place before the first call.
const OIDC_HTTP_TIMEOUT_MS = 10_000;
custom.setHttpOptionsDefaults({ timeout: OIDC_HTTP_TIMEOUT_MS });

const DISCOVERY_ATTEMPTS = 3;
const DISCOVERY_BACKOFF_MS = 1_000;

/**
 * Discovery for the boot path, retried.
 *
 * A longer timeout on its own would still let one slow moment become a service
 * that never starts, so the timeout buys patience and the retries buy a second
 * and third chance at it. The worst case is about 33s (three 10s attempts plus
 * 1s and 2s of backoff), which fits inside the startup probe's budget with a
 * large margin: boot is otherwise ~45s against 20s of initial delay plus 24
 * probes at 10s.
 *
 * The per-org path further down is deliberately NOT retried. Its failure costs
 * one login attempt rather than the process, and holding somebody's request
 * open for half a minute to discover that is worse than failing it quickly.
 *
 * Exported for its tests, which is the only way to assert the attempt count
 * without standing up the whole strategy around it.
 */
export const discoverIssuerWithRetry = async (
    endpoint: string,
    attempt = 1,
): Promise<Issuer<BaseClient>> => {
    try {
        return await Issuer.discover(endpoint);
    } catch (e) {
        if (attempt >= DISCOVERY_ATTEMPTS) {
            throw e;
        }
        Logger.warn(
            `OIDC discovery of ${endpoint} failed on attempt ${attempt} of ${DISCOVERY_ATTEMPTS}, retrying: ${e}`,
        );
        await new Promise<void>((resolve) => {
            // unref so a pending backoff cannot by itself hold the process open.
            setTimeout(resolve, DISCOVERY_BACKOFF_MS * attempt).unref?.();
        });
        return discoverIssuerWithRetry(endpoint, attempt + 1);
    }
};

/**
 * KONTALA: the verified id_token claims, when the second argument to the
 * verify callback is the openid-client TokenSet it actually is at runtime.
 *
 * ⚠ THAT ARGUMENT IS DECLARED `issuer: string`, and the declaration is wrong.
 * It comes from @types/passport-openidconnect, which describes a different
 * library; openid-client's own passport strategy builds the argument list as
 * [tokenset, userinfo, done] and unshifts `req`. The lie has never bitten
 * because both call sites pass `issuerOverride`, so `issuerOverride || issuer`
 * never reads it - which is also why the runtime shape has to be sniffed here
 * rather than trusted from the type.
 */
const idTokenClaimsOf = (candidate: unknown): Record<string, unknown> => {
    if (
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof (candidate as { claims?: unknown }).claims !== 'function'
    ) {
        return {};
    }
    try {
        const claims = (
            candidate as { claims: () => Record<string, unknown> }
        ).claims();
        return typeof claims === 'object' && claims !== null ? claims : {};
    } catch {
        // A TokenSet with no id_token throws rather than returning nothing.
        return {};
    }
};

const createOpenIdUserFromProfile = (
    profile: PassportProfile & {
        email_verified?: boolean;
        lightdash_organization_uuid?: unknown;
        _json?: {
            email_verified?: boolean;
            given_name?: string;
            family_name?: string;
            [key: string]: unknown;
        };
    },
    issuer: string,
    issuerType: OpenIdIdentityIssuerType,
    done: ArgumentsOf<VerifyFunctionWithRequest>['3'],
    idTokenClaims: Record<string, unknown> = {},
) => {
    const email = profile.emails?.[0]?.value || profile.email;
    const subject = profile.id || profile.sub;
    const emailVerified =
        profile.email_verified ?? profile._json?.email_verified;

    if (!email) {
        Logger.error(
            `Authentication failed: missing email in OpenID profile. ${JSON.stringify(
                profile,
            )}`,
        );
        return done(null, false, {
            message: 'Authentication failed: missing email in OpenID profile.',
        });
    }

    if (emailVerified === false) {
        Logger.error(
            `Authentication failed: email is not verified in OpenID profile. ${JSON.stringify(
                profile,
            )}`,
        );
        return done(null, false, {
            message:
                'Authentication failed: email is not verified in OpenID profile.',
        });
    }

    if (!subject) {
        Logger.error(
            `Authentication failed: missing subject (user ID) in OpenID profile. ${JSON.stringify(
                profile,
            )}`,
        );
        return done(null, false, {
            message:
                'Authentication failed: missing subject (user ID) in OpenID profile.',
        });
    }

    const displayName = profile.displayName || '';
    const [fallbackFirstName, fallbackLastName] = displayName.split(' ');
    const firstName =
        profile.name?.givenName ||
        profile._json?.given_name ||
        profile.given_name ||
        fallbackFirstName;
    const lastName =
        profile.name?.familyName ||
        profile._json?.family_name ||
        profile.family_name ||
        fallbackLastName;

    // KONTALA: the organization this login is for, when the provider says.
    //
    // ⚠ THE ID TOKEN IS THE SOURCE, not `profile`. `profile` here is the
    // USERINFO RESPONSE - openid-client fetches it whenever the verify
    // callback declares more than three parameters, which ours does, and
    // passes it where passport would have put a normalised profile. It is a
    // flat object with no `_json`, so reading `profile._json` alone resolved
    // to undefined on every login: the claim was sent, was never read, and
    // every session silently fell back to the member's oldest organization.
    //
    // Taking it from the id_token is also the right place on the merits. It is
    // signed and already verified by `client.callback`, where userinfo is a
    // separately fetched body; which organization a login is for decides what
    // the session may read. The two `profile` reads stay as fallbacks for a
    // provider that publishes the claim there instead.
    const claimedOrganization =
        idTokenClaims.lightdash_organization_uuid ??
        profile.lightdash_organization_uuid ??
        profile._json?.lightdash_organization_uuid;
    const claimedOrganizationUuid =
        typeof claimedOrganization === 'string'
            ? claimedOrganization
            : undefined;

    const openIdUser: OpenIdUser = {
        openId: {
            issuer: issuer || '',
            email,
            subject,
            firstName,
            lastName,
            issuerType: issuerType || '',
            organizationUuid: claimedOrganizationUuid,
        },
    };

    return openIdUser;
};

/**
 * Identifies the per-org SSO method whose strategy authenticated a request, so
 * the callback can confirm the IdP-asserted email domain is one that method is
 * actually allowed to route. Absent for env-based single-tenant strategies,
 * which are trusted instance-wide and carry no per-org whitelist.
 */
export type PerOrgSsoContext = {
    organizationUuid: string;
    provider: OrganizationSsoProvider;
};

export const genericOidcHandler =
    (
        issuerType: OpenIdUser['openId']['issuerType'],
        issuerOverride?: string,
        perOrgSso?: PerOrgSsoContext,
    ): VerifyFunctionWithRequest =>
    async (req, issuer, profile, done) => {
        try {
            const { inviteCode } = req.session.oauth || {};
            req.session.oauth = {};

            const openIdUser = createOpenIdUserFromProfile(
                profile,
                issuerOverride || issuer,
                issuerType,
                done,
                idTokenClaimsOf(issuer),
            );

            if (openIdUser) {
                if (perOrgSso) {
                    const isAllowed = await req.services
                        .getOrganizationSsoService()
                        .isEmailDomainAllowedForOrgSso(
                            openIdUser.openId.email,
                            perOrgSso.organizationUuid,
                            perOrgSso.provider,
                        );
                    if (!isAllowed) {
                        Logger.error(
                            `Authentication failed: OpenID email domain is not allowed for the authenticating SSO method (org ${perOrgSso.organizationUuid}, provider ${perOrgSso.provider}).`,
                        );
                        return done(null, false, {
                            message:
                                'Authentication failed: email domain is not allowed for this login method.',
                        });
                    }
                }

                const user = await req.services
                    .getUserService()
                    .loginWithOpenId(
                        openIdUser,
                        req.user,
                        inviteCode,
                        undefined,
                        {
                            ip: req.ip,
                            userAgent: req.get('user-agent'),
                        },
                    );
                return done(null, user);
            }
            return done(null, false, {
                message: 'Unexpected error processing user information',
            });
        } catch (e) {
            if (e instanceof LightdashError) {
                return done(null, false, { message: e.message });
            }
            Logger.warn(`Unexpected error while authorizing user: ${e}`);
            return done(null, false, {
                message: 'Unexpected error authorizing user',
            });
        }
    };

export const createGenericOidcPassportStrategy = async () => {
    const { oidc } = lightdashConfig.auth;
    const issuer = await discoverIssuerWithRetry(
        oidc.metadataDocumentEndpoint!,
    );

    const hasJwtConfig =
        (oidc.privateKeyFile || oidc.privateKeyFilePath) &&
        (oidc.x509PublicKeyCert || oidc.x509PublicKeyCertPath);

    const keySet = hasJwtConfig
        ? await buildJwtKeySet({
              certificateFilePath: oidc.x509PublicKeyCertPath,
              certificateFile: oidc.x509PublicKeyCert,
              keyFilePath: oidc.privateKeyFilePath,
              keyFile: oidc.privateKeyFile,
          })
        : undefined;

    const client = new issuer.Client(
        {
            client_id: oidc.clientId!,
            client_secret: oidc.clientSecret,
            token_endpoint_auth_signing_alg: oidc.authSigningAlg,
            token_endpoint_auth_method: oidc.authMethod,
        },
        keySet ? { keys: [keySet.jwk] } : undefined,
    );

    return new OpenIdClientStrategy(
        {
            client,
            usePKCE: !!keySet,
            passReqToCallback: true,
            params: {
                // KONTALA: a leading slash resolves against the ORIGIN, which
                // silently threw away SITE_URL's path and produced a callback
                // pointing at whatever else lives at that origin's /api/v1.
                // Resolved against the site URL's own path instead.
                redirect_uri: new URL(
                    `api/v1${oidc.callbackPath}`,
                    `${lightdashConfig.siteUrl.replace(/\/*$/, '')}/`,
                ).href,
            },
            extras: {
                ...(keySet
                    ? {
                          clientAssertionPayload: {
                              aud: issuer.metadata.issuer,
                              typ: 'JWT',
                          },
                      }
                    : {}),
            },
        },

        /**
         * This is compatible, but types differ from what's otherwise expected.
         */
        genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
            issuer.metadata.issuer,
        ) as unknown as StrategyVerifyCallback<unknown>,
    );
};

/**
 * Builds a generic OIDC passport strategy from a plain config object using the
 * client-secret flow. Used by the per-org DB-stored config path. (The env-based
 * `createGenericOidcPassportStrategy` additionally supports the private_key_jwt
 * / x509 cert flow, which per-org config does not expose.)
 */
export const createGenericOidcStrategyForConfig = async (
    config: GenericOidcSsoConfig,
    organizationUuid?: string,
) => {
    const issuer = await Issuer.discover(config.metadataDocumentEndpoint);

    const client = new issuer.Client({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        token_endpoint_auth_method: 'client_secret_basic',
    });

    return new OpenIdClientStrategy(
        {
            client,
            passReqToCallback: true,
            params: {
                // KONTALA: see the note on the other redirect_uri above.
                redirect_uri: new URL(
                    `api/v1${lightdashConfig.auth.oidc.callbackPath}`,
                    `${lightdashConfig.siteUrl.replace(/\/*$/, '')}/`,
                ).href,
                scope: config.scopes || 'openid profile email',
            },
        },
        genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
            issuer.metadata.issuer,
            organizationUuid
                ? {
                      organizationUuid,
                      provider: OrganizationSsoProvider.GENERIC_OIDC,
                  }
                : undefined,
        ) as unknown as StrategyVerifyCallback<unknown>,
    );
};
