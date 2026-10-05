import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
    type PivotData,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import PivotTable from './index';

// jsdom has no layout to measure, so render every row
vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count }: { count: number }) => {
        const items = Array.from({ length: count }, (_, index) => ({
            index,
            key: index,
            start: index * 36,
            end: (index + 1) * 36,
            size: 36,
            lane: 0,
        }));
        return {
            getVirtualItems: () => items,
            getTotalSize: () => count * 36,
            measureElement: () => {},
        };
    },
}));

const YEAR = 'orders_order_date_year';
const METHOD = 'payments_payment_method';
const REVENUE = 'payments_total_revenue';

const fields: ItemsMap = {
    [YEAR]: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'order_date_year',
        label: 'Order date year',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
    [METHOD]: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'payment_method',
        label: 'Payment method',
        table: 'payments',
        tableLabel: 'Payments',
        sql: '',
        hidden: false,
    },
    [REVENUE]: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total_revenue',
        label: 'Total revenue',
        table: 'payments',
        tableLabel: 'Payments',
        sql: '',
        hidden: false,
    },
};

const years = ['2025', '2024', '2023'];
const methods = ['bank_transfer', 'coupon'];
// Revenue per year (rows) and payment method (pivoted columns)
const revenue = [
    [493.78, 125.64],
    [301.9, 82],
    [10.5, 51],
];

const resultValue = (raw: string | number): ResultValue => ({
    raw,
    formatted: String(raw),
});
const pivotColumnId = (methodIndex: number) =>
    `${METHOD}__${REVENUE}__${methodIndex}`;

const pivotData: PivotData = {
    titleFields: [
        [{ fieldId: METHOD, direction: 'header' }],
        [{ fieldId: YEAR, direction: 'index' }],
    ],
    headerValueTypes: [
        { type: FieldType.DIMENSION, fieldId: METHOD },
        { type: FieldType.METRIC },
    ],
    headerValues: [
        methods.map((method) => ({
            type: 'value' as const,
            fieldId: METHOD,
            value: resultValue(method),
            colSpan: 1,
        })),
        methods.map(() => ({ type: 'label' as const, fieldId: REVENUE })),
    ],
    indexValueTypes: [{ type: FieldType.DIMENSION, fieldId: YEAR }],
    indexValues: years.map((year) => [
        {
            type: 'value' as const,
            fieldId: YEAR,
            value: resultValue(year),
            colSpan: 1,
        },
    ]),
    dataColumnCount: methods.length,
    dataValues: revenue.map((row) => row.map(resultValue)),
    cellsCount: 1 + methods.length,
    rowsCount: years.length,
    pivotConfig: {
        pivotDimensions: [METHOD],
        metricsAsRows: false,
        columnOrder: [METHOD, YEAR, REVENUE],
        hiddenMetricFieldIds: [],
        columnTotals: false,
        rowTotals: false,
    },
    retrofitData: {
        allCombinedData: years.map(
            (year, rowIndex): ResultRow => ({
                [YEAR]: { value: resultValue(year) },
                ...Object.fromEntries(
                    revenue[rowIndex].map((value, methodIndex) => [
                        pivotColumnId(methodIndex),
                        { value: resultValue(value) },
                    ]),
                ),
            }),
        ),
        pivotColumnInfo: [
            {
                fieldId: YEAR,
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            ...methods.map((_, methodIndex) => ({
                fieldId: pivotColumnId(methodIndex),
                baseId: REVENUE,
                underlyingId: undefined,
                columnType: undefined,
            })),
        ],
    },
};

const renderPivotWithBars = () =>
    renderWithProviders(
        <PivotTable
            data={pivotData}
            conditionalFormattings={[]}
            minMaxMap={{ [REVENUE]: { min: 10.5, max: 493.78 } }}
            columnProperties={{ [REVENUE]: { displayStyle: 'bar' } }}
            getField={(fieldId) => fields[fieldId]}
            getFieldLabel={(fieldId) => {
                const field = fields[fieldId];
                return field && 'label' in field ? field.label : undefined;
            }}
            hideRowNumbers
            isMinimal={false}
            enableContextMenu={false}
        />,
    );

// The invisible copies of a label that reserve its width
const getReservedLabels = (text: string) =>
    screen
        .getAllByText(text)
        .filter((element) => element.getAttribute('aria-hidden') === 'true');

describe('PivotTable bars in cells', () => {
    it('reserves each pivot column its widest label in every row', () => {
        const { container } = renderPivotWithBars();

        // One bar per value cell: 3 years x 2 payment methods
        // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
        const bars = container.querySelectorAll(
            'div[style*="border-radius"][style*="background"]',
        );
        expect(bars).toHaveLength(6);

        // Every row of a column reserves the column's widest label, so all
        // three rows keep the same bar track width
        expect(getReservedLabels('493.78')).toHaveLength(3);
        expect(getReservedLabels('125.64')).toHaveLength(3);
        expect(screen.getByText('82')).toBeInTheDocument();
        expect(screen.getByText('51')).toBeInTheDocument();
    });
});
