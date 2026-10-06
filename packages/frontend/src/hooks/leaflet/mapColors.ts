import { type MapChart } from '@lightdash/common';
import Color from 'colorjs.io';
import { getThemeColors, type ColorScheme } from '../../theme/colors';
import {
    isLightColor,
    transformColorStopsForDarkMode,
} from '../../utils/colorUtils';

/**
 * KONTALA: the colours a map is drawn in for one colour scheme.
 *
 * Leaflet writes a shape's colours as SVG attributes, where a CSS variable
 * does not resolve, so a map cannot follow the theme the way the rest of the
 * page does and every colour here is a value, chosen per scheme.
 */
export type MapColors = {
    colorRange: string[];
    noDataColor: string;
    borderColor: string;
    noDataBorderColor: string;
    hoverBorderColor: string;
};

export type MapColorConfig = Pick<
    MapChart,
    | 'darkModeColorRange'
    | 'noDataColor'
    | 'darkModeNoDataColor'
    | 'backgroundColor'
> & {
    /** The light scheme's stops, the default ones where the config has none */
    colorRange: string[];
};

const DEFAULT_NO_DATA_COLOR = '#f3f3f3';

/**
 * The surface a map is drawn on: a dashboard tile's, `--ld-color-tile` in
 * theme/cssVariablesResolver.ts, which is #ffffff and #101112.
 */
export const MAP_SURFACE: Record<ColorScheme, string> = {
    light: getThemeColors('light').background[0],
    dark: '#101112',
};

/**
 * The no-data colour on a dark surface where the light one would glare, the
 * dark scheme's border grey (#303034), and the one for a scale whose low end
 * passes for that grey (#55555c, DARK_MODE_COLORS.SUBTLE_GRAY).
 */
const DARK_NO_DATA_COLORS = [
    getThemeColors('dark').ldGray[2],
    getThemeColors('dark').ldGray[4],
];

const areAlike = (a: string, b: string): boolean => {
    try {
        return new Color(a).deltaE(new Color(b), '2000') < 5;
    } catch {
        return false;
    }
};

const isOpaque = (color: string | undefined): color is string => {
    if (!color) return false;
    try {
        return new Color(color).alpha === 1;
    } catch {
        return false;
    }
};

/**
 * The colours a map is drawn in: in light mode the ones it is configured
 * with, in dark mode its dark ones where it has them, and the light ones made
 * to read on a dark surface where it does not.
 *
 * Borders are hairlines in the colour of what the map is drawn on, its
 * background where that is a colour and the surface otherwise, so that
 * countries read as cut apart rather than outlined; a hovered shape is drawn
 * round in the scheme's text colour.
 */
export const getMapColors = (
    config: MapColorConfig,
    colorScheme: ColorScheme,
): MapColors => {
    const background = isOpaque(config.backgroundColor)
        ? config.backgroundColor
        : MAP_SURFACE[colorScheme];
    const borders = {
        borderColor: background,
        noDataBorderColor: background,
        hoverBorderColor: getThemeColors(colorScheme).foreground[0],
    };
    const noDataColor = config.noDataColor ?? DEFAULT_NO_DATA_COLOR;

    if (colorScheme === 'light') {
        return { colorRange: config.colorRange, noDataColor, ...borders };
    }

    const colorRange = config.darkModeColorRange?.length
        ? config.darkModeColorRange
        : transformColorStopsForDarkMode(config.colorRange);
    if (config.darkModeNoDataColor) {
        return {
            colorRange,
            noDataColor: config.darkModeNoDataColor,
            ...borders,
        };
    }
    // Whatever stands in for no data must not pass for the scale's low end.
    const darkNoDataColor = [
        ...(isLightColor(noDataColor) ? [] : [noDataColor]),
        ...DARK_NO_DATA_COLORS,
    ].find((color) => !areAlike(color, colorRange[0]));
    return {
        colorRange,
        noDataColor: darkNoDataColor ?? DARK_NO_DATA_COLORS[0],
        ...borders,
    };
};
