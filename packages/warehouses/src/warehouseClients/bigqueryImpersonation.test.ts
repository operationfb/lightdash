import {
    BigqueryAuthenticationType,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import { GoogleAuth, Impersonated, type AuthClient } from 'google-auth-library';
import type { MockInstance } from 'vitest';
import {
    BIGQUERY_SCOPE,
    CLOUD_PLATFORM_SCOPE,
    getBigqueryImpersonatedClient,
    LazySourceClient,
} from './bigqueryImpersonation';
import { credentials } from './BigqueryWarehouseClient.mock';

const ACCOUNT = 'kt-acme@kontala-byo-eu.iam.gserviceaccount.com';

const adc: CreateBigqueryCredentials = {
    ...credentials,
    authenticationType: BigqueryAuthenticationType.ADC,
    keyfileContents: {},
    impersonateServiceAccount: ACCOUNT,
};

// The credentials the connection holds, as GoogleAuth would find them: a
// token of their own, and the one request Impersonated makes with them.
const sourceClient = (
    request: (options: unknown) => Promise<unknown> = async () => ({
        data: {
            accessToken: 'as the account',
            expireTime: new Date(Date.now() + 3600_000).toISOString(),
        },
    }),
) => ({
    getAccessToken: vi.fn(async () => ({ token: 'the connection itself' })),
    getRequestHeaders: vi.fn(),
    request: vi.fn(request),
});

describe('getBigqueryImpersonatedClient', () => {
    let getClient: MockInstance<GoogleAuth['getClient']>;
    let sources: GoogleAuth[];

    beforeEach(() => {
        sources = [];
    });

    afterEach(() => {
        getClient?.mockRestore();
    });

    const resolveSourceTo = (client: ReturnType<typeof sourceClient>) => {
        getClient = vi
            .spyOn(GoogleAuth.prototype, 'getClient')
            .mockImplementation(async function resolveSource(this: GoogleAuth) {
                sources.push(this);
                return client as unknown as AuthClient;
            });
    };

    it('impersonates nobody when the connection names no account', () => {
        expect(getBigqueryImpersonatedClient(credentials)).toBeUndefined();
        for (const impersonateServiceAccount of ['', '  ']) {
            expect(
                getBigqueryImpersonatedClient({
                    ...adc,
                    impersonateServiceAccount,
                }),
            ).toBeUndefined();
        }
    });

    it('asks for a BigQuery token as the account, through application default credentials', async () => {
        const source = sourceClient();
        resolveSourceTo(source);

        const client = getBigqueryImpersonatedClient({
            ...adc,
            impersonateServiceAccount: ` ${ACCOUNT} `,
        });

        expect(client).toBeInstanceOf(Impersonated);
        expect(client?.getTargetPrincipal()).toBe(ACCOUNT);
        // Nothing is looked for until the first query needs a token.
        expect(getClient).not.toHaveBeenCalled();

        await expect(client?.getAccessToken()).resolves.toMatchObject({
            token: 'as the account',
        });
        expect(source.request).toHaveBeenCalledTimes(1);
        expect(source.request).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${ACCOUNT}:generateAccessToken`,
                data: {
                    delegates: [],
                    scope: [BIGQUERY_SCOPE],
                    lifetime: '3600s',
                },
            }),
        );
        // Application default credentials: no credentials of the
        // connection's own, scoped to call the IAM Credentials API.
        expect(sources[0].jsonContent).toBeNull();
        expect((sources[0] as unknown as { scopes: unknown }).scopes).toEqual([
            CLOUD_PLATFORM_SCOPE,
        ]);

        // The token is kept until it is close to expiring.
        await client?.getAccessToken();
        expect(source.request).toHaveBeenCalledTimes(1);
    });

    it("acts through the connection's keyfile when it has one", async () => {
        const source = sourceClient();
        resolveSourceTo(source);

        const keyfileContents = {
            type: 'service_account',
            client_email: 'lightdash@example.iam.gserviceaccount.com',
            private_key: 'the connection key',
        };
        const client = getBigqueryImpersonatedClient({
            ...credentials,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            keyfileContents,
            impersonateServiceAccount: ACCOUNT,
        });
        await client?.getAccessToken();

        expect(sources[0].jsonContent).toEqual(keyfileContents);
    });

    it('says the connection may not act as the account when IAM refuses', async () => {
        resolveSourceTo(
            sourceClient(async () => {
                throw new Error(
                    "Permission 'iam.serviceAccounts.getAccessToken' denied",
                );
            }),
        );

        await expect(
            getBigqueryImpersonatedClient(adc)?.getAccessToken(),
        ).rejects.toThrow(
            /unable to impersonate.*iam\.serviceAccounts\.getAccessToken/,
        );
    });

    it('hands every call to the credentials GoogleAuth finds', async () => {
        const source = sourceClient();
        resolveSourceTo(source);
        const lazy = new LazySourceClient(new GoogleAuth());

        await lazy.getAccessToken();
        await lazy.getRequestHeaders('https://bigquery.googleapis.com');
        await lazy.request({ url: 'https://iamcredentials.googleapis.com' });

        expect(source.getAccessToken).toHaveBeenCalledTimes(1);
        expect(getClient).toHaveBeenCalledTimes(3);
        expect(source.getRequestHeaders).toHaveBeenCalledWith(
            'https://bigquery.googleapis.com',
        );
        expect(source.request).toHaveBeenCalledWith({
            url: 'https://iamcredentials.googleapis.com',
        });
    });
});
