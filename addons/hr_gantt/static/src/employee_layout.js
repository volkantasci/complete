// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * R7 and R8 apply only at half-day precision: the scale's columns are days and each column has
 * two parts. A day scale with half-hour parts is not one (the rule is decided by precision).
 * @param {string} columnUnit the unit of the scale's columns ("hour", "day" or "month")
 * @param {number} parts
 */
export function isHalfDayPrecision(columnUnit, parts) {
    return columnUnit === "day" && parts === 2;
}

/** The grey of an unavailable part (002a R28) and the colour of an available one (R7). */
const UNAVAILABLE = "var(--o-tl-unavailable-bg)";
const AVAILABLE = "var(--o-hrg-available-bg, transparent)";

/** The angle of the diagonal split of R7. */
export const DIAGONAL_ANGLE = 325;

/**
 * R7: the background of a cell whose two halves differ: a hard-edged gradient at 325 degrees, the
 * colour of the first half's state up to 49 % and that of the second half's state from 50 %.
 * The available half is the view background (a property that is transparent in today's column, so
 * the today shade shows through it). Null when both halves are in the same state (002a R28 draws those).
 * @param {boolean} firstUnavailable
 * @param {boolean} secondUnavailable
 * @returns {string|null}
 */
export function diagonalBackground(firstUnavailable, secondUnavailable) {
    if (Boolean(firstUnavailable) === Boolean(secondUnavailable)) {
        return null;
    }
    const first = firstUnavailable ? UNAVAILABLE : AVAILABLE;
    const second = secondUnavailable ? UNAVAILABLE : AVAILABLE;
    return `linear-gradient(${DIAGONAL_ANGLE}deg, ${first} 49%, ${second} 50%)`;
}

/**
 * R8: which sub-column a pill over two sub-columns of one day keeps, at half-day precision.
 * Times are whole minutes of the wall clock (hour * 60 + minute) of the pill's start day, clipped
 * to the displayed period; a stop at the midnight that ends the day is 1440.
 * @param {Object} params
 * @param {number} params.startMinutes
 * @param {number} params.stopMinutes
 * @param {boolean} params.sameDay start and stop fall on the same calendar day
 * @param {number} params.parts sub-columns per column of the scale
 * @param {string} [params.columnUnit] unit of the scale's columns, "day" when not given
 * @param {number} params.subColumnsCovered sub-columns the pill covers (002a R12)
 * @returns {"first"|"second"|"both"}
 */
export function lunchRoundedParts({
    startMinutes,
    stopMinutes,
    sameDay,
    parts,
    subColumnsCovered,
    columnUnit = "day",
}) {
    if (!isHalfDayPrecision(columnUnit, parts) || subColumnsCovered !== 2 || !sameDay) {
        return "both";
    }
    // whole minutes; the stop wins a tie
    const startIsCloser = 12 * 60 - startMinutes < stopMinutes - 12 * 60;
    if (startMinutes >= 11 * 60 && startIsCloser) {
        return "second";
    }
    if (stopMinutes <= 14 * 60) {
        return "first";
    }
    return "both";
}
