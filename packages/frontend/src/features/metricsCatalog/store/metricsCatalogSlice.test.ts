import {
    DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG,
    SpotlightTableColumns,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    convertStateToTableColumnConfig,
    convertTableColumnConfigToState,
    metricsCatalogSlice,
    setColumnConfig,
} from './metricsCatalogSlice';

const { METRIC, TABLE, DESCRIPTION, CATEGORIES, CHART_USAGE, OWNER } =
    SpotlightTableColumns;

const defaultLayout = {
    columnOrder: DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG.map(
        ({ column }) => column,
    ),
    columnVisibility: Object.fromEntries(
        DEFAULT_SPOTLIGHT_TABLE_COLUMN_CONFIG.map(({ column, isVisible }) => [
            column,
            isVisible,
        ]),
    ),
};

describe('convertTableColumnConfigToState', () => {
    it('gives the default layout when nothing is saved', () => {
        expect(convertTableColumnConfigToState([])).toEqual(defaultLayout);
    });

    it('keeps the saved order and visibility', () => {
        const saved = [
            { column: METRIC, isVisible: true },
            { column: OWNER, isVisible: true },
            { column: CHART_USAGE, isVisible: false },
            { column: DESCRIPTION, isVisible: true },
            { column: TABLE, isVisible: true },
            { column: CATEGORIES, isVisible: false },
        ];

        const state = convertTableColumnConfigToState(saved);

        expect(state.columnOrder).toEqual([
            METRIC,
            OWNER,
            CHART_USAGE,
            DESCRIPTION,
            TABLE,
            CATEGORIES,
        ]);
        expect(convertStateToTableColumnConfig(state)).toEqual(saved);
    });

    it('puts a column an older config lacks after its default neighbour', () => {
        const state = convertTableColumnConfigToState([
            { column: METRIC, isVisible: true },
            { column: CHART_USAGE, isVisible: true },
            { column: DESCRIPTION, isVisible: false },
            { column: TABLE, isVisible: true },
            { column: CATEGORIES, isVisible: true },
        ]);

        expect(state.columnOrder).toEqual([
            METRIC,
            CHART_USAGE,
            OWNER,
            DESCRIPTION,
            TABLE,
            CATEGORIES,
        ]);
        expect(state.columnVisibility[OWNER]).toBe(false);
        expect(state.columnVisibility[DESCRIPTION]).toBe(false);
    });

    it('keeps the metric column first when a config leaves it out', () => {
        expect(
            convertTableColumnConfigToState([
                { column: DESCRIPTION, isVisible: true },
                { column: TABLE, isVisible: true },
            ]).columnOrder,
        ).toEqual([METRIC, DESCRIPTION, CATEGORIES, CHART_USAGE, OWNER, TABLE]);
    });

    it('drops unknown columns and repeats of a column', () => {
        const state = convertTableColumnConfigToState([
            { column: 'retired' as SpotlightTableColumns, isVisible: true },
            { column: DESCRIPTION, isVisible: false },
            { column: DESCRIPTION, isVisible: true },
        ]);

        expect(state.columnOrder).toEqual(defaultLayout.columnOrder);
        expect(state.columnVisibility).toEqual({
            ...defaultLayout.columnVisibility,
            [DESCRIPTION]: false,
        });
    });
});

describe('setColumnConfig', () => {
    it.each([{ columnConfig: [] }, null, undefined])(
        'shows the default layout for %j',
        (payload) => {
            const state = metricsCatalogSlice.reducer(
                undefined,
                setColumnConfig(payload),
            );

            expect(state.columnConfig).toEqual(defaultLayout);
        },
    );
});
