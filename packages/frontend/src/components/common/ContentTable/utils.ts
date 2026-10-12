import { type Column, type RowData } from '@tanstack/react-table';
import { type ContentTableColumnDef } from './types';

export const getLightdashColumnDef = <TData extends RowData>(
    column: Column<TData, unknown>,
) =>
    (
        column.columnDef.meta as
            | { lightdashColumnDef?: ContentTableColumnDef<TData> }
            | undefined
    )?.lightdashColumnDef;

// The runtime `columnDef.header` is always a render callback (see
// `toTanStackColumn`), so string labels must come from the preserved def.
export const getColumnHeaderLabel = <TData extends RowData>(
    column: Column<TData, unknown>,
): string => {
    const header = getLightdashColumnDef(column)?.header;
    return typeof header === 'string' ? header : column.id;
};

export type ContentTableColumnSize = {
    id: string;
    size: number;
    grow: boolean;
};

// Fixed columns keep their size; growing columns share the slack in
// proportion to their sizes, so the row exactly fills the available width.
export const getGrownColumnSizes = (
    columns: ContentTableColumnSize[],
    availableWidth: number | null,
): Record<string, number> => {
    const sizes: Record<string, number> = Object.fromEntries(
        columns.map((column) => [column.id, column.size]),
    );
    if (availableWidth === null) return sizes;

    const totalSize = columns.reduce((sum, column) => sum + column.size, 0);
    const growingSize = columns
        .filter((column) => column.grow)
        .reduce((sum, column) => sum + column.size, 0);
    const slack = availableWidth - totalSize;
    if (slack <= 0 || growingSize === 0) return sizes;

    for (const column of columns) {
        if (column.grow) {
            sizes[column.id] =
                column.size + (slack * column.size) / growingSize;
        }
    }
    return sizes;
};
