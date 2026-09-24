<summary>
Analytics events for Lightdash user interactions and system events, with type safety.
Events stay in-process: they feed the usage event stream and Prometheus event metrics.
This fork removed the RudderStack transport, so nothing is sent to a third party.
</summary>

<howToUse>
The main entry point is the `LightdashAnalytics` class. Initialize it with your configuration and use it to track user events throughout the application.

```typescript
import { LightdashAnalytics } from './analytics/LightdashAnalytics';

// Initialize analytics
const analytics = new LightdashAnalytics({
    lightdashConfig,
    eventEmitter, // optional: Prometheus event metrics
    eventStreamSink, // optional: usage event stream
});

// Track user events
analytics.track({
    event: 'query.executed',
    userId: 'user-123',
    properties: {
        context: QueryExecutionContext.API,
        organizationId: 'org-123',
        projectId: 'project-123',
        metricsCount: 5,
        dimensionsCount: 3,
    },
});

// Track from account context (recommended)
analytics.trackAccount(account, {
    event: 'saved_chart.created',
    properties: {
        projectId: 'project-123',
        chartType: ChartType.CARTESIAN,
    },
});
```

</howToUse>

<codeExample>

```typescript
// Example: Track query execution with metrics
analytics.track({
    event: 'query.executed',
    userId: user.userUuid,
    properties: {
        context: QueryExecutionContext.CHART,
        organizationId: organization.organizationUuid,
        projectId: project.projectUuid,
        metricsCount: query.metrics.length,
        dimensionsCount: query.dimensions.length,
        chartId: chart.uuid,
    },
});

// Example: Track user creation
analytics.track({
    event: 'user.created',
    properties: {
        context: 'registration',
        createdUserId: newUser.userUuid,
        organizationId: organization?.organizationUuid,
        userConnectionType: 'password',
    },
});
```

</codeExample>

<importantToKnow>
- `track()` hands every event to the usage event stream sink, and emits it for Prometheus when `prometheus.eventMetricsEnabled` is on
- There is no external transport: do not add one, and do not reintroduce `identify()`/`group()`
- Use `trackAccount()` method when you have account context - it automatically extracts user/org IDs
- `userId` is set for registered users (account.user.id), while `anonymousId` is used for embed users
- For embed users, `anonymousId` is set to 'embed' and `externalId` is stored in properties
- The `analyticsMock` export is for testing - it has no sinks attached
- Event types are strictly typed - unknown events will cause TypeScript errors
</importantToKnow>

<links>
@/packages/backend/src/config/lightdashConfig.ts - Configuration for analytics settings
@/packages/common/src/types/analytics.ts - Shared analytics type definitions
</links>
