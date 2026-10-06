import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { getMantineThemeOverride } from '../../theme';
import { getThemeColors } from '../../theme/colors';
import { cssVariablesResolver } from '../../theme/cssVariablesResolver';
import { transformColorStopsForDarkMode } from '../../utils/colorUtils';
import { getMapColors, MAP_SURFACE } from './mapColors';

const BLUES = ['#d0ebff', '#74c0fc', '#339af0', '#1c7ed6', '#1864ab'];

describe('getMapColors', () => {
    it('draws a light map in the colours it is configured with', () => {
        expect(
            getMapColors(
                {
                    colorRange: BLUES,
                    darkModeColorRange: ['#000000', '#ffffff'],
                    noDataColor: '#eeeeee',
                    darkModeNoDataColor: '#111111',
                },
                'light',
            ),
        ).toEqual({
            colorRange: BLUES,
            noDataColor: '#eeeeee',
            borderColor: '#ffffff',
            noDataBorderColor: '#ffffff',
            hoverBorderColor: '#18181b',
        });
    });

    it('gives a light map with no no-data colour the default one', () => {
        expect(getMapColors({ colorRange: BLUES }, 'light').noDataColor).toBe(
            '#f3f3f3',
        );
    });

    it('draws a dark map in its dark colours where it has them', () => {
        expect(
            getMapColors(
                {
                    colorRange: BLUES,
                    darkModeColorRange: ['#1e3a5f', '#a5d8ff'],
                    noDataColor: '#eeeeee',
                    darkModeNoDataColor: '#2a2a2e',
                },
                'dark',
            ),
        ).toEqual({
            colorRange: ['#1e3a5f', '#a5d8ff'],
            noDataColor: '#2a2a2e',
            borderColor: '#101112',
            noDataBorderColor: '#101112',
            hoverBorderColor: '#ececee',
        });
    });

    it('makes the light colours read on a dark surface where it has none', () => {
        const colors = getMapColors({ colorRange: BLUES }, 'dark');

        expect(colors.colorRange).toEqual(
            transformColorStopsForDarkMode(BLUES),
        );
        // #f3f3f3 would glare, so no data is the dark scheme's border grey.
        expect(colors.noDataColor).toBe('#303034');
    });

    it('keeps a dark map a no-data colour that is not light', () => {
        expect(
            getMapColors({ colorRange: BLUES, noDataColor: '#5c5f66' }, 'dark')
                .noDataColor,
        ).toBe('#5c5f66');
    });

    it('never lets no data pass for the low end of the scale', () => {
        [
            ['#303034', '#ff6b6b'],
            ['#5c5f66', '#fa5252'],
            ['#232326', '#303034', '#ffffff'],
        ].forEach((darkModeColorRange) => {
            [undefined, '#f3f3f3', '#5c5f66'].forEach((noDataColor) => {
                const colors = getMapColors(
                    { colorRange: BLUES, darkModeColorRange, noDataColor },
                    'dark',
                );
                expect(
                    new Color(colors.noDataColor).deltaE(
                        new Color(colors.colorRange[0]),
                        '2000',
                    ),
                ).toBeGreaterThanOrEqual(5);
            });
        });
        expect(
            getMapColors(
                { colorRange: BLUES, darkModeColorRange: ['#303034', '#fff'] },
                'dark',
            ).noDataColor,
        ).toBe('#55555c');
    });

    it('lets the configured dark no-data colour be what it is', () => {
        expect(
            getMapColors(
                {
                    colorRange: BLUES,
                    darkModeColorRange: ['#303034', '#ffffff'],
                    darkModeNoDataColor: '#303034',
                },
                'dark',
            ).noDataColor,
        ).toBe('#303034');
    });

    it('draws borders in the surface colour of each scheme', () => {
        (['light', 'dark'] as const).forEach((scheme) => {
            [undefined, 'transparent', '#00000080'].forEach(
                (backgroundColor) => {
                    const colors = getMapColors(
                        { colorRange: BLUES, backgroundColor },
                        scheme,
                    );
                    expect(colors.borderColor).toBe(MAP_SURFACE[scheme]);
                    expect(colors.noDataBorderColor).toBe(MAP_SURFACE[scheme]);
                },
            );
        });
    });

    it('draws borders in the background colour where the map has one', () => {
        (['light', 'dark'] as const).forEach((scheme) => {
            const colors = getMapColors(
                { colorRange: BLUES, backgroundColor: '#e7f5ff' },
                scheme,
            );
            expect(colors.borderColor).toBe('#e7f5ff');
            expect(colors.noDataBorderColor).toBe('#e7f5ff');
        });
    });

    it('draws a hovered region round in the colour of text', () => {
        (['light', 'dark'] as const).forEach((scheme) => {
            expect(
                getMapColors({ colorRange: BLUES }, scheme).hoverBorderColor,
            ).toBe(getThemeColors(scheme).foreground[0]);
        });
    });
});

describe('MAP_SURFACE', () => {
    // Leaflet takes values, not variables, so the map's copy of the dashboard
    // tile's surface is held here to the theme's.
    it('is the dashboard tile surface of each scheme', () => {
        const theme = mergeMantineTheme(
            DEFAULT_THEME,
            getMantineThemeOverride('light'),
        );
        const variables = cssVariablesResolver(theme);

        expect(variables.light['--ld-color-tile']).toBe(
            'var(--mantine-color-background-0)',
        );
        expect(MAP_SURFACE.light).toBe(getThemeColors('light').background[0]);
        expect(variables.dark['--ld-color-tile']).toBe(MAP_SURFACE.dark);
    });
});
