import { type ApiErrorDetail } from '@lightdash/common';

/** KONTALA: the organization an OtherOrganizationError says to sign in for. */
export const getOtherOrganizationUuid = (
    error: ApiErrorDetail,
): string | null =>
    error.name === 'OtherOrganizationError' &&
    typeof error.data?.organizationUuid === 'string'
        ? error.data.organizationUuid
        : null;
