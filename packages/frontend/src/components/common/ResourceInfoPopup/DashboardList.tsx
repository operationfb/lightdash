import { Anchor, Box, List, Loader, Text } from '@mantine/core';
import { type FC } from 'react';
import { useDashboardsContainingChart } from '../../../hooks/dashboard/useDashboards';
import { toBrowserPath } from '../../../utils/url';

type Props = {
    resourceItemId: string;
    projectUuid: string;
};

export const DashboardList: FC<Props> = ({ resourceItemId, projectUuid }) => {
    const { data: relatedDashboards } = useDashboardsContainingChart(
        projectUuid,
        resourceItemId,
    );
    return (
        <Box>
            {relatedDashboards ? (
                <Text fw={600} fz="xs" c="dimmed">
                    Used in {relatedDashboards?.length ?? 0} dashboard
                    {relatedDashboards?.length === 1 ? '' : 's'}
                    {relatedDashboards && relatedDashboards.length > 0
                        ? ':'
                        : ''}
                </Text>
            ) : (
                <Loader color="gray" size="xs" />
            )}
            {!!relatedDashboards?.length && (
                <List size="xs">
                    {relatedDashboards.map(({ uuid, slug, name }) => (
                        <List.Item key={uuid}>
                            <Anchor
                                // KONTALA: a real anchor, so the router path
                                // needs the base path. See utils/url.ts.
                                href={toBrowserPath(
                                    `/projects/${projectUuid}/dashboards/${slug}/view/`,
                                )}
                                target="_blank"
                                onClick={(
                                    e: React.MouseEvent<HTMLAnchorElement>,
                                ) => e.stopPropagation()}
                                fz="xs"
                            >
                                {name}
                            </Anchor>
                        </List.Item>
                    ))}
                </List>
            )}
        </Box>
    );
};
