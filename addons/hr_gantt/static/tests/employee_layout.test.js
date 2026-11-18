// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { diagonalBackground, isHalfDayPrecision, lunchRoundedParts } from "../src/employee_layout";

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
        "linear-gradient(325deg, var(--o-hrg-available-bg, transparent) 49%, var(--o-tl-unavailable-bg) 50%)"
    );
    expect(diagonalBackground(true, false)).toBe(
        "linear-gradient(325deg, var(--o-tl-unavailable-bg) 49%, var(--o-hrg-available-bg, transparent) 50%)"
    );
    expect(diagonalBackground(true, true)).toBe(null);
    expect(diagonalBackground(false, false)).toBe(null);
});

test("R7, R8: half-day precision means day columns with two parts", () => {
    expect(isHalfDayPrecision("day", 2)).toBe(true);
    expect(isHalfDayPrecision("hour", 2)).toBe(false);
    expect(isHalfDayPrecision("day", 4)).toBe(false);
    expect(isHalfDayPrecision("month", 1)).toBe(false);
    expect(rounded(hm(9), hm(10), { columnUnit: "hour" })).toBe("both");
});

test("A21: the comparison with noon is made in whole minutes", () => {
    // 11:00 to 13:01: the start is 60 minutes before noon, the stop 61 after: the start is closer
    expect(rounded(hm(11), hm(13, 1))).toBe("second");
    // 11:01 to 13:00: 59 against 60 minutes: the start is closer too
    expect(rounded(hm(11, 1), hm(13))).toBe("second");
    // 10:59 to 13:00: 61 against 60: the stop is closer, the morning
    expect(rounded(hm(10, 59), hm(13))).toBe("first");
    // a stop at the midnight that ends the day is 24:00
    expect(rounded(hm(11, 30), hm(24))).toBe("second");
});
