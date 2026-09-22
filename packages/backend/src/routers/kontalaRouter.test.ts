import express from 'express';
import { request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    DEPLOY_TOKEN_DESCRIPTION,
    deployUserEmail,
    KONTALA_ADMIN_HEADER,
    kontalaRouter,
} from './kontalaRouter';

vi.mock('../logging/logger', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORG = '371c115d-9530-484b-a617-f19dae37ecb9';
const SECRET = 'a-shared-secret';

type Models = {
    userModel: Record<string, ReturnType<typeof vi.fn>>;
    emailModel: Record<string, ReturnType<typeof vi.fn>>;
    organizationMemberProfileModel: Record<string, ReturnType<typeof vi.fn>>;
    personalAccessTokenModel: Record<string, ReturnType<typeof vi.fn>>;
};

const buildModels = (overrides: Partial<Models> = {}): Models => ({
    userModel: {
        findUserByEmail: vi.fn().mockResolvedValue(undefined),
        createPendingUser: vi
            .fn()
            .mockResolvedValue({ userUuid: 'user-uuid-1' }),
        findSessionUserByUUID: vi.fn().mockResolvedValue({ userId: 42 }),
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
    personalAccessTokenModel: {
        deleteAllTokensForUser: vi.fn().mockResolvedValue(undefined),
        create: vi
            .fn()
            .mockResolvedValue({ token: 'ldpat_minted', uuid: 'pat-uuid-1' }),
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
            personalAccessTokenModel: models.personalAccessTokenModel as never,
        }),
    );
    const server = app.listen(0);
    servers.push(server);
    return (server.address() as AddressInfo).port;
};

const post = (
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
                method: 'POST',
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

const configWith = (
    overrides: { adminSecret?: string; patEnabled?: boolean } = {},
) => ({
    ...lightdashConfigMock,
    kontala: { adminSecret: overrides.adminSecret ?? SECRET },
    auth: {
        ...lightdashConfigMock.auth,
        pat: {
            ...lightdashConfigMock.auth.pat,
            enabled: overrides.patEnabled ?? true,
        },
    },
});

describe('kontala deploy tokens', () => {
    it('mints a token for a brand new organization and returns it once', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(res.status).toBe(201);
        expect(JSON.parse(res.body).results.token).toBe('ldpat_minted');
        // The service user is unroutable and scoped to this organization.
        expect(models.userModel.createPendingUser).toHaveBeenCalledWith(
            ORG,
            expect.objectContaining({ email: deployUserEmail(ORG) }),
            true,
            true,
        );
        expect(models.emailModel.verifyUserEmailIfExists).toHaveBeenCalled();
        // Rotation, not accumulation.
        expect(
            models.personalAccessTokenModel.deleteAllTokensForUser,
        ).toHaveBeenCalledWith(42);
        expect(models.personalAccessTokenModel.create).toHaveBeenCalledWith(
            { userId: 42 },
            expect.objectContaining({
                expiresAt: null,
                description: DEPLOY_TOKEN_DESCRIPTION,
            }),
        );
    });

    it('is admin, because no lesser role can deploy a non-preview project', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(models.userModel.createPendingUser).toHaveBeenCalledWith(
            ORG,
            expect.objectContaining({ role: 'admin' }),
            true,
            true,
        );
    });

    it('reuses the service user and repairs a membership that drifted', async () => {
        const models = buildModels();
        models.userModel.findUserByEmail.mockResolvedValue({
            userUuid: 'user-uuid-1',
        });
        models.organizationMemberProfileModel.getOrganizationMemberByUuid.mockResolvedValue(
            { role: 'viewer' },
        );
        const port = start(models, configWith());

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(res.status).toBe(201);
        expect(models.userModel.createPendingUser).not.toHaveBeenCalled();
        expect(
            models.organizationMemberProfileModel.updateOrganizationMember,
        ).toHaveBeenCalledWith(ORG, 'user-uuid-1', { role: 'admin' });
    });

    it('re-attaches a service user whose membership was removed', async () => {
        const models = buildModels();
        models.userModel.findUserByEmail.mockResolvedValue({
            userUuid: 'user-uuid-1',
        });
        const port = start(models, configWith());

        await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(
            models.organizationMemberProfileModel
                .createOrganizationMembershipByUuid,
        ).toHaveBeenCalledWith({
            organizationUuid: ORG,
            userUuid: 'user-uuid-1',
            role: 'admin',
        });
    });

    it('refuses a bad secret, and mints nothing', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: 'wrong' },
        );

        expect(res.status).toBe(401);
        expect(models.personalAccessTokenModel.create).not.toHaveBeenCalled();
    });

    it('is invisible when the integration is not configured', async () => {
        const models = buildModels();
        const port = start(models, configWith({ adminSecret: '' }));

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(res.status).toBe(404);
        expect(models.personalAccessTokenModel.create).not.toHaveBeenCalled();
    });

    it('says so when personal access tokens are disabled instance-wide', async () => {
        const models = buildModels();
        const port = start(models, configWith({ patEnabled: false }));

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            { organizationUuid: ORG },
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(res.status).toBe(409);
        expect(models.personalAccessTokenModel.create).not.toHaveBeenCalled();
    });

    it('requires an organizationUuid', async () => {
        const models = buildModels();
        const port = start(models, configWith());

        const res = await post(
            port,
            '/api/v1/kontala/deploy-tokens',
            {},
            { [KONTALA_ADMIN_HEADER]: SECRET },
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(models.personalAccessTokenModel.create).not.toHaveBeenCalled();
    });
});
