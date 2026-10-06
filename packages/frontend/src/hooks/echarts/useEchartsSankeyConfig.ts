import {
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    getTooltipStyle,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import {
    format as echartsFormat,
    type EChartsOption,
    type SankeySeriesOption,
} from 'echarts';
import { useCallback, useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { sanitizeEchartsFontFamily } from '../../utils/sanitizeEchartsFontFamily';
import { lastColumnLabels, sankeyNodeData } from '../sankeyTransform';

// ECharts' own label size and gap between a node and its label, which the
// series keeps, and the widest a label grows before an ellipsis shortens it.
const LABEL_FONT_SIZE = 12;
const LABEL_DISTANCE = 5;
const MAX_LABEL_WIDTH = 200;

const useEchartsSankeyConfig = (isInDashboard?: boolean) => {
    const {
        visualizationConfig,
        colorPalette,
        parameters,
        isTouchDevice,
        minimal,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isSankeyVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    // Node names are opaque ids; map them to their display labels.
    const labelByName = useMemo(
        () =>
            new Map(
                (chartConfig?.data.nodes ?? []).map((node) => [
                    node.name,
                    node.label,
                ]),
            ),
        [chartConfig],
    );
    const displayName = useCallback(
        (name: string) => labelByName.get(name) ?? name,
        [labelByName],
    );

    const sankeySeriesOption: SankeySeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const {
            data,
            validConfig: { nodeAlign, orient, colorOverrides },
        } = chartConfig;

        if (data.nodes.length === 0 || data.links.length === 0) return;

        // Generate levels array for per-depth coloring (per spec)
        const levels = Array.from({ length: data.maxDepth + 1 }, (_, i) => ({
            depth: i,
            itemStyle: {
                color: colorPalette[i % colorPalette.length],
            },
            lineStyle: {
                color: 'source' as const,
                opacity: 0.6,
            },
        }));

        const isVertical = (orient ?? 'horizontal') === 'vertical';

        // A horizontal Sankey draws its last column's labels to the right of
        // their nodes, in its right margin, so the margin is as wide as the
        // widest of them, measured as ECharts lays them out: a fixed share of
        // the width cut a label off on a narrow tile and left a wide one an
        // empty strip.
        const labelFont = `${LABEL_FONT_SIZE}px ${
            sanitizeEchartsFontFamily(theme.other.chartFont) ?? 'sans-serif'
        }`;
        const rightLabelWidth = Math.min(
            MAX_LABEL_WIDTH,
            Math.ceil(
                Math.max(
                    0,
                    ...lastColumnLabels(data, nodeAlign ?? 'justify').map(
                        (label) =>
                            echartsFormat.getTextRect(label, labelFont).width,
                    ),
                ),
            ),
        );

        return {
            type: 'sankey',
            layout: 'none',
            nodeAlign: nodeAlign ?? 'justify',
            orient: orient ?? 'horizontal',
            draggable: true,
            emphasis: {
                focus: 'adjacency',
            },
            top: '2%',
            bottom: isVertical ? '14%' : '2%',
            left: '1%',
            right: isVertical ? '1%' : rightLabelWidth + LABEL_DISTANCE + 8,
            nodeGap: 8,
            nodeWidth: 20,
            levels,
            data: sankeyNodeData(data.nodes, colorOverrides),
            links: data.links.map((link) => ({
                source: link.source,
                target: link.target,
                value: link.value,
            })),
            lineStyle: {
                curveness: 0.5,
            },
            label: {
                show: true,
                color: theme.colors.foreground?.[0],
                position: isVertical ? 'bottom' : 'right',
                distance: LABEL_DISTANCE,
                fontSize: LABEL_FONT_SIZE,
                width: MAX_LABEL_WIDTH,
                overflow: 'truncate',
                formatter: (params: { name?: string }) =>
                    displayName(params.name ?? ''),
            },
        };
    }, [
        chartConfig,
        theme.colors.foreground,
        theme.other.chartFont,
        colorPalette,
        displayName,
    ]);

    const eChartsOptions: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !sankeySeriesOption) return;

        // Find the metric field for tooltip formatting
        let metricField: Metric | TableCalculation | undefined;
        if (
            isSankeyVisualizationConfig(visualizationConfig) &&
            visualizationConfig.numericFields
        ) {
            const metricFieldId = chartConfig.metricFieldId;
            if (metricFieldId) {
                metricField = visualizationConfig.numericFields[metricFieldId];
            }
        }

        return {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(theme?.other.chartFont),
            },
            tooltip: {
                ...getTooltipStyle({ appendToBody: !isTouchDevice }),
                trigger: 'item' as const,
                formatter: (params: any) => {
                    if (params.dataType === 'edge') {
                        const formattedValue = formatItemValue(
                            metricField,
                            params.value,
                            false,
                            parameters,
                            resolvedTimezone,
                        );
                        const source = displayName(params.data.source);
                        const target = displayName(params.data.target);
                        const colorIndicator = formatColorIndicator(
                            typeof params.color === 'string'
                                ? params.color
                                : '',
                        );
                        const valuePill = formatTooltipValue(formattedValue);
                        return formatTooltipRow(
                            colorIndicator,
                            `${source} → ${target}`,
                            valuePill,
                        );
                    }
                    const colorIndicator = formatColorIndicator(
                        typeof params.color === 'string' ? params.color : '',
                    );
                    return formatTooltipRow(
                        colorIndicator,
                        displayName(params.name),
                        '',
                    );
                },
            },
            series: [sankeySeriesOption],
            animation: !(isInDashboard || minimal),
        };
    }, [
        chartConfig,
        sankeySeriesOption,
        isInDashboard,
        minimal,
        theme,
        isTouchDevice,
        visualizationConfig,
        parameters,
        resolvedTimezone,
        displayName,
    ]);

    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsSankeyConfig;
