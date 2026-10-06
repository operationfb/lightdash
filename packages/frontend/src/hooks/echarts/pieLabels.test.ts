import { describe, expect, it } from 'vitest';
import { formatPieOutsideLabel } from './pieLabels';

const slice = { name: 'desktop', percent: 67.04, formattedValue: '1,603' };

describe('formatPieOutsideLabel', () => {
    it('puts the percentage under the name', () => {
        expect(
            formatPieOutsideLabel({
                ...slice,
                showValue: false,
                showPercentage: true,
            }),
        ).toBe('{name|desktop}\n{value|67.04%}');
    });

    it('puts the value under the name', () => {
        expect(
            formatPieOutsideLabel({
                ...slice,
                showValue: true,
                showPercentage: false,
            }),
        ).toBe('{name|desktop}\n{value|1,603}');
    });

    it('puts the percentage and the value together under the name', () => {
        expect(
            formatPieOutsideLabel({
                ...slice,
                showValue: true,
                showPercentage: true,
            }),
        ).toBe('{name|desktop}\n{value|67.04% - 1,603}');
    });

    it('draws the name alone when neither is shown', () => {
        expect(
            formatPieOutsideLabel({
                ...slice,
                showValue: false,
                showPercentage: false,
            }),
        ).toBe('{name|desktop}');
    });
});
