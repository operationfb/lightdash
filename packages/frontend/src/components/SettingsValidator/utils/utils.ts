import {
    isChartValidationError,
    isDataAppValidationError,
    isDashboardValidationError,
    type ValidationResponse,
} from '@lightdash/common';
import { toBrowserPath } from '../../../utils/url';

export const getLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    if (isChartValidationError(validationError) && validationError.chartUuid)
        return `/projects/${projectUuid}/saved/${validationError.chartUuid}`;

    if (
        isDashboardValidationError(validationError) &&
        validationError.dashboardUuid
    )
        return `/projects/${projectUuid}/dashboards/${validationError.dashboardSlug ?? validationError.dashboardUuid}/view`;

    if (isDataAppValidationError(validationError) && validationError.appUuid)
        return `/projects/${projectUuid}/apps/${validationError.appUuid}`;

    return;
};

/**
 * KONTALA: `getLinkToResource` for a real anchor. That one is a router path,
 * which is also what useRenameResource wants (it adds the base path itself), so
 * it stays as it is and the anchors take this instead. See utils/url.ts.
 */
export const getBrowserLinkToResource = (
    validationError: ValidationResponse,
    projectUuid: string,
) => {
    const routerPath = getLinkToResource(validationError, projectUuid);
    return routerPath && toBrowserPath(routerPath);
};
