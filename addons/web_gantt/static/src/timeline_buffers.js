// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Buffer bands of the timeline (002c R22). Pure functions, no DOM.
 */

/**
 * The length in hours of the sub-column at a position, from the columns of the period (a column
 * can be 23 or 25 hours long on a clock change, a month column 28 to 31 days).
 * @returns {(part: number) => number}
 */
export function subColumnHoursAt(columns, parts) {
    return (part) => {
        const column = columns[Math.min(Math.max(Math.floor(part / parts), 0), columns.length - 1)];
        return (column.stop.toMillis() - column.start.toMillis()) / 3600000 / parts;
    };
}

/** Whole sub-columns of an extension of `hours`; nothing for a value that is not positive. */
function partsOf(hours, subColumnHours) {
    const value = Number(hours);
    if (!(value > 0) || !(subColumnHours > 0)) {
        return 0;
    }
    return Math.max(Math.round(value / subColumnHours), 0);
}

/**
 * The sub-columns `[from, to)` of a record's band: the pill's span extended by the free time
 * before and after, each side rounded to whole sub-columns and kept inside the displayed period.
 * @param {{raw: Object}} record
 * @param {Object} params
 * @param {string|null} params.beforeField
 * @param {string|null} params.afterField
 * @param {number|((part: number) => number)} params.subColumnHours
 * @param {number} params.from first sub-column of the pill
 * @param {number} params.to end (exclusive) of the pill
 * @param {number} params.partsTotal sub-columns of the displayed period
 * @returns {{from: number, to: number}|null} null when neither side has an extension
 */
export function bufferSpan(
    record,
    { beforeField, afterField, subColumnHours, from, to, partsTotal }
) {
    const hoursAt = typeof subColumnHours === "function" ? subColumnHours : () => subColumnHours;
    const before = beforeField ? partsOf(record.raw[beforeField], hoursAt(from)) : 0;
    const after = afterField ? partsOf(record.raw[afterField], hoursAt(to - 1)) : 0;
    const start = Math.max(from - before, 0);
    const stop = Math.min(to + after, partsTotal);
    if (start === from && stop === to) {
        return null;
    }
    return { from: start, to: stop };
}
