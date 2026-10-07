import { Anchor, Center, Group, Text } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { IconArrowLeft, IconTool } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useUpdateActiveProjectMutation } from '../../hooks/useActiveProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import { formatPreviewExpiry } from './formatPreviewExpiry';
import classes from './PreviewBanner.module.css';

const formatExpirationSuffix = (expiresAt: Date, now: Date): string => {
    const expiresAtDate = new Date(expiresAt);
    const formatted = expiresAtDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    return ` ${formatPreviewExpiry(expiresAtDate, now)} (${formatted}).`;
};

export const PreviewBanner: FC<{
    expiresAt: Date | null;
    upstreamProject: {
        projectUuid: string;
        slug?: string;
        name: string;
    } | null;
}> = ({ expiresAt, upstreamProject }) => {
    const navigate = useNavigate();
    const { mutate: setActiveProject } = useUpdateActiveProjectMutation();

    // KONTALA: re-render each minute so the time left stays true in an open tab
    const [now, setNow] = useState(() => new Date());
    const refreshNow = useCallback(() => setNow(new Date()), []);
    useInterval(refreshNow, 60 * 1000, { autoInvoke: true });

    const handleBackToUpstream = useCallback(() => {
        if (!upstreamProject) return;
        setActiveProject(upstreamProject.projectUuid);
        void navigate(
            `/projects/${getProjectUrlIdentifier(upstreamProject)}/home`,
        );
    }, [navigate, setActiveProject, upstreamProject]);

    return (
        <Center
            id="preview-banner"
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            bg="blue.6"
            className={classes.banner}
            px="md"
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <MantineIcon icon={IconTool} color="white" size="sm" />
                <Text c="white" fw={500} fz="xs" truncate>
                    This is a preview environment. Any changes you make here
                    will not affect production.
                    {expiresAt && formatExpirationSuffix(expiresAt, now)}
                </Text>
                {upstreamProject && (
                    <Anchor
                        component="button"
                        type="button"
                        onClick={handleBackToUpstream}
                        c="white"
                        fz="xs"
                        fw={600}
                        underline="always"
                        className={classes.backLink}
                    >
                        <MantineIcon icon={IconArrowLeft} size="sm" />
                        <Text span fz="xs" fw={600} truncate maw={200}>
                            back to {upstreamProject.name}
                        </Text>
                    </Anchor>
                )}
            </Group>
        </Center>
    );
};
