import { lightdashConfig } from './config/lightdashConfig';

/**
 * KONTALA: the enterprise module, and the AI, sandbox and chart-registry
 * clients it imports, are ~1.4k of the ~9.9k files a boot reads, and without a
 * licence key getEnterpriseAppArguments() returns {} having used none of them.
 * Both the server and the scheduler worker start through here.
 */
export const getEnterpriseAppArgumentsIfLicensed = async () => {
    if (!lightdashConfig.license.licenseKey) return {};
    const { getEnterpriseAppArguments } = await import('./ee');
    return getEnterpriseAppArguments();
};
