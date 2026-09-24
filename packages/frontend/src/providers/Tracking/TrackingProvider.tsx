import noop from 'lodash/noop';
import { type FC, type PropsWithChildren } from 'react';
import TrackingContext from './context';
import {
    type PageData,
    type SectionData,
    type TrackingContextType,
} from './types';

// KONTALA: no third-party transport. Tracking calls are accepted and dropped;
// the RudderStack SDK this provider used to drive is removed.
const trackingContext: TrackingContextType = {
    data: {},
    page: noop,
    track: noop,
    identify: noop,
};

const TrackingProvider: FC<PropsWithChildren> = ({ children }) => (
    <TrackingContext.Provider value={trackingContext}>
        {children}
    </TrackingContext.Provider>
);

export const TrackPage: FC<PropsWithChildren<PageData>> = ({ children }) => (
    <>{children}</>
);

export const TrackSection: FC<PropsWithChildren<SectionData>> = ({
    children,
}) => <>{children}</>;

export default TrackingProvider;
