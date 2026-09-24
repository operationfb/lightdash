import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventName, PageName, SectionName } from '../../types/Events';
import TrackingProvider, { TrackPage, TrackSection } from './TrackingProvider';
import useTracking from './useTracking';

describe('TrackingProvider', () => {
    it('still reports a missing provider rather than silently disabling tracking', () => {
        expect(() => renderHook(() => useTracking())).toThrow(
            'useTracking must be used within a TrackingProvider',
        );
    });

    it('accepts tracking calls inside page and section context', () => {
        const { result } = renderHook(() => useTracking(), {
            wrapper: ({ children }) => (
                <TrackingProvider>
                    <TrackPage name={PageName.DASHBOARD}>
                        <TrackSection name={SectionName.DASHBOARD_TILE}>
                            {children}
                        </TrackSection>
                    </TrackPage>
                </TrackingProvider>
            ),
        });

        expect(() => {
            result.current.track({ name: EventName.COMMENTS_CLICKED });
            result.current.page({ name: PageName.DASHBOARD });
            result.current.identify({ id: 'user-1' });
        }).not.toThrow();
    });
});
