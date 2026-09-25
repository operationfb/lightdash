import {
    OpenIdIdentityIssuerType,
    OrganizationSsoProvider,
} from '@lightdash/common';
import { Request } from 'express';
import { Profile as PassportProfile } from 'passport';
import { Strategy } from 'passport-strategy';
import Logger from '../../../logging/logger';
import {
    DeferredPassportStrategy,
    genericOidcHandler,
    getOrganizationHint,
} from './oidcStrategy';

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

describe('DeferredPassportStrategy', () => {
    // Passport runs authenticate on a per-request Object.create(strategy) with
    // these action methods attached; this mirrors that.
    const authenticateOnce = (strategy: DeferredPassportStrategy) =>
        new Promise<string>((resolve) => {
            const perRequest = Object.assign(Object.create(strategy), {
                success: () => resolve('success'),
                fail: () => resolve('fail'),
                redirect: (url: string) => resolve(`redirect:${url}`),
                pass: () => resolve('pass'),
                error: (e: Error) => resolve(`error:${e.message}`),
            }) as DeferredPassportStrategy;
            perRequest.authenticate({} as Request);
        });

    const innerRedirectingTo = (url: string) => {
        const inner = new Strategy();
        inner.authenticate = function authenticate(this: Strategy) {
            this.redirect(url);
        };
        return inner;
    };

    beforeEach(() => {
        vi.spyOn(Logger, 'warn').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('does not build the strategy until the first request', () => {
        const build = vi.fn();
        // eslint-disable-next-line no-new
        new DeferredPassportStrategy(build);
        expect(build).not.toHaveBeenCalled();
    });

    test('delegates to the built strategy and builds it once', async () => {
        const build = vi
            .fn()
            .mockResolvedValue(innerRedirectingTo('https://idp/auth'));
        const strategy = new DeferredPassportStrategy(build);

        await expect(authenticateOnce(strategy)).resolves.toBe(
            'redirect:https://idp/auth',
        );
        await expect(authenticateOnce(strategy)).resolves.toBe(
            'redirect:https://idp/auth',
        );
        expect(build).toHaveBeenCalledTimes(1);
    });

    test('reports a failed build as an error and tries again next time', async () => {
        const build = vi
            .fn()
            .mockRejectedValueOnce(new Error('outgoing request timed out'))
            .mockResolvedValue(innerRedirectingTo('https://idp/auth'));
        const strategy = new DeferredPassportStrategy(build);

        await expect(authenticateOnce(strategy)).resolves.toBe(
            'error:outgoing request timed out',
        );
        await expect(authenticateOnce(strategy)).resolves.toBe(
            'redirect:https://idp/auth',
        );
        expect(build).toHaveBeenCalledTimes(2);
    });

    test('warm() builds ahead of the first request, which reuses it', async () => {
        const build = vi
            .fn()
            .mockResolvedValue(innerRedirectingTo('https://idp/auth'));
        const strategy = new DeferredPassportStrategy(build);

        strategy.warm();
        expect(build).toHaveBeenCalledTimes(1);

        await expect(authenticateOnce(strategy)).resolves.toBe(
            'redirect:https://idp/auth',
        );
        expect(build).toHaveBeenCalledTimes(1);
    });

    test('a failed warm() is logged rather than thrown, and the first request builds again', async () => {
        vi.spyOn(Logger, 'info').mockImplementation((() => undefined) as never);
        const build = vi
            .fn()
            .mockRejectedValueOnce(new Error('provider is cold'))
            .mockResolvedValue(innerRedirectingTo('https://idp/auth'));
        const strategy = new DeferredPassportStrategy(build);

        strategy.warm();
        await vi.waitFor(() =>
            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining('provider is cold'),
            ),
        );

        await expect(authenticateOnce(strategy)).resolves.toBe(
            'redirect:https://idp/auth',
        );
        expect(build).toHaveBeenCalledTimes(2);
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

describe('getOrganizationHint', () => {
    const withQuery = (query: Record<string, unknown>) =>
        ({ query }) as unknown as Request;

    it('forwards a uuid under the name of the claim it asks for', () => {
        const uuid = '371c115d-9530-484b-a617-f19dae37ecb9';
        expect(getOrganizationHint(withQuery({ organization: uuid }))).toEqual({
            lightdash_organization_uuid: uuid,
        });
    });

    it.each([
        ['absent', {}],
        ['not a uuid', { organization: 'chrometests' }],
        ['repeated', { organization: ['a', 'b'] }],
    ])('forwards nothing when the parameter is %s', (_, query) => {
        expect(getOrganizationHint(withQuery(query))).toBeNull();
    });
});
