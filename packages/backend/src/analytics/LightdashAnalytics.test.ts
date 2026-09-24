import { EventEmitter } from 'events';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import type { FeatureFlagCheckAggregateEntry } from '../models/FeatureFlagModel/flagCheckAggregator';
import type { EventStreamSink } from './eventStream/EventStreamSink';
import { LightdashAnalytics } from './LightdashAnalytics';

describe('LightdashAnalytics', () => {
    it('tracks one aggregated feature flag check event per entry', () => {
        const analytics = new LightdashAnalytics({
            lightdashConfig: lightdashConfigMock,
        });
        const trackSpy = vi.spyOn(analytics, 'track');
        const entries: FeatureFlagCheckAggregateEntry[] = [
            {
                flagId: 'enabled-flag',
                checkCount: 3,
                enabledCount: 2,
                disabledCount: 1,
                uniqueOrgCount: 2,
                orgUuids: ['org-1', 'org-2'],
                orgUuidsTruncated: false,
                windowStartAt: '2026-07-25T00:00:00.000Z',
                windowEndAt: '2026-07-25T00:15:00.000Z',
            },
            {
                flagId: 'disabled-flag',
                checkCount: 1,
                enabledCount: 0,
                disabledCount: 1,
                uniqueOrgCount: 1,
                orgUuids: ['org-3'],
                orgUuidsTruncated: true,
                windowStartAt: '2026-07-25T00:00:00.000Z',
                windowEndAt: '2026-07-25T00:15:00.000Z',
            },
        ];

        analytics.trackFeatureFlagChecks(entries, 'scheduler');

        expect(trackSpy).toHaveBeenCalledTimes(2);
        expect(trackSpy).toHaveBeenNthCalledWith(1, {
            event: 'feature_flag.checked_aggregated',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                ...entries[0],
                processType: 'scheduler',
            },
        });
        expect(trackSpy).toHaveBeenNthCalledWith(2, {
            event: 'feature_flag.checked_aggregated',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                ...entries[1],
                processType: 'scheduler',
            },
        });
    });

    describe('track', () => {
        const payload = {
            event: 'custom.event',
            userId: 'user-1',
            properties: { organizationId: 'org-1' },
        };

        it('hands every event to the usage event stream', () => {
            const handle = vi.fn();
            const analytics = new LightdashAnalytics({
                lightdashConfig: lightdashConfigMock,
                eventStreamSink: { handle } as unknown as EventStreamSink,
            });

            analytics.track(payload);

            expect(handle).toHaveBeenCalledWith(payload);
        });

        it.each([
            { eventMetricsEnabled: true, expectedCalls: 1 },
            { eventMetricsEnabled: false, expectedCalls: 0 },
        ])(
            'emits Prometheus event metrics only when enabled ($eventMetricsEnabled)',
            ({ eventMetricsEnabled, expectedCalls }) => {
                const eventEmitter = new EventEmitter();
                const listener = vi.fn();
                eventEmitter.on('analytics.track.custom.event', listener);
                const analytics = new LightdashAnalytics({
                    lightdashConfig: {
                        ...lightdashConfigMock,
                        prometheus: {
                            ...lightdashConfigMock.prometheus,
                            enabled: true,
                            eventMetricsEnabled,
                        },
                    },
                    eventEmitter,
                });

                analytics.track(payload);

                expect(listener).toHaveBeenCalledTimes(expectedCalls);
            },
        );
    });
});
