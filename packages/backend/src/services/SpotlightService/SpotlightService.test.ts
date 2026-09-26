import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    SpotlightTableColumns,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SpotlightTableConfigModel } from '../../models/SpotlightTableConfigModel';
import { SpotlightService } from './SpotlightService';

const projectUuid = 'test-project-uuid';

const accountWith = (ability: Ability<PossibleAbilities>) =>
    fromSession({ ...defaultSessionUser, ability }, 'session-cookie');

describe('SpotlightService.getSpotlightTableConfig', () => {
    const getSpotlightTableConfig = vi.fn();
    const service = new SpotlightService({
        lightdashConfig: lightdashConfigMock,
        spotlightTableConfigModel: {
            getSpotlightTableConfig,
        } as unknown as SpotlightTableConfigModel,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: defaultSessionUser.organizationUuid,
                name: 'Test project',
            }),
        } as unknown as ProjectModel,
    });
    const viewer = accountWith(
        new Ability<PossibleAbilities>([
            { subject: 'SpotlightTableConfig', action: 'view' },
        ]),
    );

    beforeEach(() => {
        getSpotlightTableConfig.mockReset();
    });

    it('answers an empty column config when the project has none saved', async () => {
        getSpotlightTableConfig.mockResolvedValue(undefined);

        await expect(
            service.getSpotlightTableConfig(viewer, projectUuid),
        ).resolves.toEqual({ columnConfig: [] });
    });

    it('answers the saved column config', async () => {
        const columnConfig = [
            { column: SpotlightTableColumns.OWNER, isVisible: true },
            { column: SpotlightTableColumns.METRIC, isVisible: true },
        ];
        getSpotlightTableConfig.mockResolvedValue({
            spotlightTableConfigUuid: 'test-config-uuid',
            projectUuid,
            columnConfig,
        });

        await expect(
            service.getSpotlightTableConfig(viewer, projectUuid),
        ).resolves.toEqual({ columnConfig });
    });

    it('refuses a caller who cannot view the config', async () => {
        await expect(
            service.getSpotlightTableConfig(
                accountWith(new Ability<PossibleAbilities>([])),
                projectUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getSpotlightTableConfig).not.toHaveBeenCalled();
    });
});
