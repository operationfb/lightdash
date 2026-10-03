import {
    BigqueryAuthenticationType,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import {
    AuthClient,
    GoogleAuth,
    Impersonated,
    type gaxios,
} from 'google-auth-library';

// The scope @google-cloud/bigquery asks for itself, so acting as another
// account changes who runs a query and nothing about what its token may do.
export const BIGQUERY_SCOPE = 'https://www.googleapis.com/auth/bigquery';

// What the connection's own credentials need to call the IAM Credentials API.
export const CLOUD_PLATFORM_SCOPE =
    'https://www.googleapis.com/auth/cloud-platform';

// generateAccessToken's default, and its maximum unless an organisation policy
// extends it. The client mints the next token itself before this one expires.
const TOKEN_LIFETIME_SECONDS = 3600;

/**
 * The connection's own credentials as an AuthClient, found on first use.
 *
 * Impersonated needs its source as an AuthClient when it is constructed, but
 * GoogleAuth finds application default credentials only asynchronously, and
 * the warehouse client is made in a constructor. GoogleAuth caches what it
 * finds, so the credentials are looked for once.
 */
export class LazySourceClient extends AuthClient {
    private readonly auth: GoogleAuth;

    constructor(auth: GoogleAuth) {
        super();
        this.auth = auth;
    }

    async getAccessToken() {
        const client = await this.auth.getClient();
        return client.getAccessToken();
    }

    async getRequestHeaders(url?: string | URL) {
        const client = await this.auth.getClient();
        return client.getRequestHeaders(url);
    }

    async request<T>(options: gaxios.GaxiosOptions): gaxios.GaxiosPromise<T> {
        const client = await this.auth.getClient();
        return client.request<T>(options);
    }
}

/**
 * The client a connection naming `impersonateServiceAccount` queries with:
 * that account, acting through the credentials the connection would
 * otherwise query with, application default credentials or its keyfile.
 * Undefined when the connection names no account.
 *
 * The connection's own identity then needs only
 * iam.serviceAccounts.getAccessToken on the account, which
 * roles/iam.serviceAccountTokenCreator carries, and nothing in the warehouse:
 * what the account may read is what the connection can read.
 */
export const getBigqueryImpersonatedClient = (
    credentials: CreateBigqueryCredentials,
): Impersonated | undefined => {
    const targetPrincipal = credentials.impersonateServiceAccount?.trim();
    if (!targetPrincipal) {
        return undefined;
    }
    const source = new GoogleAuth({
        scopes: [CLOUD_PLATFORM_SCOPE],
        ...(credentials.authenticationType === BigqueryAuthenticationType.ADC
            ? {}
            : { credentials: credentials.keyfileContents }),
    });
    return new Impersonated({
        sourceClient: new LazySourceClient(source),
        targetPrincipal,
        targetScopes: [BIGQUERY_SCOPE],
        lifetime: TOKEN_LIFETIME_SECONDS,
    });
};
