import {
    DimensionType,
    FieldType,
    type CompiledDimension,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { validExplore } from '../ProjectService/ProjectService.mock';
import {
    exploreWithoutUnlistedRows,
    KONTALA_UNLISTED_TAG,
} from './kontalaUnlisted';

const statisticsRow = (table: string): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.BOOLEAN,
    name: 'statistics_row',
    label: 'Statistics row',
    table,
    tableLabel: '',
    sql: 'IFNULL(${TABLE}.statistics, FALSE)',
    hidden: true,
    compiledSql: `IFNULL("${table}".statistics, FALSE)`,
    tablesReferences: [table],
    tags: [KONTALA_UNLISTED_TAG],
});

const withTagged = (
    tables: string[],
    sqlWhere: string | undefined = undefined,
): Explore => ({
    ...validExplore,
    tables: Object.fromEntries(
        Object.entries(validExplore.tables).map(([name, table]) => [
            name,
            {
                ...table,
                ...(name === validExplore.baseTable && sqlWhere
                    ? { sqlWhere }
                    : {}),
                dimensions: tables.includes(name)
                    ? {
                          ...table.dimensions,
                          statistics_row: statisticsRow(name),
                      }
                    : table.dimensions,
            },
        ]),
    ),
});

describe('exploreWithoutUnlistedRows', () => {
    it('returns an explore with no dimension tagged kontala-unlisted as it is', () => {
        expect(exploreWithoutUnlistedRows(validExplore)).toBe(validExplore);
    });

    it('leaves out the rows the base table says are statistics rows', () => {
        const explore = withTagged(['a']);
        const narrowed = exploreWithoutUnlistedRows(explore);
        expect(narrowed.tables.a.sqlWhere).toBe(
            'NOT COALESCE((IFNULL("a".statistics, FALSE)), FALSE)',
        );
        expect(narrowed.tables.b).toBe(explore.tables.b);
    });

    it('keeps the base table filter it already had', () => {
        const narrowed = exploreWithoutUnlistedRows(
            withTagged(['a'], '"a".event_name = \'page_view\''),
        );
        expect(narrowed.tables.a.sqlWhere).toBe(
            '("a".event_name = \'page_view\') AND NOT COALESCE((IFNULL("a".statistics, FALSE)), FALSE)',
        );
    });

    it('reads the base table alone, never a joined one', () => {
        const explore = withTagged(['b']);
        expect(exploreWithoutUnlistedRows(explore)).toBe(explore);
    });

    it('never changes the explore it was given', () => {
        const explore = withTagged(['a'], 'x = 1');
        exploreWithoutUnlistedRows(explore);
        expect(explore.tables.a.sqlWhere).toBe('x = 1');
    });
});
