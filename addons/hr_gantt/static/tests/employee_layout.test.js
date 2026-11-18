// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { diagonalBackground, lunchRoundedParts } from "../src/employee_layout";

describe.current.tags("headless");

const hm = (hours, minutes = 0) => hours * 60 + minutes;
const rounded = (start, stop, extra = {}) =>
    lunchRoundedParts({
        startMinutes: start,
        stopMinutes: stop,
        sameDay: true,
        parts: 2,
        subColumnsCovered: 2,
        ...extra,
    });

test("A21: the examples of R8 at half-day precision", () => {
    expect(rounded(hm(9), hm(13))).toBe("first");
    expect(rounded(hm(11), hm(15))).toBe("second");
    expect(rounded(hm(10), hm(15))).toBe("both");
    expect(rounded(hm(11, 30), hm(12, 15))).toBe("first");
});

test("A21: a tie goes to the stop; the start must be at 11:00 or later", () => {
    // 11:00 to 13:00: start 1 h before noon, stop 1 h after: the stop is chosen, so the morning
    expect(rounded(hm(11), hm(13))).toBe("first");
    // 10:59 to 15:00 is not an afternoon pill
    expect(rounded(hm(10, 59), hm(12, 30))).toBe("first");
    expect(rounded(hm(10, 59), hm(15))).toBe("both");
});

test("A22: no rounding at any other precision, over other sub-column counts or across midnight", () => {
    expect(rounded(hm(9), hm(13), { parts: 4 })).toBe("both");
    expect(rounded(hm(9), hm(13), { parts: 1 })).toBe("both");
    expect(rounded(hm(9), hm(13), { subColumnsCovered: 1 })).toBe("both");
    expect(rounded(hm(9), hm(13), { subColumnsCovered: 3 })).toBe("both");
    expect(rounded(hm(9), hm(13), { sameDay: false })).toBe("both");
});

test("R7: the diagonal is a hard-edged gradient at 325 degrees", () => {
    expect(diagonalBackground(false, true)).toBe(
        "linear-gradient(325deg, transparent 49%, var(--o-tl-unavailable-bg) 50%)"
    );
    expect(diagonalBackground(true, false)).toBe(
        "linear-gradient(325deg, var(--o-tl-unavailable-bg) 49%, transparent 50%)"
    );
    expect(diagonalBackground(true, true)).toBe(null);
    expect(diagonalBackground(false, false)).toBe(null);
});
