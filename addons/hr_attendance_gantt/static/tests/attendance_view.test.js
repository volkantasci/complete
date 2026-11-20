// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, hover, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryAllTexts, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { onRpc, patchWithCleanup, toggleSearchBarMenu } from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";
import { RESIZE_DELAY } from "../src/attendance_timeline_renderer";

import {
    ARCH,
    mountAttendances,
    setupAttendanceFixtures,
} from "./attendance_test_helpers";

describe.current.tags("desktop");

setupAttendanceFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
});

const headerOf = (name) =>
    queryAll(".o_tl_row_header").find((header) => header.textContent.includes(name));
const labelOf = (name) => headerOf(name).querySelector(".o_tl_progress_label");
const fillOf = (name) => headerOf(name).querySelector(".o_tl_progress_fill");
const barOf = (name) => headerOf(name).querySelector(".o_tl_progress:not(.o_hag_bar_space)");
const entry = (value, max, tracked = false, flexible = false) => ({
    value,
    max_value: max,
    hag_tracked: tracked,
    hag_fully_flexible: flexible,
});

/** Mounts one row for each of the progress `entries` (by name), at a window width. */
async function mountLabels(entries, { width = 1400, ...rest } = {}) {
    await resize({ width });
    const employees = Object.keys(entries);
    return mountAttendances({
        employees,
        attendances: employees.map((name) => [name, [11, "8:00"], [11, "9:00"]]),
        progress: entries,
        ...rest,
    });
}

const STATES = {
    "Over Worker": entry(10, 8),
    "Double Worker": entry(18, 8),
    "Exact Worker": entry(8, 8),
    "Tracked Idle": entry(0, 8, true),
    "Untracked Idle": entry(0, 8, false),
};

// ----------------------------------------------------------------------------
// R17
// ----------------------------------------------------------------------------

test("A47: label states, colours and fill", async () => {
    await mountLabels(STATES);
    expect(labelOf("Over Worker")).toHaveText("10h / 8h (+2h)");
    expect(labelOf("Double Worker")).toHaveText("18h / 8h (+10h)");
    expect(labelOf("Exact Worker")).toHaveText("8h / 8h");
    expect(labelOf("Tracked Idle")).toHaveText("0h / 8h");
    expect(labelOf("Untracked Idle")).toHaveText("0h / 8h");
    expect(labelOf("Over Worker")).toHaveClass(["o_hag_warning", "text-warning"]);
    expect(labelOf("Double Worker")).toHaveClass(["o_hag_danger", "text-danger"]);
    expect(labelOf("Exact Worker")).toHaveClass("o_hag_success");
    expect(labelOf("Tracked Idle")).toHaveClass("o_hag_warning");
    expect(labelOf("Untracked Idle")).toHaveClass("o_hag_success");
    // the bar is filled to min(ratio, 100) % in the status colour; nothing at ratio 0
    expect(fillOf("Over Worker")).toHaveClass("o_hag_fill_warning");
    expect(fillOf("Over Worker").style.width).toBe("100%");
    expect(fillOf("Double Worker")).toHaveClass("o_hag_fill_danger");
    expect(fillOf("Double Worker").style.width).toBe("100%");
    expect(fillOf("Exact Worker")).toHaveClass("o_hag_fill_success");
    expect(fillOf("Exact Worker").style.width).toBe("100%");
    expect(fillOf("Tracked Idle")).toBe(null);
    expect(fillOf("Untracked Idle")).toBe(null);
    // the fill is the status colour at 75 %
    expect(getComputedStyle(fillOf("Double Worker")).backgroundColor).toMatch(/0\.75\)$/);
});

test("A47: the fill is the share of the maximum", async () => {
    await mountLabels({ "Half Worker": entry(4, 8), "Left Worker": entry(3.5, 8) });
    expect(labelOf("Half Worker")).toHaveText("4h / 8h (4h left)");
    expect(labelOf("Left Worker")).toHaveText("3h 30m / 8h (4h 30m left)");
    expect(fillOf("Half Worker").style.width).toBe("50%");
    expect(fillOf("Half Worker")).toHaveClass("o_hag_fill_success");
});

test("A48: below 1400 px the label is its short form", async () => {
    await mountLabels(STATES, { width: 1399 });
    expect(labelOf("Over Worker")).toHaveText("+2h");
    expect(labelOf("Double Worker")).toHaveText("+10h");
    expect(labelOf("Exact Worker")).toHaveText("8h");
    expect(labelOf("Tracked Idle")).toHaveText("0h");
    expect(labelOf("Untracked Idle")).toHaveText("0h");
});

test("A48: the short form of a partly done row", async () => {
    await mountLabels({ "Left Worker": entry(3.5, 8), "Plus Worker": entry(9, 8) }, { width: 1399 });
    expect(labelOf("Left Worker")).toHaveText("4h 30m left");
    expect(labelOf("Plus Worker")).toHaveText("+1h");
});

test("R17: the tooltip of the label and of the bar", async () => {
    await mountLabels({ "Plus Worker": entry(8.997, 8), "Free Worker": entry(5, 0) });
    expect(labelOf("Plus Worker")).toHaveAttribute("data-tooltip", "9h/8h (112%)");
    expect(barOf("Plus Worker")).toHaveAttribute("data-tooltip", "9h/8h (112%)");
    // no maximum: no tooltip and no bar
    expect(labelOf("Free Worker")).not.toHaveAttribute("data-tooltip");
    expect(barOf("Free Worker")).toBe(null);
    await hover(labelOf("Plus Worker"));
    await advanceTime(500);
    expect(".o-tooltip").toHaveText("9h/8h (112%)");
});

test("R17: the warning icon never shows", async () => {
    await mountLabels({
        "Plus Worker": { ...entry(9, 8), warning: "something" },
        "Free Worker": { ...entry(5, 0), warning: "something" },
    });
    expect(".o_tl_progress_warning").toHaveCount(0);
});

test("A49: the label form follows the width of the window without a reload", async () => {
    await mountLabels({ "Over Worker": entry(10, 8) });
    const height = queryRect(headerOf("Over Worker")).height;
    const calls = timelineMock.calls.length;
    expect(labelOf("Over Worker")).toHaveText("10h / 8h (+2h)");
    await resize({ width: 1399 });
    // the label changes at the latest a second after the resize
    await advanceTime(1000);
    await animationFrame();
    expect(labelOf("Over Worker")).toHaveText("+2h");
    await resize({ width: 1400 });
    await advanceTime(1000);
    await animationFrame();
    expect(labelOf("Over Worker")).toHaveText("10h / 8h (+2h)");
    expect(timelineMock.calls).toHaveLength(calls);
    expect(queryRect(headerOf("Over Worker")).height).toBe(height);
    expect(labelOf("Over Worker")).toHaveAttribute("data-tooltip", "10h/8h (125%)");
});

test("A49: the listener is removed when the view is left", async () => {
    let scheduled = 0;
    patchWithCleanup(browser, {
        setTimeout(callback, delay, ...rest) {
            if (delay === RESIZE_DELAY) {
                scheduled++;
            }
            return super.setTimeout(callback, delay, ...rest);
        },
    });
    await resize({ width: 1400 });
    const { view } = await mountAttendances({
        employees: ["Over Worker"],
        attendances: [["Over Worker", [11, "8:00"], [11, "9:00"]]],
        progress: { "Over Worker": entry(10, 8) },
    });
    // the resize starts the wait of the label (and perhaps that of other parts of the page)
    const before = scheduled;
    await resize({ width: 1399 });
    const whileShown = scheduled - before;
    expect(whileShown).toBeGreaterThan(0);
    await advanceTime(1000);
    view.__owl__.app.destroy();
    const afterLeaving = scheduled;
    await resize({ width: 1400 });
    await advanceTime(1000);
    // no listener of the view is left: the same resize starts no wait now
    expect(scheduled - afterLeaving).toBe(0);
});

test("A50: a fully flexible row shows the hours only", async () => {
    await mountLabels({ "Flexible Worker": entry(0, 0, false, true), "Other Worker": entry(5, 8) });
    const label = labelOf("Flexible Worker");
    expect(label).toHaveText("0h");
    expect(label).toHaveClass("o_hag_success");
    expect(label).not.toHaveAttribute("data-tooltip");
    expect(barOf("Flexible Worker")).toBe(null);
    // the bar's space stays: the header is as tall as another one, 41 px
    expect(queryRect(headerOf("Flexible Worker")).height).toBe(
        queryRect(headerOf("Other Worker")).height
    );
    expect(queryRect(headerOf("Flexible Worker")).height).toBe(41);
    // at the narrow width too
    await resize({ width: 1000 });
    await advanceTime(1000);
    await animationFrame();
    expect(labelOf("Flexible Worker")).toHaveText("0h");
});

test("A50: a flexible row with hours worked", async () => {
    await mountLabels({ "Flexible Worker": entry(3.5, 0, false, true) });
    expect(labelOf("Flexible Worker")).toHaveText("3h 30m");
    expect(barOf("Flexible Worker")).toBe(null);
});

test("N2: a fully flexible row with hours worked and the maximum of 24 h the server sends", async () => {
    await mountLabels({ "Tracked Flexible": entry(3.5, 24, true, true) });
    const label = labelOf("Tracked Flexible");
    expect(label).toHaveText("3h 30m");
    expect(label).toHaveClass("o_hag_success");
    expect(label).not.toHaveAttribute("data-tooltip");
    expect(barOf("Tracked Flexible")).toBe(null);
});

test("N2 (A70): a whole day worked by a fully flexible employee", async () => {
    await mountLabels({ "Flexible Worker": entry(24, 24, false, true) });
    const label = labelOf("Flexible Worker");
    expect(label).toHaveText("24h");
    expect(label).toHaveClass("o_hag_success");
    expect(label).not.toHaveAttribute("data-tooltip");
    expect(barOf("Flexible Worker")).toBe(null);
});

test("N2 (A70): the whole day of 25 h reads 25h in the warning colour, the day of 23 h 23h muted", async () => {
    // the maximum is 24 h on both days (the calendar days of the period); 25 h of 24 h is 104 %,
    // 23 h of 24 h is 96 %
    await mountLabels({
        "Long Day": entry(25, 24, false, true),
        "Short Day": entry(23, 24, false, true),
    });
    expect(labelOf("Long Day")).toHaveText("25h");
    expect(labelOf("Long Day")).toHaveClass(["o_hag_warning", "text-warning"]);
    expect(labelOf("Short Day")).toHaveText("23h");
    expect(labelOf("Short Day")).toHaveClass("o_hag_success");
    expect(labelOf("Long Day")).not.toHaveAttribute("data-tooltip");
    expect(barOf("Long Day")).toBe(null);
});

test("A45: a fully flexible employee tracked by attendances has a warning label", async () => {
    await mountLabels({ "Tracked Flexible": entry(0, 0, true, true) });
    const label = labelOf("Tracked Flexible");
    expect(label).toHaveText("0h");
    expect(label).toHaveClass(["o_hag_warning", "text-warning"]);
    expect(label).not.toHaveAttribute("data-tooltip");
    expect(barOf("Tracked Flexible")).toBe(null);
});

// ----------------------------------------------------------------------------
// R19
// ----------------------------------------------------------------------------

async function mountContracts(rest = {}) {
    const employees = ["Anita Oliver", "Audrey Peterson"];
    const make = await mountAttendances({
        employees,
        attendances: employees.map((name) => [name, [11, "8:00"], [11, "9:00"]]),
        ...rest,
    });
    return make;
}

test("A51: the names of the employees without a contract are red", async () => {
    await mountContracts({ withoutContract: ["Audrey Peterson"] });
    const name = (employee) => headerOf(employee).querySelector(".o_tl_row_label");
    expect(name("Audrey Peterson")).toHaveClass(["o_hag_no_contract", "text-danger"]);
    expect(name("Anita Oliver")).not.toHaveClass("text-danger");
    expect(".o_hag_no_contract").toHaveCount(1);
});

test("R19: no name is red with two groupings", async () => {
    await mountContracts({ withoutContract: ["Audrey Peterson"], groupBy: ["employee_id", "department_id"] });
    expect(".o_hag_no_contract").toHaveCount(0);
});

// ----------------------------------------------------------------------------
// R20
// ----------------------------------------------------------------------------

const HELP = `<p class="o_view_nocontent_smiling_face">Help of the action</p>`;

test("A53: the helper shows below the grid for one employee without attendance", async () => {
    await mountAttendances({ employees: ["Beth Evans"], expand: true, noContentHelp: HELP });
    expect(".o_tl_row").toHaveCount(1);
    expect(".o_hag_helper .o_view_nocontent").toHaveCount(1);
    expect(".o_hag_helper .o_nocontent_help").toHaveCount(1);
    // the helper is a layer over the content: its box lets the pointer through to the row
    expect(".o_hag_helper").toHaveStyle({ position: "absolute", pointerEvents: "none" });
    expect(".o_tl_row").toHaveCount(1);
});

test("A29: the helper shows with the placeholder row of a search that keeps no employee", async () => {
    await mountAttendances({ employees: [], noContentHelp: HELP });
    expect(".o_tl_row").toHaveCount(1);
    expect(".o_hag_helper .o_view_nocontent").toHaveCount(1);
});

test("A53: the generic message shows when the action has no help", async () => {
    await mountAttendances({ employees: [] });
    expect(".o_hag_helper .o_view_nocontent_empty_folder").toHaveCount(1);
});

test("A53: an employee with an attendance shows no helper", async () => {
    await mountAttendances({
        employees: ["Anita Oliver"],
        attendances: [["Anita Oliver", [11, "8:00"], [11, "9:00"]]],
        noContentHelp: HELP,
    });
    expect(".o_hag_helper").toHaveCount(0);
});

test("A70: the helper's layer starts 115 px below the content area's top at any window height", async () => {
    await resize({ width: 1600, height: 900 });
    await mountAttendances({ employees: ["Beth Evans"], expand: true, noContentHelp: HELP });
    const contentTop = () => queryRect(".o_content").top;
    for (const height of [700, 900, 1200]) {
        await resize({ width: 1600, height });
        await advanceTime(RESIZE_DELAY + 50);
        await animationFrame();
        const layer = queryRect(".o_hag_helper");
        // 25 + 50 px of header lines and the 40 px inner height of the one row
        expect(Math.abs(layer.top - (contentTop() + 115)) < 0.6).toBe(true);
        // down to the window's bottom, whatever its height
        expect(Math.abs(layer.bottom - height) < 0.6).toBe(true);
    }
    // the content is centred in the layer, not under the row
    const layer = queryRect(".o_hag_helper");
    const help = queryRect(".o_hag_helper .o_nocontent_help");
    expect(Math.abs(help.top + help.height / 2 - (layer.top + layer.height / 2)) < 2).toBe(true);
});

test("A8: in the monthly variant the helper's layer starts below the overview band", async () => {
    onRpc("hr.employee", "get_attendance_data_by_employee", () => ({}));
    await resize({ width: 1600, height: 900 });
    await mountAttendances({
        employees: ["Beth Evans"],
        expand: true,
        noContentHelp: HELP,
        arch: ARCH("month").replace("attendance_gantt", "monthly_attendance_gantt"),
        context: { active_id: 1, active_model: "hr.employee" },
    });
    const band = queryRect(".o_hag_overview_band");
    expect(band.height).toBe(96);
    expect(".o_hag_helper").toHaveCount(1);
    // the same 115 px below the content area's top as without the band, plus the band's own
    // height: the layer does not start inside the band
    const layer = queryRect(".o_hag_helper");
    expect(Math.abs(layer.top - (queryRect(".o_content").top + 96 + 115)) < 0.6).toBe(true);
    expect(layer.top >= band.bottom).toBe(true);
});

test("A54: no helper with twenty empty rows", async () => {
    const employees = Array.from({ length: 20 }, (_unused, index) => `Employee ${index + 10}`);
    await mountAttendances({ employees, expand: true, noContentHelp: HELP });
    expect(".o_tl_row").toHaveCount(20);
    expect(".o_hag_helper").toHaveCount(0);
});

// ----------------------------------------------------------------------------
// R11
// ----------------------------------------------------------------------------

test("A58: no multi-selection, no side panel, no dependencies; the search menu offers three sections", async () => {
    await mountAttendances({
        employees: ["Anita Oliver"],
        attendances: [["Anita Oliver", [11, "8:00"], [11, "9:00"]]],
    });
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    expect(".o_tl_with_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(".o_tl_connect").toHaveCount(0);
    expect(".o_tl_arrow").toHaveCount(0);
    expect(".o_tl_selection_buttons").toHaveCount(0);
    await toggleSearchBarMenu();
    expect(queryAllTexts(".o_search_bar_menu .o_dropdown_title")).toEqual([
        "Filters",
        "Group By",
        "Favorites",
    ]);
});

test("R17 point 5: the tooltip percentage is rounded, not cut (A40, A63, M80)", async () => {
    await mountLabels({
        "Long Worker": entry(28.997, 40),
        "Plus Worker": entry(8.997, 8),
        "Round Worker": entry(3.5, 8),
        "Half Worker": entry(29, 40),
    });
    expect(labelOf("Long Worker")).toHaveAttribute("data-tooltip", "29h/40h (72%)");
    // 43.75 % gives 44, a half rounds up
    expect(labelOf("Round Worker")).toHaveAttribute("data-tooltip", "3h 30m/8h (44%)");
    expect(labelOf("Half Worker")).toHaveAttribute("data-tooltip", "29h/40h (73%)");
    expect(labelOf("Plus Worker")).toHaveAttribute("data-tooltip", "9h/8h (112%)");
    expect(barOf("Plus Worker")).toHaveAttribute("data-tooltip", "9h/8h (112%)");
});

test("label of 8.997 h and 3.6667 h", async () => {
    await mountLabels({ "Plus Worker": entry(8.997, 8), "Minutes Worker": entry(3.6667, 8) });
    expect(labelOf("Plus Worker")).toHaveText("9h / 8h (+1h)");
    expect(labelOf("Minutes Worker")).toHaveText("3h 40m / 8h (4h 20m left)");
    await resize({ width: 1399 });
    await advanceTime(1000);
    await animationFrame();
    expect(labelOf("Plus Worker")).toHaveText("+1h");
});

test("a difference of no minute is no difference", async () => {
    await mountLabels({ "Near Worker": entry(7.999, 8), "Above Worker": entry(8.001, 8) });
    expect(labelOf("Near Worker")).toHaveText("8h / 8h");
    expect(labelOf("Above Worker")).toHaveText("8h / 8h");
    await resize({ width: 1399 });
    await advanceTime(1000);
    await animationFrame();
    expect(labelOf("Near Worker")).toHaveText("8h");
    expect(labelOf("Above Worker")).toHaveText("8h");
});

test("A68: the smallest difference with a bracket is 30 seconds, on both sides (R17, D6)", async () => {
    await mountLabels({
        "Over Half": entry(8 + 30 / 3600, 8),
        "Under Half": entry(8 - 30 / 3600, 8),
        "Over Ten": entry(8 + 10 / 3600, 8),
        "Under Ten": entry(8 - 10 / 3600, 8),
    });
    expect(labelOf("Over Half")).toHaveText("8h 1m / 8h (+0h 1m)");
    expect(labelOf("Under Half")).toHaveText("8h / 8h (0h 1m left)");
    expect(labelOf("Over Ten")).toHaveText("8h / 8h");
    expect(labelOf("Under Ten")).toHaveText("8h / 8h");
    // the status still follows the ratio (M87): warning above 100, success below
    expect(labelOf("Over Ten")).toHaveClass("text-warning");
    expect(labelOf("Under Ten")).not.toHaveClass("text-warning");
    expect(labelOf("Over Ten")).toHaveAttribute("data-tooltip", "8h/8h (100%)");
});
