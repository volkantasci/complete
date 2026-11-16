// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {
    beforeEach,
    describe,
    expect,
    freezeTime,
    mockDate,
    mockTimeZone,
    test,
} from "@odoo/hoot";
import {
    click,
    drag,
    keyDown,
    keyUp,
    press,
    queryAll,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    mountView,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import {
    at,
    HOST_ARCHS,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;

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
    await resize({ width: 1600, height: 900 });
});

const FEW = [["id", "in", [14]]];
const FORM = `multi_create_view="test_web_gantt.host_form_template_one"`;
const BASE = `default_range="week" color="x_color"`;
const GROUPS = ["parent_id", "x_contact"];
const H18 = timelineArch(`${BASE} plan="0"`);
const H33_MONTH = timelineArch(`default_range="month" color="x_color" ${FORM}`);
const H33_DAY = timelineArch(`default_range="day" color="x_color" ${FORM}`);
const H33_YEAR = timelineArch(`default_range="year" scales="year" color="x_color" ${FORM}`);
const H12_MULTI = timelineArch(
    `${BASE} progress="x_progress" display_unavailability="1" progress_bar="x_contact" ${FORM}`,
    `<field name="x_flagged"/><field name="x_done"/>`
);
const H12_MULTI_TOTAL = timelineArch(
    `${BASE} total_row="1" display_unavailability="1" progress_bar="x_contact" ${FORM}`
);
// ids of the records of the fixtures (4 + the index of the row in the fixtures)
const ID = { Test: 7, "Long task": 10, "Overlap A": 11, "Color eleven": 15 };

async function mountMulti({ arch = HOST_ARCHS.H33, groupBy = GROUPS, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, groupBy, ...rest });
    await animationFrame();
}

const renderer = () => queryOne(".o_tl_renderer");
const state = () => controller.selection.state;
const picked = () => controller.selection.renderer.picked;
const rows = () => queryAll(".o_tl_row[data-row-id]");
const isGroupRow = (row) => row.classList.contains("o_tl_group_row");
const labelOf = (row) => row.querySelector(".o_tl_row_label").textContent;
/** Index of the record row `sub` of the group `group` (the group row itself without `sub`). */
function rowIndex(group, sub) {
    const all = rows();
    const start = all.findIndex((row) => isGroupRow(row) && labelOf(row) === group);
    if (start < 0 || sub === undefined) {
        return start;
    }
    for (let i = start + 1; i < all.length && !isGroupRow(all[i]); i++) {
        if (labelOf(all[i]) === sub) {
            return i;
        }
    }
    return -1;
}
const cellOf = (rowIdx, date) =>
    rows()[rowIdx].querySelectorAll(".o_tl_cell")[
        Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index)
    ];
/** Viewport point in the half `half` (0 or 1) of the day `date` of the row `rowIdx`. */
function pointOf(rowIdx, date, half = 0) {
    const rect = queryRect(cellOf(rowIdx, date));
    return {
        x: rect.left + (rect.width * (half + 0.5)) / 2,
        y: rect.bottom - 4,
    };
}
const header = (date) => queryOne(`.o_tl_col[data-date="${date}"]`);
const pickedCells = () => queryAll(".o_tl_cell_picked");
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

/** Press at (row, date, half) and move to another cell; the button stays down. */
async function draw(from, to, { steps = [] } = {}) {
    const helpers = await drag(cellOf(from[0], from[1]), {
        position: pointOf(...from),
    });
    for (const [row, date, half] of [...steps, to]) {
        await helpers.moveTo(cellOf(row, date), { position: pointOf(row, date, half) });
        await animationFrame();
    }
    return helpers;
}

async function clickCell(rowIdx, date, half = 0) {
    await click(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half) });
    await animationFrame();
}

async function withKey(key, action) {
    await keyDown(key);
    try {
        await action();
    } finally {
        await keyUp(key);
    }
}

test("002b3 A4: week and month select; day, year and sparse follow 002b", async () => {
    await mountMulti({ groupBy: [], domain: FEW });
    expect(".o_tl_grid").toHaveClass("o_tl_multi");
    expect(rows()).toHaveCount(1);
    await clickCell(0, "2026-11-09", 0);
    expect(pickedCells()).toHaveCount(2);
    expect(state().count).toBe(0);
    expect(".o_dialog").toHaveCount(0);
    expect(".o_tl_grid").toHaveClass("o_tl_multi");
    // the sparse display mode: a click on a cell is 002b's again
    await contains(".o_tl_display_mode").click();
    await animationFrame();
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A4: the month scale keeps the mode, the day and year scales do not", async () => {
    await mountMulti({ arch: H33_MONTH, groupBy: [], domain: FEW });
    expect(".o_tl_grid").toHaveClass("o_tl_multi");
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_range_day").click();
    await animationFrame();
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    await click(rows()[0].querySelectorAll(".o_tl_cell")[10], {
        position: { x: queryRect(rows()[0].querySelectorAll(".o_tl_cell")[10]).left + 5, y: queryRect(rows()[0]).bottom - 4 },
    });
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(".o_dialog .modal-title").toHaveText("Plan");
});

test("002b3 A4: the year scale follows 002b", async () => {
    await mountMulti({ arch: H33_YEAR, groupBy: [], domain: FEW });
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    await click(rows()[0].querySelectorAll(".o_tl_cell")[3], {
        position: { x: queryRect(rows()[0].querySelectorAll(".o_tl_cell")[3]).left + 5, y: queryRect(rows()[0]).bottom - 4 },
    });
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(".o_dialog .modal-title").toHaveText("Plan");
});

test("002b3 A4: the day scale follows 002b", async () => {
    await mountMulti({ arch: H33_DAY, groupBy: [] });
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
});

test("002b3 A5: leaving multi-selection mode forgets the picked cells", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    await clickCell(row, "2026-11-10");
    expect(pickedCells()).toHaveCount(2);
    expect(".o_multi_selection_buttons").toHaveCount(1);
    // the window shrinks below the phone breakpoint without any new data
    await resize({ width: 390, height: 844 });
    await animationFrame();
    await animationFrame();
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
    expect(state().cellCount).toBe(0);
    // New on the phone is 002b's: no block taken from a stale selection
    const sent = [];
    controller.editor.createFor = (params) => sent.push(params);
    controller.selection.state.cellCount = 2;
    await controller.onNew();
    expect(sent).toHaveLength(1);
    expect(sent[0].row).toBe(undefined);
    // back on the desktop: the old selection does not come back
    controller.selection.state.cellCount = 0;
    await resize({ width: 1600, height: 900 });
    await animationFrame();
    await animationFrame();
    expect(".o_tl_grid").toHaveClass("o_tl_multi");
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
});

test("002b3 A5: the phone keeps 002b", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountMulti();
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    const cell = rows()[rowIndex("Beta", "Host Contact 2")].querySelectorAll(".o_tl_cell")[3];
    await click(cell);
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Plan");
    // the search starts from the row's values: Parent Beta
    // (on the phone the search bar shows behind its toggle)
    await click(".o_dialog .o_control_panel .oi[data-icon='search']");
    await animationFrame();
    expect(".o_dialog .o_searchview_facet").toHaveText(/Beta/);
    expect(pickedCells()).toHaveCount(0);
    await contains(".o_dialog .btn-close, .o_dialog .o_form_button_cancel").click();
    await animationFrame();
    await click(queryAll(".o_tl_col")[3]);
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    const scroll = renderer().scrollLeft;
    await click(rows()[rowIndex("Beta", "Host Contact 2")].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(renderer().scrollLeft).not.toBe(scroll);
});

test("002b3 A6: without a template form 002b applies", async () => {
    await mountMulti({ arch: H18 });
    expect(".o_tl_grid").not.toHaveClass("o_tl_multi");
    const row = rowIndex("Alpha", "Host Contact 1");
    const helpers = await draw([row, "2026-11-09", 0], [row, "2026-11-10", 1]);
    await helpers.drop();
    await animationFrame();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Create");
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    await click(header("2026-11-10"));
    await click(rows()[row].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A7: a click picks the day, no dialog, no click lock", async () => {
    freezeTime();
    await mountMulti();
    const first = rowIndex("Beta", "Host Contact 2");
    await clickCell(first, "2026-11-09", 0);
    expect(pickedCells()).toHaveCount(2);
    expect(".o_dialog").toHaveCount(0);
    const cell = queryRect(cellOf(first, "2026-11-09"));
    const [one, two] = pickedCells().map((el) => queryRect(el));
    expect(near(one.width, cell.width / 2)).toBe(true);
    expect(near(two.width, cell.width / 2)).toBe(true);
    expect(near(one.left, cell.left)).toBe(true);
    expect(near(one.height, queryRect(rows()[first]).height)).toBe(true);
    expect(state()).toMatchObject({ count: 0, cellCount: 2, visible: true });
    // a second click 0.3 s later replaces the selection
    await advanceTime(300);
    const second = rowIndex("Gamma", "Host Contact 3");
    await clickCell(second, "2026-11-09", 1);
    expect(pickedCells()).toHaveCount(2);
    expect(rows()[second].querySelectorAll(".o_tl_cell_picked")).toHaveLength(2);
    expect(".o_dialog").toHaveCount(0);
});

test("002b3 A8: Ctrl and a click toggle the day", async () => {
    await mountMulti();
    const first = rowIndex("Beta", "Host Contact 2");
    const second = rowIndex("Gamma", "Host Contact 3");
    await clickCell(first, "2026-11-09");
    await withKey("ctrl", () => clickCell(second, "2026-11-14"));
    expect(pickedCells()).toHaveCount(4);
    await withKey("ctrl", () => clickCell(second, "2026-11-14"));
    expect(pickedCells()).toHaveCount(2);
    expect(rows()[first].querySelectorAll(".o_tl_cell_picked")).toHaveLength(2);
});

test("002b3 A9: a drawing highlights its cells and shows no badge and no buttons while held", async () => {
    await mountMulti();
    const from = rowIndex("Beta", "Host Contact 2");
    const to = rowIndex("Gamma", "Undefined Contact");
    expect(to).toBeGreaterThan(from);
    const drawing = await draw([from, "2026-11-10", 0], [to, "2026-11-11", 0], {
        steps: [[from + 1, "2026-11-10", 1]],
    });
    expect(pickedCells()).toHaveCount(3 * (to - from + 1));
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_tl_pill_locked").toHaveCount(0);
    expect(state()).toMatchObject({ drawing: true, visible: false });
    expect(".o_timeline_view").toHaveClass("o_tl_drawing");
    await drawing.drop();
    await animationFrame();
    expect(pickedCells()).toHaveCount(3 * (to - from + 1));
    expect(state()).toMatchObject({ drawing: false, visible: true, cellCount: 3 * (to - from + 1) });
    // Gamma / Undefined Contact comes before Gamma / Host Contact 3: only "Color eleven" is there
    expect(controller.selection.renderer.pickedRecordIds()).toEqual([ID["Color eleven"]]);
    expect(state().count).toBe(1);
    expect(".o_timeline_view").not.toHaveClass("o_tl_drawing");
});

test("002b3 A9: a press and release with an 8 px move is a click", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    const start = pointOf(row, "2026-11-10", 0);
    const helpers = await drag(cellOf(row, "2026-11-10"), { position: start });
    await helpers.moveTo(cellOf(row, "2026-11-10"), {
        position: { x: start.x + 8, y: start.y },
    });
    await helpers.drop();
    await animationFrame();
    expect(pickedCells()).toHaveCount(2);
});

test("002b3 A10: group row cells highlighted, not counted", async () => {
    await mountMulti();
    const from = rowIndex("Beta", "Host Contact 2");
    const group = rowIndex("Gamma");
    const to = group + 1;
    const drawing = await draw([from, "2026-11-10", 0], [to, "2026-11-10", 1]);
    await drawing.drop();
    await animationFrame();
    expect(rows()[group].querySelectorAll(".o_tl_cell_picked")).toHaveLength(2);
    expect(near(queryRect(rows()[group].querySelector(".o_tl_cell_picked")).height, 40)).toBe(true);
    // the grey pills of the group row are no records: only the record rows count
    const withGroup = state().count;
    controller.selection.renderer.clearPicked();
    await animationFrame();
    const only = await draw([group + 1, "2026-11-10", 0], [to, "2026-11-10", 1]);
    await only.drop();
    await animationFrame();
    expect(state().count).toBe(withGroup);
    // a drawing over group row cells only (Gamma) counts no record
    controller.selection.renderer.clearPicked();
    await animationFrame();
    const gammaOnly = await draw([group, "2026-11-10", 0], [group, "2026-11-11", 1]);
    await gammaOnly.drop();
    await animationFrame();
    expect(state().count).toBe(0);
});

test("002b3 A15: a press on a group row cell draws nothing", async () => {
    await mountMulti();
    const group = rowIndex("Beta");
    const to = rowIndex("Beta", "Host Contact 2");
    const helpers = await draw([group, "2026-11-12", 0], [to, "2026-11-13", 0]);
    expect(pickedCells()).toHaveCount(0);
    await helpers.drop();
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A11: Ctrl held while drawing adds to the selection", async () => {
    await mountMulti();
    const first = rowIndex("Beta", "Host Contact 2");
    const second = rowIndex("Alpha", "Host Contact 1");
    await clickCell(first, "2026-11-09");
    await withKey("ctrl", async () => {
        const drawing = await draw([second, "2026-11-12", 0], [second + 1, "2026-11-12", 0]);
        await drawing.drop();
    });
    await animationFrame();
    expect(pickedCells()).toHaveCount(4);
    expect(state().cellCount).toBe(4);
});

test("002b3 A12: Escape during a drawing clears all, also from a locked pill", async () => {
    await mountMulti();
    const first = rowIndex("Beta", "Host Contact 2");
    await clickCell(first, "2026-11-09");
    expect(pickedCells()).toHaveCount(2);
    const to = rowIndex("Gamma", "Undefined Contact");
    const drawing = await draw([first, "2026-11-10", 0], [to, "2026-11-11", 0]);
    expect(pickedCells().length).toBeGreaterThan(2);
    await drawing.cancel();
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(state()).toMatchObject({ cellCount: 0, visible: false, drawing: false });
    // the same from the locked pill "Long task": cut at both ends
    const row = rowIndex("Gamma", "Host Contact 3");
    const pill = queryOne(`.o_tl_pill[data-pill-id="${ID["Long task"]}"]`);
    const rect = queryRect(pill);
    const locked = await drag(pill, { position: { x: rect.left + 60, y: rect.top + 8 } });
    await locked.moveTo(cellOf(row, "2026-11-12"), { position: pointOf(row, "2026-11-12", 1) });
    await animationFrame();
    expect(pickedCells().length).toBeGreaterThan(0);
    await locked.cancel();
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A13: a pill move or resize clears the selection", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    await clickCell(row, "2026-11-09");
    expect(pickedCells()).toHaveCount(2);
    const pill = queryOne(`.o_tl_pill[data-pill-id="${ID.Test}"]`);
    const rect = queryRect(pill);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(pill, { position: start });
    await helpers.moveTo(document.elementFromPoint(start.x + 50, start.y), {
        position: { x: start.x + 50, y: start.y },
    });
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(1);
    expect(pickedCells()).toHaveCount(0);
    expect(state().cellCount).toBe(0);
    await helpers.cancel();
    await animationFrame();
    // a resize
    await clickCell(row, "2026-11-09");
    expect(pickedCells()).toHaveCount(2);
    await contains(`.o_tl_pill[data-pill-id="${ID.Test}"]`).hover();
    await animationFrame();
    const handle = queryOne(`.o_tl_pill[data-pill-id="${ID.Test}"] .o_tl_handle_stop`);
    const box = queryRect(handle);
    const origin = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const resizing = await drag(handle, { position: origin });
    await resizing.moveTo(document.elementFromPoint(origin.x - 40, origin.y), {
        position: { x: origin.x - 40, y: origin.y },
    });
    await animationFrame();
    expect(".o_tl_pill_resizing").toHaveCount(1);
    expect(pickedCells()).toHaveCount(0);
    await resizing.cancel();
});

test("002b3 A14: drawing from a locked pill, no lock icon", async () => {
    await mountMulti();
    const row = rowIndex("Gamma", "Host Contact 3");
    const pill = queryOne(`.o_tl_pill[data-pill-id="${ID["Long task"]}"]`);
    const rect = queryRect(pill);
    const helpers = await drag(pill, { position: { x: rect.left + 400, y: rect.top + 8 } });
    await helpers.moveTo(cellOf(row, "2026-11-12"), { position: pointOf(row, "2026-11-12", 0) });
    await animationFrame();
    expect(".o_tl_pill_lock").toHaveCount(0);
    expect(".o_tl_pill_locked").toHaveCount(0);
    expect(pickedCells().length).toBeGreaterThan(0);
    await helpers.drop();
    await animationFrame();
    expect(state().visible).toBe(true);
    expect(controller.selection.renderer.pickedRecordIds().includes(ID["Long task"])).toBe(true);
    // the release over the pill is no click on it: no popover opens
    await advanceTime(400);
    expect(".o_tl_popover").toHaveCount(0);
});

test("002b3 A16: drawing scrolls in both directions near the edges", async () => {
    await resize({ width: 1600, height: 420 });
    await mountMulti({ arch: H33_MONTH });
    const element = renderer();
    expect(element.scrollWidth).toBeGreaterThan(element.clientWidth);
    expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
    const row = rowIndex("Alpha", "Host Contact 1");
    const date = "2026-11-12";
    const start = pointOf(row, date, 0);
    const helpers = await drag(cellOf(row, date), { position: start });
    const box = queryRect(element);
    const right = box.left + element.clientLeft + element.clientWidth;
    const bottom = box.top + element.clientTop + element.clientHeight;
    const before = { left: element.scrollLeft, top: element.scrollTop };
    freezeTime();
    await helpers.moveTo(document.elementFromPoint(right - 10, bottom - 10) || element, {
        position: { x: right - 10, y: bottom - 10 },
    });
    await advanceTime(250);
    await animationFrame();
    expect(element.scrollLeft).toBeGreaterThan(before.left + 50);
    expect(element.scrollTop).toBeGreaterThan(before.top + 50);
    expect(pickedCells().length).toBeGreaterThan(2);
    await helpers.cancel();
});

test("002b3 A17: column headers", async () => {
    await mountMulti();
    const count = rows().length;
    await click(header("2026-11-09"));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 2);
    await withKey("shift", () => click(header("2026-11-11")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 6);
    await withKey("ctrl", () => click(header("2026-11-13")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 8);
    await withKey("ctrl", () => click(header("2026-11-13")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 6);
    await withKey("ctrl", () => click(header("2026-11-13")));
    await animationFrame();
    await keyDown("ctrl");
    await withKey("shift", () => click(header("2026-11-12")));
    await keyUp("ctrl");
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 4);
    // the week line selects nothing
    await click(queryAll(".o_tl_col_group")[0]);
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 4);
});

test("002b3 A18: row header scrolls then selects", async () => {
    await mountMulti({ arch: H33_MONTH });
    const row = rowIndex("Beta", "Host Contact 2");
    renderer().scrollLeft = 0;
    await animationFrame();
    await click(rows()[row].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(renderer().scrollLeft).toBeGreaterThan(0);
    const total = queryAll(".o_tl_col").length * 2;
    expect(rows()[row].querySelectorAll(".o_tl_cell_picked")).toHaveLength(total);
    expect(pickedCells()).toHaveCount(total);
    expect(controller.selection.renderer.pickedRecordIds()).toEqual([ID.Test]);
    // Shift: every row down to Gamma / Undefined Contact, group rows between included
    const last = rowIndex("Gamma", "Undefined Contact");
    await withKey("shift", () => click(rows()[last].querySelector(".o_tl_row_header")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(total * (last - row + 1));
    // Escape, then Ctrl: a toggle on an empty selection
    await press("Escape");
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    const other = rowIndex("Alpha", "Host Contact 1");
    await withKey("ctrl", () => click(rows()[other].querySelector(".o_tl_row_header")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(total);
    await withKey("ctrl", () => click(rows()[other].querySelector(".o_tl_row_header")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    // Shift without an anchor: that row only
    controller.selection.renderer.clearPicked();
    await withKey("shift", () => click(rows()[last].querySelector(".o_tl_row_header")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(total);
});

test("002b3 A19: a group header clears by reload", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    await click(rows()[row].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(pickedCells().length).toBeGreaterThan(0);
    await click(rows()[rowIndex("Beta")].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(rows()[rowIndex("Beta")]).toHaveClass("o_tl_collapsed");
    expect(pickedCells()).toHaveCount(0);
    expect(state().cellCount).toBe(0);
});

test("002b3 A20: switching between a row anchor and a column anchor", async () => {
    await mountMulti();
    const count = rows().length;
    const row = rowIndex("Beta", "Host Contact 2");
    await click(rows()[row].querySelector(".o_tl_row_header"));
    await animationFrame();
    await click(header("2026-11-10"));
    await animationFrame();
    // the row was cleared first: only the column is selected
    expect(pickedCells()).toHaveCount(count * 2);
    await withKey("shift", () => click(header("2026-11-11")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 4);
    // a column, a plain cell click, then Shift on a header: the anchor is forgotten
    await click(header("2026-11-09"));
    await clickCell(row, "2026-11-12");
    await withKey("shift", () => click(header("2026-11-14")));
    await animationFrame();
    expect(pickedCells()).toHaveCount(count * 2);
});

test("002b3 A20: a finished drawing keeps the column anchor, a Ctrl cell click too", async () => {
    await mountMulti();
    const count = rows().length;
    await click(header("2026-11-09"));
    const beta = rowIndex("Beta", "Host Contact 2");
    const drawing = await draw([beta, "2026-11-13", 0], [beta, "2026-11-13", 1]);
    await drawing.drop();
    await animationFrame();
    expect(picked().columnAnchor).not.toBe(null);
    await withKey("shift", () => click(header("2026-11-11")));
    await animationFrame();
    // from the first header's column to the clicked one, in every row
    expect(pickedCells()).toHaveCount(count * 6);
    await withKey("ctrl", () => clickCell(beta, "2026-11-14"));
    expect(picked().columnAnchor).not.toBe(null);
});

describe("folded columns", () => {
    const unavailable = () => {
        timelineMock.unavailability = {
            x_contact: Object.fromEntries(
                [1, 2, 3].map((id) => [id, [{ start: at(3, "00:00"), stop: at(5, "00:00") }]])
            ),
        };
    };
    async function mountFolded(arch = H12_MULTI) {
        unavailable();
        await mountMulti({ arch, domain: [["id", "in", [4, 5, 6, 9]]] });
    }
    const total = () => rows().length;

    test("002b3 A21: a folded header opens and selects nothing; with Ctrl it selects", async () => {
        await mountFolded();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        await click(".o_tl_col.o_tl_folded");
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        expect(pickedCells()).toHaveCount(0);
        await mountFolded();
        await withKey("ctrl", () => click(".o_tl_col.o_tl_folded"));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        expect(pickedCells().length).toBeGreaterThan(0);
        expect(pickedCells().length % total()).toBe(0);
    });

    test("002b3 A21: an open column that can fold folds, selects nothing and clears", async () => {
        await mountFolded();
        await click(".o_tl_col.o_tl_folded");
        await animationFrame();
        await clickCell(1, "2026-11-12");
        expect(pickedCells()).toHaveCount(2);
        await click(".o_tl_col.o_tl_foldable");
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        expect(pickedCells()).toHaveCount(0);
    });

    test("002b3 A20: a plain click on a folded cell forgets the anchors, a Ctrl click keeps them", async () => {
        await mountFolded();
        await click(header("2026-11-12"));
        await animationFrame();
        expect(picked().columnAnchor).not.toBe(null);
        // a record row's folded cell (the first row is a group row)
        await withKey("ctrl", () => click(rows()[1].querySelector(".o_tl_folded_cell")));
        await animationFrame();
        expect(picked().columnAnchor).not.toBe(null);
        await click(rows()[1].querySelector(".o_tl_folded_cell"));
        await animationFrame();
        expect(picked().columnAnchor).toBe(null);
        expect(pickedCells()).toHaveCount(total() * 2);
    });

    test("002b3 A21: Shift selects a column that can fold without folding it", async () => {
        await mountFolded();
        await click(".o_tl_col.o_tl_folded");
        await animationFrame();
        await withKey("shift", () => click(".o_tl_col.o_tl_foldable"));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        expect(pickedCells()).toHaveCount(total() * 2);
    });

    test("002b3 A21: Shift on a folded header neither unfolds it nor selects it", async () => {
        await mountFolded();
        const folded = queryAll(".o_tl_col.o_tl_folded").length;
        await withKey("shift", () => click(".o_tl_col.o_tl_folded"));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(folded);
        expect(pickedCells()).toHaveCount(0);
    });

    test("002b3 A21: a click on a folded cell does nothing and a drawing skips folded cells", async () => {
        await mountFolded();
        const folded = queryAll(".o_tl_col.o_tl_folded").length;
        await click(rows()[0].querySelector(".o_tl_folded_cell"));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(folded);
        expect(pickedCells()).toHaveCount(0);
        // a Shift selection across the folded run never includes its cells
        await click(header("2026-11-12"));
        const open = queryAll(".o_tl_col").filter((el) => !el.classList.contains("o_tl_folded"));
        await withKey("shift", () => click(open.at(-1)));
        await animationFrame();
        const indexes = open
            .map((el) => Number(el.dataset.index))
            .filter((index) => index >= Number(header("2026-11-12").dataset.index));
        expect(rows()[1].querySelectorAll(".o_tl_cell_picked")).toHaveLength(indexes.length * 2);
    });

    /** The headers of the open columns next to the folded one, in the order of the page. */
    function aroundFold() {
        const cols = queryAll(".o_tl_col");
        const at = cols.findIndex((el) => el.classList.contains("o_tl_folded"));
        return { before: cols[at - 1], fold: cols[at], after: cols[at + 1] };
    }
    const foldedPicked = () => queryAll(".o_tl_folded_cell.o_tl_cell_picked");

    test("002c A8: Shift from the day after a folded run to the day before leaves the run out", async () => {
        await mountFolded();
        const { before, after } = aroundFold();
        await click(after);
        await animationFrame();
        expect(pickedCells()).toHaveCount(total() * 2);
        await withKey("shift", () => click(before));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        expect(pickedCells()).toHaveCount(total() * 4);
        expect(foldedPicked()).toHaveCount(0);
    });

    test("002c A8: a column header with Ctrl is selected and an open foldable one stays open", async () => {
        await mountFolded();
        await click(".o_tl_col.o_tl_folded");
        await animationFrame();
        await click(header("2026-11-10"));
        await animationFrame();
        expect(pickedCells()).toHaveCount(total() * 2);
        await withKey("ctrl", () => click(".o_tl_col.o_tl_foldable"));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        expect(pickedCells()).toHaveCount(total() * 4);
    });

    test("002c A8: a drawing across a folded run selects both sides and none of the run", async () => {
        await mountFolded();
        const { before, after } = aroundFold();
        // the cells of a row follow the headers on the page (a folded run is one cell)
        const cols = queryAll(".o_tl_col");
        const cell = (header) => rows()[1].querySelectorAll(".o_tl_cell")[cols.indexOf(header)];
        const point = (header, half) => {
            const rect = queryRect(cell(header));
            return { x: rect.left + (rect.width * (half + 0.5)) / 2, y: rect.bottom - 4 };
        };
        const drawing = await drag(cell(before), { position: point(before, 0) });
        await drawing.moveTo(cell(after), { position: point(after, 1) });
        await animationFrame();
        await drawing.drop();
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        expect(foldedPicked()).toHaveCount(0);
        expect(rows()[1].querySelectorAll(".o_tl_cell_picked")).toHaveCount(4);
    });

    test("002c A9: a folded cell of a record row selects nothing and stays folded, with and without Ctrl", async () => {
        await mountFolded();
        const cell = () => rows()[1].querySelector(".o_tl_folded_cell");
        await click(cell());
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        expect(pickedCells()).toHaveCount(0);
        await withKey("ctrl", () => click(cell()));
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(1);
        expect(pickedCells()).toHaveCount(0);
    });

    test("002c A9: the folded cell of the total row opens the run in multi-selection mode", async () => {
        await mountFolded(H12_MULTI_TOTAL);
        expect(".o_tl_total_row .o_tl_folded_cell").toHaveCount(1);
        await click(".o_tl_total_row .o_tl_folded_cell");
        await animationFrame();
        expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        expect(pickedCells()).toHaveCount(0);
    });

    test("002c A9: after a plain folded-cell click the anchor is gone, Shift on a header selects only that column", async () => {
        await mountFolded();
        await click(header("2026-11-10"));
        await animationFrame();
        expect(picked().columnAnchor).not.toBe(null);
        await click(rows()[1].querySelector(".o_tl_folded_cell"));
        await animationFrame();
        await withKey("shift", () => click(header("2026-11-12")));
        await animationFrame();
        expect(pickedCells()).toHaveCount(total() * 2);
    });
});

test("002b3 A25: Escape clears the selection, the range change reloads", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    await clickCell(row, "2026-11-10");
    expect(pickedCells()).toHaveCount(2);
    await press("Escape");
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(state().visible).toBe(false);
    await clickCell(row, "2026-11-10");
    await contains(".o_tl_next").click();
    await advanceTime(600);
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(state().cellCount).toBe(0);
});

test("002b3 A25: Today inside the displayed period keeps the selection; Escape with none does nothing", async () => {
    await mountMulti();
    // Escape with no selection does nothing
    await press("Escape");
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(state().visible).toBe(false);
    const row = rowIndex("Beta", "Host Contact 2");
    await clickCell(row, "2026-11-10");
    expect(pickedCells()).toHaveCount(2);
    await contains(".o_tl_today").click();
    await advanceTime(600);
    await animationFrame();
    expect(pickedCells()).toHaveCount(2);
    expect(state().visible).toBe(true);
    // a Today that changes the period reloads and clears
    for (let i = 0; i < 2; i++) {
        await contains(".o_tl_next").click();
        await advanceTime(600);
        await animationFrame();
    }
    const later = queryAll(".o_tl_col[data-date]")[3].dataset.date;
    await clickCell(rowIndex("Beta", "Host Contact 2"), later);
    expect(pickedCells()).toHaveCount(2);
    await contains(".o_tl_today").click();
    for (let i = 0; i < 3; i++) {
        await advanceTime(600);
        await animationFrame();
    }
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A25: a reload clears the cells and the anchors", async () => {
    await mountMulti();
    await click(header("2026-11-10"));
    await animationFrame();
    expect(picked().columnAnchor).not.toBe(null);
    await contains(".o_tl_next").click();
    await advanceTime(600);
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(picked().columnAnchor).toBe(null);
    expect(picked().rowAnchor).toBe(null);
    await contains(".o_tl_previous").click();
    await advanceTime(600);
    await animationFrame();
    const row = rowIndex("Beta", "Host Contact 2");
    await click(rows()[row].querySelector(".o_tl_row_header"));
    await animationFrame();
    expect(picked().rowAnchor).not.toBe(null);
    await controller.model.reload();
    await animationFrame();
    expect(picked().rowAnchor).toBe(null);
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A27: pointer shapes", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    const shape = (element) => getComputedStyle(element).cursor;
    expect(shape(cellOf(row, "2026-11-10"))).toBe("cell");
    expect(shape(rows()[row].querySelector(".o_tl_row_header"))).toBe("pointer");
    expect(shape(header("2026-11-10"))).toBe("pointer");
    await clickCell(row, "2026-11-10");
    expect(shape(cellOf(row, "2026-11-10"))).toBe("cell");
    expect(shape(header("2026-11-10"))).toBe("pointer");
    // while drawing, the view has the cell shape
    const drawing = await draw([row, "2026-11-10", 0], [row + 1, "2026-11-11", 0]);
    expect(shape(rows()[row].querySelector(".o_tl_row_header"))).toBe("cell");
    await drawing.drop();
});

test("002b3 A27: 002b keeps the arrow cursor on cells of a view without a template form", async () => {
    await mountMulti({ arch: H18 });
    const row = rowIndex("Beta", "Host Contact 2");
    expect(getComputedStyle(cellOf(row, "2026-11-10")).cursor).not.toBe("cell");
});

test("002c R14: the delayed reload after a method choice clears a cell selection", async () => {
    await mountMulti({
        arch: timelineArch(
            `${BASE} ${FORM} dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"`
        ),
    });
    await clickCell(rowIndex("Beta", "Host Contact 2"), "2026-11-10");
    expect(pickedCells()).toHaveCount(2);
    await click(".o_tl_reschedule_button");
    await animationFrame();
    await click(".o_tl_reschedule_consumeBuffer");
    await animationFrame();
    // the choice is shown at once, the selection stays until the data is loaded again
    expect(pickedCells()).toHaveCount(2);
    await advanceTime(600);
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(state().cellCount).toBe(0);
});
