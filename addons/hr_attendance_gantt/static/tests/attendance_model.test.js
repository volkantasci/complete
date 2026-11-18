// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";
import { periodDomain } from "../src/attendance_layout";

import {
    answerWithoutContract,
    ARCH,
    makeAttendanceData,
    makeAttendanceModel,
    setupAttendanceFixtures,
} from "./attendance_test_helpers";

const { DateTime } = luxon;

describe.current.tags("headless");

setupAttendanceFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
});

const first = (model) => model.period.start.toISODate();
const last = (model) => model.period.stop.minus({ days: 1 }).toISODate();
const middleAt = (model, isoDate) =>
    model.setViewAccess({ middleDate: () => DateTime.fromISO(isoDate), scroll: () => 0 });

/** One step, with the half second the view waits before it loads. */
async function stepBy(model, direction) {
    const done = model.step(direction);
    await advanceTime(500);
    await done;
}

// ----------------------------------------------------------------------------
// R12
// ----------------------------------------------------------------------------

test("A30: a named range is one period of its kind", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel();
    // Day: one day (the first display builds one period too)
    expect([first(model), last(model), model.columns.length]).toEqual([
        "2026-11-11",
        "2026-11-11",
        24,
    ]);
    // today lies in the period, so every range is built around it (R6)
    await model.setKind("week");
    expect([first(model), last(model), model.columns.length]).toEqual([
        "2026-11-08",
        "2026-11-14",
        7,
    ]);
    await model.setKind("month");
    expect([first(model), last(model), model.columns.length]).toEqual([
        "2026-11-01",
        "2026-11-30",
        30,
    ]);
    // the quarter is drawn at the month scale: its days
    await model.setKind("quarter");
    expect([first(model), last(model), model.scaleId, model.columns.length]).toEqual([
        "2026-10-01",
        "2026-12-31",
        "month",
        92,
    ]);
    await model.setKind("year");
    expect([first(model), last(model), model.columns.length]).toEqual([
        "2026-01-01",
        "2026-12-31",
        12,
    ]);
});

test("A30: the first display is one period of the default range", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel({ arch: ARCH("month") });
    expect([first(model), last(model)]).toEqual(["2026-11-01", "2026-11-30"]);
});

test("A30: previous and next move by one period", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel();
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-11-12", "2026-11-12"]);
    await model.setKind("week");
    await stepBy(model, -1);
    expect([first(model), last(model)]).toEqual(["2026-11-01", "2026-11-07"]);
    await model.setKind("month");
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-12-01", "2026-12-31"]);
    await stepBy(model, -1);
    await stepBy(model, -1);
    expect([first(model), last(model)]).toEqual(["2026-10-01", "2026-10-31"]);
    await model.setKind("quarter");
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2027-01-01", "2027-03-31"]);
    // today is not in the quarter shown: the year around the focus (January 2027), then one back
    await model.setKind("year");
    expect([first(model), last(model)]).toEqual(["2027-01-01", "2027-12-31"]);
    await stepBy(model, -1);
    expect([first(model), last(model)]).toEqual(["2026-01-01", "2026-12-31"]);
});

test("A30: Today builds today's one period", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel({ arch: ARCH("week") });
    await stepBy(model, 1);
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-11-22", "2026-11-28"]);
    expect(await model.goToday()).toBe("reloaded");
    expect([first(model), last(model)]).toEqual(["2026-11-08", "2026-11-14"]);
    // today is displayed: a scroll
    expect(await model.goToday()).toBe("scrolled");
});

test("A16: from the month of December, Week gives 13 to 19 December after one Next", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel({ arch: ARCH("month") });
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-12-01", "2026-12-31"]);
    // today (11 November) is not displayed: the middle of the visible part holds (R6)
    middleAt(model, "2026-12-16");
    await model.setKind("week");
    expect([first(model), last(model)]).toEqual(["2026-12-13", "2026-12-19"]);
});

// ----------------------------------------------------------------------------
// R13
// ----------------------------------------------------------------------------

test("R13: the domain of the period, as the server tests build it", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    const model = await makeAttendanceModel();
    // Day of 11 November in Brussels: 10 Nov 23:00 to 11 Nov 23:00 UTC; now 10:00:05 UTC
    const closed = [
        "&",
        "&",
        ["check_out", "!=", false],
        ["check_in", "<", "2026-11-11 23:00:00"],
        "|",
        ["check_out", ">", "2026-11-10 23:00:00"],
        ["check_in", ">=", "2026-11-10 23:00:00"],
    ];
    const opened = [
        "&",
        "&",
        ["check_out", "=", false],
        ["check_in", "<", "2026-11-11 23:00:00"],
        ["check_in", "<", "2026-11-11 10:00:05"],
    ];
    expect(model._periodDomain(model.period)).toEqual(["|", ...closed, ...opened]);
    expect(JSON.stringify(timelineMock.calls.at(-1).domain)).toInclude("2026-11-11 10:00:05");
    // a period that starts after now: no open attendance (point 2)
    await stepBy(model, 1);
    expect(model._periodDomain(model.period)).toEqual([
        "&",
        "&",
        ["check_out", "!=", false],
        ["check_in", "<", "2026-11-12 23:00:00"],
        "|",
        ["check_out", ">", "2026-11-11 23:00:00"],
        ["check_in", ">=", "2026-11-11 23:00:00"],
    ]);
    expect(JSON.stringify(timelineMock.calls.at(-1).domain)).not.toInclude("2026-11-11 10:00:05");
    // the pure function gives the same shape
    expect(periodDomain("a", "b", "S", "E", "N", true).length).toBe(1 + 7 + 5);
});

test("A31: an open attendance is drawn from its check-in to now, then snapped to its sub-column", async () => {
    await makeAttendanceData(
        ["Anita Oliver"],
        [
            ["Anita Oliver", [11, "8:00"], null],
            ["Anita Oliver", [10, "8:00"], [10, "9:00"]],
        ]
    );
    const model = await makeAttendanceModel();
    // now is 11:00:05: 8:00 to 11:15 on the quarter hours of the day scale
    const open = model.data.records.find((record) => record.isOpen);
    expect(open.span).toMatchObject({ from: 8 * 4, to: 11 * 4 + 1 });
    // the record's own data stay as the server sent them
    expect(open.raw.check_out).toBe(false);
    expect(model.data.records).toHaveLength(1);
    // the pill does not grow until the next load; two hours later it reaches 13:15
    await advanceTime(2 * 3600 * 1000);
    expect(model.data.records.find((record) => record.isOpen).span.to).toBe(11 * 4 + 1);
    await model.reload();
    expect(model.data.records.find((record) => record.isOpen).span.to).toBe(13 * 4 + 1);
});

test("A32: no open attendance is drawn in a period that lies in the future", async () => {
    await makeAttendanceData(["Anita Oliver"], [["Anita Oliver", [11, "8:00"], null]]);
    const model = await makeAttendanceModel();
    expect(model.data.records).toHaveLength(1);
    await stepBy(model, 1);
    expect(model.data.records).toHaveLength(0);
    // even a record the server would send is not drawn: its end (now) lies before the period
    const call = timelineMock.calls.at(-1);
    expect(JSON.stringify(call.domain)).not.toInclude('"check_out","=",false');
});

test("E6: an open attendance in a past period ends at the period end", async () => {
    // it began before the period and is still open
    await makeAttendanceData(["Anita Oliver"], [["Anita Oliver", [1, "8:00", 10], null]]);
    const model = await makeAttendanceModel({ arch: ARCH("week") });
    await stepBy(model, -1);
    expect([first(model), last(model)]).toEqual(["2026-11-01", "2026-11-07"]);
    expect(model.data.records).toHaveLength(1);
    const [open] = model.data.records;
    expect(open.isOpen).toBe(true);
    // the quarter days of the week scale: from the first to the last sub-column of the period
    expect(open.span).toEqual({ from: 0, to: 7 * 4, cutStart: true, cutStop: true });
});

// ----------------------------------------------------------------------------
// R19
// ----------------------------------------------------------------------------

test("R19: the employees without a contract are those of the answer, for one grouping only", async () => {
    const ids = await makeAttendanceData(["Anita Oliver", "Audrey Peterson"]);
    answerWithoutContract(() => [ids["Audrey Peterson"]]);
    const model = await makeAttendanceModel();
    expect([...model.data.withoutContract]).toEqual([ids["Audrey Peterson"]]);
    await model.load({ groupBy: ["employee_id", "department_id"], context: {} });
    expect(model.data.withoutContract.size).toBe(0);
});
