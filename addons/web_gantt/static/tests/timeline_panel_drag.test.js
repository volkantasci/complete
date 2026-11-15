// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    press,
    queryAll,
    queryAllTexts,
    queryOne,
    queryRect,
    resize,
    waitFor,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { HOST_ARCHS, Pill, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
/** The write calls the server saw, in order. */
let log;
/** Makes the writes wait for the test, or null. */
let gate = null;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineController.prototype, {
        setup() {
            super.setup(...arguments);
            controller = this;
        },
    });
    log = [];
    gate = null;
    onRpc("write", async ({ model, args }) => {
        log.push({ model, ids: args[0], values: args[1] });
        await gate;
    });
    await resize({ width: 1600, height: 900 });
});

async function mountPanel(arch = HOST_ARCHS.H36, { groupBy = ["parent_id"], ...rest } = {}) {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch,
        viewId: 5,
        config: { actionId: 7 },
        groupBy,
        ...rest,
    });
    await animationFrame();
    log.length = 0;
}

const pill = (name) => MockServer.current.env.pill.find((record) => record.name === name);
const lineEl = (name) =>
    queryAll(".o_tl_panel_line").find(
        (line) => line.querySelector(".o_tl_panel_name").textContent === name
    );
const names = () => queryAllTexts(".o_tl_panel_list .o_tl_panel_name");
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const root = () => queryOne(".o_timeline_view");
const badgeTexts = () => queryAllTexts(".o_tl_selection_badge");

/** The row element of the row named `names` (from the top level). */
function rowEl(...path) {
    let rows = controller.model.data.rows;
    let row;
    for (const name of path) {
        row = rows.find((item) => item.name === name);
        rows = row.children;
    }
    return queryAll(".o_tl_row[data-row-id]").find((element) => element.dataset.rowId === row.id);
}

const cellOf = (row, date) =>
    row.querySelector(`.o_tl_cell[data-column="${queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index}"]`);

/** The viewport point at `at` (0 to 1) of the width of the day `date` in the row `row`. */
function pointIn(row, date, at = 0.75) {
    const cell = queryRect(cellOf(row, date));
    const rect = queryRect(row);
    return { x: cell.left + cell.width * at, y: rect.top + rect.height / 2 };
}

/** Press the line `name` at its centre. `move(x, y)` moves in two steps. */
async function pressLine(name) {
    const element = lineEl(name);
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const move = async (x, y) => {
        for (const step of [0.5, 1]) {
            const px = start.x + (x - start.x) * step;
            const py = start.y + (y - start.y) * step;
            const target = document.elementFromPoint(px, py) || queryOne(".o_tl_renderer");
            await helpers.moveTo(target, { position: { x: px, y: py } });
            await animationFrame();
        }
    };
    return { ...helpers, start, move, over: (row, date, at) => move(...Object.values(pointIn(row, date, at))) };
}

async function settle() {
    await advanceTime(100);
    await animationFrame();
}

const writes = () => log.filter((entry) => entry.model === "pill");

test("002b3 A47: the line follows the pointer, the highlight covers one day from Thursday 12:00, badges read 11/12/2026, 12:00 PM and 11/13/2026, 12:00 PM", async () => {
    await mountPanel();
    const beta = rowEl("Beta");
    const before = queryRect(lineEl("Unscheduled"));
    const held = await pressLine("Unscheduled");
    // before the pointer moved 10 px nothing shows
    expect(".o_tl_panel_ghost").toHaveCount(0);
    const target = pointIn(beta, "2026-11-12");
    await held.move(target.x, target.y);

    // the copy follows the pointer, keeping the grabbed place (M41), at the line's size
    expect(".o_tl_panel_ghost").toHaveCount(1);
    const ghost = queryRect(".o_tl_panel_ghost");
    // (the page's own rectangles are measured by the tour: the test page is not at the window's origin)
    expect(near(parseFloat(queryOne(".o_tl_panel_ghost").style.left), target.x - 131)).toBe(true);
    expect(near(parseFloat(queryOne(".o_tl_panel_ghost").style.top), target.y - 14.5)).toBe(true);
    expect(ghost.width).toBe(262);
    expect(ghost.height).toBe(29);
    expect(".o_tl_panel_ghost").toHaveStyle({ position: "fixed" });
    // M42: its handle is dark
    expect(".o_tl_panel_ghost .o_tl_panel_handle").toHaveStyle({ color: "rgb(102, 102, 102)" });
    // M43: the list keeps its line where it was
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    expect(queryRect(lineEl("Unscheduled"))).toEqual(before);
    expect(lineEl("Unscheduled")).toHaveStyle({ opacity: "1" });
    // M40: one day from Thursday 12:00 over the Beta row's height
    expect(".o_tl_drop").toHaveCount(1);
    const thursday = queryRect(cellOf(beta, "2026-11-12"));
    const highlight = queryRect(".o_tl_drop");
    expect(near(highlight.left, thursday.left + thursday.width / 2)).toBe(true);
    expect(near(highlight.width, thursday.width)).toBe(true);
    expect(near(highlight.height, queryRect(beta).height)).toBe(true);
    expect(".o_tl_drop").toHaveStyle({ backgroundColor: "rgba(0, 160, 157, 0.3)" });
    // M44, M45: the badges stay in the black role
    expect(badgeTexts()).toEqual(["11/12/2026, 12:00 PM", "11/13/2026, 12:00 PM"]);
    expect(".o_tl_selection_badge.text-success, .o_tl_selection_badge.text-danger").toHaveCount(0);
    const start = queryRect(".o_tl_badge_start");
    const stop = queryRect(".o_tl_badge_stop");
    expect(near(start.left, highlight.left)).toBe(true);
    expect(near(start.bottom, highlight.top)).toBe(true);
    expect(near(stop.right, highlight.right)).toBe(true);
    expect(near(stop.top, highlight.bottom)).toBe(true);
    // M46: the move shape over the view
    expect(root()).toHaveClass("o_tl_drag_panel");
    expect(getComputedStyle(root()).cursor).toBe("move");
    await held.drop();
    await settle();
});

test("002b3 A47: the release writes start, stop and Parent Beta and reloads, no notification", async () => {
    await mountPanel();
    const held = await pressLine("Unscheduled");
    await held.over(rowEl("Beta"), "2026-11-12");
    await held.drop();
    await settle();
    expect(writes()).toEqual([
        {
            model: "pill",
            ids: [pill("Unscheduled").id],
            values: {
                date_start: "2026-11-12 09:00:00",
                date_stop: "2026-11-13 09:00:00",
                parent_id: 2,
            },
        },
    ]);
    expect(".o_notification").toHaveCount(0);
    expect(".o_notification_buttons, .o_notification button").toHaveCount(0);
    expect(".o_tl_panel_ghost").toHaveCount(0);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    // the view reloaded: the record left the list and stands in the Beta row
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 3");
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(queryAllTexts(".o_tl_pill", { root: rowEl("Beta") })).toInclude("Unscheduled");
});

test("002b3 A48: ungrouped drop writes no grouping; a Parent group row writes the Parent only", async () => {
    await mountPanel(HOST_ARCHS.H36, { groupBy: [] });
    const row = queryAll(".o_tl_row[data-row-id]")[0];
    const held = await pressLine("Unscheduled");
    await held.over(row, "2026-11-11", 0.25);
    expect(badgeTexts()).toEqual(["11/11/2026, 12:00 AM", "11/12/2026, 12:00 AM"]);
    await held.drop();
    await settle();
    // Wednesday 11, 00:00 to Thursday 12, 00:00 local (three hours ahead)
    expect(writes()).toEqual([
        {
            model: "pill",
            ids: [pill("Unscheduled").id],
            values: { date_start: "2026-11-10 21:00:00", date_stop: "2026-11-11 21:00:00" },
        },
    ]);
});

test("002b3 A48: a Parent group row of a two-level grouping writes the Parent only", async () => {
    await mountPanel(HOST_ARCHS.H36, { groupBy: ["parent_id", "x_contact"] });
    const group = rowEl("Beta");
    expect(group).toHaveClass("o_tl_group_row");
    const held = await pressLine("Gamma");
    await held.over(group, "2026-11-12");
    expect(".o_tl_drop").toHaveCount(1);
    expect(near(queryRect(".o_tl_drop").height, 40)).toBe(true);
    await held.drop();
    await settle();
    expect(writes()).toEqual([
        {
            model: "pill",
            ids: [pill("Gamma").id],
            values: {
                date_start: "2026-11-12 09:00:00",
                date_stop: "2026-11-13 09:00:00",
                parent_id: 2,
            },
        },
    ]);
});

test("002b3 A49: Created by rows refuse", async () => {
    patchWithCleanup(Pill._fields.x_contact, { readonly: true });
    await mountPanel(HOST_ARCHS.H36, { groupBy: ["parent_id", "x_contact"] });
    for (const path of [["Beta", "Host Contact 3"], ["Alpha", "Host Contact 1"]]) {
        const held = await pressLine("Unscheduled");
        await held.over(rowEl(...path), "2026-11-12");
        expect(".o_tl_panel_ghost").toHaveCount(1);
        expect(".o_tl_drop").toHaveCount(0);
        expect(".o_tl_selection_badge").toHaveCount(0);
        await held.drop();
        await settle();
        expect(writes()).toEqual([]);
        expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    }
    // a Parent row shows the highlight and writes the Parent only
    const held = await pressLine("Unscheduled");
    await held.over(rowEl("Beta"), "2026-11-12");
    expect(".o_tl_drop").toHaveCount(1);
    await held.drop();
    await settle();
    expect(writes().map((entry) => entry.values)).toEqual([
        { date_start: "2026-11-12 09:00:00", date_stop: "2026-11-13 09:00:00", parent_id: 2 },
    ]);
});

test("002b3 A50: Escape cancels; no edge scroll; release over the control bar writes nothing", async () => {
    await mountPanel(timelineArch(`string="Pills" default_range="month" schedule="1" plan="0"`));
    const renderer = queryOne(".o_tl_renderer");
    expect(renderer.scrollWidth).toBeGreaterThan(renderer.clientWidth);
    const held = await pressLine("Unscheduled");
    const row = queryAll(".o_tl_row[data-row-id]")[1];
    const box = queryRect(renderer);
    // near the right edge of the grid: the grid does not scroll
    const scrolled = renderer.scrollLeft;
    await held.move(box.right - 10, queryRect(row).top + 10);
    await advanceTime(800);
    await animationFrame();
    expect(renderer.scrollLeft).toBe(scrolled);
    expect(".o_tl_panel_ghost").toHaveCount(1);
    // Escape: the line goes back, nothing is written
    await press("Escape");
    await animationFrame();
    expect(".o_tl_panel_ghost").toHaveCount(0);
    expect(".o_tl_drop").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    await held.drop();
    await settle();
    expect(writes()).toEqual([]);
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);

    // released over the control bar
    const again = await pressLine("Unscheduled");
    const bar = queryRect(".o_control_panel");
    await again.move(bar.left + bar.width / 2, bar.top + bar.height / 2);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    await again.drop();
    await settle();
    expect(writes()).toEqual([]);
    expect(".o_tl_panel_ghost").toHaveCount(0);
});

test("002b3 A50: a release over the panel writes nothing and the next drag works", async () => {
    await mountPanel();
    const first = await pressLine("Unscheduled");
    await first.over(rowEl("Beta"), "2026-11-12");
    expect(".o_tl_drop").toHaveCount(1);
    const panel = queryRect(".o_tl_panel");
    await first.move(panel.left + 100, panel.top + 300);
    // over the panel: no highlight, no badge
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_tl_panel_ghost").toHaveCount(1);
    await first.drop();
    await settle();
    expect(writes()).toEqual([]);
    expect(".o_tl_panel_ghost").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    // the next press works
    const second = await pressLine("Gamma");
    await second.over(rowEl("Alpha"), "2026-11-12");
    await second.drop();
    await settle();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].ids).toEqual([pill("Gamma").id]);
    expect(writes()[0].values.parent_id).toBe(1);
});

test("002b3 A57: a panel drag clears the selection", async () => {
    await mountPanel(HOST_ARCHS.H40);
    const cell = queryAll(".o_tl_row[data-row-id]:not(.o_tl_group_row) .o_tl_cell")[8];
    await click(cell);
    await animationFrame();
    expect(controller.selection.state.cellCount).toBeGreaterThan(0);
    expect(".o_tl_cell_picked").not.toHaveCount(0);
    const held = await pressLine("Unscheduled");
    await held.move(held.start.x - 100, held.start.y + 50);
    expect(".o_tl_panel_ghost").toHaveCount(1);
    expect(controller.selection.state.cellCount).toBe(0);
    expect(".o_tl_cell_picked").toHaveCount(0);
    await held.drop();
    await settle();
});

test("002b3 A60: a date-only drop writes the day as start and stop ", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill2",
        arch: timelineArch(
            `string="Dated pills" default_range="month" scales="day,week,month" schedule="1"`
        ),
        viewId: 5,
        config: { actionId: 7 },
    });
    await animationFrame();
    MockServer.current.env.pill2.create({ name: "Undated", active: true });
    await controller.model.reload();
    await animationFrame();
    log.length = 0;
    expect(names()).toEqual(["Undated"]);
    const held = await pressLine("Undated");
    const row = queryAll(".o_tl_row[data-row-id]")[0];
    await held.over(row, "2026-11-12", 0.75);
    expect(".o_tl_drop").toHaveCount(1);
    const thursday = queryRect(cellOf(row, "2026-11-12"));
    // the whole day, and both badges show the day
    expect(near(queryRect(".o_tl_drop").left, thursday.left)).toBe(true);
    expect(near(queryRect(".o_tl_drop").width, thursday.width)).toBe(true);
    expect(badgeTexts()).toEqual(["11/12/2026", "11/12/2026"]);
    await held.drop();
    await settle();
    expect(log).toEqual([
        {
            model: "pill2",
            ids: [MockServer.current.env.pill2.find((record) => record.name === "Undated").id],
            values: { date_start: "2026-11-12", date_stop: "2026-11-12" },
        },
    ]);
});

test("002b3 A61: the second drop waits for the first write", async () => {
    await mountPanel();
    let release;
    gate = new Promise((resolve) => (release = resolve));
    const first = await pressLine("Unscheduled");
    await first.over(rowEl("Beta"), "2026-11-12");
    await first.drop();
    await settle();
    expect(writes()).toHaveLength(1);
    // before the reload returned: the second drop
    const second = await pressLine("Gamma");
    await second.over(rowEl("Alpha"), "2026-11-11");
    await second.drop();
    await settle();
    expect(writes()).toHaveLength(1);
    release();
    await settle();
    await settle();
    expect(writes().map((entry) => entry.ids)).toEqual([[pill("Unscheduled").id], [pill("Gamma").id]]);
    expect(pill("Unscheduled").date_start).not.toBe(false);
    expect(pill("Gamma").date_start).not.toBe(false);
    expect(names()).toEqual(["Alpha", "Beta"]);
});

test("002b3 R19: a click anywhere on a line opens the record, the end of a drag does not", async () => {
    await mountPanel();
    await contains(".o_tl_panel_line[data-record-id='2'] .o_tl_panel_handle").click();
    await waitFor(".modal-body .o_form_view");
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    await advanceTime(100);
    expect(".o_dialog").toHaveCount(0);
    // a drag released over the panel's own line opens nothing
    const held = await pressLine("Gamma");
    await held.move(held.start.x + 5, held.start.y + 40);
    await held.move(held.start.x, held.start.y);
    await held.drop();
    await settle();
    expect(".o_dialog").toHaveCount(0);
});
