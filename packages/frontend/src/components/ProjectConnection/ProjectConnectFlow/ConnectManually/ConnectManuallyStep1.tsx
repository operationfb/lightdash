import { type WarehouseTypes } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import CodeBlock from '../../../common/CodeBlock/CodeBlock';
import MantineIcon from '../../../common/MantineIcon';
import { ProjectCreationCard } from '../../../common/Settings/SettingsCard';
import { OnboardingConnectTitle } from '../common/OnboardingTitle';
import OnboardingWrapper from '../common/OnboardingWrapper';

const codeBlock = String.raw`
models:
  - name: my_model
    columns:
      - name: my_column_1
      - name: my_column_2
`;

interface ConnectManuallyStep1Props {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onForward: () => void;
    selectedWarehouse: WarehouseTypes;
}

const ConnectManuallyStep1: FC<ConnectManuallyStep1Props> = ({
    isCreatingFirstProject,
    onBack,
    onForward,
    selectedWarehouse,
}) => {
    const { track } = useTracking();

    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftSection={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                Back
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text c="dimmed">
                        We strongly recommend that you define columns in your
                        .yml to see a table in Kontala Analytics. eg:
                    </Text>

                    <CodeBlock
                        code={codeBlock}
                        language="yaml"
                        ta="left"
                        withCopyButton={false}
                    />

                    <Stack gap="xs">
                        <Button
                            onClick={() => {
                                track({
                                    name: EventName.CREATE_PROJECT_COLUMNS_DEFINED_BUTTON_CLICKED,
                                    properties: {
                                        warehouse: selectedWarehouse,
                                    },
                                });
                                onForward();
                            }}
                        >
                            I’ve defined them!
                        </Button>
                    </Stack>
                </Stack>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};

export default ConnectManuallyStep1;
