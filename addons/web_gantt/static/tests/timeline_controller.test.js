// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { press, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { contains, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    HOST_ARCHS,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const GROUPED = timelineArch(`default_range="week"`);

async function mountTimeline({ arch = HOST_ARCHS.H1, resModel = "pill", ...rest } = {}) {
    await mountView({ type: "gantt", resModel, arch, ...rest });
}

async function openRangeMenu() {
    await contains(".o_tl_range_button").click();
}

const customLine = () => [
    queryOne(".o_tl_custom_start input").value,
    queryOne(".o_tl_custom_stop input").value,
];
const rangeButtonText = () =>
    queryAllTexts(".o_tl_range_button span").join(" ") || queryOne(".o_tl_range_button").textContent.trim();
const scale = () => queryOne(".o_tl_renderer").dataset.scale;
const formatDay = (date) => date.toFormat("MM/dd/yyyy");

async function settle() {
    await advanceTime(500);
    await animationFrame();
}

async function applyCustom(startText, stopText) {
    await openRangeMenu();
    await contains(".o_tl_custom_start input").edit(startText, { confirm: "enter" });
    await contains(".o_tl_custom_stop input").edit(stopText, { confirm: "enter" });
    await contains(".o_tl_apply").click();
    await animationFrame();
}

test("A20: opens on Week with the custom line showing 11/01/2026 and 11/21/2026", async () => {
    await mountTimeline();
    expect(rangeButtonText()).toBe("Week");
    await openRangeMenu();
    expect(customLine()).toEqual(["11/01/2026", "11/21/2026"]);
    expect(scale()).toBe("week");
});

test("A25: range menu content", async () => {
    await mountTimeline();
    await openRangeMenu();
    expect(queryAllTexts(".o_tl_range_item")).toEqual(["Day", "Week", "Month", "Quarter", "Year"]);
    expect(".o_tl_range_item.selected").toHaveText("Week");
    expect(".o_tl_range_item.selected .fa-check").toHaveCount(1);
    expect(".o_tl_range_menu .dropdown-divider").toHaveCount(1);
    expect(".o_tl_custom_line input").toHaveCount(2);
    expect(".o_tl_apply").toHaveClass("btn-primary btn-sm");
    expect(".o_tl_apply").toHaveText("Apply");
});

test("A26: next and previous update the custom line", async () => {
    await mountTimeline();
    expect(timelineMock.calls).toHaveLength(1);
    await contains(".o_tl_next").click();
    await settle();
    expect(timelineMock.calls).toHaveLength(2);
    await openRangeMenu();
    expect(customLine()).toEqual(["11/08/2026", "11/28/2026"]);
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_previous").click();
    await contains(".o_tl_previous").click();
    await settle();
    expect(timelineMock.calls).toHaveLength(3);
    await openRangeMenu();
    expect(customLine()).toEqual(["10/25/2026", "11/14/2026"]);
});

test("A26: month steps by one month", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="month"`) });
    await openRangeMenu();
    expect(customLine()).toEqual(["10/01/2026", "12/31/2026"]);
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_next").click();
    await settle();
    await openRangeMenu();
    expect(customLine()).toEqual(["11/01/2026", "01/31/2027"]);
});

test("A27: next and previous move a custom range by its length", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H5,
        context: { default_start_date: "2026-11-12", default_stop_date: "2026-11-21" },
    });
    expect(rangeButtonText()).toBe("11/12/2026 11/21/2026");
    await contains(".o_tl_next").click();
    await settle();
    expect(rangeButtonText()).toBe("11/22/2026 12/01/2026");
    await contains(".o_tl_previous").click();
    await contains(".o_tl_previous").click();
    await settle();
    expect(rangeButtonText()).toBe("11/02/2026 11/11/2026");
});

test("A30: Today rebuilds the range when it is outside the period", async () => {
    await mountTimeline();
    await contains(".o_tl_next").click();
    await contains(".o_tl_next").click();
    await settle();
    expect(timelineMock.calls).toHaveLength(2);
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(timelineMock.calls).toHaveLength(3);
    await openRangeMenu();
    expect(customLine()).toEqual(["11/01/2026", "11/21/2026"]);
});

test("A30: Today on a custom range far in the past keeps its length", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H5,
        context: { default_start_date: "2026-01-01", default_stop_date: "2026-01-09" },
    });
    await contains(".o_tl_today").click();
    await animationFrame();
    // nine days, today in the middle
    expect(rangeButtonText()).toBe("11/08/2026 11/16/2026");
});

test("A31: shortcuts p n v t", async () => {
    await mountTimeline();
    expect(".o_tl_previous").toHaveAttribute("data-hotkey", "p");
    expect(".o_tl_next").toHaveAttribute("data-hotkey", "n");
    expect(".o_tl_range_button").toHaveAttribute("data-hotkey", "v");
    expect(".o_tl_today").toHaveAttribute("data-hotkey", "t");
    expect(".o_tl_today").toHaveAttribute("title", "Jump to today");
    const lengths = [];
    for (const key of ["n", "p", "n", "n", "t"]) {
        await press(["alt", key]);
        await settle();
        await settle();
        lengths.push(timelineMock.calls.length);
    }
    expect(lengths.join(",")).toBe("2,3,4,5,6");
    await press(["alt", "v"]);
    await animationFrame();
    expect(".o_tl_range_menu").toHaveCount(1);
});

test("A33: Apply sets the custom range and closes the menu", async () => {
    await mountTimeline();
    await openRangeMenu();
    // a start after the stop pulls the stop to the start
    await contains(".o_tl_custom_start input").edit("12/31/2026", { confirm: "enter" });
    expect(customLine()).toEqual(["12/31/2026", "12/31/2026"]);
    // more than ten years: the start moves
    await contains(".o_tl_custom_stop input").edit("12/31/2036", { confirm: "enter" });
    expect(customLine()).toEqual(["01/01/2027", "12/31/2036"]);
    expect(".o_tl_range_menu").toHaveCount(1);
    await contains(".o_tl_apply").click();
    await animationFrame();
    expect(".o_tl_range_menu").toHaveCount(0);
    expect(rangeButtonText()).toBe("01/01/2027 12/31/2036");
    expect(timelineMock.calls).toHaveLength(2);
});

test("A34: scale after Apply", async () => {
    await mountTimeline();
    const first = DateTime.local(2026, 11, 1);
    const expected = [
        [4, "day"],
        [5, "day"],
        [20, "week"],
        [26, "week"],
        [100, "month"],
        [363, "month"],
        [400, "year"],
    ];
    for (const [days, name] of expected) {
        await applyCustom(formatDay(first), formatDay(first.plus({ days })));
        expect(scale()).toBe(name);
    }
});

test("A34: no year offered gives the month scale", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    await applyCustom("11/01/2026", formatDay(DateTime.local(2026, 11, 1).plus({ days: 400 })));
    expect(scale()).toBe("month");
});

test("A63: expand and collapse button visibility", async () => {
    await mountTimeline({ arch: GROUPED, groupBy: ["parent_id", "x_contact"] });
    expect(".o_tl_collapse_all").not.toHaveClass("invisible");
    expect(".o_tl_collapse_all").toHaveAttribute("title", "Fold every group");
    expect(".o_tl_collapse_all .fa-caret-down").toHaveCount(1);
    await contains(".o_tl_collapse_all").click();
    expect(".o_tl_collapse_all").toHaveAttribute("title", "Open every group");
    expect(".o_tl_collapse_all .fa-caret-right").toHaveCount(1);
    await contains(".o_tl_collapse_all").click();
    expect(".o_tl_collapse_all").toHaveAttribute("title", "Fold every group");
});

test("A63: one level in dense mode keeps the invisible button in its place", async () => {
    await mountTimeline({ arch: GROUPED, groupBy: ["parent_id"] });
    expect(".o_tl_collapse_all").toHaveCount(1);
    expect(".o_tl_collapse_all").toHaveClass("invisible");
});

test("A65: display mode toggle", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H6, groupBy: ["parent_id"] });
    expect(".o_tl_display_mode .fa-compress").toHaveCount(1);
    expect(".o_tl_display_mode").toHaveAttribute("title", "Group records on shared rows");
    // groups_limit 2 pages the four groups
    expect(".o_pager_value").toHaveText("1-2");
    expect(".o_pager_limit").toHaveText("4");
    await contains(".o_tl_display_mode").click();
    expect(".o_tl_display_mode .fa-expand").toHaveCount(1);
    expect(".o_tl_display_mode").toHaveAttribute("title", "Show one row per record");
});

test("A80: no New button when create is off", async () => {
    await mountTimeline({ arch: timelineArch(`create="0"`) });
    expect(".o_tl_button_add").toHaveCount(0);
    expect(".o_tl_controls").toHaveCount(1);
});

test("A80: the New button renders with the c shortcut and does nothing", async () => {
    await mountTimeline();
    expect(".o_tl_button_add").toHaveCount(1);
    expect(".o_tl_button_add").toHaveAttribute("data-hotkey", "c");
    await contains(".o_tl_button_add").click();
    expect(".o_tl_controls").toHaveCount(1);
});

test("A110: access rights switch the buttons off", async () => {
    await mountTimeline({ arch: timelineArch(`create="false" delete="false"`) });
    expect(".o_tl_button_add").toHaveCount(0);
});

test("A118: Today keeps the custom range length", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H5,
        context: { default_start_date: "2026-01-01", default_stop_date: "2026-01-10" },
    });
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(rangeButtonText()).toBe("11/08/2026 11/17/2026");
    await contains(".o_tl_previous").click();
    await settle();
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(rangeButtonText()).toBe("11/08/2026 11/17/2026");
});

test("A119: only the quarter range offered", async () => {
    await mountTimeline({ arch: timelineArch(`scales="quarter" default_range="quarter"`) });
    await openRangeMenu();
    expect(queryAllTexts(".o_tl_range_item")).toEqual(["Quarter"]);
    await contains(".o_tl_range_button").click();
    await applyCustom("11/01/2026", "11/20/2026");
    expect(scale()).toBe("month");
    expect(".o_tl_column").toHaveCount(20);
});

test("A119: quarter and year offered", async () => {
    await mountTimeline({ arch: timelineArch(`scales="quarter,year" default_range="quarter"`) });
    await applyCustom("11/01/2026", "11/20/2026");
    expect(scale()).toBe("month");
    await applyCustom("11/01/2026", "12/06/2027");
    expect(scale()).toBe("year");
});

test("the renderer stub draws the column groups and columns", async () => {
    await mountTimeline();
    expect(".o_tl_column_group").toHaveCount(3);
    expect(".o_tl_column").toHaveCount(21);
    expect(queryAllTexts(".o_tl_column_group")[1]).toBe("Week 46, Nov 8 - Nov 14");
});
