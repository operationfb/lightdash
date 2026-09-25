import { OpenIdIdentityIssuerType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OpenIdIdentityModel } from './OpenIdIdentitiesModel';

describe('OpenIdIdentityModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new OpenIdIdentityModel({ database });
    let tracker: Tracker;

    const identity = {
        issuer: 'https://konta.la/api/v1/oidc',
        issuerType: OpenIdIdentityIssuerType.GENERIC_OIDC,
        subject: 'subject',
        email: 'person@example.com',
    };

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        tracker.on.update('openid_identities').response(0);
    });

    afterEach(() => {
        tracker.reset();
    });

    it('updates an identity in one statement, only when its email changed', async () => {
        await model.updateIdentityByOpenId(identity);

        expect(tracker.history.all).toHaveLength(1);
        const [update] = tracker.history.update;
        expect(update.sql).toBe(
            'update "openid_identities" set "email" = $1 where "issuer" = $2 and "subject" = $3 and (email IS DISTINCT FROM $4)',
        );
        expect(update.bindings).toEqual([
            identity.email,
            identity.issuer,
            identity.subject,
            identity.email,
        ]);
    });

    it('also updates an identity whose given refresh token changed', async () => {
        await model.updateIdentityByOpenId({
            ...identity,
            refreshToken: 'refresh-token',
        });

        const [update] = tracker.history.update;
        expect(update.sql).toBe(
            'update "openid_identities" set "email" = $1, "refresh_token" = $2 where "issuer" = $3 and "subject" = $4 and (email IS DISTINCT FROM $5 or refresh_token IS DISTINCT FROM $6)',
        );
        expect(update.bindings).toEqual([
            identity.email,
            'refresh-token',
            identity.issuer,
            identity.subject,
            identity.email,
            'refresh-token',
        ]);
    });
});
