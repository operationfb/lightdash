import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test,
    vi,
    type MockInstance,
} from 'vitest';
import { ContentTable } from './ContentTable';
import { type ContentTableColumnDef } from './types';
import { useContentTable } from './useContentTable';

type Row = { name: string };

const columns: ContentTableColumnDef<Row>[] = [
    { accessorKey: 'name', header: 'Name' },
];

const rows: Row[] = [{ name: 'alpha' }, { name: 'beta' }];

const VirtualizedTable: FC<{ data: Row[]; search: string }> = ({
    data,
    search,
}) => {
    const table = useContentTable({
        columns,
        data,
        enableRowVirtualization: true,
        state: { globalFilter: search },
    });

    return <ContentTable table={table} />;
};

const Providers: FC<PropsWithChildren> = ({ children }) => (
    <MantineProvider env="test">{children}</MantineProvider>
);

const renderTable = (data: Row[]) => {
    const view = render(<VirtualizedTable data={data} search="" />, {
        wrapper: Providers,
    });
    // jsdom has no Element.scrollTo, which the virtualizer scrolls with.
    const scrollTo = vi.fn();
    const scrollContainer = screen.getByRole('table').parentElement;
    if (scrollContainer) scrollContainer.scrollTo = scrollTo;

    return { ...view, scrollTo };
};

describe('ContentTable row virtualization', () => {
    let warn: MockInstance<typeof console.warn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    test('scrolls back to the top when the sort changes', () => {
        const { scrollTo } = renderTable(rows);

        fireEvent.click(screen.getByRole('button', { name: 'Name' }));

        expect(scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ top: 0 }),
        );
    });

    test('scrolls back to the top when the search changes', () => {
        const { rerender, scrollTo } = renderTable(rows);

        rerender(<VirtualizedTable data={rows} search="al" />);

        expect(scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ top: 0 }),
        );
    });

    test('keeps the scroll position when more rows load', () => {
        const { rerender, scrollTo } = renderTable(rows);

        rerender(
            <VirtualizedTable data={[...rows, { name: 'gamma' }]} search="" />,
        );

        expect(scrollTo).not.toHaveBeenCalled();
    });

    test('scrolls to the top without warning while the list is empty', () => {
        const { rerender, scrollTo } = renderTable([]);

        fireEvent.click(screen.getByRole('button', { name: 'Name' }));
        rerender(<VirtualizedTable data={[]} search="al" />);

        expect(warn).not.toHaveBeenCalled();
        expect(scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ top: 0 }),
        );
    });

    test('does not warn when the list empties right after a search', async () => {
        const { rerender } = renderTable(rows);

        rerender(<VirtualizedTable data={rows} search="al" />);
        rerender(<VirtualizedTable data={[]} search="al" />);
        await act(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                }),
        );

        expect(warn).not.toHaveBeenCalled();
    });
});
