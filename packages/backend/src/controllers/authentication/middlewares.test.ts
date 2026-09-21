import express, {
    type NextFunction,
    type Request,
    type Response,
} from 'express';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import passport from 'passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { errorHandler } from '../../errors';
import { sessionUser } from '../../services/UserService.mock';
import { allowApiKeyAuthentication } from './middlewares';

vi.mock('../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                pat: { ...lightdashConfigMock.auth.pat, enabled: true },
            },
        },
    };
});

vi.mock('../../logging/logger', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

// Isolates the PAT branch: the service-account step declines and hands over.
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: (
        _req: Request,
        _res: Response,
        next: NextFunction,
    ) => next(),
}));

const VALID_TOKEN = 'valid-personal-access-token';

type Answer = { status: number; contentType: string; body: string };

const get = async (authorization?: string): Promise<Answer> => {
    passport.use(
        'headerapikey',
        new HeaderAPIKeyStrategy(
            { header: 'Authorization', prefix: 'ApiKey ' },
            false,
            (token, done) => {
                if (token === VALID_TOKEN) {
                    done(null, sessionUser);
                    return;
                }
                done(null, false);
            },
        ),
    );

    const app = express();
    app.use(passport.initialize());
    app.use((req, _res, next) => {
        req.services = {
            getOauthService: () => ({
                authenticate: () =>
                    Promise.reject(new Error('not an oauth token')),
            }),
        } as unknown as Express.Request['services'];
        next();
    });
    app.get('/api/v1/org', allowApiKeyAuthentication, (req, res) => {
        res.json({
            status: 'ok',
            results: { userUuid: req.user?.userUuid ?? null },
        });
    });
    app.use(
        (error: Error, _req: Request, res: Response, _next: NextFunction) => {
            const response = errorHandler(error);
            res.status(response.statusCode).send({
                status: 'error',
                error: response,
            });
        },
    );

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        return await new Promise<Answer>((resolve, reject) => {
            const request = httpRequest(
                {
                    host: '127.0.0.1',
                    port: (server.address() as AddressInfo).port,
                    path: '/api/v1/org',
                    method: 'GET',
                    headers: authorization ? { authorization } : {},
                },
                (response) => {
                    let body = '';
                    response.setEncoding('utf8');
                    response.on('data', (chunk: string) => {
                        body += chunk;
                    });
                    response.on('end', () =>
                        resolve({
                            status: response.statusCode ?? 0,
                            contentType: response.headers['content-type'] ?? '',
                            body,
                        }),
                    );
                },
            );
            request.on('error', reject);
            request.end();
        });
    } finally {
        server.close();
    }
};

// Passport's default failure handling ends the response with a bare
// `Unauthorized` body. Every Lightdash client parses the error envelope, and
// treats anything else as a sign the request never reached Lightdash.
describe('allowApiKeyAuthentication', () => {
    it('rejects an anonymous request with the error envelope', async () => {
        const answer = await get();

        expect(answer.status).toBe(401);
        expect(answer.contentType).toContain('application/json');
        expect(JSON.parse(answer.body)).toMatchObject({
            status: 'error',
            error: { statusCode: 401, name: 'AuthorizationError' },
        });
    });

    it('rejects an unrecognised token with the error envelope', async () => {
        const answer = await get('ApiKey not-a-real-token');

        expect(answer.status).toBe(401);
        expect(JSON.parse(answer.body)).toMatchObject({
            status: 'error',
            error: { statusCode: 401, name: 'AuthorizationError' },
        });
    });

    it('never answers with a body that is not the envelope', async () => {
        const answer = await get();

        expect(answer.body).not.toBe('Unauthorized');
    });

    it('authenticates a valid token and populates req.user', async () => {
        const answer = await get(`ApiKey ${VALID_TOKEN}`);

        expect(answer.status).toBe(200);
        expect(JSON.parse(answer.body)).toEqual({
            status: 'ok',
            results: { userUuid: sessionUser.userUuid },
        });
    });
});
