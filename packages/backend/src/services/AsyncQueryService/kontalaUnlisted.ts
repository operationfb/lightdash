import type { Explore } from '@lightdash/common';

/**
 * Kontala: a statistics row is counted, never listed one by one.
 *
 * Where a Kontala property enforces its visitors' consent, a visitor who
 * refused analytics is still measured, as a statistics row, and every report
 * of those rows must be an aggregate (Kontala's docs/design/consent-buckets.md,
 * D6, after the CNIL's audience measurement tool, §4). Every Kontala model
 * whose rows can be a statistics row, visit or visitor declares one hidden
 * boolean dimension tagged `kontala-unlisted` that is true of exactly those
 * rows, and an underlying data query of its explore leaves them out, here,
 * on the server, where no request from a browser can take the condition off.
 *
 * Charts are untouched: every metric still counts the rows.
 */
export const KONTALA_UNLISTED_TAG = 'kontala-unlisted';

/**
 * The explore an underlying data query of `explore` runs against: its base
 * table's SQL filter, ANDed with `NOT` each of its dimensions tagged
 * `kontala-unlisted`, a NULL counting as false. An explore with no such
 * dimension is returned as it is.
 */
export function exploreWithoutUnlistedRows(explore: Explore): Explore {
    const base = explore.tables[explore.baseTable];
    if (!base) {
        return explore;
    }
    const conditions = Object.values(base.dimensions)
        .filter((dimension) =>
            (dimension.tags ?? []).includes(KONTALA_UNLISTED_TAG),
        )
        .map((dimension) => `NOT COALESCE((${dimension.compiledSql}), FALSE)`);
    if (conditions.length === 0) {
        return explore;
    }
    const sqlWhere = [
        ...(base.sqlWhere ? [`(${base.sqlWhere})`] : []),
        ...conditions,
    ].join(' AND ');
    return {
        ...explore,
        tables: {
            ...explore.tables,
            [explore.baseTable]: { ...base, sqlWhere },
        },
    };
}
