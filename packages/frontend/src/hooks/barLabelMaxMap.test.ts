import { type ResultRow } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getBarLabelMaxMap } from './barLabelMaxMap';

const toRows = (...rows: Array<Record<string, string>>): ResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([columnId, formatted]) => [
                columnId,
                { value: { raw: formatted, formatted } },
            ]),
        ),
    );

describe('getBarLabelMaxMap', () => {
    it('keeps the longest label of each column', () => {
        expect(
            getBarLabelMaxMap(
                toRows(
                    { margin: '82', revenue: '1,700' },
                    { margin: '125.64', revenue: '998' },
                ),
            ),
        ).toEqual({ margin: '125.64', revenue: '1,700' });
    });

    it('prefers the label with more digits among labels of equal length', () => {
        // With tabular figures a minus sign is narrower than a digit
        expect(getBarLabelMaxMap(toRows({ a: '-20' }, { a: '100' }))).toEqual({
            a: '100',
        });
        expect(getBarLabelMaxMap(toRows({ a: '100' }, { a: '-20' }))).toEqual({
            a: '100',
        });
    });

    it('reserves nothing for a column whose labels are empty', () => {
        expect(getBarLabelMaxMap(toRows({ a: '' }))).toEqual({});
    });
});
