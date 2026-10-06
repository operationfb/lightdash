import { type ConditionalFormattingColorRange } from '@lightdash/common';
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { DARK_MODE_COLORS } from '../theme';
import {
    isLightColor,
    transformColorStopsForDarkMode,
    transformColorsForDarkMode,
} from './colorUtils';

const lightness = (color: string) => new Color(color).get('lch.l');
const hue = (color: string) => new Color(color).get('lch.h');

// transformColorsForDarkMode as it was before its thresholds were shared with
// the map's transform, which must not have changed what a table shows.
const transformColorsForDarkModeBefore = (
    colorRange: ConditionalFormattingColorRange,
): ConditionalFormattingColorRange => {
    let startColor = colorRange.start;
    let endColor = colorRange.end;
    const startLuminance = new Color(startColor).get('lch.l');
    const endLuminance = new Color(endColor).get('lch.l');
    const isStartLight = startLuminance > 85;
    const isEndLight = endLuminance > 85;
    const isStartDark = startLuminance < 15;
    const isEndDark = endLuminance < 15;
    if (isStartLight && isEndDark) {
        startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        endColor = DARK_MODE_COLORS.CONTRAST_GRAY;
    } else if (isStartDark && isEndLight) {
        startColor = DARK_MODE_COLORS.CONTRAST_GRAY;
        endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
    } else {
        if (isStartLight || isStartDark) {
            startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isEndLight || isEndDark) {
            endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
    }
    return { start: startColor, end: endColor };
};

// Each side of both thresholds (#d4d4d4 is L* 84.9, #d5d5d5 85.3, #252525
// 14.7, #262626 15.2), the ends, and colours a table's range is set to.
const COLORS = [
    '#ffffff',
    '#d5d5d5',
    '#d4d4d4',
    '#262626',
    '#252525',
    '#000000',
    '#228be6',
    '#fa5252',
    '#40c057',
    '#fff3bf',
    '#1864ab',
];

// Mantine's blues 1 to 9, the map's default scale.
const BLUES = ['#d0ebff', '#74c0fc', '#339af0', '#1c7ed6', '#1864ab'];

describe('transformColorsForDarkMode', () => {
    it('gives a table the colours it gave it before', () => {
        COLORS.forEach((start) =>
            COLORS.forEach((end) =>
                expect(transformColorsForDarkMode({ start, end })).toEqual(
                    transformColorsForDarkModeBefore({ start, end }),
                ),
            ),
        );
    });

    it('turns a light-to-dark range into greys that read on a dark surface', () => {
        expect(
            transformColorsForDarkMode({ start: '#ffffff', end: '#000000' }),
        ).toEqual({
            start: DARK_MODE_COLORS.SUBTLE_GRAY,
            end: DARK_MODE_COLORS.CONTRAST_GRAY,
        });
    });
});

describe('transformColorStopsForDarkMode', () => {
    it('mirrors a light-to-dark scale, so its high end stands out most on a dark surface', () => {
        const dark = transformColorStopsForDarkMode(BLUES).map(lightness);

        dark.slice(1).forEach((l, i) => expect(l).toBeGreaterThan(dark[i]));
        // Clear of the dark surface and the dark no-data grey (L* 20).
        expect(dark[0]).toBeGreaterThanOrEqual(29);
        expect(dark[dark.length - 1]).toBeLessThanOrEqual(85.5);
    });

    it('keeps a light-to-dark scale as spread out as it was', () => {
        const light = BLUES.map(lightness);
        const dark = transformColorStopsForDarkMode(BLUES).map(lightness);

        expect(dark[dark.length - 1] - dark[0]).toBeGreaterThan(
            0.95 * (light[0] - light[light.length - 1]),
        );
    });

    it('keeps each stop of a lightness scale its hue', () => {
        const dark = transformColorStopsForDarkMode(BLUES);

        BLUES.forEach((stop, i) =>
            expect(Math.abs(hue(dark[i]) - hue(stop))).toBeLessThan(10),
        );
    });

    it('fits a scale spread wider than a dark surface allows', () => {
        const dark = transformColorStopsForDarkMode([
            '#ffffff',
            '#808080',
            '#000000',
        ]).map(lightness);

        expect(dark[0]).toBeCloseTo(30, 0);
        expect(dark[2]).toBeCloseTo(85, 0);
        expect(dark[1]).toBeGreaterThan(dark[0]);
        expect(dark[1]).toBeLessThan(dark[2]);
    });

    it('mirrors a dark-to-light scale the other way', () => {
        const dark = transformColorStopsForDarkMode([...BLUES].reverse()).map(
            lightness,
        );

        dark.slice(1).forEach((l, i) => expect(l).toBeLessThan(dark[i]));
    });

    it('leaves a scale of hues alone', () => {
        expect(transformColorStopsForDarkMode(['#228be6', '#fa5252'])).toEqual([
            '#228be6',
            '#fa5252',
        ]);
        expect(
            transformColorStopsForDarkMode(['#40c057', '#fab005', '#fa5252']),
        ).toEqual(['#40c057', '#fab005', '#fa5252']);
    });

    it('quietens the light middle of a diverging scale and keeps its ends', () => {
        const [low, middle, high] = transformColorStopsForDarkMode([
            '#2166ac',
            '#f7f7f7',
            '#b2182b',
        ]);

        expect(low).toBe('#2166ac');
        expect(high).toBe('#b2182b');
        expect(lightness(middle)).toBeCloseTo(
            lightness(DARK_MODE_COLORS.SUBTLE_GRAY) +
                100 -
                lightness('#f7f7f7'),
            0,
        );
    });

    it('brightens a dark stop of a scale that is not one of lightness', () => {
        const [, dark] = transformColorStopsForDarkMode([
            '#fa5252',
            '#000000',
            '#fa5252',
        ]);

        expect(lightness(dark)).toBeCloseTo(
            lightness(DARK_MODE_COLORS.CONTRAST_GRAY),
            0,
        );
    });

    it('leaves stops it cannot read as they are', () => {
        expect(
            transformColorStopsForDarkMode(['#ffffff', 'var(--x)', '#000000']),
        ).toEqual(['#ffffff', 'var(--x)', '#000000']);
        expect(transformColorStopsForDarkMode([])).toEqual([]);
        expect(transformColorStopsForDarkMode(['#228be6'])).toEqual([
            '#228be6',
        ]);
    });
});

describe('isLightColor', () => {
    it('reads light by the threshold the transforms use', () => {
        expect(isLightColor('#f3f3f3')).toBe(true);
        expect(isLightColor('#d5d5d5')).toBe(true);
        expect(isLightColor('#d4d4d4')).toBe(false);
        expect(isLightColor('#303034')).toBe(false);
        expect(isLightColor('not a colour')).toBe(false);
    });
});
