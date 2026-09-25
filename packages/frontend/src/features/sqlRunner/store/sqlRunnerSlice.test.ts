import {
    CartesianSeriesType,
    ChartKind,
    DimensionType,
    VizAggregationOptions,
    VizIndexType,
    WarehouseTypes,
    type VizBarChartConfig,
    type VizTableConfig,
} from '@lightdash/common';
import { type UnknownAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { store, type RootState } from '.';
import { setChartConfig } from '../../../components/DataViz/store/actions/commonChartActions';
import { barChartConfigSlice } from '../../../components/DataViz/store/barChartSlice';
import { tableVisSlice } from '../../../components/DataViz/store/tableVisSlice';
import {
    initialState,
    selectActiveVizConfigs,
    selectSqlQueryHistory,
    selectSqlQueryResults,
    setSql,
    setState,
    setWarehouseConnectionType,
    sqlRunnerSlice,
} from './sqlRunnerSlice';
import { prepareAndFetchChartData, runSqlQuery } from './thunks';

const { reducer } = sqlRunnerSlice;

describe('sqlRunnerSlice warehouseConnectionType', () => {
    it('setState replaces the slice and clears warehouseConnectionType when the payload omits it', () => {
        // Simulates a share link (e.g. from the MCP `run_sql` tool) whose payload
        // has no warehouseConnectionType: useSqlRunnerShareUrl spreads it over
        // initialState, so the value arrives as undefined.
        const withWarehouse = reducer(
            undefined,
            setWarehouseConnectionType(WarehouseTypes.SNOWFLAKE),
        );
        expect(withWarehouse.warehouseConnectionType).toBe(
            WarehouseTypes.SNOWFLAKE,
        );

        const sharePayload = {
            ...initialState,
            sql: 'SELECT 1',
            fetchResultsOnLoad: true,
        };
        const afterSetState = reducer(withWarehouse, setState(sharePayload));

        expect(afterSetState.warehouseConnectionType).toBeUndefined();
    });

    it('setWarehouseConnectionType restores the value after it was clobbered (not permanently lost)', () => {
        const clobbered = reducer(
            undefined,
            setState({ ...initialState, sql: 'SELECT 1' }),
        );
        expect(clobbered.warehouseConnectionType).toBeUndefined();

        const restored = reducer(
            clobbered,
            setWarehouseConnectionType(WarehouseTypes.POSTGRES),
        );

        expect(restored.warehouseConnectionType).toBe(WarehouseTypes.POSTGRES);
    });
});

// react-redux re-renders whenever a selector returns a new reference, so these
// selectors must return the same one until their inputs change.
describe('sqlRunner selector memoization', () => {
    const emptyState = store.getState();

    // Reduces through the slice reducers directly, so no listener runs
    const reduceSqlRunner = (
        state: RootState,
        action: UnknownAction,
    ): RootState => ({
        ...state,
        sqlRunner: reducer(state.sqlRunner, action),
    });

    // Every response carries freshly parsed rows, like the API client's JSON
    const queryResultsFor = (sql: string) => ({
        queryUuid: `query-${sql}`,
        fileUrl: 'https://example.com/results.jsonl',
        columns: [{ reference: 'order_id', type: DimensionType.NUMBER }],
        results: [{ order_id: 1 }],
    });
    const runQuery = (state: RootState, sql: string): RootState =>
        reduceSqlRunner(
            reduceSqlRunner(state, setSql(sql)),
            runSqlQuery.fulfilled(queryResultsFor(sql), `request-${sql}`, {
                sql,
                limit: 500,
                projectUuid: 'project-uuid',
                parameterValues: {},
            }),
        );

    it('selectSqlQueryResults keeps its result until the results change', () => {
        expect(selectSqlQueryResults(emptyState)).toBeUndefined();

        const ran = runQuery(emptyState, 'SELECT 1');
        const results = selectSqlQueryResults(ran);
        expect(results).toEqual({
            columns: [{ reference: 'order_id', type: DimensionType.NUMBER }],
            fileUrl: 'https://example.com/results.jsonl',
            results: [{ order_id: 1 }],
        });

        const edited = reduceSqlRunner(ran, setSql('SELECT 2'));
        expect(selectSqlQueryResults(edited)).toBe(results);

        const rerun = runQuery(edited, 'SELECT 2');
        expect(selectSqlQueryResults(rerun)).not.toBe(results);
    });

    it('selectSqlQueryHistory keeps its result until a query joins the history', () => {
        const noHistory = selectSqlQueryHistory(emptyState);
        expect(noHistory).toEqual([]);
        expect(
            selectSqlQueryHistory(
                reduceSqlRunner(emptyState, setSql('SELECT 1')),
            ),
        ).toBe(noHistory);

        const ran = runQuery(emptyState, 'SELECT 1');
        const history = selectSqlQueryHistory(ran);
        expect(history.map((item) => item.value)).toEqual(['SELECT 1']);
        expect(
            selectSqlQueryHistory(reduceSqlRunner(ran, setSql('SELECT 2'))),
        ).toBe(history);

        const ranAgain = runQuery(ran, 'SELECT 2');
        expect(
            selectSqlQueryHistory(ranAgain).map((item) => item.value),
        ).toEqual(['SELECT 2', 'SELECT 1']);
    });

    it('selectActiveVizConfigs keeps its result until an active config changes', () => {
        const noConfigs = selectActiveVizConfigs(emptyState);
        expect(noConfigs).toEqual({
            chartConfigs: [],
            tableConfig: undefined,
        });
        expect(selectActiveVizConfigs({ ...emptyState })).toBe(noConfigs);

        const barConfig: VizBarChartConfig = {
            type: ChartKind.VERTICAL_BAR,
            metadata: { version: 1 },
            fieldConfig: {
                x: { reference: 'order_date', type: VizIndexType.TIME },
                y: [
                    {
                        reference: 'amount',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupBy: [],
            },
            display: {
                series: { amount: { type: CartesianSeriesType.BAR } },
            },
        };
        const tableConfig: VizTableConfig = {
            type: ChartKind.TABLE,
            metadata: { version: 1 },
            columns: {
                order_id: {
                    visible: true,
                    reference: 'order_id',
                    label: 'Order',
                    frozen: false,
                },
            },
            display: undefined,
        };
        const configured: RootState = {
            ...emptyState,
            barChartConfig: barChartConfigSlice.reducer(
                emptyState.barChartConfig,
                setChartConfig(barConfig),
            ),
            tableVisConfig: tableVisSlice.reducer(
                emptyState.tableVisConfig,
                setChartConfig(tableConfig),
            ),
        };
        const activeConfigs = selectActiveVizConfigs(configured);
        expect(activeConfigs.tableConfig?.columns).toEqual(tableConfig.columns);
        expect(activeConfigs.chartConfigs).toEqual([
            {
                type: ChartKind.VERTICAL_BAR,
                metadata: barConfig.metadata,
                fieldConfig: barConfig.fieldConfig,
                display: barConfig.display,
            },
        ]);

        const loading: RootState = {
            ...reduceSqlRunner(configured, setSql('SELECT 2')),
            barChartConfig: barChartConfigSlice.reducer(
                configured.barChartConfig,
                prepareAndFetchChartData.pending('request-id', undefined),
            ),
        };
        expect(selectActiveVizConfigs(loading)).toBe(activeConfigs);

        const reordered: RootState = {
            ...loading,
            barChartConfig: barChartConfigSlice.reducer(
                loading.barChartConfig,
                barChartConfigSlice.actions.setSeriesOrder(['amount']),
            ),
        };
        const reorderedConfigs = selectActiveVizConfigs(reordered);
        expect(reorderedConfigs).not.toBe(activeConfigs);
        expect(reorderedConfigs.chartConfigs).toEqual([
            {
                ...activeConfigs.chartConfigs[0],
                display: { ...barConfig.display, seriesOrder: ['amount'] },
            },
        ]);
        expect(reorderedConfigs.tableConfig).toBe(activeConfigs.tableConfig);
    });
});
