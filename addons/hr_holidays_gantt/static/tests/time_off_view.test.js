// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryAllTexts } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { patchWithCleanup, toggleSearchBarMenu } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";

import {
    makeTimeOffData,
    makeTimeOffModel,
    mountTimeOff,
    setupTimeOffFixtures,
} from "./time_off_test_helpers";

const { DateTime } = luxon;

describe.current.tags("desktop");

setupTimeOffFixtures();

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

test("A53: no New button in either variant", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"] });
    expect(".o_tl_button_add").toHaveCount(0);
    expect(".o_tl_grid").toHaveCount(1);
});

test("the leave variant's root carries the class of its control bar spacing", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"] });
    expect(".o_timeline_view.o_hhg_leave_view").toHaveCount(1);
});

test("the report variant's root carries its own class, not the leave variant's", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"], report: true });
    expect(".o_timeline_view").toHaveCount(1);
    expect(".o_timeline_view.o_hhg_leave_view").toHaveCount(0);
    expect(".o_timeline_view.o_hhg_report_view").toHaveCount(1);
});

test("A53: no New button in the report variant", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"], report: true });
    expect(".o_tl_button_add").toHaveCount(0);
    expect(".o_tl_grid").toHaveCount(1);
});

for (const report of [false, true]) {
    test(`the data call context holds group_by, tz and user_domain (${
        report ? "report" : "leave"
    })`, async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], report });
        const context = timelineMock.calls.at(-1).context;
        expect(context.group_by).toEqual(["employee_id"]);
        // the zone the test sets with mockTimeZone(1): UTC+1
        expect(context.tz).toBe("UTC+1");
        // today is the browser's (A86): the test clock stands on 11 November 2026
        expect(context.hhg_today).toBe("2026-11-11");
        expect(context.user_domain).toEqual([]);
    });

    test(`the same keys are sent again on a reload (${report ? "report" : "leave"})`, async () => {
        await makeTimeOffData(["Anita Oliver"]);
        const model = await makeTimeOffModel({ report });
        const loads = timelineMock.calls.length;
        await stepBy(model, 1);
        expect(timelineMock.calls.length).toBeGreaterThan(loads);
        const context = timelineMock.calls.at(-1).context;
        expect(context.group_by).toEqual(["employee_id"]);
        expect(context.tz).toBe("UTC+1");
        expect(context.hhg_today).toBe("2026-11-11");
        expect(context.user_domain).toEqual([]);
    });
}

test("A53: the base Gantt view shows the New button the time-off variant hides", async () => {
    const plain = `<gantt string="Days" date_start="start" date_stop="stop"
        default_group_by="employee_id" default_range="month" scales="week,month,quarter"
        precision="{'week': 'day:full', 'month': 'day:full'}" plan="0"/>`;
    await mountTimeOff({ employees: ["Anita Oliver"], arch: plain });
    expect(".o_tl_button_add").toHaveCount(1);
});

test("A54: the report variant still offers the Date grouping", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"], report: true });
    await toggleSearchBarMenu();
    expect(queryAllTexts(".o_search_bar_menu .o_menu_item")).toInclude("Date");
});

test("A54: the Date grouping is not offered", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"] });
    await toggleSearchBarMenu();
    const items = queryAllTexts(".o_search_bar_menu .o_menu_item");
    expect(items).toInclude("Employee");
    expect(items).toInclude("Type");
    expect(items).toInclude("Status");
    expect(items).not.toInclude("Date");
});

test("A48: a named range is one period", async () => {
    await makeTimeOffData(["Anita Oliver"]);
    const model = await makeTimeOffModel();
    expect([first(model), last(model)]).toEqual(["2026-11-01", "2026-11-30"]);
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-12-01", "2026-12-31"]);
    await model.setKind("week");
    await stepBy(model, -1);
    // a week is seven columns
    expect(model.columns.length).toBe(7);
    await model.setKind("quarter");
    expect(model.scaleId).toBe("month");
});

test("A48: Week Previous and Quarter Next move by one period", async () => {
    await makeTimeOffData(["Anita Oliver"]);
    const model = await makeTimeOffModel();
    await model.setKind("week");
    await stepBy(model, -1);
    expect([first(model), last(model)]).toEqual(["2026-11-01", "2026-11-07"]);
    await model.setKind("quarter");
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2027-01-01", "2027-03-31"]);
});

test("A49: a range chosen around today, or around the middle of the visible part", async () => {
    await makeTimeOffData(["Anita Oliver"]);
    const model = await makeTimeOffModel();
    middleAt(model, "2026-11-28");
    await model.setKind("week");
    expect([first(model), last(model)]).toEqual(["2026-11-08", "2026-11-14"]);
    await model.setKind("month");
    await stepBy(model, 1);
    middleAt(model, "2026-12-16");
    await model.setKind("week");
    expect([first(model), last(model)]).toEqual(["2026-12-13", "2026-12-19"]);
});

test("A50: Today reloads on another period, then only scrolls", async () => {
    await makeTimeOffData(["Anita Oliver"]);
    const model = await makeTimeOffModel();
    await model.setKind("week");
    await stepBy(model, 1);
    await stepBy(model, 1);
    expect([first(model), last(model)]).toEqual(["2026-11-22", "2026-11-28"]);
    expect(await model.goToday()).toBe("reloaded");
    expect([first(model), last(model)]).toEqual(["2026-11-08", "2026-11-14"]);
    expect(await model.goToday()).toBe("scrolled");
});

test("A50: Today on a custom range keeps its kind and its ten days", async () => {
    await makeTimeOffData(["Anita Oliver"]);
    const model = await makeTimeOffModel();
    await model.applyCustom(DateTime.fromISO("2026-12-01"), DateTime.fromISO("2026-12-10"), {
        edited: "start",
    });
    expect(model.range.kind).toBe("custom");
    await model.goToday();
    expect(model.range.kind).toBe("custom");
    expect(model.range.stop.diff(model.range.start, "days").days).toBe(9);
    expect(model.range.start.toISODate()).toBe("2026-11-07");
});

test("A15: the report variant offers Day to Year and Custom", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"], report: true });
    await click(".o_tl_range_button");
    await animationFrame();
    expect(queryAllTexts(".o_tl_range_item")).toEqual(["Day", "Week", "Month", "Quarter", "Year"]);
    expect(".o_tl_custom_line").toHaveCount(1);
});

test("A15: the leave variant offers Week, Month and Quarter", async () => {
    await mountTimeOff({ employees: ["Anita Oliver"] });
    await click(".o_tl_range_button");
    await animationFrame();
    expect(queryAllTexts(".o_tl_range_item")).toEqual(["Week", "Month", "Quarter"]);
});
