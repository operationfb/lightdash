import { Menu, UnstyledButton, type MenuItemProps } from '@mantine/core';
import React, { type FC } from 'react';
import { useNavigate } from 'react-router';
import { type EventData } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { toBrowserHref } from '../../utils/url';

export interface LinkMenuItemProps extends MenuItemProps {
    trackingEvent?: EventData;
    target?: React.HTMLAttributeAnchorTarget;
    forceRefresh?: boolean;
    href?: string;
    disabled?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const LinkMenuItem: FC<React.PropsWithChildren<LinkMenuItemProps>> = ({
    href,
    target,
    trackingEvent,
    forceRefresh = false,
    disabled = false,
    onClick,
    children,
    ...rest
}) => {
    const navigate = useNavigate();
    const { track } = useTracking();

    // KONTALA: `href` is a router path - `navigate` below wants it that way.
    // The anchor is a real document link, so it gets the base path this build
    // is served under, and an external URL passes through. See utils/url.ts.
    return (
        <UnstyledButton
            target={target}
            component="a"
            href={disabled || !href ? undefined : toBrowserHref(href)}
        >
            <Menu.Item
                {...rest}
                disabled={disabled}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    if (
                        !forceRefresh &&
                        !e.ctrlKey &&
                        !e.metaKey &&
                        target !== '_blank' &&
                        href
                    ) {
                        e.preventDefault();
                        void navigate(href);
                    }

                    onClick?.(e);

                    if (trackingEvent) track(trackingEvent);
                }}
            >
                {children}
            </Menu.Item>
        </UnstyledButton>
    );
};

export default LinkMenuItem;
