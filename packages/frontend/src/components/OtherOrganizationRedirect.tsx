import { type ApiErrorDetail } from '@lightdash/common';
import { useEffect, useState, type FC } from 'react';
import useApp from '../providers/App/useApp';
import { toBrowserPath } from '../utils/url';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

// Long enough to cover one sign-in round trip, short enough that a later visit
// tries again.
const ATTEMPT_WINDOW_MS = 60_000;

const attemptKey = (organizationUuid: string) =>
    `organization-switch:${organizationUuid}`;

const wasAttemptedRecently = (organizationUuid: string): boolean => {
    try {
        const at = Number(
            window.sessionStorage.getItem(attemptKey(organizationUuid)),
        );
        return Number.isFinite(at) && Date.now() - at < ATTEMPT_WINDOW_MS;
    } catch {
        return false;
    }
};

const recordAttempt = (organizationUuid: string): boolean => {
    try {
        window.sessionStorage.setItem(
            attemptKey(organizationUuid),
            String(Date.now()),
        );
        return true;
    } catch {
        // Without somewhere to record the attempt there is no loop guard, so
        // do not attempt at all.
        return false;
    }
};

/**
 * KONTALA: the session is active in one organization and this page is in
 * another of the user's organizations. Sign in again for that organization,
 * once; if the provider does not grant it, explain instead of looping.
 */
const OtherOrganizationRedirect: FC<{
    error: ApiErrorDetail;
    organizationUuid: string;
}> = ({ error, organizationUuid }) => {
    const { health } = useApp();
    const oidc = health.data?.auth.oidc;
    // Decided once, so recording the attempt cannot flip this render's answer
    // while the browser is leaving.
    const [shouldRedirect, setShouldRedirect] = useState(
        () => !!oidc?.enabled && !wasAttemptedRecently(organizationUuid),
    );

    useEffect(() => {
        if (!oidc || !shouldRedirect) return;
        if (!recordAttempt(organizationUuid)) {
            setShouldRedirect(false);
            return;
        }
        window.location.assign(
            `${toBrowserPath(`/api/v1${oidc.loginPath}`)}?redirect=${encodeURIComponent(
                window.location.href,
            )}&organization=${encodeURIComponent(organizationUuid)}`,
        );
    }, [oidc, organizationUuid, shouldRedirect]);

    return shouldRedirect ? <PageSpinner /> : <ErrorState error={error} />;
};

export default OtherOrganizationRedirect;
