import { OrganizationMemberRole } from '@lightdash/common';
import express from 'express';
import { request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { errorHandler } from '../errors';
import {
    deployUserEmail,
    KONTALA_ADMIN_HEADER,
    kontalaRouter,
} from './kontalaRouter';

vi.mock('../logging/logger', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORG = '371c115d-9530-484b-a617-f19dae37ecb9';
const PROJECT = '364da357-5ce7-489c-b924-ea134a23d823';
const SECRET = 'a-shared-secret';

/**
 * The path the CLI produced, and therefore the one Kontala must keep sending:
 * it reaches the compiled explore as original_file_path.
 */
const MODEL_PATH = 'lightdash/models/events_clean.yml';
const TABLE = '`stocks-ag.analytics.events_clean_chrometests`';

const modelYaml = ({
    name = 'events_clean',
    table = TABLE,
}: { name?: string; table?: string } = {}) => `
type: model
name: ${name}
label: "Page views"
sql_from: '${table}'
primary_key: ingest_id
dimensions:
  - name: ingest_id
    label: "Ingest id"
    sql: \${TABLE}.ingest_id
    type: string
  - name: path
    label: "Path"
    sql: \${TABLE}.path
    type: string
metrics:
  page_views:
    label: "Page views"
    type: count
    sql: \${TABLE}.ingest_id
`;

type Models = {
    userModel: Record<string, ReturnType<typeof vi.fn>>;
    emailModel: Record<string, ReturnType<typeof vi.fn>>;
    organizationMemberProfileModel: Record<string, ReturnType<typeof vi.fn>>;
    projectModel: Record<string, ReturnType<typeof vi.fn>>;
    projectService: Record<string, ReturnType<typeof vi.fn>>;
    coderService: Record<string, ReturnType<typeof vi.fn>>;
};

const bigqueryProject = {
    projectUuid: PROJECT,
    organizationUuid: ORG,
    name: 'chrometests-project',
    warehouseConnection: { type: 'bigquery', startOfWeek: undefined },
};

const buildModels = (overrides: Partial<Models> = {}): Models => ({
    userModel: {
        findOrganizationRoleByPrimaryEmail: vi
            .fn()
            .mockResolvedValue(undefined),
        findUserByEmail: vi.fn().mockResolvedValue(undefined),
        createUser: vi.fn().mockResolvedValue({ userUuid: 'user-uuid-1' }),
        createPendingUser: vi
            .fn()
            .mockResolvedValue({ userUuid: 'user-uuid-1' }),
        getUserDetailsByUuid: vi.fn().mockResolvedValue({
            userUuid: 'user-uuid-1',
            userId: 1,
            firstName: 'Kontala',
            lastName: 'deploy',
            email: deployUserEmail(ORG),
            // No organizationUuid: this account holds no membership, which is
            // exactly the state deployActor has to work from.
            organizationUuid: undefined,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            isActive: true,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            timezone: null,
            avatarUrl: null,
            avatarGradient: null,
        }),
    },
    emailModel: {
        verifyUserEmailIfExists: vi.fn().mockResolvedValue(undefined),
    },
    organizationMemberProfileModel: {
        getOrganizationMemberByUuid: vi.fn().mockResolvedValue(undefined),
        createOrganizationMembershipByUuid: vi
            .fn()
            .mockResolvedValue(undefined),
        updateOrganizationMember: vi.fn().mockResolvedValue(undefined),
    },
    projectModel: {
        get: vi.fn().mockResolvedValue(bigqueryProject),
    },
    projectService: {
        saveExploresToCacheAndIndexCatalog: vi
            .fn()
            .mockResolvedValue('catalog-job-uuid-1'),
    },
    coderService: {
        upsertChart: vi.fn().mockResolvedValue({}),
        upsertSqlChart: vi.fn().mockResolvedValue({}),
        upsertDashboard: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
});

const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    );
                }),
        ),
    );
});

const start = (models: Models, config: Record<string, unknown>) => {
    const app = express();
    app.use(
        '/api/v1/kontala',
        kontalaRouter({
            lightdashConfig: config as never,
            userModel: models.userModel as never,
            emailModel: models.emailModel as never,
            organizationMemberProfileModel:
                models.organizationMemberProfileModel as never,
            projectModel: models.projectModel as never,
            projectService: models.projectService as never,
            coderService: models.coderService as never,
        }),
    );
    // ⚠ WITHOUT THIS EVERY ASSERTION BELOW COLLAPSES TO ">= 400". App.ts maps a
    // thrown LightdashError to its status code through errorHandler; express's
    // own default renders 500 and HTML for every one of them. This endpoint's
    // whole contract is which status code comes back, so the test app has to
    // map them the way production does. The Sentry and analytics wrapping
    // around it there is not part of that contract.
    app.use(
        (
            error: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
        ) => {
            const mapped = errorHandler(error);
            res.status(mapped.statusCode).json({
                status: 'error',
                error: mapped,
            });
        },
    );
    const server = app.listen(0);
    servers.push(server);
    return (server.address() as AddressInfo).port;
};

const send = (
    method: 'POST' | 'PUT',
    port: number,
    path: string,
    body: unknown,
    headers: Record<string, string>,
): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = httpRequest(
            {
                host: '127.0.0.1',
                port,
                path,
                method,
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload),
                    ...headers,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk as string;
                });
                res.on('end', () =>
                    resolve({ status: res.statusCode ?? 0, body: data }),
                );
            },
        );
        req.on('error', reject);
        req.end(payload);
    });

const configWith = (overrides: { adminSecret?: string } = {}) => ({
    ...lightdashConfigMock,
    kontala: { adminSecret: overrides.adminSecret ?? SECRET },
});

const deploy = (
    port: number,
    body: unknown,
    headers: Record<string, string> = { [KONTALA_ADMIN_HEADER]: SECRET },
) =>
    send(
        'PUT',
        port,
        `/api/v1/kontala/projects/${PROJECT}/semantic-layer`,
        body,
        headers,
    );

const oneModel = (yaml = modelYaml()) => ({
    models: [{ path: MODEL_PATH, content: yaml }],
});

const savedArgs = (models: Models) =>
    models.projectService.saveExploresToCacheAndIndexCatalog.mock
        .calls[0][0] as Record<string, unknown>;

const savedNothing = (models: Models) =>
    expect(
        models.projectService.saveExploresToCacheAndIndexCatalog,
    ).not.toHaveBeenCalled();

const ensureMember = (
    port: number,
    body: unknown,
    headers: Record<string, string> = { [KONTALA_ADMIN_HEADER]: SECRET },
) => send('POST', port, '/api/v1/kontala/members', body, headers);

const person = {
    organizationUuid: ORG,
    email: 'Person@Example.com',
    firstName: 'Per',
    lastName: 'Son',
    role: OrganizationMemberRole.EDITOR,
};

const knownPerson = (models: Models, role: OrganizationMemberRole | null) =>
    models.userModel.findOrganizationRoleByPrimaryEmail.mockResolvedValue({
        userUuid: 'user-uuid-2',
        role,
    });

const reconciledNothing = (models: Models) => {
    expect(models.userModel.createPendingUser).not.toHaveBeenCalled();
    expect(models.emailModel.verifyUserEmailIfExists).not.toHaveBeenCalled();
    expect(
        models.organizationMemberProfileModel
            .createOrganizationMembershipByUuid,
    ).not.toHaveBeenCalled();
    expect(
        models.organizationMemberProfileModel.updateOrganizationMember,
    ).not.toHaveBeenCalled();
};

describe('kontala members', () => {
    it('creates a person it has never seen, with their email verified', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await ensureMember(port, person);

        expect(res.status).toBe(201);
        expect(JSON.parse(res.body).results).toBe('created');
        expect(
            models.userModel.findOrganizationRoleByPrimaryEmail,
        ).toHaveBeenCalledExactlyOnceWith('person@example.com', ORG);
        expect(models.userModel.createPendingUser).toHaveBeenCalledWith(
            ORG,
            expect.objectContaining({
                email: 'person@example.com',
                role: OrganizationMemberRole.EDITOR,
            }),
            true,
            true,
        );
        expect(models.emailModel.verifyUserEmailIfExists).toHaveBeenCalledWith(
            'user-uuid-1',
            'person@example.com',
        );
    });

    it('attaches a known person to an organization they are not in', async () => {
        const models = buildModels();
        knownPerson(models, null);
        const port = start(models, configWith());

        const res = await ensureMember(port, person);

        expect(res.status).toBe(201);
        expect(JSON.parse(res.body).results).toBe('attached');
        expect(
            models.organizationMemberProfileModel
                .createOrganizationMembershipByUuid,
        ).toHaveBeenCalledExactlyOnceWith({
            organizationUuid: ORG,
            userUuid: 'user-uuid-2',
            role: OrganizationMemberRole.EDITOR,
        });
        expect(models.userModel.createPendingUser).not.toHaveBeenCalled();
    });

    it('corrects a role that has drifted', async () => {
        const models = buildModels();
        knownPerson(models, OrganizationMemberRole.VIEWER);
        const port = start(models, configWith());

        const res = await ensureMember(port, person);

        expect(res.status).toBe(200);
        expect(JSON.parse(res.body).results).toBe('role-updated');
        expect(
            models.organizationMemberProfileModel.updateOrganizationMember,
        ).toHaveBeenCalledExactlyOnceWith(ORG, 'user-uuid-2', {
            role: OrganizationMemberRole.EDITOR,
        });
    });

    it('answers a crossing that changes nothing with one lookup and no writes', async () => {
        const models = buildModels();
        knownPerson(models, OrganizationMemberRole.EDITOR);
        const port = start(models, configWith());

        const res = await ensureMember(port, person);

        expect(res.status).toBe(200);
        expect(JSON.parse(res.body).results).toBe('unchanged');
        expect(
            models.userModel.findOrganizationRoleByPrimaryEmail,
        ).toHaveBeenCalledTimes(1);
        expect(models.userModel.findUserByEmail).not.toHaveBeenCalled();
        reconciledNothing(models);
    });

    it('refuses a role it does not know before reading anything', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await ensureMember(port, { ...person, role: 'owner' });

        expect(res.status).toBe(400);
        expect(
            models.userModel.findOrganizationRoleByPrimaryEmail,
        ).not.toHaveBeenCalled();
        reconciledNothing(models);
    });

    it('refuses a bad secret before reading anything', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await ensureMember(port, person, {
            [KONTALA_ADMIN_HEADER]: 'wrong',
        });

        expect(res.status).toBe(401);
        expect(
            models.userModel.findOrganizationRoleByPrimaryEmail,
        ).not.toHaveBeenCalled();
        reconciledNothing(models);
    });
});

describe('kontala semantic layer', () => {
    it('compiles the posted model and replaces the project explores', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, oneModel());

        expect(res.status).toBe(200);
        const { results } = JSON.parse(res.body);
        expect(results.exploreCount).toBe(1);
        expect(results.exploreNames).toEqual(['events_clean']);
        expect(results.catalogIndexJobUuid).toBe('catalog-job-uuid-1');

        const saved = savedArgs(models);
        expect(saved.projectUuid).toBe(PROJECT);
        expect(saved.requestMethod).toBe('kontala');
        // A replace, not a merge: a renamed model must not leave its old
        // explore cached for ever.
        expect(saved.complete).toBe(true);
        expect(saved.explores).toHaveLength(1);
    });

    it('keeps the posted path as the explore source, so redeploys do not churn', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await deploy(port, oneModel());

        expect(JSON.stringify(savedArgs(models).explores)).toContain(
            MODEL_PATH,
        );
    });

    it('compiles against the project warehouse, not a default', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await deploy(port, oneModel());

        // The project's own table reference surviving into the compiled
        // explore is what proves the dialect came from the project row rather
        // than from anything the caller posted.
        expect(JSON.stringify(savedArgs(models).explores)).toContain(
            'stocks-ag.analytics.events_clean_chrometests',
        );
    });

    it('attributes the deploy to an org-scoped account with no membership', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await deploy(port, oneModel());

        expect(models.userModel.createUser).toHaveBeenCalledWith(
            expect.objectContaining({ email: deployUserEmail(ORG) }),
            true,
            true,
        );
        // The account exists to be a foreign key, so it is given no role
        // anywhere: createPendingUser would have placed it in the customer's
        // organization.
        expect(models.userModel.createPendingUser).not.toHaveBeenCalled();
        expect(
            models.organizationMemberProfileModel
                .createOrganizationMembershipByUuid,
        ).not.toHaveBeenCalled();
        expect(savedArgs(models).userUuid).toBe('user-uuid-1');
    });

    it('reuses an attribution account that already exists', async () => {
        const models = buildModels();
        models.userModel.findUserByEmail.mockResolvedValue({
            userUuid: 'existing-user',
        });
        const port = start(models, configWith());

        const res = await deploy(port, oneModel());

        expect(res.status).toBe(200);
        expect(models.userModel.createUser).not.toHaveBeenCalled();
        expect(savedArgs(models).userUuid).toBe('existing-user');
    });

    it('is 404 for a project that does not exist, and saves nothing', async () => {
        const models = buildModels();
        const { NotFoundError } = await import('@lightdash/common');
        models.projectModel.get.mockRejectedValue(
            new NotFoundError('Cannot find project'),
        );
        const port = start(models, configWith());

        const res = await deploy(port, oneModel());

        expect(res.status).toBe(404);
        savedNothing(models);
    });

    it('refuses a model that does not satisfy the schema', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        // No sql_from, so there is nothing to select from.
        const res = await deploy(
            port,
            oneModel('type: model\nname: events_clean\n'),
        );

        expect(res.status).toBe(400);
        savedNothing(models);
    });

    it('refuses something that is not YAML at all', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, oneModel('type: "model\n  name: ['));

        expect(res.status).toBe(400);
        savedNothing(models);
    });

    it('refuses an empty models array before reading the project', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, { models: [] });

        expect(res.status).toBe(400);
        expect(models.projectModel.get).not.toHaveBeenCalled();
    });

    it('refuses two models sharing a name', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, {
            models: [
                { path: 'lightdash/models/a.yml', content: modelYaml() },
                { path: 'lightdash/models/b.yml', content: modelYaml() },
            ],
        });

        expect(res.status).toBe(400);
        savedNothing(models);
    });

    it('refuses a config that names a different warehouse than the project', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, {
            ...oneModel(),
            config: 'warehouse:\n  type: postgres\n',
        });

        expect(res.status).toBe(400);
        savedNothing(models);
    });

    it('refuses a project with no warehouse connection', async () => {
        const models = buildModels();
        models.projectModel.get.mockResolvedValue({
            ...bigqueryProject,
            warehouseConnection: undefined,
        });
        const port = start(models, configWith());

        const res = await deploy(port, oneModel());

        expect(res.status).toBe(400);
        savedNothing(models);
    });

    it('refuses a bad secret before reading anything', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await deploy(port, oneModel(), {
            [KONTALA_ADMIN_HEADER]: 'wrong',
        });

        expect(res.status).toBe(401);
        expect(models.projectModel.get).not.toHaveBeenCalled();
    });

    it('is invisible when the integration is not configured', async () => {
        const models = buildModels();
        const port = start(models, configWith({ adminSecret: '' }));

        const res = await deploy(port, oneModel());

        expect(res.status).toBe(404);
        expect(models.projectModel.get).not.toHaveBeenCalled();
    });
});

const publish = (
    port: number,
    body: unknown,
    headers: Record<string, string> = { [KONTALA_ADMIN_HEADER]: SECRET },
) =>
    send(
        'PUT',
        port,
        `/api/v1/kontala/projects/${PROJECT}/content`,
        body,
        headers,
    );

const chartYaml = (slug: string, space = 'kontala') => `
contentType: chart
version: 1
slug: ${slug}
spaceSlug: ${space}
name: "${slug}"
tableName: events_clean
metricQuery:
  exploreName: events_clean
  dimensions: []
  metrics: [events_clean_page_views]
  filters: {}
  sorts: []
  limit: 1
  tableCalculations: []
chartConfig:
  type: big_number
`;

const sqlChartYaml = (slug: string) => `
contentType: sql_chart
version: 1
slug: ${slug}
spaceSlug: kontala
name: "${slug}"
description: null
sql: "SELECT 1 AS n"
limit: 500
chartKind: table
config:
  type: table
  metadata: { version: 1 }
  columns: {}
`;

const dashboardYaml = (tileChartSlug: string) => `
contentType: dashboard
version: 1
slug: overview
spaceSlug: kontala
name: "Overview"
tabs: []
tiles:
  - type: saved_chart
    x: 0
    y: 0
    w: 18
    h: 6
    properties:
      title: "A tile"
      chartSlug: ${tileChartSlug}
`;

const upserts = (models: Models) => ({
    charts: models.coderService.upsertChart.mock.calls,
    sqlCharts: models.coderService.upsertSqlChart.mock.calls,
    dashboards: models.coderService.upsertDashboard.mock.calls,
});

const wroteNothing = (models: Models) => {
    expect(models.coderService.upsertChart).not.toHaveBeenCalled();
    expect(models.coderService.upsertSqlChart).not.toHaveBeenCalled();
    expect(models.coderService.upsertDashboard).not.toHaveBeenCalled();
};

describe('kontala content', () => {
    it('publishes SQL charts, then charts, then dashboards', async () => {
        const models = buildModels();
        const port = start(models, configWith());
        const order: string[] = [];
        models.coderService.upsertSqlChart.mockImplementation(async () => {
            order.push('sql');
            return {};
        });
        models.coderService.upsertChart.mockImplementation(async () => {
            order.push('chart');
            return {};
        });
        models.coderService.upsertDashboard.mockImplementation(async () => {
            order.push('dashboard');
            return {};
        });

        // Posted worst-case: the dashboard first, the SQL chart last.
        const res = await publish(port, {
            files: [
                {
                    path: 'lightdash/dashboards/overview.yml',
                    content: dashboardYaml('kpi-sessions'),
                },
                {
                    path: 'lightdash/charts/kpi-sessions.yml',
                    content: chartYaml('kpi-sessions'),
                },
                {
                    path: 'lightdash/sql_charts/dau.yml',
                    content: sqlChartYaml('dau'),
                },
            ],
        });

        expect(res.status).toBe(200);
        // ⚠ THE WHOLE POINT. A dashboard written before its charts is saved
        // with empty tiles and a warning, never an error, so nothing downstream
        // would report this going wrong.
        expect(order).toEqual(['sql', 'chart', 'dashboard']);
        const { results } = JSON.parse(res.body);
        expect(results.written.map((w: { slug: string }) => w.slug)).toEqual([
            'dau',
            'kpi-sessions',
            'overview',
        ]);
    });

    it('runs the upserts as an admin that holds no membership', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await publish(port, {
            files: [{ path: 'c.yml', content: chartYaml('kpi-sessions') }],
        });

        const [actor] = upserts(models).charts[0];
        expect(actor.role).toBe(OrganizationMemberRole.ADMIN);
        expect(actor.organizationUuid).toBe(ORG);
        expect(actor.ability.can('manage', 'ContentAsCode')).toBe(true);
        // The ability is built in memory. Nothing may have written it down.
        expect(
            models.organizationMemberProfileModel
                .createOrganizationMembershipByUuid,
        ).not.toHaveBeenCalled();
        expect(
            models.organizationMemberProfileModel.updateOrganizationMember,
        ).not.toHaveBeenCalled();
    });

    it('creates the space so every project member can see it', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await publish(port, {
            files: [{ path: 'c.yml', content: chartYaml('kpi-sessions') }],
            spaceNames: { kontala: 'Kontala' },
        });

        const [, , , , options] = upserts(models).charts[0];
        // Without publicSpaceCreate a new space is private to its creator, and
        // its creator is an account nobody can sign in as.
        expect(options.publicSpaceCreate).toBe(true);
        expect(options.spaceNames).toEqual({ kontala: 'Kontala' });
        expect(options.filePath).toBe('c.yml');
    });

    it('reports a tile whose chart is not in the payload', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await publish(port, {
            files: [
                {
                    path: 'd.yml',
                    content: dashboardYaml('a-chart-nobody-sent'),
                },
            ],
        });

        expect(res.status).toBe(200);
        const { results } = JSON.parse(res.body);
        expect(results.warnings.join(' ')).toContain('a-chart-nobody-sent');
    });

    it('refuses a malformed document before writing anything', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await publish(port, {
            files: [
                { path: 'good.yml', content: chartYaml('kpi-sessions') },
                {
                    path: 'bad.yml',
                    content: 'contentType: chart\nversion: 1\n',
                },
            ],
        });

        expect(res.status).toBe(400);
        // The good document came first in the payload and must still not have
        // been written: parse-all-then-write is the only atomicity this
        // endpoint can offer, and it is worthless if it is partial.
        wroteNothing(models);
    });

    it.each([
        [
            'an unsupported content type',
            'contentType: homepage\nversion: 1\nslug: x\nspaceSlug: kontala\n',
        ],
        [
            'a slug with a capital letter',
            'contentType: chart\nversion: 1\nslug: Overview\nspaceSlug: kontala\n',
        ],
        [
            'a missing spaceSlug',
            'contentType: chart\nversion: 1\nslug: overview\n',
        ],
        [
            'a future version',
            'contentType: chart\nversion: 2\nslug: overview\nspaceSlug: kontala\n',
        ],
        ['invalid YAML', 'contentType: chart\n  : ]['],
    ])('refuses %s', async (_name, content) => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await publish(port, {
            files: [{ path: 'x.yml', content }],
        });

        expect(res.status).toBe(400);
        wroteNothing(models);
    });

    it('refuses two documents of one kind sharing a slug', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await publish(port, {
            files: [
                { path: 'a.yml', content: chartYaml('kpi-sessions') },
                { path: 'b.yml', content: chartYaml('kpi-sessions', 'shared') },
            ],
        });

        expect(res.status).toBe(400);
        wroteNothing(models);
    });

    it('is closed to a bad secret and absent when unconfigured', async () => {
        const models = buildModels();
        const port = start(models, configWith());
        const bad = await publish(
            port,
            { files: [] },
            {
                [KONTALA_ADMIN_HEADER]: 'not-the-secret',
            },
        );
        expect(bad.status).toBe(401);
        wroteNothing(models);

        const unconfigured = buildModels();
        const closedPort = start(unconfigured, configWith({ adminSecret: '' }));
        const off = await publish(closedPort, {
            files: [{ path: 'c.yml', content: chartYaml('kpi-sessions') }],
        });
        expect(off.status).toBe(404);
        wroteNothing(unconfigured);
    });
});
