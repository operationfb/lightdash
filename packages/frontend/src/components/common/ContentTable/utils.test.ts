import { describe, expect, test } from 'vitest';
import { getGrownColumnSizes } from './utils';

const columns = [
    { id: 'name', size: 300, grow: true },
    { id: 'role', size: 100, grow: true },
    { id: 'actions', size: 72, grow: false },
];

describe('getGrownColumnSizes', () => {
    test('keeps declared sizes until the width is measured', () => {
        expect(getGrownColumnSizes(columns, null)).toEqual({
            name: 300,
            role: 100,
            actions: 72,
        });
    });

    test('shares the slack between growing columns by size and keeps fixed ones', () => {
        expect(getGrownColumnSizes(columns, 872)).toEqual({
            name: 600,
            role: 200,
            actions: 72,
        });
    });

    test('keeps declared sizes when the row is wider than the available width', () => {
        expect(getGrownColumnSizes(columns, 400)).toEqual({
            name: 300,
            role: 100,
            actions: 72,
        });
    });

    test('keeps declared sizes when no column can grow', () => {
        expect(
            getGrownColumnSizes(
                columns.map((column) => ({ ...column, grow: false })),
                872,
            ),
        ).toEqual({ name: 300, role: 100, actions: 72 });
    });
});
