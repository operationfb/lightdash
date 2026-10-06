/**
 * KONTALA: the text of a label drawn outside a pie, as ECharts rich text: the
 * slice's name, and under it its value, its percentage or both.
 *
 * Upstream writes the two on one line, "desktop: 67.04%". ECharts fits an
 * outside label into the room between the pie and the edge of the chart and
 * cuts off whatever does not fit, and a one-line label needs the room of its
 * name and its value together: in a tile half a dashboard wide on a 1024px
 * screen every label read "deskto..." or "mobil...". On two lines a label
 * needs only the room of the longer of the two, and a line that still does
 * not fit is cut off alone, so the name survives a value that does not fit
 * and the other way round.
 */
export const formatPieOutsideLabel = ({
    name,
    percent,
    formattedValue,
    showValue,
    showPercentage,
}: {
    name: string;
    percent: number | undefined;
    formattedValue: string;
    showValue: boolean | undefined;
    showPercentage: boolean | undefined;
}): string => {
    const value =
        showValue && showPercentage
            ? `${percent}% - ${formattedValue}`
            : showValue
              ? formattedValue
              : showPercentage
                ? `${percent}%`
                : undefined;
    return value === undefined
        ? `{name|${name}}`
        : `{name|${name}}\n{value|${value}}`;
};
