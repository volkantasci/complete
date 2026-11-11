// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { allowTranslations, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { buildColumns, displayedPeriod, namedRange } from "@web_gantt/timeline_dates";
import {
    colorIndexOf,
    foldableRuns,
    orderPills,
    pillLabel,
    pillSpan,
    rowHeightFor,
    segmentCounts,
    stackPills,
    totalBars,
    unavailableParts,
} from "@web_gantt/timeline_layout";

const { DateTime } = luxon;

describe.current.tags("headless");

const FIELDS = { startField: "start", stopField: "stop", startIsDate: false, stopIsDate: false };
const DATE_FIELDS = { startField: "start", stopField: "stop", startIsDate: true, stopIsDate: true };

// The records of the acceptance setup, as [name, parent, startDay, startTime, stopDay, stopTime].
const SETUP = [
    ["Design", "Alpha", -3, "09:00", -1, "18:00"],
    ["Build", "Alpha", 0, "09:00", 2, "18:00"],
    ["Review", "Alpha", 0, "13:00", 0, "17:00"],
    ["Test", "Beta", 1, "08:00", 4, "12:00"],
    ["Deploy", "Beta", 5, "08:00", 6, "18:00"],
    ["Plan", "", -1, "09:00", 1, "12:00"],
    ["Long task", "Gamma", -20, "09:00", 20, "18:00"],
    ["Overlap A", "Gamma", -2, "10:00", 0, "12:00"],
    ["Overlap B", "Gamma", -1, "14:00", 1, "12:00"],
    ["Overlap C", "Gamma", 0, "08:00", 2, "18:00"],
    ["Color ten", "Gamma", 3, "08:00", 4, "18:00"],
    ["Color eleven", "Gamma", -3, "08:00", -2, "18:00"],
    ["Wrong order", "Beta", 3, "18:00", 3, "09:00"],
    ["Unscheduled", "Beta", null, null, null, null],
];

let columns;
let range;
const at = (offset, time) => {
    const [hour, minute] = time.split(":").map(Number);
    return DateTime.fromISO("2026-11-12").plus({ days: offset }).set({ hour, minute });
};
const records = () =>
    SETUP.map(([name, parent, startDay, startTime, stopDay, stopTime]) => ({
        name,
        parent,
        start: startDay === null ? false : at(startDay, startTime),
        stop: stopDay === null ? false : at(stopDay, stopTime),
    }));
const pillsOf = (list, parts = 2, fields = FIELDS) =>
    list
        .map((record) => ({ record, name: record.name, start: record.start, ...pillSpan(record, fields, columns, parts) }))
        .filter((pill) => pill.from !== undefined);
const byName = (pills, name) => pills.find((pill) => pill.name === name);
const spanOf = (pills, name) => {
    const pill = byName(pills, name);
    return [pill.from, pill.to];
};

beforeEach(() => {
    allowTranslations();
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    range = namedRange("week", DateTime.now().startOf("day"));
    columns = buildColumns("week", displayedPeriod(range, "week"));
});

test("A38: precision", () => {
    const review = records().find((record) => record.name === "Review");
    const place = (parts) => {
        const { from, to } = pillSpan(review, FIELDS, columns, parts);
        return [from, to];
    };
    expect(place(2)).toEqual([23, 24]); // afternoon half of D0 (column 11)
    expect(place(1)).toEqual([11, 12]); // the whole day
    expect(place(4)).toEqual([46, 47]); // 12:00 to 18:00
});

test("A39: pills snap to sub-columns", () => {
    const pills = pillsOf(records());
    expect(spanOf(pills, "Design")).toEqual([16, 22]); // start of D-3 to end of D-1
    expect(spanOf(pills, "Build")).toEqual([22, 28]); // start of D0 to end of D+2
    expect(spanOf(pills, "Test")).toEqual([24, 31]); // 12:00 sits on a boundary: ends there
});

test("pillSpan: invalid, zero-length and outside records", () => {
    const base = { start: at(0, "09:00"), stop: at(0, "09:00") };
    // stop exactly the start, inside a sub-column: the containing sub-column
    expect(pillSpan(base, FIELDS, columns, 2)).toEqual({
        from: 22,
        to: 23,
        cutStart: false,
        cutStop: false,
    });
    // same boundary: zero width
    const boundary = { start: at(0, "12:00"), stop: at(0, "12:00") };
    expect(pillSpan(boundary, FIELDS, columns, 2)).toEqual({
        from: 23,
        to: 23,
        cutStart: false,
        cutStop: false,
    });
    const all = pillsOf(records());
    expect(all.map((pill) => pill.name)).not.toInclude("Wrong order");
    expect(all.map((pill) => pill.name)).not.toInclude("Unscheduled");
    expect(pillSpan({ start: false, stop: at(0, "09:00") }, FIELDS, columns, 2)).toBe(null);
    expect(pillSpan({ start: at(-40, "09:00"), stop: at(-30, "09:00") }, FIELDS, columns, 2)).toBe(null);
    expect(pillSpan({ start: at(30, "09:00"), stop: at(31, "09:00") }, FIELDS, columns, 2)).toBe(null);
});

test("A40: date-only stop includes its day", () => {
    const day = (offset) => DateTime.fromISO("2026-11-12").plus({ days: offset });
    const list = [
        { name: "Day one", start: day(0), stop: day(0) },
        { name: "Three days", start: day(-1), stop: day(1) },
        { name: "Next month", start: day(25), stop: day(40) },
    ];
    const pills = pillsOf(list, 2, DATE_FIELDS);
    expect(spanOf(pills, "Day one")).toEqual([22, 24]);
    expect(spanOf(pills, "Three days")).toEqual([20, 26]);
    expect(pills.map((pill) => pill.name)).not.toInclude("Next month");
});

test("A41: cut pills", () => {
    const pills = pillsOf(records());
    const long = byName(pills, "Long task");
    expect([long.from, long.to, long.cutStart, long.cutStop]).toEqual([0, 42, true, true]);
    const design = byName(pills, "Design");
    expect([design.cutStart, design.cutStop]).toEqual([false, false]);
});

test("A42: year scale fills the month", () => {
    const yearRange = namedRange("year", DateTime.now().startOf("day"));
    columns = buildColumns("year", displayedPeriod(yearRange, "year"));
    const pills = pillsOf(records(), 1);
    expect(spanOf(pills, "Design")).toEqual([22, 23]);
    expect(spanOf(pills, "Review")).toEqual([22, 23]);
    expect(spanOf(pills, "Long task")).toEqual([21, 24]); // Oct 23 to Dec 2
});

test("A43/A44: labels", () => {
    const list = records();
    const find = (name) => list.find((record) => record.name === name);
    const options = { scaleId: "week", range, computed: true, hasAllocatedHours: false };
    expect(pillLabel(find("Design"), "Design", { ...options, computed: false })).toBe("Design");
    expect(pillLabel(find("Long task"), "Long task", { ...options, computed: false })).toBe("Long task");
    expect(pillLabel(find("Design"), "Design", options)).toBe("Design");
    expect(pillLabel(find("Review"), "Review", options)).toBe("Review");
    expect(pillLabel(find("Long task"), "Long task", options)).toBe("Oct 23 - Dec 2 Long task");
    // the stop runs past the end of the range
    // month scale: the displayed range is Oct 1 to Dec 31, so Long task lies inside it
    const month = { ...options, scaleId: "month", range: namedRange("month", DateTime.now().startOf("day")) };
    expect(pillLabel(find("Long task"), "Long task", month)).toBe("Long task");
    const early = { start: at(-60, "09:00"), stop: at(-50, "09:00") }; // Sep 13 to Sep 23
    expect(pillLabel(early, "Early", month)).toBe("Sep 13 - Sep 23 Early");
    const year = { ...options, scaleId: "year" };
    expect(pillLabel(find("Long task"), "Long task", year)).toBe("Oct 23 - Dec 2 Long task");
    expect(pillLabel(find("Design"), "Design", year)).toBe("Nov 9 - Nov 11 Design");
    expect(pillLabel(find("Review"), "Review", year)).toBe("Nov 12 Review");
});

test("A44: allocated hours label", () => {
    const review = { ...records().find((record) => record.name === "Review"), allocatedHours: 4 };
    const flat = (text) => text.replace(/\s/g, " ");
    const options = { scaleId: "week", range, computed: true, hasAllocatedHours: true };
    expect(flat(pillLabel(review, "Review", options))).toBe("1:00 PM - 5:00 PM (4:00) Review");
    expect(flat(pillLabel(review, "Review", { ...options, scaleId: "month" }))).toBe(
        "1:00 PM - 5:00 PM (4:00)"
    );
    expect(pillLabel(review, "Review", { ...options, hasAllocatedHours: false })).toBe("Review");
});

test("A45: colour index", () => {
    for (let value = 0; value < 12; value++) {
        expect(colorIndexOf(value)).toBe(value);
    }
    expect(colorIndexOf(14)).toBe(2);
    expect(colorIndexOf(-1)).toBe(0);
    expect(Object.is(colorIndexOf(-0.4), 0)).toBe(true);
    expect(Object.is(colorIndexOf(0), 0)).toBe(true);
    expect(colorIndexOf(2.6)).toBe(3);
    expect(colorIndexOf([15, "x"])).toBe(3);
    expect(colorIndexOf({ id: 25 })).toBe(1);
    expect(colorIndexOf(false)).toBe(0);
    expect(colorIndexOf(null)).toBe(0);
    expect(colorIndexOf("7")).toBe(0);
});

test("A51: stacking", () => {
    const gamma = pillsOf(records().filter((record) => record.parent === "Gamma"));
    const stacked = stackPills(gamma);
    const lines = Object.fromEntries(stacked.map((pill) => [pill.name, pill.line]));
    expect(lines).toEqual({
        "Long task": 1,
        "Color eleven": 2,
        "Overlap B": 2,
        "Color ten": 2,
        "Overlap A": 3,
        "Overlap C": 4,
    });
    expect(stacked.map((pill) => pill.name)).toEqual([
        "Long task",
        "Color eleven",
        "Overlap A",
        "Overlap B",
        "Overlap C",
        "Color ten",
    ]);
    expect(rowHeightFor(4)).toBe(116);
    expect(rowHeightFor(1)).toBe(41);
    expect(rowHeightFor(0)).toBe(41);
});

test("A51: Gamma / C3 row", () => {
    const row = pillsOf(
        records().filter((record) => ["Long task", "Overlap A", "Overlap B", "Overlap C"].includes(record.name))
    );
    const lines = Object.fromEntries(stackPills(row).map((pill) => [pill.name, pill.line]));
    expect(lines).toEqual({ "Long task": 1, "Overlap A": 2, "Overlap B": 3, "Overlap C": 4 });
});

test("A61: consolidated counts", () => {
    const alpha = pillsOf(records().filter((record) => record.parent === "Alpha"));
    expect(segmentCounts(alpha)).toEqual([
        { from: 16, to: 22, count: 1 },
        { from: 22, to: 23, count: 1 },
        { from: 23, to: 24, count: 2 },
        { from: 24, to: 28, count: 1 },
    ]);
    expect(segmentCounts([])).toEqual([]);
    // a gap between two pills has no segment
    expect(
        segmentCounts([
            { from: 0, to: 2 },
            { from: 4, to: 6 },
        ])
    ).toEqual([
        { from: 0, to: 2, count: 1 },
        { from: 4, to: 6, count: 1 },
    ]);
});

test("A70: total counts", () => {
    const segments = segmentCounts(pillsOf(records()));
    expect(segments.map((segment) => [segment.from, segment.to, segment.count])).toEqual([
        [0, 16, 1],
        [16, 18, 3],
        [18, 20, 4],
        [20, 21, 4],
        [21, 22, 5],
        [22, 23, 6],
        [23, 24, 6],
        [24, 25, 6],
        [25, 28, 4],
        [28, 31, 3],
        [31, 32, 2],
        [32, 36, 2],
        [36, 42, 1],
    ]);
    const bars = totalBars(segments, 40);
    expect(bars.map((bar) => bar.heightPx)).toEqual([
        6, 18, 24, 24, 30, 36, 36, 36, 24, 18, 12, 12, 6,
    ]);
    expect(totalBars([], 40)).toEqual([]);
});

test("A74: unavailable parts", () => {
    const periods = [
        { start: at(1, "00:00"), stop: at(2, "00:00") },
        { start: at(2, "00:00"), stop: at(2, "12:00") },
    ];
    const half = unavailableParts(periods, columns, 2);
    expect([...half.entries()]).toEqual([
        [12, [true, true]],
        [13, [true, false]],
    ]);
    const whole = unavailableParts(periods, columns, 1);
    expect([...whole.entries()]).toEqual([[12, [true]]]);
    const quarter = unavailableParts(periods, columns, 4);
    expect(quarter.get(13)).toEqual([true, true, false, false]);
    // a period starting after the part's start leaves it available
    const late = unavailableParts([{ start: at(1, "06:00"), stop: at(2, "00:00") }], columns, 2);
    expect(late.get(12)).toEqual([false, true]);
});

test("A75/A76: foldable runs", () => {
    const both = new Map([
        [15, [true, true]],
        [16, [true, true]],
    ]);
    const only = new Map([[15, [true, true]]]);
    const run = (rows, extra = {}) =>
        foldableRuns({ columns, rowsUnavailable: rows, pillsSubRanges: [], scaleId: "week", ...extra });
    expect(run([both, both, both])).toEqual([{ first: 15, last: 16 }]);
    // a single day folds alone on the week scale, not on the month scale
    expect(run([only, only])).toEqual([{ first: 15, last: 15 }]);
    expect(run([only, only], { scaleId: "month" })).toEqual([]);
    expect(run([both, both], { scaleId: "month" })).toEqual([{ first: 15, last: 16 }]);
    // one row is available: nothing folds
    expect(run([both, both, new Map()])).toEqual([]);
    expect(run([both, both, new Map([[17, [true, true]]])])).toEqual([]);
    // a pill on D+4 keeps that day open
    expect(run([both, both], { pillsSubRanges: [{ from: 32, to: 34 }] })).toEqual([
        { first: 15, last: 15 },
    ]);
    // a half unavailable column does not fold
    expect(run([new Map([[15, [true, false]]])])).toEqual([]);
    // nothing unavailable anywhere
    expect(run([])).toEqual([]);
    expect(run([new Map(), new Map()])).toEqual([]);
    // two separate runs
    const split = new Map([
        [3, [true, true]],
        [4, [true, true]],
        [8, [true, true]],
        [9, [true, true]],
    ]);
    expect(run([split])).toEqual([
        { first: 3, last: 4 },
        { first: 8, last: 9 },
    ]);
});

test("A101: equal first sub-column orders by start", () => {
    const early = { name: "early", from: 22, to: 28, start: at(0, "08:00") };
    const late = { name: "late", from: 22, to: 26, start: at(0, "11:00") };
    const first = { name: "first", from: 20, to: 21, start: at(-1, "18:00") };
    expect(orderPills([late, early, first]).map((pill) => pill.name)).toEqual([
        "first",
        "early",
        "late",
    ]);
    const stacked = stackPills([late, early]);
    expect(stacked.map((pill) => [pill.name, pill.line])).toEqual([
        ["early", 1],
        ["late", 2],
    ]);
});

test("A106: narrow flag on total bars", () => {
    const bars = totalBars(segmentCounts(pillsOf(records())), 40);
    expect(bars.map((bar) => bar.narrow)).toEqual([
        false, false, false, true, true, true, true, true, false, false, true, false, false,
    ]);
});
