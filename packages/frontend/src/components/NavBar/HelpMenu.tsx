import { subject } from '@casl/ability';
import { LightdashMode } from '@lightdash/common';
import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
    IconBook,
    IconHelp,
    IconMail,
    IconMessages,
    IconRoad,
    IconSos,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import useHealth from '../../hooks/health/useHealth';
import { useCanAccessSettings } from '../../hooks/settings/useCanAccessSettings';
import useApp from '../../providers/App/useApp';
import SupportDrawerContent from '../../providers/SupportDrawer/SupportDrawerContent';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import { useNavBarMenuProps } from './NavBarPortalContext';

const HelpMenu: FC<{ withLabel?: boolean }> = ({ withLabel = false }) => {
    const menuProps = useNavBarMenuProps();
    const health = useHealth();
    const { user } = useApp();
    const canAccessSettings = useCanAccessSettings();
    // The roadmap is a Settings page, registered only behind a valid licence.
    const canViewRoadmap =
        canAccessSettings &&
        health.data?.license?.valid === true &&
        user.data?.ability.can(
            'view',
            subject('Roadmap', {
                organizationUuid: user.data.organizationUuid,
            }),
        );
    const isCloudCustomer = health.data?.mode === LightdashMode.CLOUD_BETA;
    const isDevelopment = health.data?.mode === LightdashMode.DEV;
    const isPylonEnabled = !!health.data?.pylon.appId;

    const helpMenuUrl = health.data?.helpMenuUrl;

    // If helpMenuUrl is set, render a button that opens the URL in a new tab
    if (helpMenuUrl) {
        return (
            <Button
                aria-label="Help"
                variant="default"
                size="xs"
                component="a"
                href={helpMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                <MantineIcon icon={IconHelp} />
                {withLabel && ' Help'}
            </Button>
        );
    }

    return (
        <Menu
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            {...menuProps}
        >
            <Menu.Target>
                <Button aria-label="Help" variant="default" size="xs">
                    <MantineIcon icon={IconHelp} />
                    {withLabel && ' Help'}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <LargeMenuItem
                    component="a"
                    href="https://www.kontala.com/docs/analytics"
                    target="_blank"
                    title="Documentation"
                    description="Read the Kontala Analytics guides"
                    icon={IconBook}
                />

                {canViewRoadmap && (
                    <LargeMenuItem
                        component={Link}
                        to="/generalSettings/roadmap"
                        title="Roadmap"
                        description="Explore what we're building and track feature requests"
                        icon={IconRoad}
                    />
                )}

                {isCloudCustomer && isPylonEnabled && (
                    <LargeMenuItem
                        onClick={() => {
                            // @ts-ignore
                            if (window.Pylon) {
                                // @ts-ignore
                                window.Pylon('show');
                            }
                        }}
                        title="Talk to support"
                        description="Drop us a message with product questions or feedback"
                        icon={IconMessages}
                    />
                )}

                <LargeMenuItem
                    component="a"
                    href="https://www.kontala.com/docs/support/contact-us"
                    target="_blank"
                    title="Contact us"
                    description="Talk to the Kontala team about setup, access or anything else"
                    icon={IconMail}
                />

                {(isCloudCustomer || isDevelopment) && (
                    <LargeMenuItem
                        component="a"
                        onClick={() => {
                            modals.open({
                                id: 'support-drawer',
                                title: 'Share with Kontala Support',
                                size: 'lg',
                                children: <SupportDrawerContent />,
                                yOffset: 100,
                                zIndex: 1000,
                            });
                        }}
                        title="Report an issue"
                        description="Share a detailed report with Kontala support"
                        icon={IconSos}
                    />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default HelpMenu;
