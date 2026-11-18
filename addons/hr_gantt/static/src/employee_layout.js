// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** The grey of an unavailable part (002a R28) and the colour of an available one (R7). */
const UNAVAILABLE = "var(--o-tl-unavailable-bg)";
const AVAILABLE = "transparent";

/** The angle of the diagonal split of R7. */
export const DIAGONAL_ANGLE = 325;

/**
 * R7: the background of a cell whose two halves differ: a hard-edged gradient at 325 degrees, the
 * colour of the first half's state up to 49 % and that of the second half's state from 50 %.
 * The available half is transparent, so the cell's own background (the today shade) shows
 * through it. Null when both halves are in the same state (002a R28 draws those).
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
 * Times are minutes since the midnight of the pill's start day, clipped to the displayed period.
 * @param {Object} params
 * @param {number} params.startMinutes
 * @param {number} params.stopMinutes
 * @param {boolean} params.sameDay start and stop fall on the same calendar day
 * @param {number} params.parts sub-columns per column of the scale
 * @param {number} params.subColumnsCovered sub-columns the pill covers (002a R12)
 * @returns {"first"|"second"|"both"}
 */
export function lunchRoundedParts({ startMinutes, stopMinutes, sameDay, parts, subColumnsCovered }) {
    if (parts !== 2 || subColumnsCovered !== 2 || !sameDay) {
        return "both";
    }
    const start = startMinutes / 60;
    const stop = stopMinutes / 60;
    // the stop wins a tie
    const startIsCloser = 12 - start < stop - 12;
    if (start >= 11 && startIsCloser) {
        return "second";
    }
    if (stop <= 14) {
        return "first";
    }
    return "both";
}
