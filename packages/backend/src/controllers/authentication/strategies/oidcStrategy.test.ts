import {
    OpenIdIdentityIssuerType,
    OrganizationSsoProvider,
} from '@lightdash/common';
import { Request } from 'express';
import { Issuer } from 'openid-client';
import { Profile as PassportProfile } from 'passport';
import Logger from '../../../logging/logger';
import { discoverIssuerWithRetry, genericOidcHandler } from './oidcStrategy';

const makeRequest = ({
    loginWithOpenId = vi.fn(),
    isEmailDomainAllowedForOrgSso = vi.fn().mockResolvedValue(true),
}: {
    loginWithOpenId?: ReturnType<typeof vi.fn>;
    isEmailDomainAllowedForOrgSso?: ReturnType<typeof vi.fn>;
} = {}) =>
    ({
        session: { oauth: {} },
        user: undefined,
        services: {
            getUserService: () => ({
                loginWithOpenId,
            }),
            getOrganizationSsoService: () => ({
                isEmailDomainAllowedForOrgSso,
            }),
        },
        ip: '127.0.0.1',
        get: vi.fn(() => 'test-user-agent'),
    }) as unknown as Request;

const verifiedProfile = (email: string): PassportProfile =>
    ({
        id: 'subject-1',
        emails: [{ value: email }],
        _json: { email_verified: true },
    }) as unknown as PassportProfile;

describe('genericOidcHandler', () => {
    test('rejects profiles with explicitly unverified email claims', async () => {
        const loginWithOpenId = vi.fn();
        const done = vi.fn();
        const handler = genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
        );
        const profile = {
            id: 'subject-1',
            emails: [{ value: 'user@example.com' }],
            _json: {
                email_verified: false,
            },
        } as unknown as PassportProfile;

        await handler(
            makeRequest({ loginWithOpenId }),
            'https://issuer.example.com',
            profile,
            done,
        );

        expect(loginWithOpenId).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledWith(null, false, {
            message:
                'Authentication failed: email is not verified in OpenID profile.',
        });
    });

    describe('per-org SSO callback domain re-check', () => {
        test('rejects an IdP identity whose email domain is outside the authorizing per-org method whitelist', async () => {
            const loginWithOpenId = vi.fn();
            // The authorizing org's method does not route this email's domain.
            const isEmailDomainAllowedForOrgSso = vi
                .fn()
                .mockResolvedValue(false);
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://idp-a.example.com',
                {
                    organizationUuid: 'org-a-uuid',
                    provider: OrganizationSsoProvider.GENERIC_OIDC,
                },
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://idp-a.example.com',
                verifiedProfile('user@domain-b.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).toHaveBeenCalledWith(
                'user@domain-b.com',
                'org-a-uuid',
                OrganizationSsoProvider.GENERIC_OIDC,
            );
            expect(loginWithOpenId).not.toHaveBeenCalled();
            expect(done).toHaveBeenCalledWith(
                null,
                false,
                expect.objectContaining({ message: expect.any(String) }),
            );
        });

        test('allows an IdP identity whose email domain is inside the authorizing per-org method whitelist', async () => {
            const loginWithOpenId = vi.fn().mockResolvedValue({
                userUuid: 'user-1',
            });
            const isEmailDomainAllowedForOrgSso = vi
                .fn()
                .mockResolvedValue(true);
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://acme-idp.example.com',
                {
                    organizationUuid: 'acme-org-uuid',
                    provider: OrganizationSsoProvider.GENERIC_OIDC,
                },
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://acme-idp.example.com',
                verifiedProfile('user@acme.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).toHaveBeenCalledWith(
                'user@acme.com',
                'acme-org-uuid',
                OrganizationSsoProvider.GENERIC_OIDC,
            );
            expect(loginWithOpenId).toHaveBeenCalledTimes(1);
            expect(done).toHaveBeenCalledWith(null, { userUuid: 'user-1' });
        });

        test('does not re-check when no per-org context is present (env-based single-tenant strategy)', async () => {
            const loginWithOpenId = vi.fn().mockResolvedValue({
                userUuid: 'user-1',
            });
            const isEmailDomainAllowedForOrgSso = vi.fn();
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://issuer.example.com',
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://issuer.example.com',
                verifiedProfile('anyone@anywhere.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).not.toHaveBeenCalled();
            expect(loginWithOpenId).toHaveBeenCalledTimes(1);
        });
    });
});

describe('discoverIssuerWithRetry', () => {
    // A discovery that times out here does not degrade single sign-on, it stops
    // the process from ever listening: App.initExpress awaits it. So what these
    // assert is that one slow moment on the provider cannot cost us the boot.
    const endpoint = 'https://idp.example.com/.well-known/openid-configuration';
    const issuer = {} as Awaited<ReturnType<typeof Issuer.discover>>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(Logger, 'warn').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('calls discovery once and does not wait when it succeeds', async () => {
        const discover = vi.spyOn(Issuer, 'discover').mockResolvedValue(issuer);

        await expect(discoverIssuerWithRetry(endpoint)).resolves.toBe(issuer);
        expect(discover).toHaveBeenCalledTimes(1);
    });

    test('retries a failing discovery and succeeds on a later attempt', async () => {
        const discover = vi
            .spyOn(Issuer, 'discover')
            .mockRejectedValueOnce(new Error('outgoing request timed out'))
            .mockRejectedValueOnce(new Error('outgoing request timed out'))
            .mockResolvedValue(issuer);

        const result = discoverIssuerWithRetry(endpoint);
        await vi.runAllTimersAsync();

        await expect(result).resolves.toBe(issuer);
        expect(discover).toHaveBeenCalledTimes(3);
        // A dependency slow enough to need retrying is worth seeing in the log,
        // otherwise the only symptom is a boot that is occasionally slower.
        expect(Logger.warn).toHaveBeenCalledTimes(2);
    });

    test('gives up after a bounded number of attempts rather than hanging', async () => {
        const discover = vi
            .spyOn(Issuer, 'discover')
            .mockRejectedValue(new Error('outgoing request timed out'));

        // Settle into a value rather than asserting on the rejection directly:
        // the handler has to be attached before the timers run, or the interval
        // between the final failure and the assertion is an unhandled rejection.
        const settled = discoverIssuerWithRetry(endpoint).then(
            () => 'resolved',
            (e: Error) => e.message,
        );
        await vi.runAllTimersAsync();

        await expect(settled).resolves.toBe('outgoing request timed out');
        expect(discover).toHaveBeenCalledTimes(3);
    });
});

// KONTALA: the regression that cost a whole sign-on its organization.
//
// The claim was sent, on every login, and was never read: `profile` here is
// the USERINFO RESPONSE rather than a passport profile, so it has no `_json`,
// and the old `profile._json?.lightdash_organization_uuid` resolved to
// undefined every time. Lightdash then fell back to the member's oldest
// organization, which is a different one from the project being opened, and
// answered "You need access" to an admin of that project's org.
//
// Every test below therefore leaves the claim OUT of `profile`. A fixture that
// carries it in both places cannot tell the two sources apart, and is exactly
// how this passed review the first time.
describe('genericOidcHandler organization claim', () => {
    const tokenSetWith = (claims: Record<string, unknown>) =>
        ({ claims: () => claims }) as unknown as string;

    const loginArgs = async (secondArgument: string) => {
        const loginWithOpenId = vi.fn().mockResolvedValue({ userUuid: 'u1' });
        const handler = genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
            'https://konta.la/api/v1/oidc',
        );
        await handler(
            makeRequest({ loginWithOpenId }),
            secondArgument,
            verifiedProfile('user@example.com'),
            vi.fn(),
        );
        expect(loginWithOpenId).toHaveBeenCalledTimes(1);
        return loginWithOpenId.mock.calls[0][0] as {
            openId: { organizationUuid?: string; issuer: string };
        };
    };

    test('is taken from the verified id_token claims', async () => {
        const openIdUser = await loginArgs(
            tokenSetWith({
                lightdash_organization_uuid:
                    '371c115d-9530-484b-a617-f19dae37ecb9',
            }),
        );
        expect(openIdUser.openId.organizationUuid).toBe(
            '371c115d-9530-484b-a617-f19dae37ecb9',
        );
    });

    test('leaves the issuer as the configured override, not the token set', async () => {
        // `issuerOverride || issuer` is what has been hiding the mistyped
        // argument all along; pin it so a future edit cannot start writing an
        // object into openid_identities.issuer.
        const openIdUser = await loginArgs(
            tokenSetWith({ lightdash_organization_uuid: 'org-uuid' }),
        );
        expect(openIdUser.openId.issuer).toBe('https://konta.la/api/v1/oidc');
    });

    test('is absent when the id_token does not carry the claim', async () => {
        const openIdUser = await loginArgs(tokenSetWith({ sub: 'subject-1' }));
        expect(openIdUser.openId.organizationUuid).toBeUndefined();
    });

    test('is absent, rather than a crash, for a non-string claim', async () => {
        const openIdUser = await loginArgs(
            tokenSetWith({ lightdash_organization_uuid: { nested: true } }),
        );
        expect(openIdUser.openId.organizationUuid).toBeUndefined();
    });

    test('survives a second argument that really is a string', async () => {
        // What the (wrong) `issuer: string` type promises, and what every
        // other test in this file passes.
        const openIdUser = await loginArgs('https://issuer.example.com');
        expect(openIdUser.openId.organizationUuid).toBeUndefined();
    });

    test('survives a token set with no id_token, whose claims() throws', async () => {
        const throwing = {
            claims: () => {
                throw new TypeError('id_token not present in TokenSet');
            },
        } as unknown as string;
        const openIdUser = await loginArgs(throwing);
        expect(openIdUser.openId.organizationUuid).toBeUndefined();
    });
});
