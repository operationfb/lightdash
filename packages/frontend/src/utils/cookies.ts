import { browserBasePath } from './url';

/**
 * Read a cookie value by name. Returns null when not present or when running
 * outside a browser context. The value is returned raw (still URL-encoded) —
 * pass it straight to the matching decoder (e.g. `decodeLastLoginMethodCookie`).
 */
export const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${name}=`));
    return match ? match.slice(name.length + 1) : null;
};

/**
 * Write a cookie. The value is stored verbatim — pre-encode it (e.g. with
 * `encodeLastLoginMethodCookie`) so it round-trips through `getCookie`. `Secure`
 * is only set over HTTPS so the cookie still persists in local http dev.
 */
export const setCookie = (
    name: string,
    value: string,
    maxAgeSeconds: number,
): void => {
    if (typeof document === 'undefined') return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    // KONTALA: scoped to the path this build is served under, as the session
    // cookie is (the backend's expressSessionOptions). On a shared origin a
    // Path=/ cookie goes out with every request to the other app too, and the
    // one written here holds the user's email.
    const path = browserBasePath() || '/';
    document.cookie = `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
    // KONTALA: and a copy written before it was scoped still sits at Path=/,
    // where it would keep going out for the rest of its year. Expiring it
    // needs the same name, path and (absent) domain it was written with.
    if (path !== '/') {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
};
