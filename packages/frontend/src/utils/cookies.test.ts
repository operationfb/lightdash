import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCookie } from './cookies';

// KONTALA: on a shared origin a Path=/ cookie goes out with every request to
// the other app as well, and the one this writes holds the user's email.
describe('setCookie', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const captureWrites = () => {
        const writes: string[] = [];
        vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
            writes.push(value);
        });
        return writes;
    };

    it('scopes the cookie to the base path and expires the unscoped copy', () => {
        vi.stubEnv('BASE_URL', '/analytics/');
        const writes = captureWrites();

        setCookie('ld.last_login_method', 'value', 60);

        expect(writes).toEqual([
            'ld.last_login_method=value; Path=/analytics; Max-Age=60; SameSite=Lax',
            'ld.last_login_method=; Path=/; Max-Age=0; SameSite=Lax',
        ]);
    });

    it('writes one cookie at the origin root, where there is nothing to expire', () => {
        const writes = captureWrites();

        setCookie('ld.last_login_method', 'value', 60);

        expect(writes).toEqual([
            'ld.last_login_method=value; Path=/; Max-Age=60; SameSite=Lax',
        ]);
    });
});
