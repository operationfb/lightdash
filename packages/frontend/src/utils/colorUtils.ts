import {
    getColorFromRange,
    type ConditionalFormattingColorRange,
} from '@lightdash/common';
import Color from 'colorjs.io';
import { DARK_MODE_COLORS } from '../theme';

export { getColorFromRange };

// KONTALA: the CIE L* (lch.l) above which a colour reads as light, and below
// which as dark, against a dark surface. Shared by the table and map
// transforms below.
const LIGHT_LIGHTNESS = 85;
const DARK_LIGHTNESS = 15;

const lightnessOf = (color: string): number => new Color(color).get('lch.l');
const isLight = (lightness: number) => lightness > LIGHT_LIGHTNESS;
const isDark = (lightness: number) => lightness < DARK_LIGHTNESS;

/**
 * Replaces 'problematic' colors in dark mode for better visibility
 */
export const transformColorsForDarkMode = (
    colorRange: ConditionalFormattingColorRange,
): ConditionalFormattingColorRange => {
    let startColor = colorRange.start;
    let endColor = colorRange.end;

    const startColorLuminance = lightnessOf(startColor);
    const endColorLuminance = lightnessOf(endColor);

    const isStartLight = isLight(startColorLuminance);
    const isEndLight = isLight(endColorLuminance);
    const isStartDark = isDark(startColorLuminance);
    const isEndDark = isDark(endColorLuminance);

    if (isStartLight && isEndDark) {
        // Light-to-dark gradient (e.g., white to black)
        // White (background-like) → closer to background, Black (contrasting) → more visible
        startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        endColor = DARK_MODE_COLORS.CONTRAST_GRAY;
    } else if (isStartDark && isEndLight) {
        // Dark-to-light gradient (e.g., black to white)
        // Black (contrasting) → more visible, White (background-like) → closer to background
        startColor = DARK_MODE_COLORS.CONTRAST_GRAY;
        endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
    } else {
        // Single-end problematic colors
        if (isStartLight) {
            // Very light start color -> visible dark gray (not background)
            startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isStartDark) {
            // Very dark start color -> slightly lighter
            startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isEndLight) {
            // Very light end color -> visible dark gray (not background)
            endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isEndDark) {
            // Very dark end color -> slightly lighter
            endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
    }

    return { start: startColor, end: endColor };
};

// KONTALA: the L* range a lightness scale of a map's stops is laid out in on a
// dark surface. Its quietest stop sits at the floor, clear of a dashboard tile
// (#101112, L* 5) and of a map's dark no-data colour (#303034, L* 20); its
// loudest at no more than what still reads as a colour rather than a glare.
const SEQUENTIAL_FLOOR = 30;
const SEQUENTIAL_CEILING = LIGHT_LIGHTNESS;
// The least L* a run of stops must climb or fall by to be a lightness scale
// rather than one of hues: blue to red, the default, moves by 4.
const SEQUENTIAL_SPREAD = 20;
// Where a stop too light or too dark for a dark surface goes: white to the
// lightness of the grey a table's light end takes, black to its dark end's.
const SUBTLE_LIGHTNESS = lightnessOf(DARK_MODE_COLORS.SUBTLE_GRAY);
const CONTRAST_LIGHTNESS = lightnessOf(DARK_MODE_COLORS.CONTRAST_GRAY);

const withLightness = (color: string, lightness: number): string => {
    const lch = new Color(color).to('lch');
    lch.l = lightness;
    return lch
        .to('srgb')
        .toGamut()
        .toString({ format: 'hex', collapse: false });
};

/**
 * KONTALA: a map's colour stops for a dark surface, for a map whose config
 * has none of its own (darkModeColorRange).
 *
 * A sequential scale shows more by contrasting more with the surface: on
 * white, its lightest stop says least and its darkest most. Left as it is on a
 * dark surface it says the opposite, so a scale whose stops only climb or only
 * fall in lightness, by SEQUENTIAL_SPREAD or more, has its lightness mirrored.
 * Each stop keeps its hue, and its chroma as far as sRGB allows; the stop that
 * was nearest the light surface is nearest the dark one, and the one that
 * stood out most is the brightest. Laid out from SEQUENTIAL_FLOOR, the stops
 * keep the spread they had, or as much of it as fits under SEQUENTIAL_CEILING,
 * so a light-to-dark ramp does not flatten into a dark one.
 *
 * Any other scale, of hues (the default blue to red) or diverging through a
 * light middle, keeps every stop a dark surface shows as it is. A stop too
 * light for one takes SUBTLE_LIGHTNESS plus however far it was from white, so
 * it stays as quiet as it was, and one too dark CONTRAST_LIGHTNESS less
 * however far it was from black, so it stays as loud; each keeps its hue.
 */
export const transformColorStopsForDarkMode = (stops: string[]): string[] => {
    let lightness: number[];
    try {
        lightness = stops.map(lightnessOf);
    } catch {
        // A stop no colour parser reads draws as it would in light mode.
        return stops;
    }
    const lightest = Math.max(...lightness);
    const darkest = Math.min(...lightness);
    const steps = lightness.slice(1).map((l, i) => l - lightness[i]);
    const isSequential =
        lightest - darkest >= SEQUENTIAL_SPREAD &&
        (steps.every((step) => step >= 0) || steps.every((step) => step <= 0));

    if (isSequential) {
        const scale = Math.min(
            1,
            (SEQUENTIAL_CEILING - SEQUENTIAL_FLOOR) / (lightest - darkest),
        );
        return stops.map((stop, i) =>
            withLightness(
                stop,
                SEQUENTIAL_FLOOR + (lightest - lightness[i]) * scale,
            ),
        );
    }

    return stops.map((stop, i) => {
        if (isLight(lightness[i])) {
            return withLightness(stop, SUBTLE_LIGHTNESS + 100 - lightness[i]);
        }
        if (isDark(lightness[i])) {
            return withLightness(stop, CONTRAST_LIGHTNESS - lightness[i]);
        }
        return stop;
    });
};

/**
 * KONTALA: whether a colour reads as light against a dark surface, by the
 * threshold the transforms above use. False where it does not parse.
 */
export const isLightColor = (color: string): boolean => {
    try {
        return isLight(lightnessOf(color));
    } catch {
        return false;
    }
};

/**
 * Interpolates a color from an array of colors based on a normalized value (0-1).
 * Uses piecewise linear interpolation between adjacent color stops.
 */
export const interpolateMultiColor = (colors: string[], t: number): string => {
    if (colors.length === 0) return '#888888';
    if (colors.length === 1) return colors[0];

    // Clamp t to [0, 1]
    const clampedT = Math.max(0, Math.min(1, t));

    // Find which segment we're in
    const segmentCount = colors.length - 1;
    const segmentIndex = Math.min(
        Math.floor(clampedT * segmentCount),
        segmentCount - 1,
    );

    // Get local t within the segment (0-1)
    const segmentStart = segmentIndex / segmentCount;
    const segmentEnd = (segmentIndex + 1) / segmentCount;
    const localT = (clampedT - segmentStart) / (segmentEnd - segmentStart);

    // Interpolate between the two colors in this segment
    const startColor = new Color(colors[segmentIndex]);
    const endColor = new Color(colors[segmentIndex + 1]);
    // Using oklab for perceptually uniform gradients (better for data visualization)
    const range = Color.range(startColor, endColor, { space: 'oklab' });

    return range(localT).toString({ format: 'hex' });
};

/**
 * Creates a color scale function that maps values in a domain to colors.
 * Similar to D3's scaleLinear but uses colorjs.io for interpolation.
 */
export const createMultiColorScale = (
    min: number,
    max: number,
    colors: string[],
): ((value: number) => string) => {
    if (colors.length === 0) return () => '#888888';
    if (colors.length === 1) return () => colors[0];
    if (max === min) return () => colors[Math.floor(colors.length / 2)];

    return (value: number): string => {
        // Clamp value to domain
        const clampedValue = Math.max(min, Math.min(max, value));
        // Normalize to 0-1
        const t = (clampedValue - min) / (max - min);
        return interpolateMultiColor(colors, t);
    };
};
