/**
 * KONTALA: upstream fetches the newest lightdash/lightdash tag from Docker Hub
 * when this module loads and every 10 minutes after, for the about footer's
 * "new version available" note. This fork does not contact Lightdash's
 * services, and upstream's newest release is not something a Kontala reader
 * can upgrade to, so there is nothing to fetch or announce. The function stays
 * as the seam upstream's health code calls.
 */
export function getDockerHubVersion(): string | undefined {
    return undefined;
}
