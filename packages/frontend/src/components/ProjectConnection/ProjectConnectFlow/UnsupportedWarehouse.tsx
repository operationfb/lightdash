import { Anchor, Avatar, Button } from '@mantine/core';
import { IconChevronLeft, IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingWrapper from './common/OnboardingWrapper';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
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
                <EmptyState
                    py="unset"
                    icon={
                        <Avatar size="lg" radius="xl">
                            <MantineIcon
                                icon={IconExclamationCircle}
                                size="xxl"
                                strokeWidth={1.5}
                                color="black"
                            />
                        </Avatar>
                    }
                    title={
                        <>
                            We only support warehouses that have{' '}
                            <Anchor
                                href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                verified dbt adapters
                            </Anchor>{' '}
                            for now
                        </>
                    }
                    description={
                        <>
                            <Anchor
                                href="https://www.kontala.com/docs/support/contact-us"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                Contact the Kontala team
                            </Anchor>{' '}
                            to ask about support for your warehouse.
                        </>
                    }
                />
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};
export default UnsupportedWarehouse;
