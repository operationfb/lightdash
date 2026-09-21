/**
 * KONTALA: the crossing between Kontala Marketing and this build.
 *
 * The two are independent builds sharing one origin (Kontala at '/', this one
 * at '/analytics/'), so a crossing is a real page load and they share no
 * JavaScript runtime. Context therefore has to be written down somewhere the
 * other build can read it, and sessionStorage is that somewhere: it belongs to
 * this tab alone and never travels in a link.
 *
 * ⚠ THE KEY NAMES AND THE PAYLOAD SHAPE ARE A CONTRACT with the Kontala SPA
 * (its app/web/src/lib/handover.ts). Change one side without the other and a
 * crossing silently stops carrying its way home.
 *
 * Reading consumes: a refresh or a back/forward traversal must not replay a
 * payload. Anything stale, malformed or of another version is treated as an
 * ordinary visit rather than an error.
 */
const TO_ANALYTICS = 'km.handover-to-analytics.v1';
const FROM_ANALYTICS = 'km.handover-from-analytics.v1';

const HANDOVER_VERSION = 1;

/**
 * How long a payload Kontala wrote stays meaningful.
 *
 * ⚠ LONGER THAN THE KONTALA SIDE ALLOWS ITS OWN, deliberately: the two legs are
 * not the same journey. Going back is one navigation between two builds, and a
 * minute is generous for it. Coming here is that navigation plus, for a reader
 * with no session in this build yet, a whole single sign-on round trip - the
 * login page, the redirect out, the provider, the token exchange and the
 * redirect back - against two services that scale to zero and may both be cold.
 * A minute does not reliably cover it, and what it costs when it runs out is
 * the way home quietly disappearing from a crossing that otherwise worked.
 *
 * Five minutes still says the thing the budget is for: context nobody came back
 * to within the span of one crossing is context to forget, rather than to
 * restore into some later visit that happens to reuse this tab.
 */
const HANDOVER_MAX_AGE_MS = 5 * 60_000;

export type Handover = {
    version: number;
    sourceApp: 'kontala' | 'analytics';
    timestamp: number;
    /** Where to send the reader back to. A same-origin path, never a URL. */
    returnTo: string;
    state?: Record<string, unknown>;
};

/**
 * A same-origin path, or null.
 *
 * ⚠ returnTo ARRIVES FROM ANOTHER BUILD and is navigated to, so treating it as
 * trusted would be an open redirect. Every rule here closes a real trick: a
 * scheme is not a path; '//evil.test' is protocol-relative; a browser reads a
 * backslash as a slash; and '/..//evil.test' normalises into one.
 */
const safePath = (raw: unknown): string | null => {
    if (typeof raw !== 'string' || raw === '' || raw.length > 2048) return null;
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
        return null;
    }
    let url: URL;
    try {
        url = new URL(raw, 'https://handover.invalid');
    } catch {
        return null;
    }
    if (url.origin !== 'https://handover.invalid') return null;
    const path = `${url.pathname}${url.search}`;
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
};

/** Every access can throw where the browser blocks site data. */
const take = (key: string): string | null => {
    try {
        const value = window.sessionStorage.getItem(key);
        if (value !== null) window.sessionStorage.removeItem(key);
        return value;
    } catch {
        return null;
    }
};

const write = (key: string, payload: Handover): void => {
    try {
        window.sessionStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // A crossing without context still works; see the Kontala side.
    }
};

/**
 * Where Kontala asked to be sent back to, consumed. Null when this was not a
 * crossing, or was one that is no longer fresh.
 */
export const takeReturnTo = (now: number = Date.now()): string | null => {
    const raw = take(TO_ANALYTICS);
    if (raw === null) return null;
    let payload: Handover;
    try {
        payload = JSON.parse(raw) as Handover;
    } catch {
        return null;
    }
    if (payload?.version !== HANDOVER_VERSION) return null;
    if (!Number.isFinite(payload.timestamp)) return null;
    const age = now - payload.timestamp;
    if (age < 0 || age > HANDOVER_MAX_AGE_MS) return null;
    return safePath(payload.returnTo);
};

/** Writes the symmetric payload and leaves for Kontala. */
export const returnToKontala = (returnTo: string): void => {
    const target = safePath(returnTo) ?? '/';
    write(FROM_ANALYTICS, {
        version: HANDOVER_VERSION,
        sourceApp: 'analytics',
        timestamp: Date.now(),
        returnTo: target,
    });
    window.location.assign(target);
};
