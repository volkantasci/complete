// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, queryAll, queryAllTexts, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceFrame, advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    mountView,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { at, HOST_ARCHS, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    await resize({ width: 1600, height: 900 });
});

const BASE = `default_range="week" color="x_color"`;
const ARCHS = {
    H1: HOST_ARCHS.H1,
    H18: timelineArch(`${BASE} plan="0"`),
    H20: timelineArch(`${BASE} create="0"`),
    H23: timelineArch(`${BASE} cell_create="0" plan="0"`),
};
const RECORD_ROW = ".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)";

async function mountTimeline({ arch = ARCHS.H1, resModel = "pill", ...rest } = {}) {
    await mountView({ type: "gantt", resModel, arch, ...rest });
    queryOne(".o_tl_renderer").scrollLeft = 0;
    await animationFrame();
}

/** Scroll the grid so that the column of `date` is in the middle of the visible area. */
async function centreOn(date) {
    const renderer = queryOne(".o_tl_renderer");
    const box = queryRect(renderer);
    const cell = queryRect(cellAt(date));
    renderer.scrollLeft += cell.left + cell.width / 2 - (box.left + box.right) / 2;
    await animationFrame();
}

const rowAt = (row = 0) => queryAll(RECORD_ROW)[row];
const rowIndexOf = (name) =>
    queryAll(RECORD_ROW).findIndex(
        (row) => row.querySelector(".o_tl_row_label")?.textContent === name
    );
const indexOfDate = (date) => Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index);
const cellAt = (date, row = 0) => rowAt(row).querySelectorAll(".o_tl_cell")[indexOfDate(date)];

/** Viewport point in `part` (0 first, 1 second half) of the column of `date`, low in its row. */
function pointAt(date, part, row = 0, parts = 2) {
    const rect = queryRect(cellAt(date, row));
    return {
        x: rect.left + (rect.width * (part + 0.5)) / parts,
        y: queryRect(rowAt(row)).bottom - 4,
    };
}

/** Press at (`date`, `part`); returns the drag helpers and a `to(date, part, row)` mover. */
async function press(date, part, row = 0, parts = 2) {
    const helpers = await drag(cellAt(date, row), { position: pointAt(date, part, row, parts) });
    return {
        ...helpers,
        to: async (toDate, toPart, toRow = row) => {
            await helpers.moveTo(cellAt(toDate, toRow), {
                position: pointAt(toDate, toPart, toRow, parts),
            });
            await animationFrame();
        },
    };
}

/** Press at (`date`, `part`) and move 12 px to the right in the same sub-column. */
async function pressAndNudge(date, part, row = 0, parts = 2) {
    const start = pointAt(date, part, row, parts);
    const helpers = await drag(cellAt(date, row), { position: { x: start.x - 6, y: start.y } });
    await helpers.moveTo(cellAt(date, row), { position: { x: start.x + 6, y: start.y } });
    await animationFrame();
    return helpers;
}

const inputValue = (name) => {
    const field = queryOne(`.o_dialog .o_field_widget[name='${name}']`);
    const button = field.querySelector("button");
    return button ? button.getAttribute("value") : field.querySelector("input").value;
};
const selectionRect = () => queryRect(".o_tl_selection");
const near = (a, b) => Math.abs(a - b) < 1;

test("002b A8: drag draws highlight and badges, release opens Create, Discard clears", async () => {
    await mountTimeline();
    const drawing = await press("2026-11-08", 1);
    await drawing.to("2026-11-10", 0);
    expect(".o_tl_selection").toHaveCount(1);
    const first = queryRect(cellAt("2026-11-08"));
    const last = queryRect(cellAt("2026-11-10"));
    expect(near(selectionRect().left, first.left + first.width / 2)).toBe(true);
    expect(near(selectionRect().right, last.left + last.width / 2)).toBe(true);
    expect(near(selectionRect().height, queryRect(rowAt()).height)).toBe(true);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual([
        "11/8/2026, 12:00 PM",
        "11/10/2026, 12:00 PM",
    ]);
    expect(".o_dialog").toHaveCount(0);

    const calls = timelineMock.calls.length;
    await drawing.drop();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Create");
    expect(inputValue("date_start")).toBe("11/08/2026 12:00:00");
    expect(inputValue("date_stop")).toBe("11/10/2026 12:00:00");
    // the highlight stays under the dialog, the badges are gone (S2)
    expect(".o_tl_selection").toHaveCount(1);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_dialog").toHaveCount(1);

    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(timelineMock.calls.length).toBeGreaterThan(calls);
});

test("002b A9: stays in its row, reverse direction, Parent Alpha", async () => {
    await mountTimeline({ arch: ARCHS.H18, groupBy: ["parent_id"] });
    const alpha = rowIndexOf("Alpha");
    const gamma = rowIndexOf("Gamma");
    expect(alpha).not.toBe(-1);
    const drawing = await press("2026-11-10", 1, alpha);
    // down into the Gamma row and to the left of the start: first half of the 9th
    await drawing.to("2026-11-09", 0, gamma);
    expect(".o_tl_selection").toHaveCount(1);
    expect(rowAt(alpha).querySelector(".o_tl_selection")).not.toBe(null);
    expect(rowAt(gamma).querySelector(".o_tl_selection")).toBe(null);
    const from = queryRect(cellAt("2026-11-09"));
    const to = queryRect(cellAt("2026-11-10"));
    expect(near(selectionRect().left, from.left)).toBe(true);
    expect(near(selectionRect().right, to.right)).toBe(true);
    await drawing.drop();
    await animationFrame();
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/09/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/11/2026 00:00:00");
    expect(queryOne(".o_dialog .o_field_widget[name='parent_id'] input").value).toBe("Alpha");
});

test("002b A10: Escape cancels", async () => {
    await mountTimeline();
    const drawing = await press("2026-11-08", 1);
    await drawing.to("2026-11-10", 0);
    expect(".o_tl_selection").toHaveCount(1);
    await drawing.cancel();
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_timeline_view").not.toHaveClass("o_tl_selecting");
    expect(".o_dialog").toHaveCount(0);
});

test("002b A10: no start on a pill, a group row, sample, H20, H23", async () => {
    // a pill
    await mountTimeline();
    const pill = queryAll(".o_tl_pill")[0];
    const rect = queryRect(pill);
    const drawing = await drag(pill, { position: { x: rect.left + 5, y: rect.top + 5 } });
    await drawing.moveTo(cellAt("2026-11-14"), { position: pointAt("2026-11-14", 0) });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    await drawing.drop();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

test("002b A10: no start on a group row cell", async () => {
    await mountTimeline({ arch: ARCHS.H18, groupBy: ["parent_id", "x_contact"] });
    const cell = queryAll(".o_tl_group_row")[0].querySelectorAll(".o_tl_cell")[8];
    const rect = queryRect(cell);
    const drawing = await drag(cell, { position: { x: rect.left + 5, y: rect.top + 5 } });
    await drawing.moveTo(cell, { position: { x: rect.left + 5 + 60, y: rect.top + 5 } });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    await drawing.cancel();
});

test("002b A10: no start in the sample state", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H8,
        domain: [["id", "=", 0]],
    });
    const cell = queryAll(`${RECORD_ROW} .o_tl_cell`)[8];
    const rect = queryRect(cell);
    const drawing = await drag(cell, { position: { x: rect.left + 5, y: rect.top + 5 } });
    await drawing.moveTo(cell, { position: { x: rect.left + 65, y: rect.top + 5 } });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    await drawing.cancel();
});

for (const [name, arch] of [
    ["H20", ARCHS.H20],
    ["H23", ARCHS.H23],
]) {
    test(`002b A10: no start with create off or cell create off (${name})`, async () => {
        await mountTimeline({ arch });
        const drawing = await press("2026-11-08", 1);
        await drawing.to("2026-11-10", 0);
        expect(".o_tl_selection").toHaveCount(0);
        await drawing.cancel();
    });
}

test("002b A11: 12 px move selects one half day; no move is a click", async () => {
    await mountTimeline({ arch: ARCHS.H18 });
    const start = pointAt("2026-11-14", 0);
    const drawing = await drag(cellAt("2026-11-14"), { position: { x: start.x - 6, y: start.y } });
    await drawing.moveTo(cellAt("2026-11-14"), { position: { x: start.x + 6, y: start.y } });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(1);
    const cell = queryRect(cellAt("2026-11-14"));
    expect(near(selectionRect().width, cell.width / 2)).toBe(true);
    await drawing.drop();
    await animationFrame();
    // one dialog only: the release is not also a click on the cell
    expect(".o_dialog").toHaveCount(1);
    expect(inputValue("date_start")).toBe("11/14/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/14/2026 12:00:00");
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();

    // a press and release without moving is the click of the whole day
    freezeTime();
    await advanceTime(1100);
    await click(cellAt("2026-11-14"));
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    expect(inputValue("date_start")).toBe("11/14/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/15/2026 00:00:00");
});

test("002b A11: a move under 10 px is still a click", async () => {
    await mountTimeline({ arch: ARCHS.H18 });
    const start = pointAt("2026-11-14", 0);
    const drawing = await drag(cellAt("2026-11-14"), { position: start });
    await drawing.moveTo(cellAt("2026-11-14"), { position: { x: start.x + 6, y: start.y } });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    await drawing.drop();
    await animationFrame();
    expect(inputValue("date_stop")).toBe("11/15/2026 00:00:00");
});

test("002b A12: edge scroll grows the selection", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const renderer = queryOne(".o_tl_renderer");
    expect(renderer.scrollWidth).toBeGreaterThan(renderer.clientWidth);
    const header = queryRect(rowAt().querySelector(".o_tl_row_header"));
    const box = queryRect(renderer);
    const startX = header.right + 400;
    const row = queryRect(rowAt());
    const y = row.bottom - 4;
    const cellUnder = (x) =>
        queryAll(`${RECORD_ROW} .o_tl_cell`).find((cell) => {
            const rect = queryRect(cell);
            return rect.left <= x && x < rect.right;
        });
    const drawing = await drag(cellUnder(startX), { position: { x: startX, y } });
    // far from both edges: no scroll
    await drawing.moveTo(cellUnder(startX + 60), { position: { x: startX + 60, y } });
    await animationFrame();
    const before = renderer.scrollLeft;
    const width = selectionRect().width;
    // 100 px from the right edge of the grid
    const x = box.right - 100;
    await drawing.moveTo(cellUnder(x), { position: { x, y } });
    await animationFrame();
    for (let i = 0; i < 5; i++) {
        await advanceFrame();
    }
    expect(renderer.scrollLeft).toBeGreaterThan(before);
    expect(selectionRect().width).toBeGreaterThan(width);

    // near the left edge, just right of the row header: it scrolls back
    const grown = renderer.scrollLeft;
    const left = header.right + 100;
    await drawing.moveTo(cellUnder(left), { position: { x: left, y } });
    await animationFrame();
    for (let i = 0; i < 5; i++) {
        await advanceFrame();
    }
    expect(renderer.scrollLeft).toBeLessThan(grown);
    // the row header column is no edge zone: 200 px right of it nothing scrolls
    const rest = renderer.scrollLeft;
    const calm = header.right + 200;
    await drawing.moveTo(cellUnder(calm), { position: { x: calm, y } });
    for (let i = 0; i < 3; i++) {
        await advanceFrame();
    }
    expect(renderer.scrollLeft).toBe(rest);

    // inside the header area: the zone is measured from its right edge, the step is the maximum
    renderer.scrollLeft = 600;
    await animationFrame();
    const inside = header.right - 20;
    await drawing.moveTo(rowAt().querySelector(".o_tl_row_header"), { position: { x: inside, y } });
    const from = renderer.scrollLeft;
    for (let i = 0; i < 3; i++) {
        await advanceFrame();
    }
    expect(renderer.scrollLeft).toBeLessThan(from);
    expect(from - renderer.scrollLeft).not.toBeGreaterThan(3 * 20 + 1);
    await drawing.cancel();
});

test("002b A12: a drag leaves no swallowed click behind (group row, folded cell)", async () => {
    timelineMock.unavailability = {
        x_contact: Object.fromEntries(
            [1, 2, 3].map((id) => [id, [{ start: at(3, "00:00"), stop: at(5, "00:00") }]])
        ),
    };
    await mountTimeline({
        arch: HOST_ARCHS.H12,
        groupBy: ["parent_id", "x_contact"],
        domain: [["id", "in", [4, 5, 6, 9]]],
    });
    const renderer = queryOne(".o_tl_renderer");
    const foldBox = queryRect(".o_tl_col.o_tl_folded");
    renderer.scrollLeft += foldBox.left - (queryRect(renderer).left + queryRect(renderer).right) / 2;
    await animationFrame();
    const cells = [...rowAt(0).querySelectorAll(".o_tl_cell")];
    const at0 = cells.findIndex((cell) => cell.classList.contains("o_tl_folded_cell"));
    const y = queryRect(rowAt(0)).bottom - 4;
    const a = queryRect(cells[at0 - 1]);
    // a drag from one cell, released over another row: its click lands on a common ancestor
    const drawing = await drag(cells[at0 - 1], { position: { x: a.left + 5, y } });
    await drawing.moveTo(cells[at0 - 2], { position: { x: a.left - 30, y } });
    await animationFrame();
    await drawing.drop();
    await animationFrame();
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    await advanceTime(1100);
    // a click on a group row still toggles it
    await click(queryAll(".o_tl_group_row")[0].querySelector(".o_tl_cell"));
    await animationFrame();
    expect(queryAll(".o_tl_group_row")[0]).toHaveClass("o_tl_collapsed");
    await click(queryAll(".o_tl_group_row")[0].querySelector(".o_tl_cell"));
    await animationFrame();
    await advanceTime(1100);
    // and a click on a folded cell unfolds it
    await click(rowAt(0).querySelector(".o_tl_folded_cell"));
    await animationFrame();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
});

test("002b A13: badges by scale (day)", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="day" plan="0"`) });
    const cells = queryAll(`${RECORD_ROW} .o_tl_cell`);
    const rect = queryRect(cells[9]);
    const y = queryRect(rowAt()).bottom - 4;
    const drawing = await drag(cells[9], { position: { x: rect.left + 5, y } });
    await drawing.moveTo(cells[9], { position: { x: rect.left + 25, y } });
    await animationFrame();
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual(["9:00 AM", "10:00 AM"]);
    await drawing.cancel();
});

test("002b A13: badges by scale (week: date and time)", async () => {
    await mountTimeline({ arch: ARCHS.H18 });
    const drawing = await pressAndNudge("2026-11-14", 0);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual([
        "11/14/2026, 12:00 AM",
        "11/14/2026, 12:00 PM",
    ]);
    await drawing.cancel();
});

test("002b A13: badges by scale (H10 month: dates only)", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    await centreOn("2026-11-16");
    const drawing = await pressAndNudge("2026-11-16", 0, 0, 1);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual(["11/16/2026", "11/17/2026"]);
    await drawing.cancel();
});

test("002b A13: badges by scale (year: first of the month)", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="year" scales="year" plan="0"`),
    });
    const month = queryRect(cellAt("2026-11-01"));
    const y = queryRect(rowAt()).bottom - 4;
    const drawing = await drag(cellAt("2026-11-01"), { position: { x: month.left + 5, y } });
    await drawing.moveTo(cellAt("2026-11-01"), { position: { x: month.left + 25, y } });
    await animationFrame();
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual(["11/1/2026", "12/1/2026"]);
    await drawing.cancel();
});

test("002b A14: RTL swaps badges", async () => {
    patchWithCleanup(localization, { direction: "rtl" });
    document.documentElement.setAttribute("dir", "rtl");
    const style = document.createElement("style");
    style.textContent = "* { direction: rtl !important; }";
    document.head.appendChild(style);
    try {
        await mountTimeline();
        queryOne(".o_tl_renderer").scrollLeft = 0;
        await animationFrame();
        const drawing = await press("2026-11-12", 1);
        await drawing.to("2026-11-11", 0);
        await drawing.to("2026-11-10", 0);
        const selection = selectionRect();
        const [start, stop] = queryAll(".o_tl_selection_badge").map((badge) => queryRect(badge));
        expect(near(start.right, selection.right)).toBe(true);
        expect(near(stop.left, selection.left)).toBe(true);
        expect(near(start.bottom, selection.top)).toBe(true);
        expect(near(stop.top, selection.bottom)).toBe(true);
        await drawing.cancel();
    } finally {
        style.remove();
        document.documentElement.removeAttribute("dir");
    }
});

test("002b A18c: crosses a folded column", async () => {
    timelineMock.unavailability = {
        x_contact: Object.fromEntries(
            [1, 2, 3].map((id) => [id, [{ start: at(3, "00:00"), stop: at(5, "00:00") }]])
        ),
    };
    await mountTimeline({
        arch: HOST_ARCHS.H12,
        groupBy: ["parent_id", "x_contact"],
        domain: [["id", "in", [4, 5, 6, 9]]],
    });
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    const renderer = queryOne(".o_tl_renderer");
    const foldBox = queryRect(".o_tl_col.o_tl_folded");
    renderer.scrollLeft += foldBox.left - (queryRect(renderer).left + queryRect(renderer).right) / 2;
    await animationFrame();
    const folded = queryRect(".o_tl_col.o_tl_folded");
    const cells = [...rowAt(0).querySelectorAll(".o_tl_cell")];
    const at0 = cells.findIndex((cell) => cell.classList.contains("o_tl_folded_cell"));
    const before = cells[at0 - 1];
    const after = cells[at0 + 1];
    const y = queryRect(rowAt(0)).bottom - 4;
    const left = queryRect(before);
    const right = queryRect(after);
    const drawing = await drag(before, { position: { x: left.left + 5, y } });
    // into the folded column: the highlight does not stop on it
    await drawing.moveTo(cells[at0], { position: { x: folded.left + 10, y } });
    await animationFrame();
    const rect = selectionRect();
    expect(rect.right <= folded.left + 0.5 || rect.right >= folded.right - 0.5).toBe(true);
    await drawing.moveTo(after, { position: { x: right.left + right.width - 5, y } });
    await animationFrame();
    expect(near(selectionRect().left, left.left)).toBe(true);
    expect(near(selectionRect().right, right.right)).toBe(true);
    await drawing.drop();
    await animationFrame();
    const dateOf = (cell) => {
        const column = Number(cell.dataset.column);
        return DateTime.fromISO(queryOne(`.o_tl_col[data-index="${column}"]`).dataset.date);
    };
    const format = (date) => date.toFormat("MM/dd/yyyy HH:mm:ss");
    expect(inputValue("date_start")).toBe(format(dateOf(before)));
    expect(inputValue("date_stop")).toBe(format(dateOf(after).plus({ days: 1 })));
});

test("002b A46: touch long press selects; quick swipe does not", async () => {
    freezeTime();
    mockTouch(true);
    await mountTimeline({ arch: ARCHS.H18 });
    // a long press, then movement
    let drawing = await press("2026-11-08", 1);
    await advanceTime(299);
    expect(".o_tl_selection").toHaveCount(0);
    await advanceTime(1);
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(1);
    await drawing.to("2026-11-10", 0);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual([
        "11/8/2026, 12:00 PM",
        "11/10/2026, 12:00 PM",
    ]);
    await drawing.drop();
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/08/2026 12:00:00");
    expect(inputValue("date_stop")).toBe("11/10/2026 12:00:00");
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();

    // a quick swipe: the grid scrolls on its own
    drawing = await press("2026-11-08", 1);
    await advanceTime(100);
    await drawing.to("2026-11-10", 0);
    await advanceTime(500);
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(0);
    await drawing.drop();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

test("002b A48: phone viewport with mouse selects", async () => {
    await resize({ width: 390, height: 844 });
    await mountTimeline({ arch: ARCHS.H18 });
    const renderer = queryRect(".o_tl_renderer");
    const header = { right: renderer.left };
    const visible = queryAll(`${RECORD_ROW} .o_tl_cell`).filter((cell) => {
        const rect = queryRect(cell);
        return rect.left >= header.right && rect.right <= renderer.right;
    });
    expect(visible.length).toBeGreaterThan(1);
    const y = queryRect(rowAt()).bottom - 4;
    const a = queryRect(visible[0]);
    const b = queryRect(visible[1]);
    const drawing = await drag(visible[0], { position: { x: a.left + 5, y } });
    await drawing.moveTo(visible[1], { position: { x: b.left + 5, y } });
    await animationFrame();
    expect(".o_tl_selection").toHaveCount(1);
    expect(selectionRect().height).toBeGreaterThan(20);
    await drawing.drop();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Create");
});

test("002b R8: release over a control-panel button does not press it", async () => {
    await mountTimeline();
    const drawing = await press("2026-11-08", 1);
    await drawing.to("2026-11-10", 0);
    expect(".o_timeline_view").toHaveClass("o_tl_selecting");
    expect(getComputedStyle(queryOne(".o_tl_next")).pointerEvents).toBe("none");
    expect(getComputedStyle(queryOne(".o_control_panel")).pointerEvents).toBe("none");
    expect(getComputedStyle(queryOne(".o_tl_controls")).pointerEvents).toBe("none");
    await drawing.drop();
    await animationFrame();
    expect(".o_timeline_view").not.toHaveClass("o_tl_selecting");
    expect(getComputedStyle(queryOne(".o_tl_next")).pointerEvents).not.toBe("none");
});

test("002b M1/M2 structure: highlight border sides and badge height/padding", async () => {
    await mountTimeline();
    const drawing = await press("2026-11-08", 1);
    await drawing.to("2026-11-10", 0);
    const highlight = getComputedStyle(queryOne(".o_tl_selection"));
    expect(highlight.backgroundColor).toBe("rgba(0, 160, 157, 0.3)");
    expect([
        highlight.borderTopWidth,
        highlight.borderRightWidth,
        highlight.borderBottomWidth,
        highlight.borderLeftWidth,
    ]).toEqual(["0px", "1px", "1px", "0px"]);
    expect(highlight.borderRightColor).toBe(
        getComputedStyle(cellAt("2026-11-14")).borderRightColor
    );
    expect(highlight.boxSizing).toBe("border-box");
    expect(highlight.borderTopLeftRadius).toBe("0px");
    expect(highlight.boxShadow).toBe("none");
    // under the pills
    expect(Number(getComputedStyle(queryOne(".o_tl_selection_layer")).zIndex)).toBeLessThan(
        Number(getComputedStyle(queryAll(".o_tl_pills")[0]).zIndex)
    );

    const selection = selectionRect();
    const [start, stop] = queryAll(".o_tl_selection_badge");
    const badge = getComputedStyle(start);
    expect(Math.abs(parseFloat(badge.paddingLeft) - 9.84)).toBeLessThan(0.05);
    expect(parseFloat(badge.paddingTop)).toBe(3);
    expect(badge.fontSize).toBe("12px");
    expect(badge.fontWeight).toBe("500");
    expect(parseFloat(badge.borderTopLeftRadius)).toBeGreaterThan(100);
    expect(badge.boxShadow).toInclude("rgba(0, 0, 0, 0.28) 0px 1px 2px 0px");
    expect(Math.abs(queryRect(start).height - 20)).toBeLessThan(0.5);
    expect(near(queryRect(start).bottom, selection.top)).toBe(true);
    expect(near(queryRect(stop).top, selection.bottom)).toBe(true);
    expect(near(queryRect(stop).right, selection.right)).toBe(true);
    // the start badge never goes left of the row header
    expect(queryRect(start).left).not.toBeLessThan(queryRect(".o_tl_renderer").left);
    await drawing.cancel();
});

test("002b A20: cursor auto on cells, pointer on pills, grabbing while selecting", async () => {
    await mountTimeline();
    const cell = cellAt("2026-11-14");
    expect(getComputedStyle(cell).cursor).toBe("auto");
    expect(getComputedStyle(cell).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(queryAll(".o_tl_pill")[0]).cursor).toBe("pointer");
    const drawing = await press("2026-11-08", 1);
    await drawing.to("2026-11-10", 0);
    expect(getComputedStyle(queryOne(".o_content")).cursor).toBe("grabbing");
    expect(getComputedStyle(cell).cursor).toBe("grabbing");
    await drawing.drop();
    await animationFrame();
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    expect(getComputedStyle(cell).cursor).toBe("auto");
});

test("002b A49: date-only selection proposes 16-18", async () => {
    const arch = timelineArch(`default_range="month" plan="0"`);
    await mountTimeline({ arch, resModel: "pill2" });
    await centreOn("2026-11-17");
    let drawing = await press("2026-11-16", 1);
    await drawing.to("2026-11-18", 1);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual([
        "11/16/2026, 12:00 PM",
        "11/19/2026, 12:00 AM",
    ]);
    await drawing.drop();
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/16/2026");
    expect(inputValue("date_stop")).toBe("11/18/2026");
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();

    drawing = await press("2026-11-16", 1);
    await drawing.to("2026-11-18", 0);
    expect(queryAllTexts(".o_tl_selection_badge")).toEqual([
        "11/16/2026, 12:00 PM",
        "11/18/2026, 12:00 PM",
    ]);
    await drawing.drop();
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/16/2026");
    expect(inputValue("date_stop")).toBe("11/18/2026");
});
