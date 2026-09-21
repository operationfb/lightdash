import { lightdashConfigMock } from './lightdashConfig.mock';
import { siteUrlFor } from './siteUrl';

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
