import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    browserBasePath,
    originOf,
    resolveInternalPath,
    toBrowserHref,
    toBrowserPath,
} from './url';

// jsdom serves these tests from http://localhost:3000
const ORIGIN = window.location.origin;

describe('resolveInternalPath', () => {
    it('keeps root-relative paths, preserving query and hash', () => {
        expect(resolveInternalPath('/')).toBe('/');
        expect(resolveInternalPath('/register')).toBe('/register');
        expect(resolveInternalPath('/projects/abc?tab=charts#top')).toBe(
            '/projects/abc?tab=charts#top',
        );
    });

    it('resolves an absolute same-origin URL down to its path', () => {
        expect(resolveInternalPath(`${ORIGIN}/register`)).toBe('/register');
        expect(resolveInternalPath(`${ORIGIN}/projects?tab=charts`)).toBe(
            '/projects?tab=charts',
        );
    });

    it('returns null for other origins, so they stay real anchors', () => {
        expect(
            resolveInternalPath('https://www.lightdash.com/signup'),
        ).toBeNull();
        expect(resolveInternalPath('http://evil.example.com/path')).toBeNull();
    });

    it('returns null for protocol-relative and backslash variants', () => {
        expect(resolveInternalPath('//evil.example.com')).toBeNull();
        expect(resolveInternalPath('//evil.example.com/path')).toBeNull();
        expect(resolveInternalPath('/\\evil.example.com')).toBeNull();
    });

    it('returns null for dangerous schemes', () => {
        expect(resolveInternalPath('javascript:alert(1)')).toBeNull();
        expect(
            resolveInternalPath('data:text/html,<script>alert(1)</script>'),
        ).toBeNull();
    });

    it('returns null rather than throwing on unparseable input', () => {
        expect(resolveInternalPath('')).toBe('/');
        expect(resolveInternalPath('http://')).toBeNull();
    });
});

// KONTALA: behind a base path an absolute URL spells the browser's path, and
// only one inside the base path belongs to this app at all.
describe('resolveInternalPath served under a base path', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('takes the base path off an absolute URL inside it, for the router', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(resolveInternalPath(`${ORIGIN}/analytics/register`)).toBe(
            '/register',
        );
        expect(
            resolveInternalPath(`${ORIGIN}/analytics/projects?tab=charts#top`),
        ).toBe('/projects?tab=charts#top');
        expect(resolveInternalPath(`${ORIGIN}/analytics`)).toBe('/');
        expect(resolveInternalPath(`${ORIGIN}/analytics?tab=charts`)).toBe(
            '/?tab=charts',
        );
    });

    it('leaves the rest of a shared origin to real document links', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(resolveInternalPath(`${ORIGIN}/properties`)).toBeNull();
        expect(resolveInternalPath(`${ORIGIN}/analyticsfoo`)).toBeNull();
    });

    it('keeps a root-relative input as the router path it already is', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(resolveInternalPath('/register')).toBe('/register');
    });
});

describe('browserBasePath', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('is empty at the origin root', () => {
        expect(browserBasePath()).toBe('');
    });

    it("is vite's base without its trailing slash", () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(browserBasePath()).toBe('/analytics');
    });
});

describe('originOf', () => {
    it('drops the path a site URL carries', () => {
        expect(originOf('https://konta.la/analytics')).toBe('https://konta.la');
    });

    it('is null rather than throwing for something that does not parse', () => {
        expect(originOf('')).toBeNull();
    });
});

// KONTALA: the router's paths and the browser's are the same string only when
// this build is served at the origin root. vitest gives BASE_URL '/', so the
// base-path cases stub it.
describe('toBrowserPath', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('changes nothing when this build is served at the origin root', () => {
        expect(toBrowserPath('/projects/abc/home')).toBe('/projects/abc/home');
        expect(toBrowserPath('/')).toBe('/');
    });

    it('puts the base path back on a path leaving the router', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserPath('/projects/abc/home')).toBe(
            '/analytics/projects/abc/home',
        );
        expect(toBrowserPath('/api/v1/login/oidc')).toBe(
            '/analytics/api/v1/login/oidc',
        );
    });

    it('does not double the slash between the two', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserPath('/')).toBe('/analytics/');
    });

    it('keeps query and hash', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserPath('/projects/abc?tab=charts#top')).toBe(
            '/analytics/projects/abc?tab=charts#top',
        );
    });
});

// KONTALA: the shared link components (LinkButton, LinkMenuItem,
// MantineLinkButton) take an `href` that is either a path into this app or a
// link off to somewhere else, so only the first gets the base path back.
describe('toBrowserHref', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('puts the base path back on a path into this app', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserHref('/projects/abc/tables')).toBe(
            '/analytics/projects/abc/tables',
        );
    });

    it('leaves an absolute URL alone', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserHref('https://docs.lightdash.com/')).toBe(
            'https://docs.lightdash.com/',
        );
        expect(toBrowserHref('https://github.com/lightdash/lightdash')).toBe(
            'https://github.com/lightdash/lightdash',
        );
    });

    it('leaves anything that would leave this origin alone', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(toBrowserHref('//evil.example.com')).toBe('//evil.example.com');
        expect(toBrowserHref('/\\evil.example.com')).toBe(
            '/\\evil.example.com',
        );
        expect(toBrowserHref('mailto:support@example.com')).toBe(
            'mailto:support@example.com',
        );
    });

    it('changes nothing when this build is served at the origin root', () => {
        expect(toBrowserHref('/projects/abc/tables')).toBe(
            '/projects/abc/tables',
        );
        expect(toBrowserHref('https://docs.lightdash.com/')).toBe(
            'https://docs.lightdash.com/',
        );
    });
});
