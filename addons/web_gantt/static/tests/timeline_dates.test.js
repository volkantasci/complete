// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { allowTranslations, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    buildColumnGroups,
    buildColumns,
    columnWidth,
    displayedPeriod,
    fixCustomDates,
    initialRange,
    namedRange,
    offeredKinds,
    partsFor,
    rangeAroundToday,
    scaleForCustom,
    scaleForKind,
    stepRange,
    TIMELINE_SCALES,
} from "@web_gantt/timeline_dates";

const { DateTime } = luxon;

describe.current.tags("headless");

const d = (iso) => DateTime.fromISO(iso);
const span = (range) => [range.start.toISODate(), range.stop.toISODate()];
const ALL = ["day", "week", "month", "quarter", "year"];

let today;
beforeEach(() => {
    allowTranslations();
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    today = DateTime.now().startOf("day");
});

test("A68: day scale marks the current hour only", () => {
    const columns = buildColumns("day", displayedPeriod(namedRange("day", today), "day"));
    const marked = columns.filter((column) => column.isToday);
    expect(marked).toHaveLength(1);
    // mockDate reads 00:30 as UTC, which is 03:30 in the +3 zone
    expect(marked[0].start.toISO()).toBe(d("2026-11-12T03:00").toISO());
});

test("scale table and kinds", () => {
    expect(TIMELINE_SCALES.week).toEqual({
        column: "day",
        group: "week",
        minWidth: 192,
        defaultParts: 2,
        parts: { full: 1, half: 2, quarter: 4 },
    });
    expect(scaleForKind("quarter")).toBe("month");
    expect(scaleForKind("year")).toBe("year");
    expect(offeredKinds("year, day, nope")).toEqual(["day", "year"]);
    expect(offeredKinds("")).toEqual(ALL);
    expect(offeredKinds("day,week", "year")).toEqual(["day", "week", "year"]);
    expect(offeredKinds(undefined, "month")).toEqual(ALL);
});

test("A20: week range spans last week to next week", () => {
    expect(today.toISODate()).toBe("2026-11-12");
    expect(span(namedRange("week", today))).toEqual(["2026-11-01", "2026-11-21"]);
    patchWithCleanup(localization, { weekStart: 1 });
    expect(span(namedRange("week", today))).toEqual(["2026-11-02", "2026-11-22"]);
});

test("named ranges of every kind", () => {
    expect(span(namedRange("day", today))).toEqual(["2026-11-11", "2026-11-13"]);
    expect(span(namedRange("month", today))).toEqual(["2026-10-01", "2026-12-31"]);
    expect(span(namedRange("quarter", today))).toEqual(["2026-07-01", "2027-03-31"]);
    expect(span(namedRange("year", today))).toEqual(["2025-01-01", "2027-12-31"]);
});

test("A21: default custom range is three months from the first of the month", () => {
    const range = initialRange({
        defaultKind: undefined,
        focus: today,
        today,
        offered: ALL,
    });
    expect(range.kind).toBe("custom");
    expect(span(range)).toEqual(["2026-11-01", "2027-01-31"]);
    expect(scaleForCustom(range.start, range.stop, ALL)).toBe("month");
});

test("A22: context range and dates", () => {
    const base = { focus: today, today, offered: ALL };
    expect(span(initialRange({ ...base, contextKind: "month" }))).toEqual([
        "2026-10-01",
        "2026-12-31",
    ]);
    const onlyStart = initialRange({ ...base, contextStart: d("2026-11-15") });
    expect(span(onlyStart)).toEqual(["2026-11-15", "2027-01-31"]);
    expect(onlyStart.focus.toISODate()).toBe("2026-11-15");
    const onlyStop = initialRange({ ...base, contextStop: d("2026-12-20") });
    expect(span(onlyStop)).toEqual(["2026-10-01", "2026-12-20"]);
    expect(onlyStop.focus.toISODate()).toBe("2026-12-20");
    const onBoundary = initialRange({ ...base, contextStop: d("2026-12-01") });
    expect(span(onBoundary)).toEqual(["2026-09-01", "2026-12-01"]);
    const both = initialRange({
        ...base,
        contextStart: d("2026-12-01"),
        contextStop: d("2026-12-24"),
    });
    expect(span(both)).toEqual(["2026-12-01", "2026-12-24"]);
    expect(both.focus.toISODate()).toBe("2026-12-01"); // today is before the range
});

test("initial range order: stored, context, default; stored custom ignored", () => {
    const base = { focus: today, today, offered: ["week", "month"], defaultKind: "week" };
    expect(initialRange({ ...base, storedKind: "month", contextKind: "week" }).kind).toBe("month");
    expect(initialRange({ ...base, storedKind: "custom", contextKind: "month" }).kind).toBe("month");
    expect(initialRange({ ...base, storedKind: "year", contextKind: "day" }).kind).toBe("week");
});

test("A23: initial date moves the focus", () => {
    const range = initialRange({
        defaultKind: "week",
        focus: d("2026-12-15"),
        today,
        offered: ALL,
    });
    expect(span(range)).toEqual(["2026-12-06", "2026-12-26"]);
    expect(range.focus.toISODate()).toBe("2026-12-15");
});

test("A26: step moves by one period", () => {
    const week = stepRange(namedRange("week", today), 1);
    expect(span(week)).toEqual(["2026-11-08", "2026-11-28"]);
    expect(week.focus.toISODate()).toBe("2026-11-19");
    expect(span(stepRange(namedRange("week", today), -1))).toEqual(["2026-10-25", "2026-11-14"]);
    expect(span(stepRange(namedRange("month", today), 1))).toEqual(["2026-11-01", "2027-01-31"]);
    expect(span(stepRange(namedRange("month", today), -1))).toEqual(["2026-09-01", "2026-11-30"]);
    expect(span(stepRange(namedRange("quarter", today), 1))).toEqual(["2026-10-01", "2027-06-30"]);
    expect(span(stepRange(namedRange("quarter", today), -1))).toEqual(["2026-04-01", "2026-12-31"]);
    expect(span(stepRange(namedRange("day", today), 1))).toEqual(["2026-11-12", "2026-11-14"]);
    expect(span(stepRange(namedRange("day", today), -1))).toEqual(["2026-11-10", "2026-11-12"]);
    expect(span(stepRange(namedRange("year", today), 1))).toEqual(["2026-01-01", "2028-12-31"]);
    expect(span(stepRange(namedRange("year", today), -1))).toEqual(["2024-01-01", "2026-12-31"]);
});

test("A27: custom range steps by its length", () => {
    const range = { kind: "custom", start: d("2026-11-10"), stop: d("2026-11-19"), focus: today };
    expect(span(stepRange(range, 1))).toEqual(["2026-11-20", "2026-11-29"]);
    expect(span(stepRange(range, -1))).toEqual(["2026-10-31", "2026-11-09"]);
});

test("A30/A118: today keeps the custom length", () => {
    const custom = (start, stop) => ({ kind: "custom", start: d(start), stop: d(stop), focus: d(start) });
    expect(span(rangeAroundToday(custom("2026-01-01", "2026-01-09"), today))).toEqual([
        "2026-11-08",
        "2026-11-16",
    ]);
    expect(span(rangeAroundToday(custom("2026-01-01", "2026-01-08"), today))).toEqual([
        "2026-11-09",
        "2026-11-16",
    ]);
    expect(span(rangeAroundToday(custom("2026-01-01", "2026-01-10"), today))).toEqual([
        "2026-11-08",
        "2026-11-17",
    ]);
    expect(span(rangeAroundToday(custom("2026-01-05", "2026-01-05"), today))).toEqual([
        "2026-11-12",
        "2026-11-12",
    ]);
    const named = rangeAroundToday(namedRange("week", d("2026-03-01")), today);
    expect(named).toEqual(namedRange("week", today));
});

test("A33: custom dates are fixed", () => {
    let fixed = fixCustomDates(d("2026-11-20"), d("2026-11-10"), "start");
    expect([fixed.start.toISODate(), fixed.stop.toISODate()]).toEqual(["2026-11-20", "2026-11-20"]);
    fixed = fixCustomDates(d("2026-11-20"), d("2026-11-10"), "stop");
    expect([fixed.start.toISODate(), fixed.stop.toISODate()]).toEqual(["2026-11-10", "2026-11-10"]);
    fixed = fixCustomDates(d("2026-01-01"), d("2040-01-01"), "stop");
    expect([fixed.start.toISODate(), fixed.stop.toISODate()]).toEqual(["2030-01-02", "2040-01-01"]);
    fixed = fixCustomDates(d("2026-01-01"), d("2040-01-01"), "start");
    expect([fixed.start.toISODate(), fixed.stop.toISODate()]).toEqual(["2026-01-01", "2035-12-31"]);
    fixed = fixCustomDates(d("2026-01-01"), d("2035-12-31"), "stop");
    expect(fixed.start.toISODate()).toBe("2026-01-01");
});

test("A34/A119: custom scales", () => {
    const scale = (days, offered = ALL) => {
        const start = d("2026-11-01");
        return scaleForCustom(start, start.plus({ days }), offered);
    };
    for (const [days, expected] of [
        [4, "day"],
        [5, "day"],
        [6, "week"],
        [20, "week"],
        [26, "week"],
        [27, "month"],
        [100, "month"],
        [363, "month"],
        [364, "year"],
        [400, "year"],
    ]) {
        expect(scale(days)).toBe(expected);
    }
    expect(scale(400, ["day", "week", "month"])).toBe("month");
    expect(scale(20, ["quarter"])).toBe("month");
    expect(scale(20, ["quarter", "year"])).toBe("month");
    expect(scale(400, ["quarter", "year"])).toBe("year");
    expect(scale(4, ["month", "year"])).toBe("month");
});

test("A37: column widths", () => {
    expect(columnWidth("week", 21, 2, 1333)).toEqual({ width: 192, scrolls: true });
    expect(columnWidth("day", 48, 1, 1333)).toEqual({ width: 40, scrolls: true });
    expect(columnWidth("month", 40, 4, 1000)).toEqual({ width: 52, scrolls: true });
    expect(columnWidth("month", 40, 8, 1000)).toEqual({ width: 48, scrolls: true });
    expect(columnWidth("week", 8, 2, 1600)).toEqual({ width: 200, scrolls: false });
});

test("A38: precision attribute", () => {
    expect(partsFor("week")).toBe(2);
    expect(partsFor("day")).toBe(1);
    expect(partsFor("year", '{"year": "month:half"}')).toBe(1);
    const attr = "{'day': 'hour:half', 'week': 'day:full', 'month': 'day:quarter'}";
    expect(partsFor("day", attr)).toBe(2);
    expect(partsFor("week", attr)).toBe(1);
    expect(partsFor("month", attr)).toBe(4);
    expect(partsFor("week", '{"week": "day:third"}')).toBe(2);
    expect(partsFor("week", '{"week": "hour:full"}')).toBe(2);
    expect(partsFor("week", "not json")).toBe(2);
});

test("displayed period, columns and groups on the week scale", () => {
    const range = namedRange("week", today);
    const period = displayedPeriod(range, "week");
    expect(period.start.toISODate()).toBe("2026-11-01");
    expect(period.stop.toISODate()).toBe("2026-11-22");
    const columns = buildColumns("week", period);
    expect(columns).toHaveLength(21);
    expect(columns.filter((column) => column.isToday).map((c) => c.start.toISODate())).toEqual([
        "2026-11-12",
    ]);
    const groups = buildColumnGroups("week", columns);
    expect(groups.map((g) => [g.firstColumn, g.span])).toEqual([
        [0, 7],
        [7, 7],
        [14, 7],
    ]);
    expect(groups[1].label).toBe("Week 46, Nov 8 - Nov 14");
    expect(groups[1].tooltip).toBe(groups[1].label);
});

test("columns and groups on the month, day and year scales", () => {
    const month = namedRange("month", today);
    const columns = buildColumns("month", displayedPeriod(month, "month"));
    expect(columns).toHaveLength(92);
    const groups = buildColumnGroups("month", columns);
    expect(groups.map((g) => [g.span, g.label])).toEqual([
        [31, "October 2026"],
        [30, "November 2026"],
        [31, "December 2026"],
    ]);
    const dayRange = namedRange("day", today);
    const hours = buildColumns("day", displayedPeriod(dayRange, "day"));
    expect(hours).toHaveLength(72);
    expect(buildColumnGroups("day", hours).map((g) => g.span)).toEqual([24, 24, 24]);
    expect(buildColumnGroups("day", hours)[1].label).toBe("Thursday, November 12, 2026");
    const year = namedRange("year", today);
    const months = buildColumns("year", displayedPeriod(year, "year"));
    expect(months).toHaveLength(36);
    expect(buildColumnGroups("year", months).map((g) => g.label)).toEqual(["2025", "2026", "2027"]);
    expect(months.filter((m) => m.isToday)).toHaveLength(1);
});

test("A99: clock changes", () => {
    mockTimeZone("Europe/Brussels");
    for (const [iso, count] of [
        ["2026-03-29", 23],
        ["2026-10-25", 25],
        ["2026-03-28", 24],
    ]) {
        const day = DateTime.fromISO(iso);
        const range = { kind: "custom", start: day, stop: day, focus: day };
        expect(buildColumns("day", displayedPeriod(range, "day"))).toHaveLength(count);
    }
});

test("ten-year cap renders", () => {
    const start = d("2026-01-01");
    const { stop } = fixCustomDates(start, d("2050-01-01"), "start");
    expect(stop.toISODate()).toBe("2035-12-31");
    const range = { kind: "custom", start, stop, focus: start };
    expect(scaleForCustom(start, stop, ALL)).toBe("year");
    const columns = buildColumns("year", displayedPeriod(range, "year"));
    expect(columns.length).toBeLessThan(122);
    expect(columns).toHaveLength(120);
});
