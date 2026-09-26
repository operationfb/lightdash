import { type SessionUser } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { GithubAppInstallationTableName } from '../../database/entities/githubAppInstallation';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { PullRequestsModel } from '../../models/PullRequestsModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { GithubAppService } from '../GithubAppService/GithubAppService';
import { user } from '../ProjectService/ProjectService.mock';
import { GitIntegrationService } from './GitIntegrationService';

const orgUser: SessionUser = {
    ...user,
    organizationUuid: 'organization-uuid',
    organizationName: 'Organization',
    organizationCreatedAt: new Date(),
};

describe('GitIntegrationService.getConfiguration', () => {
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as ProjectModel,
        projectDbtSourcesModel: {} as ProjectDbtSourcesModel,
        pullRequestsModel: {} as PullRequestsModel,
        savedChartModel: {} as SavedChartModel,
        spaceModel: {} as SpaceModel,
        githubAppInstallationsModel: new GithubAppInstallationsModel({
            database: knex({ client: MockClient, dialect: 'pg' }),
            encryptionUtil,
        }),
        githubAppService: {} as GithubAppService,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('answers disabled when the organization has no installation', async () => {
        tracker.on.select(GithubAppInstallationTableName).response([]);

        await expect(service.getConfiguration(orgUser)).resolves.toEqual({
            enabled: false,
            installationId: undefined,
        });
    });

    it('answers the installation when the organization has one', async () => {
        tracker.on.select(GithubAppInstallationTableName).response([
            {
                organization_uuid: orgUser.organizationUuid,
                encrypted_installation_id: encryptionUtil.encrypt('4242'),
            },
        ]);

        await expect(service.getConfiguration(orgUser)).resolves.toEqual({
            enabled: true,
            installationId: '4242',
        });
        expect(tracker.history.select[0].bindings).toContain(
            orgUser.organizationUuid,
        );
    });
});
