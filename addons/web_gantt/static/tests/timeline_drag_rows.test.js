// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    keyDown,
    keyUp,
    queryAll,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    defineWebModels,
    contains,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { drag } from "@odoo/hoot-dom";
import { TimelineController } from "@web_gantt/timeline_controller";

import { HOST_ARCHS, Pill, setupTimelineFixtures, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
/** Makes the writes and copies wait for the test, or null. */
let gate = null;
/** The write and copy calls the server saw, in order. */
let log;

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
    onRpc("write", async ({ args }) => {
        log.push({ call: "write", ids: args[0], values: args[1] });
        await gate;
    });
    onRpc("gantt_undo_drag_drop", ({ args, kwargs }) => {
        log.push({ call: "undo", ids: args[0], kind: kwargs.drag_kind, values: kwargs.values });
        return true;
    });
    onRpc("copy", async ({ args, kwargs }) => {
        log.push({ call: "copy", ids: args[0], default: kwargs.default });
        await gate;
        if (gate?.refuse) {
            throw new Error("Access denied");
        }
    });
    await resize({ width: 1600, height: 900 });
});

const PILL = { Design: 4, Build: 5, Review: 6, Plan: 9 };

async function mountTimeline({ arch = HOST_ARCHS.H1, groupBy, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, groupBy, ...rest });
    await animationFrame();
    log.length = 0;
    timelineMock.calls.length = 0;
}

/** The record rows of the model, by names from the top level (`rowEl("Beta", "Host Contact 3")`). */
function rowEl(...names) {
    let rows = controller.model.data.rows;
    let row;
    for (const name of names) {
        row = rows.find((item) => item.name === name);
        rows = row.children;
    }
    return queryAll(".o_tl_row[data-row-id]").find((element) => element.dataset.rowId === row.id);
}
const pillEl = (name, nth = 0) =>
    queryAll(`.o_tl_pill[data-pill-id="${PILL[name]}"]:not(.o_tl_pill_moved)`)[nth];
const partWidth = () => {
    const column = queryOne(`.o_tl_col[data-date="2026-11-12"]`);
    return queryRect(column).width / 2;
};
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const middleOf = (element) => {
    const rect = queryRect(element);
    return rect.top + rect.height / 2;
};
const root = () => queryOne(".o_timeline_view");
const moved = () => queryAll(".o_tl_pill_moved");
const writes = () => log.filter((entry) => entry.call === "write");
const copies = () => log.filter((entry) => entry.call === "copy");

/** Press the pill element at its middle; `to(row, dx)` moves over a row element. */
async function pressPill(element) {
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const move = async (x, y) => {
        const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x, y } });
        await animationFrame();
    };
    return {
        ...helpers,
        start,
        move,
        over: (row, dx = 0) => move(start.x + dx, middleOf(row)),
    };
}

async function settle() {
    await advanceTime(100);
    await animationFrame();
}

/** The row that holds the highlight, or null. */
const highlightRow = () => queryAll(".o_tl_drop")[0]?.closest(".o_tl_row") || null;

/** Make the Contact field read-only, like the "Created by" level of the hosts H30 and H32. */
function makeContactReadonly() {
    patchWithCleanup(Pill._fields.x_contact, { readonly: true });
}

const BY_PARENT_CONTACT = ["parent_id", "x_contact"];

// ----------------------------------------------------------------------------
// Rows of the grouping
// ----------------------------------------------------------------------------

test("A9 Design from Alpha to Beta: the highlight fills the row, Parent Beta only is written", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const beta = rowEl("Beta");
    const design = await pressPill(pillEl("Design"));
    await design.over(beta);
    expect(highlightRow()).toBe(beta);
    expect(near(queryRect(".o_tl_drop").height, queryRect(beta).height, 1.5)).toBe(true);
    // the same days: both badges keep the black role
    expect(".o_tl_selection_badge.text-success, .o_tl_selection_badge.text-danger").toHaveCount(0);
    await design.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Design], values: { parent_id: 2 } }]);
    expect(".o_notification").toHaveCount(1);
});

test("A10 H3 Alpha / first contact to Beta / third contact: Parent and Contact are written", async () => {
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const target = rowEl("Beta", "Host Contact 3");
    const design = await pressPill(pillEl("Design"));
    await design.over(target);
    expect(highlightRow()).toBe(target);
    await design.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Design], values: { parent_id: 2, x_contact: 3 } },
    ]);
});

for (const mode of ["move", "copy"]) {
    test(`A11 the closed Beta group row takes the ${mode}: group-row highlight, Parent only, the group opens`, async () => {
        freezeTime();
        await mountTimeline({ groupBy: BY_PARENT_CONTACT });
        const header = rowEl("Beta").querySelector(".o_tl_row_header");
        await click(header);
        await advanceTime(1100);
        await animationFrame();
        expect(rowEl("Beta")).toHaveClass("o_tl_collapsed");
        if (mode === "copy") {
            await keyDown("ctrl");
        }
        const design = await pressPill(pillEl("Design"));
        await design.over(rowEl("Beta"));
        expect(highlightRow()).toBe(rowEl("Beta"));
        // M51: a group row is 40 px tall, and so is the highlight over it
        expect(near(queryRect(".o_tl_drop").height, 40)).toBe(true);
        await design.drop();
        if (mode === "copy") {
            await keyUp("ctrl");
        }
        await advanceTime(100);
        await animationFrame();
        if (mode === "move") {
            expect(writes()).toEqual([{ call: "write", ids: [PILL.Design], values: { parent_id: 2 } }]);
        } else {
            expect(copies()).toHaveLength(1);
            expect(copies()[0].default.parent_id).toBe(2);
            expect("x_contact" in copies()[0].default).toBe(false);
        }
        expect(rowEl("Beta")).not.toHaveClass("o_tl_collapsed");
    });
}

test("A12 H4 many-to-many rows: Design to the T2 row replaces its tags; Build to T2 writes nothing", async () => {
    await mountTimeline({ groupBy: ["x_tags"] });
    const t2 = rowEl("Host Tag 2");
    const design = await pressPill(pillEl("Design"));
    await design.over(t2);
    expect(highlightRow()).toBe(t2);
    await design.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Design], values: { x_tags: [[6, 0, [2]]] } },
    ]);

    // Build holds both tags: the T1 row to the T2 row changes nothing
    log.length = 0;
    await animationFrame();
    const build = await pressPill(pillEl("Build"));
    await build.over(rowEl("Host Tag 2"));
    expect(highlightRow()).toBe(rowEl("Host Tag 2"));
    await build.drop();
    await settle();
    expect(log).toHaveLength(0);
});

test("A12 the Undefined tags row empties the tag list", async () => {
    await mountTimeline({ groupBy: ["x_tags"] });
    const none = queryAll(".o_tl_row[data-row-id]").find((row) => row.querySelector(".o_tl_row_label")?.textContent === "Undefined Tags");
    expect(!!none).toBe(true);
    const design = await pressPill(pillEl("Design"));
    await design.over(none);
    await design.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Design], values: { x_tags: false } }]);
});

test("M1 H4: the held instance of Build in the T1 row leaves its other row's pill in place", async () => {
    await mountTimeline({ groupBy: ["x_tags"] });
    expect(queryAll(`.o_tl_pill[data-pill-id="${PILL.Build}"]`)).toHaveLength(2);
    const build = await pressPill(pillEl("Build", 0));
    await build.over(rowEl("Host Tag 2"), 40);
    expect(pillEl("Build", 0)).toHaveClass("o_tl_pill_origin");
    expect(pillEl("Build", 1)).not.toHaveClass("o_tl_pill_origin");
    await build.drop();
    await settle();
});

test("A40 H4: Undo of a move between many-to-many rows gives the former tags back", async () => {
    await mountTimeline({ groupBy: ["x_tags"] });
    // Design from the T1 row to the T2 row, then Undo: T1 again
    const design = await pressPill(pillEl("Design"));
    await design.over(rowEl("Host Tag 2"));
    await design.drop();
    await settle();
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await settle();
    const undone = log.filter((entry) => entry.call === "undo");
    expect(undone).toHaveLength(1);
    expect(undone[0].values.x_tags).toEqual([[6, 0, [1]]]);

    // Build (T1 and T2) onto the Undefined Tags row, then Undo: T1 and T2 again
    log.length = 0;
    const none = queryAll(".o_tl_row[data-row-id]").find(
        (row) => row.querySelector(".o_tl_row_label")?.textContent === "Undefined Tags"
    );
    const build = await pressPill(pillEl("Build", 0));
    await build.over(none);
    await build.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Build], values: { x_tags: false } }]);
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await settle();
    const second = log.filter((entry) => entry.call === "undo");
    expect(second).toHaveLength(1);
    expect(second[0].values.x_tags).toEqual([[6, 0, [1, 2]]]);
});

// ----------------------------------------------------------------------------
// Rows of a read-only grouping (R13)
// ----------------------------------------------------------------------------

test("A50 H30: the read-only level of Beta refuses, the Beta group row accepts and writes Parent only", async () => {
    makeContactReadonly();
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const design = await pressPill(pillEl("Design"));
    // a row of the read-only level under another parent: no highlight, no badge
    await design.over(rowEl("Beta", "Host Contact 2"));
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    // a release there writes nothing
    await design.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);

    const again = await pressPill(pillEl("Design"));
    await again.over(rowEl("Beta"));
    expect(highlightRow()).toBe(rowEl("Beta"));
    expect(near(queryRect(".o_tl_drop").height, 40)).toBe(true);
    await again.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Design], values: { parent_id: 2 } }]);
});

test("A50 the row of the pill itself keeps accepting", async () => {
    makeContactReadonly();
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const design = await pressPill(pillEl("Design"));
    await design.over(rowEl("Alpha", "Host Contact 1"), 2 * partWidth());
    expect(highlightRow()).toBe(rowEl("Alpha", "Host Contact 1"));
    await design.drop();
    await settle();
    expect(writes()).toHaveLength(1);
    expect(Object.keys(writes()[0].values)).toEqual(["date_start", "date_stop"]);
});

test("A51 H32: below the read-only level only the siblings under the same row accept", async () => {
    makeContactReadonly();
    await mountTimeline({ groupBy: ["parent_id", "x_contact", "x_state"] });
    const build = await pressPill(pillEl("Build"));
    const refused = [
        rowEl("Alpha", "Host Contact 1"),
        rowEl("Beta", "Host Contact 2"),
        rowEl("Gamma", "Host Contact 3"),
        rowEl("Beta", "Host Contact 2", "Undefined State"),
    ];
    for (const row of refused) {
        await build.over(row);
        expect(".o_tl_drop").toHaveCount(0);
        expect(".o_tl_selection_badge").toHaveCount(0);
    }
    // the sibling "Draft" under Alpha / the same contact accepts
    const draft = rowEl("Alpha", "Host Contact 1", "Draft");
    await build.over(draft);
    expect(highlightRow()).toBe(draft);
    // and so does the Beta group row
    await build.over(rowEl("Beta"));
    expect(highlightRow()).toBe(rowEl("Beta"));
    await build.over(draft);
    await build.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Build], values: { x_state: "draft" } }]);
});

test("A52 phone size: Plan over Alpha's contact row is refused, over the Alpha group row accepted", async () => {
    makeContactReadonly();
    await resize({ width: 390, height: 844 });
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const plan = pillEl("Plan");
    const rect = queryRect(plan);
    const renderer = queryRect(".o_tl_renderer");
    const x = Math.min(Math.max(rect.left + rect.width / 2, renderer.left + 5), renderer.right - 5);
    const helpers = await drag(plan, { position: { x, y: rect.top + rect.height / 2 } });
    const over = async (row) => {
        const y = middleOf(row);
        await helpers.moveTo(document.elementFromPoint(x, y) || queryOne(".o_tl_renderer"), {
            position: { x, y },
        });
        await animationFrame();
    };
    await over(rowEl("Alpha", "Host Contact 1"));
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    await over(rowEl("Alpha"));
    expect(highlightRow()).toBe(rowEl("Alpha"));
    expect(near(queryRect(".o_tl_drop").height, 40)).toBe(true);
    await helpers.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [PILL.Plan], values: { parent_id: 1 } }]);
});

test("A72 Review onto its own Alpha group row: nothing written, no notification", async () => {
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const review = await pressPill(pillEl("Review"));
    await review.over(rowEl("Alpha"));
    expect(highlightRow()).toBe(rowEl("Alpha"));
    await review.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
    expect(moved()).toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
});

// ----------------------------------------------------------------------------
// R26: the chain of empty-value rows under the leading one
// ----------------------------------------------------------------------------

/** Row names and heights from the top: the Contact field stands for the host's "Created by". */
const rowSummary = () =>
    queryAll(".o_tl_row[data-row-id]").map((element) => [
        element.querySelector(".o_tl_row_name")?.textContent.trim(),
        Math.round(queryRect(element).height),
    ]);

test("A76 H30: Undefined Parent, Undefined Contact (empty), the contact's row with Plan, then Alpha, Beta, Gamma", async () => {
    // Plan has a contact, so no record lies in the empty "Undefined Contact" row
    Pill._records.find((record) => record.name === "Plan").x_contact = 1;
    await mountTimeline({ groupBy: BY_PARENT_CONTACT });
    const names = rowSummary().map(([name]) => name);
    expect(names.slice(0, 3)).toEqual(["Undefined Parent", "Undefined Contact", "Host Contact 1"]);
    expect(names.indexOf("Alpha")).toBeGreaterThan(2);
    // the empty row lies under the first group row, it is a leaf of one record row height
        expect(rowEl("Undefined Parent", "Undefined Contact").querySelectorAll(".o_tl_pill")).toHaveCount(0);
    expect(rowSummary()[1][1]).toBe(41);
    expect(rowSummary()[0][1]).toBe(40);
    expect(rowEl("Undefined Parent", "Host Contact 1").querySelectorAll(".o_tl_pill")).toHaveCount(1);
    // under the other top-level rows nothing is added
    expect(names[names.indexOf("Alpha") + 1]).toBe("Host Contact 1");
});

test("A76 H32: Undefined Parent, Undefined Contact (empty, 40 px), Undefined State (empty, 41 px), the contact's row with its Undefined State row holding Plan", async () => {
    Pill._records.find((record) => record.name === "Plan").x_contact = 1;
    await mountTimeline({ groupBy: ["parent_id", "x_contact", "x_state"] });
    const summary = rowSummary();
    expect(summary.slice(0, 5)).toEqual([
        ["Undefined Parent", 40],
        ["Undefined Contact", 40],
        ["Undefined State", 41],
        ["Host Contact 1", 40],
        ["Undefined State", 41],
    ]);
    expect(
        rowEl("Undefined Parent", "Host Contact 1", "Undefined State").querySelectorAll(".o_tl_pill")
    ).toHaveCount(1);
});
