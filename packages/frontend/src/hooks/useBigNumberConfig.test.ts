import {
    ComparisonFormatTypes,
    FieldType,
    MetricType,
    type ItemsMap,
    type Metric,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getBigNumberComparison } from './useBigNumberConfig';

const metric = (name: string, type = MetricType.NUMBER): ItemsMap[string] =>
    ({
        table: 'trends',
        tableLabel: 'Trends',
        name,
        label: name,
        fieldType: FieldType.METRIC,
        type,
        sql: '${TABLE}.value',
        hidden: false,
    }) as Metric;

const visits = metric('visits');
const visitsEarlier = metric('visits_7d_earlier');

const compare = (
    value: unknown,
    comparisonValue: unknown,
    format = ComparisonFormatTypes.PERCENTAGE,
) =>
    getBigNumberComparison({
        item: visits,
        comparisonItem: visitsEarlier,
        value,
        comparisonValue,
        format,
    });

describe('getBigNumberComparison', () => {
    it('compares a value with its comparison as a percentage', () => {
        expect(compare(12, 10)).toEqual({
            value: 0.2,
            format: ComparisonFormatTypes.PERCENTAGE,
        });
        expect(compare(8, 10, ComparisonFormatTypes.RAW)).toEqual({
            value: -2,
            format: ComparisonFormatTypes.RAW,
        });
    });

    it('has nothing to compare with when the comparison field is empty', () => {
        // Number(null) is 0, so this read as +∞% before.
        expect(compare(120, null)).toEqual({
            value: 'undefined',
            format: ComparisonFormatTypes.PERCENTAGE,
        });
        // No next row to compare with, as a row-based comparison finds.
        expect(compare(120, undefined).value).toBe('undefined');
    });

    it('never reads an empty value as zero', () => {
        expect(compare(null, 10).value).toBe('n/a');
    });

    it('compares against zero by the difference, which a percentage cannot say', () => {
        // 0 against 0 read as NaN, and 5 against 0 as +∞%.
        expect(compare(0, 0)).toEqual({
            value: 0,
            format: ComparisonFormatTypes.RAW,
        });
        expect(compare(5, 0)).toEqual({
            value: 5,
            format: ComparisonFormatTypes.RAW,
        });
        expect(compare(-3, '0')).toEqual({
            value: -3,
            format: ComparisonFormatTypes.RAW,
        });
    });

    it('compares nothing that is no number', () => {
        expect(
            getBigNumberComparison({
                item: metric('channel', MetricType.STRING),
                comparisonItem: visitsEarlier,
                value: 'Email',
                comparisonValue: 10,
                format: ComparisonFormatTypes.PERCENTAGE,
            }).value,
        ).toBe('n/a');
    });
});
