import { Alert, Code, Stack, Text } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const DbtManifestForm: FC = () => {
    return (
        <Stack>
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
            >
                <Text c="orange">
                    This project was created from a manifest.json file. If you
                    want to keep Kontala Analytics in sync with your dbt
                    project, you need to either change your connection type,
                    setup a GitHub action or, run <Code>lightdash deploy</Code>{' '}
                    from your command line.
                </Text>
            </Alert>
        </Stack>
    );
};

export default DbtManifestForm;
