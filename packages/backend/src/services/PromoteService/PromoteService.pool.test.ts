import { PromotionAction, type PromotionChanges } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import type { SavedSqlModel } from '../../models/SavedSqlModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { PromoteService } from './PromoteService';
import {
    existingUpstreamChart,
    promotedChart,
    user,
} from './PromoteService.mock';

/**
 * A database whose queries knex-mock-client answers, behind knex's own tarn
 * pool of `connections`: a transaction holds one connection until it ends,
 * any other query takes one for as long as it runs, and a wait for one past
 * `acquireTimeoutMs` fails as it does in production, with KnexTimeoutError.
 */
const pooledDatabase = (connections: number, acquireTimeoutMs: number) => {
    const database = knex({
        client: MockClient,
        dialect: 'pg',
        pool: { min: 0, max: connections },
        acquireConnectionTimeout: acquireTimeoutMs,
    });
    // knex-mock-client hands every query a connection of its own; these
    // lines put its connections behind the pool knex builds for a driver.
    const { client } = database;
    client.acquireRawConnection = () =>
        MockClient.prototype.acquireConnection.call(client);
    client.destroyRawConnection = async () => undefined;
    client.validateConnection = () => true;
    client.acquireConnection = knex.Client.prototype.acquireConnection;
    client.releaseConnection = knex.Client.prototype.releaseConnection;
    client.initializePool();
    return database;
};

// Every statement writing a chart's version: what the rows say is not what
// these tests are about, only which connection each statement runs on.
const answerChartWrites = (tracker: Tracker) => {
    tracker.on
        .select(() => true)
        .response([
            {
                saved_query_id: 11,
                project_uuid: existingUpstreamChart.projectUuid,
                space_id: 7,
                slug: promotedChart.chart.slug,
            },
        ]);
    tracker.on.insert(() => true).response([{ saved_queries_version_id: 13 }]);
    tracker.on.update(() => true).response(1);
};

// The committed transactions that wrote a chart's version: each updates the
// chart's own row, where the version's insert is in a savepoint of its own.
const versionWrites = (tracker: Tracker) =>
    tracker.history.transactions.filter(
        (transaction) =>
            transaction.state === 'committed' &&
            transaction.queries.some((query) =>
                query.sql.startsWith('update "saved_queries" set'),
            ),
    );

describe('SavedChartModel.createVersionInTransaction', () => {
    let database: Knex;
    let tracker: Tracker;
    let model: SavedChartModel;

    beforeEach(() => {
        database = pooledDatabase(1, 200);
        tracker = getTracker();
        answerChartWrites(tracker);
        model = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterEach(async () => {
        tracker.reset();
        await database.destroy();
    });

    test('writes a version on the transaction it is given, with no second connection', async () => {
        await database.transaction((transaction) =>
            model.createVersionInTransaction(
                existingUpstreamChart.chart!.uuid,
                promotedChart.chart,
                user,
                transaction,
            ),
        );

        expect(versionWrites(tracker)).toHaveLength(1);
        expect(tracker.history.insert[0].sql).toMatch(
            /^insert into "saved_queries_versions"/,
        );
    });

    // Why the method above exists: createVersion reads the chart back
    // through the pool before the caller's transaction can end, so a
    // transaction holding the only connection waits for another until the
    // acquire timeout. If this ever stops timing out, createVersion reads
    // back on the transaction it is given and upsertCharts may call it again.
    test('createVersion inside a transaction needs a second connection', async () => {
        await expect(
            database.transaction((transaction) =>
                model.createVersion(
                    existingUpstreamChart.chart!.uuid,
                    promotedChart.chart,
                    user,
                    transaction,
                ),
            ),
        ).rejects.toThrow('Knex: Timeout acquiring a connection');
    });
});

describe('PromoteService.upsertCharts', () => {
    const charts = 3;
    const connections = 2;
    let database: Knex;
    let tracker: Tracker;
    let service: PromoteService;

    beforeEach(() => {
        database = pooledDatabase(connections, 500);
        tracker = getTracker();
        answerChartWrites(tracker);
        const savedChartModel = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
        // A read through the pool, as the real one is, and nothing more:
        // every chart's transaction runs at once, so one that waited on the
        // pool would hold a connection it can never give back.
        vi.spyOn(savedChartModel, 'get').mockImplementation(async (uuid) => {
            await database(SavedChartsTableName)
                .select('slug')
                .where('saved_query_uuid', uuid);
            return { ...promotedChart.chart, uuid };
        });
        service = new PromoteService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            projectModel: {} as ProjectModel,
            savedChartModel,
            savedSqlModel: {} as SavedSqlModel,
            spaceModel: {} as SpaceModel,
            dashboardModel: {} as DashboardModel,
            spacePermissionService: {} as SpacePermissionService,
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        tracker.reset();
        await database.destroy();
    });

    test('updates more charts at once than the pool has connections', async () => {
        const changes: PromotionChanges = {
            spaces: [],
            dashboards: [],
            charts: Array.from({ length: charts }, (_, index) => ({
                action: PromotionAction.UPDATE,
                data: {
                    ...promotedChart.chart,
                    uuid: `upstream-chart-${index}`,
                    oldUuid: `promoted-chart-${index}`,
                    projectUuid: existingUpstreamChart.projectUuid,
                    spaceUuid: existingUpstreamChart.space!.uuid,
                    spaceSlug: promotedChart.space.slug,
                    spacePath: promotedChart.space.path,
                },
            })),
        };

        const promoted = await service.upsertCharts(user, changes);

        expect(promoted.charts.map((chart) => chart.data.uuid)).toEqual(
            changes.charts.map((chart) => chart.data.uuid),
        );
        expect(versionWrites(tracker)).toHaveLength(charts);
    });
});
