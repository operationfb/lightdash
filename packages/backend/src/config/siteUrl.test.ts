import { lightdashConfigMock } from './lightdashConfig.mock';
import { appPathOf, sitePathFor, siteUrlFor } from './siteUrl';

// KONTALA: one rule, and the whole reason this helper exists rather than a
// `new URL(path, siteUrl)` at each call site.
describe('siteUrlFor', () => {
    const atRoot = { ...lightdashConfigMock, basePath: '' };
    const underPath = {
        ...lightdashConfigMock,
        siteUrl: 'https://konta.la/analytics',
        basePath: '/analytics',
    };

    it('keeps a path inside the base path this instance is served under', () => {
        expect(siteUrlFor(underPath, '/api/v1/login/oidc')).toBe(
            'https://konta.la/analytics/api/v1/login/oidc',
        );
    });

    it('resolves the root of this instance, not of the origin', () => {
        // The one that mattered: the post-login landing. Resolved against the
        // origin it hands the reader to whatever else lives there.
        expect(siteUrlFor(underPath, '/')).toBe('https://konta.la/analytics/');
    });

    it('carries a query string through untouched', () => {
        expect(
            siteUrlFor(underPath, '/api/v1/login/oidc?login_hint=a%40b'),
        ).toBe('https://konta.la/analytics/api/v1/login/oidc?login_hint=a%40b');
    });

    it('changes nothing for an instance at the origin root', () => {
        expect(siteUrlFor(atRoot, '/api/v1/login/oidc')).toBe(
            `${lightdashConfigMock.siteUrl}/api/v1/login/oidc`,
        );
        expect(siteUrlFor(atRoot, '/')).toBe(`${lightdashConfigMock.siteUrl}/`);
    });
});

// KONTALA: the same rule for a redirect's Location, which only needs a path.
describe('sitePathFor', () => {
    it('keeps a path inside the base path this instance is served under', () => {
        expect(sitePathFor({ basePath: '/analytics' }, '/login')).toBe(
            '/analytics/login',
        );
    });

    it('changes nothing for an instance at the origin root', () => {
        expect(sitePathFor({ basePath: '' }, '/login?redirect=%2Fx')).toBe(
            '/login?redirect=%2Fx',
        );
    });
});

// KONTALA: a `/login?redirect=` value is a router path to the frontend, which
// puts the base path back on itself; req.originalUrl already carries it.
describe('appPathOf', () => {
    const underPath = { basePath: '/analytics' };

    it("takes the base path off a request's original URL", () => {
        expect(
            appPathOf(underPath, '/analytics/api/v1/oauth/authorize?a=1'),
        ).toBe('/api/v1/oauth/authorize?a=1');
        expect(appPathOf(underPath, '/analytics')).toBe('/');
        expect(appPathOf(underPath, '/analytics?a=1')).toBe('/?a=1');
    });

    it('leaves a path outside the base path alone', () => {
        expect(appPathOf(underPath, '/analyticsfoo/x')).toBe('/analyticsfoo/x');
        expect(appPathOf(underPath, '/other')).toBe('/other');
    });

    it('changes nothing for an instance at the origin root', () => {
        expect(appPathOf({ basePath: '' }, '/api/v1/x?y=1')).toBe(
            '/api/v1/x?y=1',
        );
    });
});
