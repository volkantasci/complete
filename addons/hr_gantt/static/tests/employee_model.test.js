// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";
import { MockServer, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";

import {
    ARCH,
    HALF_HOUR_PRECISION,
    makeEmployeeData,
    makeEmployeeModel,
    setupEmployeeFixtures,
    utc,
} from "./employee_test_helpers";

const { DateTime } = luxon;

describe.current.tags("headless");

setupEmployeeFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11 10:00:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const focusOf = (model) => model.data.range.focus.toISODate();
const middleAt = (model, isoDate) =>
    model.setViewAccess({ middleDate: () => DateTime.fromISO(isoDate), scroll: () => 0 });

// ----------------------------------------------------------------------------
// R3
// ----------------------------------------------------------------------------

test("R3: the data call carries the search conditions as user_domain", async () => {
    await makeEmployeeData(["Anita Oliver"], [["Shift", "Anita Oliver", [11, "9:00"], [11, "12:00"]]]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="day"`) });
    const call = timelineMock.calls.at(-1);
    // no search model in this test: the model's own conditions
    expect(call.context.user_domain).toEqual([]);
    expect(call.groupby).toEqual(["employee_id"]);
    expect(model.data.rows.map((row) => row.name)).toInclude("Anita Oliver");
});

// ----------------------------------------------------------------------------
// R6
// ----------------------------------------------------------------------------

test("A15: from Month, Week is built around today, not around the middle of the visible part", async () => {
    await makeEmployeeData(["Anita Oliver"]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="day"`) });
    await model.setKind("month");
    middleAt(model, "2026-11-16");
    await model.setKind("week");
    expect(model.data.range.kind).toBe("week");
    expect(focusOf(model)).toBe("2026-11-11");
});

test("A16: when today is not in the displayed period, the middle of the visible part holds", async () => {
    await makeEmployeeData(["Anita Oliver"]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="month"`) });
    // The base variant loads the periods around the focus (three months on the month range);
    // one period per range is the attendance variant's rule (R12, Task 9). One step still shows
    // November, so the test steps twice to leave it out of the displayed period.
    model.step(1);
    const next = model.step(1);
    await advanceTime(500);
    await next;
    expect(model.period.start.toISODate() > "2026-11-30").toBe(true);
    middleAt(model, "2027-01-16");
    await model.setKind("week");
    expect(focusOf(model)).toBe("2027-01-16");
});

test("A17: today in the displayed period but scrolled out of view still wins", async () => {
    await makeEmployeeData(["Anita Oliver"]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="quarter"`) });
    expect(model.data.range.kind).toBe("quarter");
    middleAt(model, "2026-12-31");
    await model.setKind("week");
    expect(focusOf(model)).toBe("2026-11-11");
});

test("A18: Today, previous and custom ranges keep 002a's behaviour", async () => {
    await makeEmployeeData(["Anita Oliver"]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="day"`) });
    model.step(-1);
    const back = model.step(-1);
    await advanceTime(500);
    await back;
    expect(focusOf(model)).toBe("2026-11-09");
    expect(await model.goToday()).toBe("reloaded");
    expect(focusOf(model)).toBe("2026-11-11");
    await model.applyCustom(DateTime.fromISO("2026-11-02"), DateTime.fromISO("2026-11-20"));
    expect(model.data.range.kind).toBe("custom");
    expect(model.data.range.start.toISODate()).toBe("2026-11-02");
    expect(model.data.range.stop.toISODate()).toBe("2026-11-20");
});

// ----------------------------------------------------------------------------
// R8
// ----------------------------------------------------------------------------

const LUNCH = [
    ["L2", "Gantt Lunch", [2, "9:00"], [2, "13:00"]],
    ["L3", "Gantt Lunch", [3, "12:30"], [3, "17:00"]],
    ["L4", "Gantt Lunch", [4, "11:00"], [4, "15:00"]],
    ["L5", "Gantt Lunch", [5, "10:00"], [5, "15:00"]],
    ["L6", "Gantt Lunch", [6, "11:30"], [6, "12:15"]],
    ["Night", "Gantt Lunch", [10, "20:00"], [11, "8:00"]],
];

/** [from, to] of a pill in the sub-columns, relative to the first sub-column of its day. */
function placed(model, name, isoDay) {
    const record = model.data.records.find((item) => item.displayName === name);
    const column = model.columns.findIndex((item) => item.start.toISODate() === isoDay);
    return [record.span.from - column * model.parts, record.span.to - column * model.parts];
}

test("A21: lunch rounding by half days on the month scale", async () => {
    await makeEmployeeData(["Gantt Lunch"], LUNCH);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="month"`) });
    expect(model.parts).toBe(2);
    expect(placed(model, "L2", "2026-11-02")).toEqual([0, 1]); // morning
    expect(placed(model, "L3", "2026-11-03")).toEqual([1, 2]); // afternoon
    expect(placed(model, "L4", "2026-11-04")).toEqual([1, 2]); // afternoon
    expect(placed(model, "L5", "2026-11-05")).toEqual([0, 2]); // both
    expect(placed(model, "L6", "2026-11-06")).toEqual([0, 1]); // morning
});

test("A22: no rounding at quarter-day precision", async () => {
    await makeEmployeeData(["Gantt Lunch"], LUNCH);
    const model = await makeEmployeeModel({
        arch: ARCH(`default_range="week"`),
        context: { initialDate: "2026-11-04" },
    });
    expect(model.parts).toBe(4);
    expect(placed(model, "L2", "2026-11-02")).toEqual([1, 3]); // 6:00 to 18:00
    expect(placed(model, "L4", "2026-11-04")).toEqual([1, 3]);
    expect(placed(model, "L5", "2026-11-05")).toEqual([1, 3]);
    expect(placed(model, "L6", "2026-11-06")).toEqual([1, 3]);
    expect(placed(model, "L3", "2026-11-03")).toEqual([2, 3]); // one quarter
});

test("A23: no rounding on the day scale, nor across midnight", async () => {
    await makeEmployeeData(["Gantt Lunch"], LUNCH);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="month"`) });
    // 20:00 to 8:00: the afternoon of the 10th and the morning of the 11th, not rounded
    const night = model.data.records.find((item) => item.displayName === "Night");
    const column = model.columns.findIndex((item) => item.start.toISODate() === "2026-11-10");
    expect([night.span.from - column * 2, night.span.to - column * 2]).toEqual([1, 3]);
    await model.setKind("day", DateTime.fromISO("2026-11-02"));
    const record = model.data.records.find((item) => item.displayName === "L2");
    // 9:00 to 13:00 of the day scale: sixteen quarter hours
    expect(record.span.to - record.span.from).toBe(16);
});

test("A22: a day scale with half-hour parts is not half-day precision, nothing is rounded", async () => {
    await makeEmployeeData(["Gantt Lunch"], [["Hour", "Gantt Lunch", [11, "9:00"], [11, "10:00"]]]);
    const model = await makeEmployeeModel({
        arch: ARCH(`default_range="day"`, HALF_HOUR_PRECISION),
    });
    expect(model.parts).toBe(2);
    const record = model.data.records.find((item) => item.displayName === "Hour");
    // one hour column of two half-hour parts: 9:00 to 10:00 stays whole
    expect(record.span.to - record.span.from).toBe(2);
    const column = model.columns.findIndex(
        (item) => item.start.toFormat("yyyy-MM-dd HH") === "2026-11-11 09"
    );
    expect(record.span.from).toBe(column * 2);
});

test("A21: start and stop are clipped to the displayed period before the rule applies", async () => {
    await makeEmployeeData(["Gantt Lunch"]);
    const model = await makeEmployeeModel({ arch: ARCH(`default_range="month"`) });
    const first = model.columns[0].start;
    const toServer = (date) => date.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
    const employee = MockServer.current.env["hr.employee"].find((item) => item.name === "Gantt Lunch").id;
    MockServer.current.env["hrg.shift"].create([
        {
            // 20:00 the evening before the period to 13:00 on its first day: clipped to 0:00 to
            // 13:00 of one day, the stop is the closer to noon and not after 14:00: the morning
            name: "Clipped",
            employee_id: employee,
            start: toServer(first.minus({ hours: 4 })),
            stop: toServer(first.plus({ hours: 13 })),
        },
        {
            // 11:30 to midnight: a stop at midnight falls on the next day (R8 rule 1), so
            // the pill is not rounded and keeps both halves
            name: "Midnight",
            employee_id: employee,
            start: toServer(first.plus({ days: 3, hours: 11, minutes: 30 })),
            stop: toServer(first.plus({ days: 4 })),
        },
    ]);
    // the same focus: the period (and so `first`) does not change
    await model.setKind("month", model.data.range.focus);
    const spanOf = (name) => model.data.records.find((item) => item.displayName === name).span;
    expect([spanOf("Clipped").from, spanOf("Clipped").to]).toEqual([0, 1]);
    expect([spanOf("Midnight").from, spanOf("Midnight").to]).toEqual([6, 8]);
});
