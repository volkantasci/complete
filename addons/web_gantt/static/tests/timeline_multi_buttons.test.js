// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    keyDown,
    keyUp,
    press,
    queryAll,
    queryAllTexts,
    queryOne,
    queryRect,
    resize,
    waitFor,
} from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { at, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

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

const BASE = `default_range="week" color="x_color" multi_create_view="test_web_gantt.host_form_template_one"`;
const GROUPS = ["parent_id", "x_contact"];

async function mountMulti(attrs = "", { groupBy = GROUPS, ...rest } = {}) {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(`${BASE} ${attrs}`),
        groupBy,
        ...rest,
    });
    await animationFrame();
}

const rows = () => queryAll(".o_tl_row[data-row-id]");
const isGroupRow = (row) => row.classList.contains("o_tl_group_row");
const labelOf = (row) => row.querySelector(".o_tl_row_label").textContent;
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
function pointOf(rowIdx, date, half = 0, dx = 0) {
    const rect = queryRect(cellOf(rowIdx, date));
    return { x: rect.left + (rect.width * (half + 0.5)) / 2 + dx, y: rect.bottom - 4 };
}
const header = (date) => queryOne(`.o_tl_col[data-date="${date}"]`);
const pickedCells = () => queryAll(".o_tl_cell_picked");
const buttons = () => queryOne(".o_multi_selection_buttons");
const countText = () => queryOne(".o_multi_selection_buttons .o_selection_box b").textContent;

async function clickCell(rowIdx, date, half = 0) {
    await click(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half) });
    await animationFrame();
    await animationFrame();
}

/** Draw inside one half day of a row (one picked cell). */
async function drawInHalfDay(rowIdx, date, half = 0) {
    const helpers = await drag(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half, -20) });
    await helpers.moveTo(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half, 20) });
    await helpers.drop();
    await animationFrame();
    await animationFrame();
}

/** The cells of A9: Beta / Contact 2 to Gamma / Undefined, Tuesday 10 first half to Wednesday 11. */
async function drawA9() {
    const from = rowIndex("Beta", "Host Contact 2");
    const to = rowIndex("Gamma", "Undefined Contact");
    const helpers = await drag(cellOf(from, "2026-11-10"), {
        position: pointOf(from, "2026-11-10", 0),
    });
    await helpers.moveTo(cellOf(to, "2026-11-11"), { position: pointOf(to, "2026-11-11", 0) });
    await helpers.drop();
    await animationFrame();
    await animationFrame();
}

const buttonTexts = () =>
    queryAll(".o_multi_selection_buttons > button").map((button) => button.textContent.trim());

async function withKey(key, action) {
    await keyDown(key);
    try {
        await action();
    } finally {
        await keyUp(key);
    }
}

test("002b3 A22: the count after a drawing and after the first header click", async () => {
    await mountMulti();
    await drawA9();
    expect(countText()).toBe("1");
    await click(header("2026-11-09"));
    await animationFrame();
    await animationFrame();
    expect(countText()).toBe("3");
    expect(queryOne(".o_multi_selection_buttons .o_selection_box").textContent).toMatch(
        /^\s*3\s+selected\s*$/
    );
});

// a week of one record whose pill is not on Monday 9: a click there counts no record
const FEW = [["id", "in", [14]]];

test("002b3 A7: count 0 shows Add only", async () => {
    await mountMulti("", { groupBy: [], domain: FEW });
    await clickCell(0, "2026-11-09", 0);
    expect(countText()).toBe("0");
    expect(buttonTexts().filter((text) => text.length)).toEqual(["Add"]);
    expect(".o_multi_selection_buttons .o_tl_multi_plan").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(0);
});

test("002b3 E3: count 0 hides Delete", async () => {
    await mountMulti("", { groupBy: [], domain: FEW });
    await clickCell(0, "2026-11-09", 1);
    expect(countText()).toBe("0");
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Add']").toHaveCount(1);
});

test("002b3 A9: the buttons sit in the control bar, hidden while no cell is picked", async () => {
    await mountMulti();
    expect(".o_multi_selection_buttons").toHaveCount(0);
    await drawA9();
    expect(".o_tl_controls .o_multi_selection_buttons").toHaveCount(1);
    expect(buttonTexts().filter((text) => text.length)).toEqual(["Add"]);
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(1);
    expect(".o_tl_multi_plan").toHaveCount(0);
    const bar = queryRect(".o_tl_controls");
    const box = queryRect(buttons());
    expect(Math.abs(box.left + box.width / 2 - (bar.left + bar.width / 2))).toBeLessThan(2);
});

test("002b3 A23: one cell shows Plan; Plan opens the plan dialog for the row and that half day; Escape keeps the selection", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    await drawInHalfDay(row, "2026-11-10", 0);
    expect(pickedCells()).toHaveCount(1);
    expect(".o_multi_selection_buttons .o_tl_multi_plan").toHaveCount(1);
    expect(".o_tl_multi_plan").toHaveText("Plan");
    expect(".o_tl_multi_plan").toHaveClass("btn-secondary");
    await contains(".o_tl_multi_plan").click();
    await waitFor(".o_dialog .o_list_view .o_content");
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Plan");
    // the search starts from the row's values: Parent Beta
    expect(queryAllTexts(".o_dialog .o_searchview_facet")).toHaveLength(1);
    expect(".o_dialog .o_searchview_facet").toHaveText(/Beta/);
    expect(queryAllTexts(".o_dialog .o_data_row .o_data_cell[name='name']")).toEqual([
        "Unscheduled",
    ]);
    await press("escape");
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(pickedCells()).toHaveCount(1);
    expect(".o_tl_multi_plan").toHaveCount(1);
});

test("002b3 A23: the plan dialog opens for the period of the picked half day", async () => {
    await mountMulti();
    const row = rowIndex("Beta", "Host Contact 2");
    const calls = [];
    patchWithCleanup(controller.editor, {
        planFor(params) {
            calls.push(params);
        },
    });
    await drawInHalfDay(row, "2026-11-10", 1);
    await contains(".o_tl_multi_plan").click();
    expect(calls).toHaveLength(1);
    expect(calls[0].row.id).toBe(rows()[row].dataset.rowId);
    const { start, stop } = calls[0].period;
    // one sub-column wide: a half day
    expect(stop.diff(start, "hours").hours).toBe(12);
    expect(start.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-11-10 12:00");
});

test("002b3 A24: a day click shows no Plan; plan off shows no Plan", async () => {
    await mountMulti();
    await clickCell(rowIndex("Beta", "Host Contact 2"), "2026-11-10", 0);
    expect(pickedCells()).toHaveCount(2);
    expect(".o_tl_multi_plan").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Add']").toHaveCount(1);
});

test("002b3 A24: plan off shows no Plan on one cell", async () => {
    await mountMulti(`plan="0"`);
    await drawInHalfDay(rowIndex("Beta", "Host Contact 2"), "2026-11-10", 0);
    expect(pickedCells()).toHaveCount(1);
    expect(".o_multi_selection_buttons").toHaveCount(1);
    expect(".o_tl_multi_plan").toHaveCount(0);
});

test("002b3 A25: the cross clears the selection", async () => {
    await mountMulti();
    await drawA9();
    expect(pickedCells().length).toBeGreaterThan(0);
    await contains(".o_multi_selection_buttons .o_unselect_all").click();
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
});

test("002b3 A25: Escape clears the selection once", async () => {
    await mountMulti();
    await drawA9();
    await press("escape");
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
});

test("002b3 A37: no rights shows the count box alone", async () => {
    await mountMulti(`create="0" edit="0" delete="0"`);
    await drawA9();
    expect(".o_multi_selection_buttons .o_selection_box").toHaveCount(1);
    expect(".o_multi_selection_buttons .o_unselect_all").toHaveCount(1);
    expect(countText()).toBe("1");
    expect(".o_multi_selection_buttons > button").toHaveCount(0);
    expect(".o_tl_button_add").toHaveCount(0);
    await drawInHalfDay(rowIndex("Beta", "Host Contact 2"), "2026-11-10", 0);
    expect(".o_tl_multi_plan").toHaveCount(0);
    expect(".o_multi_selection_buttons .o_selection_box").toHaveCount(1);
});

test("002b3 A63: create and delete off; delete off only", async () => {
    await mountMulti(`create="0" delete="0"`);
    // the New button is absent too (002b R14)
    expect(".o_tl_button_add").toHaveCount(0);
    await drawA9();
    expect(".o_tl_button_add").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Add']").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(0);
    await drawInHalfDay(rowIndex("Beta", "Host Contact 2"), "2026-11-10", 0);
    expect(".o_tl_multi_plan").toHaveCount(1);
    await contains(".o_multi_selection_buttons .o_unselect_all").click();
    await animationFrame();
});

test("002b3 A63: delete off only", async () => {
    await mountMulti(`delete="0"`);
    await drawA9();
    expect(".o_multi_selection_buttons [data-tooltip='Add']").toHaveCount(1);
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(0);
});

test("002b3 A63: create off, delete on: the count box and Delete", async () => {
    await mountMulti(`create="0"`);
    await drawA9();
    expect(".o_multi_selection_buttons [data-tooltip='Add']").toHaveCount(0);
    expect(".o_multi_selection_buttons [data-tooltip='Delete']").toHaveCount(1);
});

test("002b3 A26: Add opens the Community popover; Escape closes it and keeps the selection", async () => {
    await mountMulti();
    await drawA9();
    const cells = pickedCells().length;
    await contains(".o_multi_selection_buttons [data-tooltip='Add']").click();
    await waitFor(".o_popover .o_multi_create_popover");
    expect(".o_popover .o_multi_create_popover").toHaveCount(1);
    await press("escape");
    await animationFrame();
    expect(".o_popover .o_multi_create_popover").toHaveCount(0);
    expect(pickedCells()).toHaveCount(cells);
    expect(".o_multi_selection_buttons").toHaveCount(1);
    // Escape again, with the buttons shown, clears
    await press("escape");
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A63: a refused default load shows the error at the click on Add; no popover, the selection stays", async () => {
    expect.errors(1);
    onRpc("pill", "onchange", () => {
        throw new Error("access refused");
    });
    await mountMulti();
    await drawA9();
    const cells = pickedCells().length;
    await contains(".o_multi_selection_buttons [data-tooltip='Add']").click();
    await animationFrame();
    await animationFrame();
    expect.verifyErrors(["access refused"]);
    expect(".o_multi_create_popover").toHaveCount(0);
    expect(".o_popover").toHaveCount(0);
    expect(pickedCells()).toHaveCount(cells);
    expect(".o_multi_selection_buttons").toHaveCount(1);
    expect(countText()).toBe("1");
});

test("002b3 A26: Delete shows the Community confirmation, the selection stays", async () => {
    await mountMulti();
    await drawA9();
    await contains(".o_multi_selection_buttons [data-tooltip='Delete']").click();
    await animationFrame();
    expect(".o_dialog .modal-body").toHaveText(
        "Are you sure you want to delete the selected record?"
    );
    await contains(".o_dialog .btn-secondary").click();
    await animationFrame();
    expect(pickedCells().length).toBeGreaterThan(0);
});

/** Records the deletion calls; the mock server answers them. */
function watchUnlinks() {
    const calls = [];
    onRpc("pill", "unlink", ({ args, kwargs }) => {
        calls.push({ ids: args[0], kwargs });
    });
    return calls;
}
const deleteButton = ".o_multi_selection_buttons [data-tooltip='Delete']";

test("002b3 A38: Delete asks with the Community confirmation for one record", async () => {
    const calls = watchUnlinks();
    await mountMulti();
    await drawA9();
    expect(countText()).toBe("1");
    await contains(deleteButton).click();
    await animationFrame();
    expect(".o_dialog .modal-body").toHaveText(
        "Are you sure you want to delete the selected record?"
    );
    expect(queryAllTexts(".o_dialog .modal-footer button")).toEqual(["Ok", "Discard"]);
    expect(calls).toHaveLength(0);
});

test("002b3 A39: Ok sends one unlink of the counted records and reloads", async () => {
    const calls = watchUnlinks();
    await mountMulti();
    await click(header("2026-11-09"));
    await animationFrame();
    await animationFrame();
    expect(countText()).toBe("3");
    const ids = controller.selection.renderer.pickedRecordIds();
    expect(ids).toHaveLength(3);
    await contains(deleteButton).click();
    await animationFrame();
    expect(".o_dialog .modal-body").toHaveText(
        "Are you sure you want to delete the 3 selected records?"
    );
    await contains(".o_dialog .modal-footer .btn-primary").click();
    await animationFrame();
    await animationFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual(ids);
    expect(calls[0].kwargs.context).toBeOfType("object");
    // the reload cleared the selection and the buttons
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
    expect(".o_dialog").toHaveCount(0);
});

test("002b3 A40: Discard keeps the selection", async () => {
    const calls = watchUnlinks();
    await mountMulti();
    await drawA9();
    const cells = pickedCells().length;
    await contains(deleteButton).click();
    await animationFrame();
    await contains(".o_dialog .modal-footer .btn-secondary").click();
    await animationFrame();
    expect(calls).toHaveLength(0);
    expect(".o_dialog").toHaveCount(0);
    expect(pickedCells()).toHaveCount(cells);
    expect(countText()).toBe("1");
    expect(deleteButton).toHaveCount(1);
});

test("002b3 A41: locked and cut pills are deleted too", async () => {
    const calls = watchUnlinks();
    // a week whose first range cuts pills (the header click counts every record of the day)
    await mountMulti();
    await click(header("2026-11-12"));
    await animationFrame();
    await animationFrame();
    const ids = controller.selection.renderer.pickedRecordIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(countText()).toBe(String(ids.length));
    await contains(deleteButton).click();
    await animationFrame();
    await contains(".o_dialog .modal-footer .btn-primary").click();
    await animationFrame();
    await animationFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual(ids);
});

test("002b3 A63: a refused deletion shows the error, clears the selection and loads nothing again", async () => {
    expect.errors(1);
    let loads = 0;
    onRpc("pill", "get_gantt_data", () => {
        loads++;
    });
    onRpc("pill", "unlink", () => {
        throw new Error("refused by the server");
    });
    await mountMulti();
    await drawA9();
    expect(pickedCells().length).toBeGreaterThan(0);
    const before = loads;
    await contains(deleteButton).click();
    await animationFrame();
    await contains(".o_dialog .modal-footer .btn-primary").click();
    await animationFrame();
    await animationFrame();
    // the refusal reaches the error handler (the Community error), not a silent promise
    expect.verifyErrors(["refused by the server"]);
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
    expect(loads).toBe(before);
});

test("002b3 R14: Ok clears the selection at once, before the server answers", async () => {
    const answer = Promise.withResolvers();
    onRpc("pill", "unlink", () => answer.promise);
    await mountMulti();
    await drawA9();
    await contains(deleteButton).click();
    await animationFrame();
    await contains(".o_dialog .modal-footer .btn-primary").click();
    await animationFrame();
    expect(pickedCells()).toHaveCount(0);
    expect(".o_multi_selection_buttons").toHaveCount(0);
    answer.resolve(true);
    await animationFrame();
});

test("002b3 A25: the state is reset when the view goes away", async () => {
    const view = await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(BASE),
        groupBy: GROUPS,
    });
    await animationFrame();
    await drawA9();
    const state = controller.selection.state;
    expect(state.visible).toBe(true);
    view.__owl__.app.destroy();
    expect(state).toMatchObject({ count: 0, cellCount: 0, drawing: false, visible: false });
});

/** Every contact is unavailable on two days of the week, so the two days fold into one column. */
const FOLD_ATTRS = `progress_bar="x_contact" display_unavailability="1" total_row="1"`;
const FOLD_MOUNT = { groupBy: ["x_contact"], domain: [["id", "in", [4, 5, 6, 9]]] };
function foldTwoDays() {
    timelineMock.unavailability = {
        x_contact: Object.fromEntries(
            [1, 2, 3].map((id) => [id, [{ start: at(3, "00:00"), stop: at(5, "00:00") }]])
        ),
    };
}

// 002c R3 replaced 002b3's "does nothing" for this cell: the total row's folded cell opens the run
test("002b3 A6 (changed by 002c R3): a click on a folded cell of the total row opens the run", async () => {
    foldTwoDays();
    await mountMulti(FOLD_ATTRS, FOLD_MOUNT);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    await click(queryOne(".o_tl_total_row .o_tl_folded_cell"));
    await animationFrame();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A17: Ctrl on an unfolded foldable header picks it and never folds", async () => {
    foldTwoDays();
    await mountMulti(FOLD_ATTRS, FOLD_MOUNT);
    await click(queryOne(".o_tl_col.o_tl_folded"));
    await animationFrame();
    await animationFrame();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    const columns = queryAll(".o_tl_col").length;
    const foldable = queryAll(".o_tl_col.o_tl_foldable")[0];
    await withKey("ctrl", () => click(foldable));
    await animationFrame();
    await animationFrame();
    expect(queryAll(".o_tl_col")).toHaveLength(columns);
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    expect(pickedCells().length).toBeGreaterThan(0);
});
