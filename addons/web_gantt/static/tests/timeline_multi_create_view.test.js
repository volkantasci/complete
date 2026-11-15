// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    keyDown,
    keyUp,
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

import { setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

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

// the mock's form 99 is the template form of the host (Name required, Contact, Tags, Color)
const BASE = `default_range="week" color="x_color" multi_create_view="99"`;
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
const pickedCells = () => queryAll(".o_tl_cell_picked");
const popover = ".o_popover .o_multi_create_popover";
const DIALOG_FORM = ".modal-body .o_form_view";
const ADD =".o_multi_selection_buttons [data-tooltip='Add']";

async function settle() {
    for (let i = 0; i < 4; i++) {
        await animationFrame();
    }
}

// the new-record dialog is up and its onchange had time to answer
async function dialogFormReady() {
    await waitFor(DIALOG_FORM);
    await settle();
}

async function clickCell(rowIdx, date, half = 0) {
    await click(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half) });
    await settle();
}

async function drawBetween(fromRow, fromDate, fromHalf, toRow, toDate, toHalf) {
    const helpers = await drag(cellOf(fromRow, fromDate), {
        position: pointOf(fromRow, fromDate, fromHalf),
    });
    await helpers.moveTo(cellOf(toRow, toDate), { position: pointOf(toRow, toDate, toHalf) });
    await helpers.drop();
    await settle();
}

async function openPopover() {
    await contains(ADD).click();
    await waitFor(popover);
    await settle();
}

const timeInputs = () => queryAll(`${popover} .o_time_picker_input`);

/** Mock the create call: the calls it received, the record kept by the mock server. */
function trackCreate() {
    const calls = [];
    onRpc("pill", "create", ({ args, kwargs }) => {
        calls.push({ values: args[0], context: kwargs.context });
    });
    return calls;
}

test("002b3 A28: Add opens the popover with times 12:00 and 13:00, the form, Add and Discard", async () => {
    await mountMulti();
    await clickCell(rowIndex("Beta", "Undefined Contact"), "2026-11-09");
    await openPopover();
    expect(timeInputs().map((input) => input.value)).toEqual(["12:00", "13:00"]);
    expect(`${popover} .o_form_renderer`).toHaveCount(1);
    expect(`${popover} .o_field_widget[name='name']`).toHaveCount(1);
    expect(`${popover} .o_field_widget[name='x_color']`).toHaveCount(1);
    expect(queryAllTexts(`${popover} .popover-footer button`)).toEqual(["Add", "Discard"]);
});

test("002b3 A29: the popover's Add sends one create with multi_create in the context and reloads", async () => {
    const calls = trackCreate();
    await mountMulti();
    const row = rowIndex("Beta", "Undefined Contact");
    await clickCell(row, "2026-11-09");
    expect(pickedCells()).toHaveCount(2);
    await openPopover();
    await contains(`${popover} .o_field_widget[name='name'] input`).edit("Sprint");
    await contains(`${popover} .popover-footer .btn-primary`).click();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].context.multi_create).toBe(true);
    // one record: one day of one row; the cell's values and the form's empty values
    expect(calls[0].values).toHaveLength(1);
    expect(calls[0].values[0]).toMatchObject({
        name: "Sprint",
        parent_id: 2,
        x_contact: false,
        x_color: 0,
        date_start: "2026-11-09 09:00:00",
        date_stop: "2026-11-09 10:00:00",
    });
    expect(calls[0].values[0].x_tags).toEqual([]);
    expect(popover).toHaveCount(0);
    expect(pickedCells()).toHaveCount(0);
    expect(queryAllTexts(".o_tl_pill_title").filter((text) => text === "Sprint")).toHaveLength(1);
});

test("002b3 A30: the picked rows give one record each, the rows' Contact replaces the form's", async () => {
    const calls = trackCreate();
    await mountMulti();
    const from = rowIndex("Beta", "Undefined Contact");
    const to = rowIndex("Beta", "Host Contact 3");
    await drawBetween(from, "2026-11-09", 0, to, "2026-11-09", 0);
    await openPopover();
    await contains(`${popover} .o_field_widget[name='name'] input`).edit("Row test");
    await contains(`${popover} .popover-footer .btn-primary`).click();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].values.map((v) => [v.parent_id, v.x_contact])).toEqual([
        [2, false],
        [2, 2],
        [2, 3],
    ]);
    for (const value of calls[0].values) {
        expect(value.date_start).toBe("2026-11-09 09:00:00");
        expect(value.date_stop).toBe("2026-11-09 10:00:00");
    }
});

test("002b3 E4: only group-row cells create nothing", async () => {
    const calls = trackCreate();
    await mountMulti();
    // every group folded: a click on a column header picks the cells of the group rows only
    controller.model.setAllCollapsed(true);
    await settle();
    expect(queryAll(".o_tl_row[data-row-id]:not(.o_tl_group_row)")).toHaveLength(0);
    await click(queryOne('.o_tl_col[data-date="2026-11-09"]'));
    await settle();
    expect(pickedCells().length).toBeGreaterThan(0);
    expect(controller.selection.state.count).toBe(0);
    await openPopover();
    await contains(`${popover} .o_field_widget[name='name'] input`).edit("Nothing");
    await contains(`${popover} .popover-footer .btn-primary`).click();
    await settle();
    expect(calls).toHaveLength(0);
    expect(popover).toHaveCount(0);
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A33: validation messages keep the popover open", async () => {
    const calls = trackCreate();
    await mountMulti();
    await clickCell(rowIndex("Beta", "Undefined Contact"), "2026-11-09");
    await openPopover();
    const add = `${popover} .popover-footer .btn-primary`;
    // an empty required Name
    await contains(add).click();
    await settle();
    expect(".o_notification").toHaveText(/Missing required fields/);
    expect(popover).toHaveCount(1);
    await contains(`${popover} .o_field_widget[name='name'] input`).edit("Check");
    // a start after the end
    await contains(timeInputs()[0]).edit("15:00");
    await contains(add).click();
    await settle();
    expect(queryAllTexts(".o_notification").join("|")).toMatch(/Start time should be before end time/);
    expect(popover).toHaveCount(1);
    // an unreadable end
    await contains(timeInputs()[1]).edit("nonsense");
    await contains(add).click();
    await settle();
    expect(queryAllTexts(".o_notification").join("|")).toMatch(/Invalid time range/);
    expect(popover).toHaveCount(1);
    expect(calls).toHaveLength(0);
});

test("002b3 A34: Discard keeps the times and the form values for the next opening", async () => {
    await mountMulti();
    await clickCell(rowIndex("Beta", "Undefined Contact"), "2026-11-09");
    await openPopover();
    await contains(timeInputs()[0]).edit("15:00");
    await contains(`${popover} .o_field_widget[name='name'] input`).edit("Kept");
    await contains(`${popover} .o_field_widget[name='x_color'] input`).edit("4");
    await contains(`${popover} .popover-footer .btn-secondary`).click();
    await settle();
    expect(popover).toHaveCount(0);
    expect(pickedCells()).toHaveCount(2);
    await openPopover();
    expect(timeInputs()[0].value).toBe("15:00");
    expect(`${popover} .o_field_widget[name='name'] input`).toHaveValue("Kept");
    expect(`${popover} .o_field_widget[name='x_color'] input`).toHaveValue("4");
});

test("002b3 A35: New with a selection opens the create dialog for the first block", async () => {
    let context;
    onRpc("pill", "onchange", ({ kwargs }) => {
        context = kwargs.context;
    });
    await mountMulti();
    const row = rowIndex("Beta", "Undefined Contact");
    await drawBetween(row, "2026-11-09", 1, row, "2026-11-10", 0);
    await keyDown("Control");
    await clickCell(rowIndex("Beta", "Host Contact 3"), "2026-11-12");
    await keyUp("Control");
    expect(pickedCells()).toHaveCount(4);
    await contains(".o_tl_button_add").click();
    await dialogFormReady();
    // Monday 9, 12:00 to Tuesday 10, 12:00 local, Parent Beta: the first block only
    expect(context.default_date_start).toBe("2026-11-09 09:00:00");
    expect(context.default_date_stop).toBe("2026-11-10 09:00:00");
    expect(context.default_parent_id).toBe(2);
    expect(pickedCells()).toHaveCount(4);
    await contains(".o_dialog .o_form_button_cancel").click();
    await settle();
    expect(pickedCells()).toHaveCount(0);
});

test("002b3 A36: New without a selection proposes the focus week", async () => {
    let context;
    onRpc("pill", "onchange", ({ kwargs }) => {
        context = kwargs.context;
    });
    await mountMulti();
    await contains(".o_tl_button_add").click();
    await dialogFormReady();
    // Sunday 8 to Sunday 15 local
    expect(context.default_date_start).toBe("2026-11-07 21:00:00");
    expect(context.default_date_stop).toBe("2026-11-14 21:00:00");
    expect(controller.selection.state.cellCount).toBe(0);
});

/** Draw inside one half day of a row (one picked cell). */
async function drawInHalfDay(rowIdx, date, half = 0) {
    const helpers = await drag(cellOf(rowIdx, date), {
        position: pointOf(rowIdx, date, half, -20),
    });
    await helpers.moveTo(cellOf(rowIdx, date), { position: pointOf(rowIdx, date, half, 20) });
    await helpers.drop();
    await settle();
}

test("002b3 A22: a pill that ends where a half day ends does not count the next cell", async () => {
    // Overlap A ends on Thursday 12 at 12:00 sharp: the second half of that day is not under it
    await mountMulti("", { groupBy: [], domain: [["name", "=", "Overlap A"]] });
    await drawInHalfDay(0, "2026-11-12", 1);
    expect(pickedCells()).toHaveCount(1);
    expect(controller.selection.state.count).toBe(0);
    await drawInHalfDay(0, "2026-11-12", 0);
    expect(controller.selection.state.count).toBe(1);
});
