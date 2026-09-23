import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type Explore,
    type Metric,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { Context, type MetricQueryDataContext } from './context';
import { DrillDownModal } from './DrillDownModal';

// KONTALA: "Open in new tab" is a real anchor, so the browser resolves its href
// against the ORIGIN and never through the router's basename. Served under
// /analytics, a bare /projects/... link named a page of the app that shares
// the origin, and every drill opened that app's 404 instead of the explore.

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));

// Only consulted for a drill whose source is another table; this one has none,
// so the context's own explore is used and no request is made.
vi.mock('../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));

// Mantine's combobox is not what is under test: choose the first field through
// the component's own onChange, as picking one from the list would.
vi.mock('../common/FieldSelect', () => ({
    default: ({
        items,
        onChange,
    }: {
        items: Dimension[];
        onChange: (item: Dimension) => void;
    }) => (
        <button type="button" onClick={() => onChange(items[0])}>
            Choose a field
        </button>
    ),
}));

const amount = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'amount',
    label: 'Amount',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.amount',
    hidden: false,
} as Metric;

const status = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
} as Dimension;

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            dimensions: { status },
            metrics: { amount },
            lineageGraph: {},
        },
    },
} as unknown as Explore;

const context: MetricQueryDataContext = {
    tableName: 'orders',
    explore,
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: ['orders_amount'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    underlyingDataConfig: undefined,
    isUnderlyingDataModalOpen: false,
    openUnderlyingDataModal: vi.fn(),
    closeUnderlyingDataModal: vi.fn(),
    drillDownConfig: {
        item: amount,
        fieldValues: { orders_amount: { raw: 79, formatted: '79' } },
    },
    isDrillDownModalOpen: true,
    openDrillDownModal: vi.fn(),
    closeDrillDownModal: vi.fn(),
};

const drillIntoFirstField = () => {
    renderWithProviders(
        <Context.Provider value={context}>
            <DrillDownModal />
        </Context.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose a field' }));
    return screen
        .getByRole('link', { name: /open in new tab/i })
        .getAttribute('href');
};

describe('DrillDownModal "Open in new tab"', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('links under the base path the app is served from', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        expect(drillIntoFirstField()).toMatch(
            /^\/analytics\/projects\/project-uuid\/tables\/orders\?/,
        );
    });

    it('links to the drilled explore at the origin root when there is no base path', () => {
        const href = drillIntoFirstField();

        const url = new URL(href ?? '', window.location.origin);
        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(url.searchParams.get('isExploreFromHere')).toBe('true');
        expect(
            JSON.parse(
                url.searchParams.get('create_saved_chart_version') ?? '',
            ),
        ).toMatchObject({
            tableName: 'orders',
            metricQuery: {
                dimensions: ['orders_status'],
                metrics: ['orders_amount'],
            },
        });
    });
});
