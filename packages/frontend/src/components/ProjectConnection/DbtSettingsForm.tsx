import {
    assertUnreachable,
    DbtProjectType,
    DbtProjectTypeLabels,
    WarehouseTypes,
} from '@lightdash/common';
import { TextInput, Stack, Select } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import useApp from '../../providers/App/useApp';
import AzureDevOpsForm from './DbtForms/AzureDevOpsForm';
import BitBucketForm from './DbtForms/BitBucketForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import DbtManifestForm from './DbtForms/DbtManifestForm';
import DbtNoneForm from './DbtForms/DbtNoneForm';
import { dbtDefaults } from './DbtForms/defaultValues';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';
import FormCollapseButton from './FormCollapseButton';
import { useFormContext } from './formContext';
import FormSection from './Inputs/FormSection';
import { MultiKeyValuePairsInput } from './Inputs/MultiKeyValuePairsInput';
import { useProjectFormContext } from './useProjectFormContext';
import WarehouseLocationInputs from './WarehouseLocationInputs';
import WarehouseSchemaInput from './WarehouseSchemaInput';

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: DbtProjectType;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
}) => {
    const form = useFormContext();
    const { isDbtSource, projectUuid } = useProjectFormContext();
    const selectedWarehouse = form.values.warehouse?.type;

    const type: DbtProjectType =
        form.values.dbt.type ?? (defaultType || DbtProjectType.GITHUB);

    const isNative =
        (form.values.dbt.type === DbtProjectType.GITHUB ||
            form.values.dbt.type === DbtProjectType.BITBUCKET) &&
        form.values.dbt.semanticLayer === 'lightdash';

    const warehouseType: WarehouseTypes =
        form.values.warehouse?.type ??
        selectedWarehouse ??
        WarehouseTypes.BIGQUERY;

    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] =
        useState<boolean>(false);
    const toggleAdvancedSettingsOpen = () =>
        setIsAdvancedSettingsOpen((open) => !open);
    const { health } = useApp();
    const options = useMemo(() => {
        // Additional dbt sources are restricted to GitHub for now (the merge is
        // git-only, and the other providers aren't validated end-to-end yet).
        if (isDbtSource) {
            return [
                {
                    value: DbtProjectType.GITHUB,
                    label: DbtProjectTypeLabels[DbtProjectType.GITHUB],
                },
            ];
        }

        const enabledTypes = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
            DbtProjectType.BITBUCKET,
            DbtProjectType.AZURE_DEVOPS,
            DbtProjectType.NONE,
            DbtProjectType.MANIFEST,
            DbtProjectType.DBT_CLOUD_IDE,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(DbtProjectType.DBT);
        }

        return enabledTypes.map((value) => ({
            value,
            label: DbtProjectTypeLabels[value],
        }));
    }, [health, isDbtSource]);

    const DbtForm = useMemo(() => {
        switch (type) {
            case DbtProjectType.DBT:
                return DbtLocalForm;
            case DbtProjectType.DBT_CLOUD_IDE:
                return DbtCloudForm;
            case DbtProjectType.GITHUB:
                return GithubForm;
            case DbtProjectType.GITLAB:
                return GitlabForm;
            case DbtProjectType.BITBUCKET:
                return BitBucketForm;
            case DbtProjectType.AZURE_DEVOPS:
                return AzureDevOpsForm;
            case DbtProjectType.NONE:
                return DbtNoneForm;
            case DbtProjectType.MANIFEST:
                return DbtManifestForm;
            default: {
                return assertUnreachable(
                    type,
                    `Unknown dbt project type ${type}`,
                );
            }
        }
    }, [type]);

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <Stack mt="xs">
                <Select
                    allowDeselect={false}
                    name="dbt.type"
                    {...form.getInputProps('dbt.type')}
                    onChange={(value) => {
                        if (!value) return;
                        const dbtType = value as DbtProjectType;
                        form.getInputProps('dbt.type').onChange(dbtType);
                        form.setValues({
                            dbt: dbtDefaults.formValues[dbtType],
                        });
                    }}
                    defaultValue={DbtProjectType.GITHUB}
                    label="Type"
                    data={options}
                    required
                    disabled={disabled}
                />

                <DbtForm disabled={disabled} />

                {type !== DbtProjectType.NONE && !isNative && (
                    <>
                        <FormSection name="target">
                            <Stack mt="xs">
                                <TextInput
                                    name="dbt.target"
                                    {...form.getInputProps('dbt.target')}
                                    label="Target name"
                                    description={
                                        <p>
                                            The name Kontala Analytics gives the
                                            dbt target it compiles with. Set it
                                            to match the target your dbt code
                                            branches on. It does not change
                                            which database or schema your models
                                            are read from.
                                        </p>
                                    }
                                    disabled={disabled}
                                    placeholder="prod"
                                />
                                {/* A source shares the project's warehouse but
                                not necessarily the same location inside it, so
                                it sets its own here. Hidden on the project form
                                when org warehouse credentials provide it. */}
                                {isDbtSource && projectUuid ? (
                                    <WarehouseLocationInputs
                                        projectUuid={projectUuid}
                                    />
                                ) : null}
                                {isDbtSource ||
                                form.values
                                    .organizationWarehouseCredentialsUuid ? null : (
                                    <WarehouseSchemaInput
                                        warehouseType={warehouseType}
                                        disabled={disabled}
                                    />
                                )}
                            </Stack>
                        </FormSection>
                        <FormSection
                            name="Advanced"
                            isOpen={isAdvancedSettingsOpen}
                        >
                            <Stack mt="xs">
                                {type !== DbtProjectType.DBT_CLOUD_IDE && (
                                    <TextInput
                                        name="dbt.selector"
                                        {...form.getInputProps('dbt.selector')}
                                        label="dbt selector"
                                        description={
                                            <p>
                                                Add dbt selectors to filter out
                                                models from your dbt project.
                                            </p>
                                        }
                                        disabled={disabled}
                                        placeholder="tag:lightdash"
                                    />
                                )}

                                <MultiKeyValuePairsInput
                                    name="dbt.environment"
                                    label="Environment variables"
                                    disabled={disabled}
                                />
                            </Stack>
                        </FormSection>
                        <FormCollapseButton
                            isSectionOpen={isAdvancedSettingsOpen}
                            onClick={toggleAdvancedSettingsOpen}
                        >
                            Advanced configuration options
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </div>
    );
};

export default DbtSettingsForm;
