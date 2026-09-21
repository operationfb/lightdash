import { Knex } from 'knex';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { PasswordResetLinkModel } from './PasswordResetLinkModel';

const code = 'test-reset-code';

const createModel = (lightdashConfig: typeof lightdashConfigMock) =>
    new PasswordResetLinkModel({
        database: vi.fn() as unknown as Knex,
        lightdashConfig,
    });

// KONTALA: the reset link is emailed, so a leading slash resolved against the
// origin would send the user to whatever else lives there rather than to this
// instance. See config/siteUrl.ts.
describe('PasswordResetLinkModel', () => {
    describe('transformCodeToUrl', () => {
        it('keeps the link inside the base path this instance is under', () => {
            const model = createModel({
                ...lightdashConfigMock,
                siteUrl: 'https://konta.la/analytics',
                basePath: '/analytics',
            });

            expect(model.transformCodeToUrl(code)).toBe(
                `https://konta.la/analytics/reset-password/${code}`,
            );
        });

        it('changes nothing for an instance at the origin root', () => {
            const model = createModel(lightdashConfigMock);

            expect(model.transformCodeToUrl(code)).toBe(
                `${lightdashConfigMock.siteUrl}/reset-password/${code}`,
            );
        });
    });
});
