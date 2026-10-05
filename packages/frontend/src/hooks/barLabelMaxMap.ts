import { type ResultRow } from '@lightdash/common';

const countDigits = (label: string) => label.replace(/\D/g, '').length;

// The reserved label renders with tabular figures, so among labels of equal
// length the one with more digits, and fewer separators, is the widest.
const isWiderLabel = (label: string, current = '') =>
    label.length > current.length ||
    (label.length === current.length &&
        countDigits(label) > countDigits(current));

// Widest formatted label per column: bars in cells reserve a label gutter
// this wide so every row's bar is scaled against the same track width.
export const getBarLabelMaxMap = (rows: ResultRow[]) => {
    const result: Record<string, string> = {};
    for (const row of rows) {
        for (const [columnId, cell] of Object.entries(row)) {
            const formatted = cell?.value?.formatted;
            if (
                typeof formatted === 'string' &&
                isWiderLabel(formatted, result[columnId])
            ) {
                result[columnId] = formatted;
            }
        }
    }
    return result;
};
