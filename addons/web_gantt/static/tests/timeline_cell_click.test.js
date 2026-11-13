// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, dblclick, queryAll, queryOne, waitFor } from "@odoo/hoot-dom";
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

import { at, HOST_ARCHS, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let writes;

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    writes = [];
    onRpc("write", ({ args, model }) => {
        writes.push({ model, ids: args[0], values: args[1] });
    });
});

const BASE = `default_range="week" color="x_color"`;
const ARCHS = {
    H1: HOST_ARCHS.H1,
    H18: timelineArch(`${BASE} plan="0"`),
    H19: timelineArch(`${BASE} edit="0"`),
    H20: timelineArch(`${BASE} create="0"`),
    H21: timelineArch(`${BASE} delete="0" plan="0"`),
    H23: timelineArch(`${BASE} cell_create="0" plan="0"`),
};

async function mountTimeline({ arch = ARCHS.H18, resModel = "pill", ...rest } = {}) {
    await mountView({ type: "gantt", resModel, arch, ...rest });
}

/** The cell of the column whose header has the data attribute `index` in the first record row. */
function cellAt(index, rowSelector = ".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)") {
    return queryAll(`${rowSelector} .o_tl_cell`)[index];
}

function indexOfDate(date) {
    return Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index);
}

const inputValue = (name) =>
    queryOne(`.o_dialog .o_field_widget[name='${name}'] button`).getAttribute("value");
const title = () => queryOne(".o_dialog .modal-title").textContent;

async function clickDate(date, options) {
    await click(cellAt(indexOfDate(date), options));
    await animationFrame();
}

async function closeDialog() {
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
}

test("002b A15: click plans", async () => {
    await mountTimeline({ arch: ARCHS.H1 });
    await clickDate("2026-11-14");
    expect(title()).toBe("Plan");
    expect(queryAll(".o_dialog .o_data_row .o_data_cell[name='name']").map((e) => e.textContent)).toEqual([
        "Alpha",
        "Beta",
        "Gamma",
        "Unscheduled",
    ]);
});

test("002b A16: click creates the whole day", async () => {
    await mountTimeline();
    await clickDate("2026-11-14");
    expect(title()).toBe("Create");
    expect(inputValue("date_start")).toBe("11/14/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/15/2026 00:00:00");
});

test("002b A16: day scale creates the whole hour", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="day" plan="0"`) });
    // the day range starts on 11 Nov (the 10th column is 10:00)
    await click(queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_cell")[10]);
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/11/2026 10:00:00");
    expect(inputValue("date_stop")).toBe("11/11/2026 11:00:00");
});

test("002b A16: year click creates the month", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="year" scales="year" plan="0"`) });
    await clickDate("2026-11-01");
    await animationFrame();
    expect(inputValue("date_start")).toBe("11/01/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("12/01/2026 00:00:00");
});

test("002b A17/E7: cell create off and plan off do nothing; New still creates", async () => {
    await mountTimeline({ arch: ARCHS.H23 });
    await clickDate("2026-11-14");
    expect(".o_dialog").toHaveCount(0);
    await contains(".o_tl_button_add").click();
    await animationFrame();
    expect(title()).toBe("Create");
});

test("002b A18: group row toggles; folded column unfolds in a group row; double click opens one dialog", async () => {
    await mountTimeline({ arch: ARCHS.H18, groupBy: ["parent_id", "x_contact"] });
    const group = queryAll(".o_tl_group_row")[0];
    expect(group).not.toHaveClass("o_tl_collapsed");
    await click(group.querySelector(".o_tl_cell"));
    await animationFrame();
    expect(queryAll(".o_tl_group_row")[0]).toHaveClass("o_tl_collapsed");
    expect(".o_dialog").toHaveCount(0);

    // double click on an empty cell: one dialog
    await advanceTime(1100);
    await dblclick(cellAt(indexOfDate("2026-11-14")));
    await animationFrame();
    expect(".o_dialog").toHaveCount(1);
});

test("002b A18: a folded column unfolds in a group row without toggling it", async () => {
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
    const group = queryAll(".o_tl_group_row")[0];
    await click(group.querySelector(".o_tl_folded_cell"));
    await animationFrame();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    expect(queryAll(".o_tl_group_row")[0]).not.toHaveClass("o_tl_collapsed");
    expect(".o_dialog").toHaveCount(0);
});

test("002b A18b: click with popover open only closes it; a second click after 500 ms plans", async () => {
    freezeTime();
    await mountTimeline({ arch: ARCHS.H1 });
    await click(`.o_tl_pill[data-pill-id="5"]`);
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
    const cell = cellAt(indexOfDate("2026-11-14"));
    await click(cell);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(0);
    expect(".o_dialog").toHaveCount(0);
    await advanceTime(500);
    await click(cell);
    await animationFrame();
    expect(title()).toBe("Plan");
});

test("002b A18b: the popover lock is 250 ms, not shorter", async () => {
    freezeTime();
    await mountTimeline({ arch: ARCHS.H1 });
    await click(`.o_tl_pill[data-pill-id="5"]`);
    await advanceTime(250);
    await animationFrame();
    const cell = cellAt(indexOfDate("2026-11-14"));
    await click(cell);
    await advanceTime(200);
    await click(cell);
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

test("002b R7: the lock after a cell click lasts one second", async () => {
    freezeTime();
    await mountTimeline();
    await clickDate("2026-11-14");
    await closeDialog();
    await advanceTime(900);
    await clickDate("2026-11-14");
    expect(".o_dialog").toHaveCount(0);
    await advanceTime(150);
    await clickDate("2026-11-14");
    expect(".o_dialog").toHaveCount(1);
});

test("002b A19: sample cells do nothing", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H8, domain: [["id", "=", 0]] });
    expect(".o_view_sample_data").toHaveCount(1);
    await click(queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_cell")[3]);
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

test("002b R7: a cell of the total row does nothing", async () => {
    await mountTimeline({ arch: ARCHS.H1 });
    await click(queryAll(".o_tl_total_row .o_tl_cell")[3]);
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

const TABLE = {
    H1: "Plan",
    H18: "Create",
    H19: "Create",
    H20: "Plan",
    H21: "Create",
    H23: "nothing",
};
for (const [name, outcome] of Object.entries(TABLE)) {
    test(`002b A3: permission table ${name}`, async () => {
        await mountTimeline({ arch: ARCHS[name] });
        await clickDate("2026-11-14");
        expect(queryAll(".o_dialog").length ? title() : "nothing").toBe(outcome);
    });
}

test('002b A4: plan "False" creates', async () => {
    await mountTimeline({ arch: timelineArch(`${BASE} plan="False"`) });
    await clickDate("2026-11-14");
    expect(title()).toBe("Create");
});

test('002b A4: cell_create "0" does nothing', async () => {
    await mountTimeline({ arch: timelineArch(`${BASE} plan="0" cell_create="0"`) });
    await clickDate("2026-11-14");
    expect(".o_dialog").toHaveCount(0);
});

/** Plan the record "Undated" of the date-only model from the click on `date`. */
async function planUndated(arch, date) {
    await mountTimeline({ arch, resModel: "pill2" });
    MockServer.current.env.pill2.create({ name: "Undated", active: true });
    await clickDate(date);
    await waitFor(".o_dialog .o_list_view .o_content");
    await animationFrame();
    await contains(".o_dialog .o_data_row:contains(Undated) .o_list_record_selector input").click();
    await waitFor(".o_dialog .o_select_button:not(:disabled)");
    await contains(".o_dialog .o_select_button").click();
    await animationFrame();
    return writes.find((write) => write.model === "pill2");
}

test("002b A49: date-only click on 16 proposes 16 to 16; week click Friday 13 to 13", async () => {
    const month = await planUndated(HOST_ARCHS.H10, "2026-11-16");
    expect(month.values).toEqual({ date_start: "2026-11-16", date_stop: "2026-11-16" });
});

test("002b A49: week click on Friday 13 proposes 13 to 13", async () => {
    const week = await planUndated(timelineArch(`default_range="week"`), "2026-11-13");
    expect(week.values).toEqual({ date_start: "2026-11-13", date_stop: "2026-11-13" });
});

test("002b A49b: year click November on date-only Nov 1 to Nov 30", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="year" scales="year"`),
        resModel: "pill2",
    });
    MockServer.current.env.pill2.create({ name: "Undated", active: true });
    await clickDate("2026-11-01");
    await waitFor(".o_dialog .o_list_view .o_content");
    await animationFrame();
    await contains(".o_dialog .o_data_row:contains(Undated) .o_list_record_selector input").click();
    await waitFor(".o_dialog .o_select_button:not(:disabled)");
    await contains(".o_dialog .o_select_button").click();
    await animationFrame();
    const [write] = writes;
    expect(write.values).toEqual({ date_start: "2026-11-01", date_stop: "2026-11-30" });
});
