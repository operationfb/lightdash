import { subject } from '@casl/ability';
import useApp from '../../providers/App/useApp';

/**
 * KONTALA: Settings are for superadmins only. They cross over from Kontala as
 * organization admins and customers never do, so `manage:Organization` tells
 * them apart. Anyone else must neither reach `/generalSettings` nor see a link
 * into it.
 */
export const useCanAccessSettings = (): boolean => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    if (!user.data || !organizationUuid) return false;
    return user.data.ability.can(
        'manage',
        subject('Organization', { organizationUuid }),
    );
};
