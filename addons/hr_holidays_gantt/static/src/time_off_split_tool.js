// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** R16: how far from a day border (px, on either side) the pointer may rest for the tool to show. */
export const SPLIT_REACH = 8;

/** A pixel tolerance for "the same border" between two columns, and for adjacent columns. */
const SAME = 0.6;

/**
 * R16, R17 point 1, D11: the border a click on a pill splits at, for a pointer at `(x, y)`.
 *
 * - `pillRect`: the pill's whole box in the viewport (`left`, `right`, `top`, `bottom`), its 1 px
 *   inset included: 25 px tall, from the box's top edge to 0.5 px above its bottom edge (R16, A43).
 * - `columns`: the visible, unfolded day columns, `{left, right, start}` with `start` the
 *   column's first moment as a luxon DateTime in the browser's zone.
 * - `rtl`: the grid runs from right to left; the border at a column's start is its right edge.
 *
 * A border qualifies when it lies strictly inside the pill, within `SPLIT_REACH` of `x`, with
 * a day column on each side of it (so never the edge of the grid, nor one beside a folded run),
 * and `y` is inside that box. Where both borders of the column under the pointer qualify,
 * its end border wins; else the nearer border.
 *
 * @returns {{borderX: number, day: string, box: {left: number, right: number}} | null} `day` is
 * the first day after the border in the browser's zone ("YYYY-MM-DD"), `box` the viewport span
 * of that day's column.
 */
export function hhgSplitBorderAt({ x, y, pillRect, columns, rtl = false }) {
    if (y < pillRect.top || y > pillRect.bottom) {
        return null;
    }
    const startEdge = (column) => (rtl ? column.right : column.left);
    const endEdge = (column) => (rtl ? column.left : column.right);
    const candidates = [];
    for (const column of columns) {
        const sides = [
            {
                column,
                borderX: startEdge(column),
                isEnd: false,
                // the day after a start border is the column's own
                after: column,
                neighbour: columns.find((other) => Math.abs(endEdge(other) - startEdge(column)) < SAME),
            },
            {
                column,
                borderX: endEdge(column),
                isEnd: true,
                after: columns.find((other) => Math.abs(startEdge(other) - endEdge(column)) < SAME),
                neighbour: columns.find((other) => Math.abs(startEdge(other) - endEdge(column)) < SAME),
            },
        ];
        for (const side of sides) {
            if (
                side.neighbour &&
                side.borderX > pillRect.left &&
                side.borderX < pillRect.right &&
                Math.abs(x - side.borderX) <= SPLIT_REACH
            ) {
                candidates.push(side);
            }
        }
    }
    if (!candidates.length) {
        return null;
    }
    const under = columns.find((column) => x >= Math.min(column.left, column.right) && x < Math.max(column.left, column.right));
    const ends = candidates.filter((side) => side.column === under && side.isEnd);
    const taken =
        ends[0] ?? candidates.sort((a, b) => Math.abs(x - a.borderX) - Math.abs(x - b.borderX))[0];
    return {
        borderX: taken.borderX,
        day: taken.after.start.toISODate(),
        box: { left: taken.after.left, right: taken.after.right },
    };
}
