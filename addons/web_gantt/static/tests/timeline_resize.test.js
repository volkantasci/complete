// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    hover,
    keyDown,
    keyUp,
    queryAll,
    queryAllTexts,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    defineWebModels,
    makeMockServer,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { at, HOST_ARCHS, MIX_ARCHS, setupTimelineFixtures, timelineArch, timelineMock, useRtl } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
/** Makes the writes wait for the test, or null. */
let gate = null;
/** The write calls the server saw, in order. */
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
    await resize({ width: 1600, height: 900 });
});

const RECORD_ROW = ".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)";
const PILL = { Design: 4, Build: 5, Review: 6, "Overlap B": 12, "Three days": 2, "Next month": 3, "MIX first": 1 };

async function mountTimeline({ arch = HOST_ARCHS.H1, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
    // the grid shows Thursday 12 in the middle (R39), where the pills of the tests are
    await animationFrame();
    log.length = 0;
    timelineMock.calls.length = 0;
}

/** "Review" over two sub-columns (setup, "Prepared states"): 10:00 to 14:00 local. */
async function prepareReview(start = at(0, "10:00"), stop = at(0, "14:00")) {
    await makeMockServer();
    const review = MockServer.current.env["pill"].find((record) => record.name === "Review");
    Object.assign(review, { date_start: start, date_stop: stop });
}

const rowAt = (row = 0) => queryAll(RECORD_ROW)[row];
const pillEl = (name) =>
    queryOne(`.o_tl_pill[data-pill-id="${PILL[name]}"]:not(.o_tl_pill_moved)`);
const indexOfDate = (date) => Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index);
const cellAt = (date, row = 0) => rowAt(row).querySelectorAll(".o_tl_cell")[indexOfDate(date)];
const partWidth = () => queryRect(cellAt("2026-11-12")).width / 2;
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const css = (element, property) => getComputedStyle(element)[property];
const root = () => queryOne(".o_timeline_view");
const badgeTexts = () => queryAllTexts(".o_tl_selection_badge");
const badgeRoles = () =>
    queryAll(".o_tl_selection_badge").map((badge) =>
        badge.classList.contains("text-danger")
            ? "danger"
            : badge.classList.contains("text-success")
              ? "success"
              : "black"
    );
const writes = () => log.filter((entry) => entry.call === "write");
const handles = (name) =>
    queryAll(`.o_tl_pill[data-pill-id="${PILL[name]}"] .o_tl_handle`);

/** Let the write and its reload settle. */
async function settle() {
    await advanceTime(100);
    await animationFrame();
}

/**
 * Rest the pointer on the pill `name`, then press its handle `edge` ("start" or "stop") in the
 * middle. Returns the drag helpers and `to(x)`, which moves the pointer to the abscissa `x` on
 * the line of the press.
 */
async function pressHandle(name, edge) {
    await hover(pillEl(name));
    await animationFrame();
    const handle = queryOne(`.o_tl_pill[data-pill-id="${PILL[name]}"] .o_tl_handle_${edge}`);
    const rect = queryRect(handle);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(handle, { position: start });
    const to = async (x, y = start.y) => {
        const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x, y } });
        await animationFrame();
    };
    return { ...helpers, start, to };
}

/** Abscissa of the border between the sub-columns: the day's left edge plus `half` halves. */
const borderOf = (date, half = 0) => queryRect(cellAt(date)).left + half * partWidth();

// ----------------------------------------------------------------------------
// Handles
// ----------------------------------------------------------------------------

test("A25 handles on hover: 8 x 23 inside the body, the resize cursors, gone on leave", async () => {
    await mountTimeline();
    expect(".o_tl_handle").toHaveCount(0);
    await hover(pillEl("Build"));
    await animationFrame();
    expect(handles("Build")).toHaveCount(2);
    expect(".o_tl_handle").toHaveCount(2);
    const body = queryRect(pillEl("Build"));
    const start = queryOne(".o_tl_handle_start");
    const stop = queryOne(".o_tl_handle_stop");
    const startRect = queryRect(start);
    const stopRect = queryRect(stop);
    // M25, M27: inside the coloured body, at its ends, 8 px wide and as tall as the body
    expect(near(startRect.left, body.left, 0.5)).toBe(true);
    expect(near(stopRect.right, body.right, 0.5)).toBe(true);
    for (const rect of [startRect, stopRect]) {
        expect(rect.width).toBe(8);
        expect(rect.height).toBe(23);
        expect(near(rect.top, body.top, 0.5)).toBe(true);
    }
    expect(css(start, "cursor")).toBe("w-resize");
    expect(css(stop, "cursor")).toBe("e-resize");
    for (const handle of [start, stop]) {
        expect(css(handle, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
        expect(css(handle, "borderTopWidth")).toBe("0px");
        expect(css(handle, "borderTopLeftRadius")).toBe("0px");
        expect(css(handle, "boxShadow")).toBe("none");
    }
    // the pointer leaves the pill: the handles go
    await hover(".o_tl_col");
    await animationFrame();
    expect(".o_tl_handle").toHaveCount(0);
});

test("A25 no handle on a view that cannot edit (H19) and none in the sample state", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" edit="0"`) });
    expect(".o_tl_pill").not.toHaveCount(0);
    await hover(pillEl("Build"));
    await animationFrame();
    expect(".o_tl_handle").toHaveCount(0);
});

test("A25 the sample state shows no pill, so no handle", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H8, domain: [["id", "<", 0]] });
    expect(".o_tl_pill").toHaveCount(0);
    expect(".o_tl_handle").toHaveCount(0);
});

test("A26 Day: Design has only an end handle, Build only a start handle; Week: Long task none", async () => {
    const day = HOST_ARCHS.H1.replace('default_range="week"', 'default_range="day"');
    await mountTimeline({ arch: day });
    // Design starts before the displayed range, Build ends after it
    await hover(pillEl("Design"));
    await animationFrame();
    expect(queryAll(".o_tl_handle").map((handle) => handle.dataset.edge)).toEqual(["stop"]);
    await hover(pillEl("Build"));
    await animationFrame();
    expect(queryAll(".o_tl_handle").map((handle) => handle.dataset.edge)).toEqual(["start"]);
});

test("A26 Week: Long task is cut at both ends and has no handle", async () => {
    await mountTimeline();
    const longTask = queryAll(".o_tl_pill").find(
        (pill) => pill.querySelector(".o_tl_pill_title").textContent.includes("Long task")
    );
    await hover(longTask);
    await animationFrame();
    expect(".o_tl_handle").toHaveCount(0);
});

test("R8 a held handle hides every handle, and another pill gets none while it is held", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "stop");
    await build.to(build.start.x - 2 * partWidth());
    expect(".o_tl_handle").toHaveCount(0);
    await hover(pillEl("Review"));
    await animationFrame();
    expect(".o_tl_handle").toHaveCount(0);
    await build.drop();
    await settle();
});

// ----------------------------------------------------------------------------
// Resizing
// ----------------------------------------------------------------------------

test("A27 shorten Build at its end: the pill follows to the border, badges, one stop write", async () => {
    await mountTimeline();
    const before = queryRect(pillEl("Build"));
    const build = await pressHandle("Build", "stop");
    const border = borderOf("2026-11-14");
    await build.to(border - 5);
    // the end goes to the nearest border (M34): the pill held is its box, one pixel around the
    // body it has at rest, and ends there
    const rect = queryRect(pillEl("Build"));
    expect(near(rect.right, border)).toBe(true);
    expect(near(rect.left, before.left - 1)).toBe(true);
    expect(near(rect.height, 25)).toBe(true);
    expect(pillEl("Build")).not.toHaveClass("o_tl_pill_origin");
    expect(".o_tl_pill_moved").toHaveCount(0);
    expect(".o_tl_pill_faded").toHaveCount(0);
    expect(".o_tl_drop").toHaveCount(0);
    // the badges: the stop with its difference in danger (M29), the start black (M31)
    expect(badgeTexts()).toEqual(["11/12/2026, 9:00 AM", "11/13/2026, 6:00 PM (-24 hours)"]);
    expect(badgeRoles()).toEqual(["black", "danger"]);
    // the badges stand against the pill's box
    const start = queryRect(".o_tl_badge_start");
    const stop = queryRect(".o_tl_badge_stop");
    expect(near(start.left, rect.left)).toBe(true);
    expect(near(start.top, rect.top - 20)).toBe(true);
    expect(near(stop.right, rect.right)).toBe(true);
    expect(near(stop.top, rect.bottom)).toBe(true);
    // M33: the east resize shape over the view
    expect(root()).toHaveClass("o_tl_dragging");
    expect(root()).toHaveClass("o_tl_drag_resize");
    expect(root()).toHaveClass("o_tl_drag_east");
    expect(css(queryOne(".o_tl_renderer"), "cursor")).toBe("e-resize");

    await build.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Build], values: { date_stop: "2026-11-13 15:00:00" } },
    ]);
    expect(root()).not.toHaveClass("o_tl_dragging");
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_notification").toHaveCount(1);
    // the view reloaded: the pill ends at the border
    expect(near(queryRect(pillEl("Build")).right, border - 1)).toBe(true);
});

test("A28 lengthen Build at its start: success badge, the west shape, one start write after the answer", async () => {
    freezeTime();
    await mountTimeline();
    const before = queryRect(pillEl("Build"));
    const build = await pressHandle("Build", "start");
    // 4 px right of the border one day before the start of Build
    const border = borderOf("2026-11-11");
    await build.to(border + 4);
    expect(badgeTexts()).toEqual(["11/11/2026, 9:00 AM (+24 hours)", "11/14/2026, 6:00 PM"]);
    expect(badgeRoles()).toEqual(["success", "black"]);
    expect(root()).toHaveClass("o_tl_drag_west");
    expect(css(queryOne(".o_tl_renderer"), "cursor")).toBe("w-resize");
    expect(near(queryRect(pillEl("Build")).left, border)).toBe(true);
    expect(near(queryRect(pillEl("Build")).right, before.right + 1, 0.5)).toBe(true);

    let release;
    gate = new Promise((resolve) => (release = resolve));
    await build.drop();
    await advanceTime(50);
    await animationFrame();
    // sent, not answered: the pill is drawn at its stored length and nothing is announced (D6)
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Build], values: { date_start: "2026-11-11 06:00:00" } },
    ]);
    expect(".o_notification").toHaveCount(0);
    expect(near(queryRect(pillEl("Build")).left, before.left)).toBe(true);
    release();
    await advanceTime(100);
    await animationFrame();
    expect(".o_notification").toHaveCount(1);
    expect(queryOne(".o_notification").textContent).toInclude("Dates changed");
    expect(".o_notification button").toHaveCount(2); // Undo and the close cross
    expect(near(queryRect(pillEl("Build")).left, border + 1)).toBe(true);
});

test("A29 the nearest border: 40 px past keeps it, 60 px goes to the next; one sub-column at least", async () => {
    await mountTimeline();
    const part = partWidth();
    const border = borderOf("2026-11-13");
    const build = await pressHandle("Build", "stop");
    await build.to(border + 40);
    expect(near(queryRect(pillEl("Build")).right, border)).toBe(true);
    await build.to(border + 60);
    expect(near(queryRect(pillEl("Build")).right, border + part)).toBe(true);
    // past the start: one sub-column remains, its end one sub-column after its start
    await build.to(queryRect(pillEl("Build")).left - 100);
    const rect = queryRect(pillEl("Build"));
    expect(near(rect.width, part)).toBe(true);
    await build.drop();
    await settle();
    // five sub-columns shorter would stop at 06:00 of Thursday, before the start at 09:00: R12
    expect(writes()).toHaveLength(0);
    expect(queryOne(".o_notification").textContent).toInclude(
        "The end cannot come before the start."
    );
});

test("A30 Year: Design end one column later reads +1 months and writes Dec 11 18:00 local", async () => {
    const year = HOST_ARCHS.H1.replace('default_range="week"', 'default_range="year"');
    await mountTimeline({ arch: year });
    const design = await pressHandle("Design", "stop");
    const column = queryRect(cellAt("2026-11-01"));
    await design.to(column.right + column.width);
    expect(badgeTexts()).toEqual(["11/9/2026", "12/11/2026 (+1 months)"]);
    expect(badgeRoles()).toEqual(["black", "success"]);
    await design.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Design], values: { date_stop: "2026-12-11 15:00:00" } },
    ]);
});

test("A31 an end before the start: one sub-column drawn, danger badge, warning, nothing written", async () => {
    await prepareReview();
    await mountTimeline();
    const part = partWidth();
    const review = await pressHandle("Review", "stop");
    await review.to(borderOf("2026-11-12", 1));
    expect(near(queryRect(pillEl("Review")).width, part)).toBe(true);
    expect(badgeTexts()).toEqual(["11/12/2026, 10:00 AM", "11/12/2026, 2:00 AM (-12 hours)"]);
    expect(badgeRoles()).toEqual(["black", "danger"]);
    await review.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_notification").toHaveCount(1);
    expect(queryOne(".o_notification").textContent).toInclude(
        "The end cannot come before the start."
    );
    expect(".o_notification .o_notification_bar.bg-warning").toHaveCount(1);
    expect(".o_notification_buttons").toHaveCount(0);
    // the pill keeps its place
    expect(near(queryRect(pillEl("Review")).width, 2 * part - 2)).toBe(true);
    expect(timelineMock.calls).toHaveLength(0);
});

test("A32 a start after the end: danger badge, warning, nothing written", async () => {
    await prepareReview();
    await mountTimeline();
    const review = await pressHandle("Review", "start");
    await review.to(borderOf("2026-11-12", 1));
    expect(badgeTexts()).toEqual(["11/12/2026, 10:00 PM (-12 hours)", "11/12/2026, 2:00 PM"]);
    expect(badgeRoles()).toEqual(["danger", "black"]);
    await review.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(queryOne(".o_notification").textContent).toInclude(
        "The start cannot come after the end."
    );
    expect(".o_notification .o_notification_bar.bg-warning").toHaveCount(1);
});

test("A33 phone without touch: the end handle 88 px left in one step reads 2:00 PM (-12 hours)", async () => {
    await prepareReview(at(-1, "22:00"), at(0, "02:00"));
    await resize({ width: 390, height: 844 });
    await mountTimeline();
    const part = partWidth();
    const review = await pressHandle("Review", "stop");
    const x = review.start.x - 88;
    await review.to(x);
    expect(badgeTexts()[1]).toBe("11/11/2026, 2:00 PM (-12 hours)");
    expect(badgeRoles()[1]).toBe("danger");
    expect(part).toBeGreaterThan(40);
    await review.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(queryOne(".o_notification").textContent).toInclude(
        "The end cannot come before the start."
    );
});

test("A34 phone with a mouse: handles on Overlap B, start to Thursday 00:00, Review start earlier", async () => {
    await resize({ width: 390, height: 844 });
    await mountTimeline();
    await hover(pillEl("Overlap B"));
    await animationFrame();
    expect(handles("Overlap B")).toHaveCount(2);
    await hover(".o_tl_col");
    const overlap = await pressHandle("Overlap B", "start");
    await overlap.to(borderOf("2026-11-12"));
    expect(badgeTexts()[0]).toBe("11/12/2026, 2:00 AM (-12 hours)");
    expect(badgeRoles()[0]).toBe("danger");
    await overlap.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL["Overlap B"]], values: { date_start: "2026-11-11 23:00:00" } },
    ]);

    const review = await pressHandle("Review", "start");
    await review.to(borderOf("2026-11-12"));
    expect(badgeTexts()[0]).toBe("11/12/2026, 1:00 AM (+12 hours)");
    expect(badgeRoles()[0]).toBe("success");
    await review.drop();
    await settle();
});

test("A35 a finger on the end handle moves the pill: no touch resizing (D5)", async () => {
    freezeTime();
    await resize({ width: 390, height: 844 });
    await mountTimeline();
    // the pointer rests on the pill first, so that its handles exist when the finger comes
    await hover(pillEl("Review"));
    await animationFrame();
    const handle = queryOne(".o_tl_pill .o_tl_handle_stop");
    mockTouch(true);
    const rect = queryRect(handle);
    const renderer = queryRect(".o_tl_renderer");
    const x = Math.min(rect.left + rect.width / 2, renderer.right - 5);
    // the press lies inside the move zone of the right edge
    expect(x).toBeGreaterThan(renderer.right - 30);
    const y = rect.top + rect.height / 2;
    const helpers = await drag(handle, { position: { x, y } });
    await advanceTime(600);
    // R-T15-4: the finger lies in the move zone of the right edge (30 px), where the grid leaves
    // the pill's last 8 px; the first move jumps out of the zone in one step, then it goes on
    // slowly to the place one half day (96 px) before the press
    let pointer = x;
    const rest = (partWidth() - 40) / 4;
    const steps = [40, rest, rest, rest, rest];
    for (const step of steps) {
        pointer -= step;
        const target = document.elementFromPoint(pointer, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x: pointer, y } });
        await advanceTime(120);
        await animationFrame();
    }
    expect(".o_tl_pill_moved").toHaveCount(1);
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(badgeTexts()).toEqual(["11/12/2026, 1:00 AM", "11/12/2026, 5:00 AM"]);
    await helpers.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL.Review],
            values: { date_start: "2026-11-11 22:00:00", date_stop: "2026-11-12 02:00:00" },
        },
    ]);
});

test("A36 Escape restores the length: no badge, nothing written", async () => {
    await mountTimeline();
    const before = queryRect(pillEl("Build"));
    const build = await pressHandle("Build", "stop");
    await build.to(borderOf("2026-11-14") - 5);
    expect(queryRect(pillEl("Build")).width).toBeLessThan(before.width);
    await keyDown("Escape");
    await keyUp("Escape");
    await animationFrame();
    expect(near(queryRect(pillEl("Build")).width, before.width)).toBe(true);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    await build.drop().catch(() => {});
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
});

test("D3 a release on the starting border writes nothing, also after moving away and back", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "stop");
    await build.to(build.start.x - 3 * partWidth());
    await build.to(build.start.x + 2);
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
    expect(timelineMock.calls).toHaveLength(0);
});

test("A37 H31 drag and drop off: the end handle still resizes by one day", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H1.replace('default_range="week"', 'default_range="week" disable_drag_drop="1"'),
    });
    // the grid scrolled left, so that the day after Build's end lies clear of the edge zone
    queryOne(".o_tl_renderer").scrollLeft += 400;
    await animationFrame();
    const build = await pressHandle("Build", "stop");
    await build.to(borderOf("2026-11-14") + 4 * partWidth());
    expect(badgeTexts()[1]).toBe("11/15/2026, 6:00 PM (+24 hours)");
    await build.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Build], values: { date_stop: "2026-11-15 15:00:00" } },
    ]);
});

test("A73 the sign of the start badge follows the length: earlier +24 success, later -24 danger", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "start");
    await build.to(borderOf("2026-11-11"));
    expect(badgeTexts()[0]).toBe("11/11/2026, 9:00 AM (+24 hours)");
    expect(badgeRoles()[0]).toBe("success");
    await build.to(borderOf("2026-11-13"));
    expect(badgeTexts()[0]).toBe("11/13/2026, 9:00 AM (-24 hours)");
    expect(badgeRoles()[0]).toBe("danger");
    await build.drop();
    await settle();
});

test("R8 another key cancels a resize, Ctrl does not", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "stop");
    await build.to(borderOf("2026-11-14") - 5);
    await keyDown("ctrl");
    await keyUp("ctrl");
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_resize");
    expect(root()).not.toHaveClass("o_tl_drag_copy");
    await keyDown("a");
    await keyUp("a");
    await animationFrame();
    expect(root()).not.toHaveClass("o_tl_dragging");
    expect(".o_tl_selection_badge").toHaveCount(0);
    await build.drop().catch(() => {});
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
});

test("R8 Ctrl alone leaves the resize running and it writes", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "stop");
    await build.to(borderOf("2026-11-14") - 5);
    await keyDown("ctrl");
    await keyUp("ctrl");
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_resize");
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(1);
});

test("R2 pointercancel and a hidden tab cancel a resize", async () => {
    await mountTimeline();
    for (const ending of ["pointercancel", "hidden"]) {
        let pointerId = 1;
        document.addEventListener("pointerdown", (ev) => (pointerId = ev.pointerId), { once: true });
        const build = await pressHandle("Build", "stop");
        await build.to(borderOf("2026-11-14") - 5);
        expect(root()).toHaveClass("o_tl_drag_resize", { message: ending });
        if (ending === "pointercancel") {
            document.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
        } else {
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
            document.dispatchEvent(new Event("visibilitychange"));
            delete document.visibilityState;
        }
        await animationFrame();
        expect(root()).not.toHaveClass("o_tl_dragging", { message: ending });
        expect(".o_tl_selection_badge").toHaveCount(0, { message: ending });
        await build.drop().catch(() => {});
        await settle();
        expect(writes()).toHaveLength(0, { message: ending });
    }
});

test("R9 a press and release on a handle without movement is a click: the popover opens", async () => {
    freezeTime();
    await mountTimeline();
    await hover(pillEl("Build"));
    await animationFrame();
    await click(queryOne(".o_tl_handle_stop"));
    await advanceTime(300);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
    expect(writes()).toHaveLength(0);
});

test("R-C-5 a short pill keeps its middle third for moving: handles never exceed a third", async () => {
    // a 15-minute sub-column of the Day scale is about 10 px wide
    await prepareReview(at(0, "13:00"), at(0, "13:15"));
    const arch = HOST_ARCHS.H1.replace(
        'default_range="week"',
        `default_range="day" precision="{'day': 'hour:quarter'}"`
    );
    await mountTimeline({ arch });
    const body = queryRect(pillEl("Review"));
    expect(body.width).toBeLessThan(16);
    await hover(pillEl("Review"));
    await animationFrame();
    for (const handle of handles("Review")) {
        expect(queryRect(handle).width).toBeLessThan(body.width / 2);
        expect(queryRect(handle).width).toBeLessThan(body.width / 3 + 0.5);
    }
    // a press in the middle moves the pill
    const middle = { x: body.left + body.width / 2, y: body.top + body.height / 2 };
    expect(document.elementFromPoint(middle.x, middle.y)).not.toHaveClass("o_tl_handle");
    const helpers = await drag(pillEl("Review"), { position: middle });
    await helpers.moveTo(queryOne(".o_tl_renderer"), { position: { x: middle.x + 30, y: middle.y } });
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_move");
    await helpers.drop();
    await settle();
    // a press at the very end resizes
    await hover(pillEl("Review"));
    await animationFrame();
    const stop = queryOne(".o_tl_handle_stop");
    const rect = queryRect(stop);
    const point = { x: rect.right - 0.5, y: rect.top + rect.height / 2 };
    const end = await drag(stop, { position: point });
    await end.moveTo(queryOne(".o_tl_renderer"), { position: { x: point.x + 30, y: point.y } });
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_resize");
    await end.drop();
    await settle();
});

// ----------------------------------------------------------------------------
// Date-only fields (R17)
// ----------------------------------------------------------------------------

const H25 = timelineArch(`string="Dated pills" default_range="month" scales="day,week,month" plan="0"`);
const leftOf = (date) => queryRect(cellAt(date)).left;
const dayWidth = () => queryRect(cellAt("2026-11-12")).width;

test("A58 H10 the end of Three days one day to the left: stop 2026-11-12, '11/12/2026 (-1 days)'", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    const three = await pressHandle("Three days", "stop");
    await three.to(three.start.x - dayWidth());
    expect(badgeTexts()).toEqual(["11/11/2026", "11/12/2026 (-1 days)"]);
    expect(badgeRoles()).toEqual(["black", "danger"]);
    await three.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL["Three days"]], values: { date_stop: "2026-11-12" } },
    ]);
    expect(near(queryRect(pillEl("Three days")).right, leftOf("2026-11-13") - 1)).toBe(true);
});

test("A59.3 half-day precision, the stop: steps at the middle of Nov 14 and of Nov 13, never before the start day", async () => {
    await mountTimeline({ arch: H25, resModel: "pill2" });
    const end = leftOf("2026-11-14");
    const day = dayWidth();
    const three = await pressHandle("Three days", "stop");
    await three.to(end + 10);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await three.to(end + 30);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/14/2026 (+1 days)"]);
    expect(near(queryRect(pillEl("Three days")).right, end + day)).toBe(true);
    // back: the step falls at the same place
    await three.to(end + 10);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await three.to(end - 20);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await three.to(end - 30);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/12/2026 (-1 days)"]);
    // never before the end of the start day
    await three.to(leftOf("2026-11-05"));
    expect(badgeTexts()).toEqual(["11/11/2026", "11/11/2026 (-2 days)"]);
    expect(near(queryRect(pillEl("Three days")).width, day)).toBe(true);
    await three.to(end - 30);
    await three.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL["Three days"]], values: { date_stop: "2026-11-12" } },
    ]);
});

test("A59.4 half-day precision, the start: Nov 10 at the middle of Nov 10 and back at the same place", async () => {
    await mountTimeline({ arch: H25, resModel: "pill2" });
    const begin = leftOf("2026-11-11");
    const three = await pressHandle("Three days", "start");
    await three.to(begin - 20);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await three.to(begin - 30);
    expect(badgeTexts()).toEqual(["11/10/2026 (+1 days)", "11/13/2026"]);
    expect(badgeRoles()[0]).toBe("success");
    await three.to(begin - 20);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await three.to(begin - 30);
    await three.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL["Three days"]], values: { date_start: "2026-11-10" } },
    ]);
});

test("A59.5 Year copy of H25: the end of Next month past the middle of January writes 2027-01-22", async () => {
    const year = timelineArch(
        `string="Dated pills" default_range="year" scales="day,week,month,year" plan="0"`
    );
    await mountTimeline({ arch: year, resModel: "pill2" });
    const end = leftOf("2027-01-01");
    const month = queryRect(cellAt("2027-01-01")).width;
    const next = await pressHandle("Next month", "stop");
    await next.to(end + month * 0.3);
    expect(badgeTexts()).toEqual(["12/7/2026", "12/22/2026"]);
    await next.to(end + month * 0.7);
    expect(badgeTexts()).toEqual(["12/7/2026", "1/22/2027 (+1 months)"]);
    await next.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL["Next month"]], values: { date_stop: "2027-01-22" } },
    ]);
});

test("R17.5 mixed model (date-only start, date-time stop 10:00): the step falls at the middle of a day, the bound keeps 10:00", async () => {
    await makeMockServer();
    const mix = MockServer.current.env["mix"].find((record) => record.name === "MIX first");
    Object.assign(mix, { day: "2026-11-12", date_stop: at(1, "10:00") });
    await mountTimeline({ arch: MIX_ARCHS.H14, resModel: "mix" });
    const stop = await pressHandle("MIX first", "stop");
    // a nudge of 10 px from the drawn edge never changes the date
    await stop.to(stop.start.x + 10);
    expect(badgeTexts()[1]).not.toInclude("days");
    await stop.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    // past the middle of the next day: one more day, at 10:00
    const again = await pressHandle("MIX first", "stop");
    await again.to(leftOf("2026-11-14") + 0.4 * dayWidth());
    expect(badgeTexts()[1]).not.toInclude("days");
    await again.to(leftOf("2026-11-14") + 0.75 * dayWidth());
    expect(badgeTexts()[1]).toInclude("(+24 hours)");
    await again.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [1], values: { date_stop: at(2, "10:00") } },
    ]);
});

// ----------------------------------------------------------------------------
// Right to left (R8, R19)
// ----------------------------------------------------------------------------

test("A62 Build handles: right end is start (e-resize), left end is stop (w-resize); the left handle one day further left lengthens the stop by one day", async () => {
    useRtl();
    await mountTimeline();
    await hover(pillEl("Build"));
    await animationFrame();
    const body = queryRect(pillEl("Build"));
    const start = queryOne(".o_tl_handle_start");
    const stop = queryOne(".o_tl_handle_stop");
    expect(near(queryRect(start).right, body.right, 0.5)).toBe(true);
    expect(near(queryRect(stop).left, body.left, 0.5)).toBe(true);
    expect(css(start, "cursor")).toBe("e-resize");
    expect(css(stop, "cursor")).toBe("w-resize");
    await hover(".o_tl_col");
    await animationFrame();

    const build = await pressHandle("Build", "stop");
    await build.to(build.start.x - 2 * partWidth());
    expect(root()).toHaveClass("o_tl_drag_west");
    expect(css(queryOne(".o_tl_renderer"), "cursor")).toBe("w-resize");
    expect(badgeTexts()[1]).toMatch(/\(\+24 hours\)$/);
    expect(badgeRoles()[1]).toBe("success");
    const rect = queryRect(pillEl("Build"));
    const startBadge = queryRect(".o_tl_badge_start");
    const stopBadge = queryRect(".o_tl_badge_stop");
    expect(near(startBadge.top, rect.bottom)).toBe(true);
    expect(near(startBadge.right, rect.right)).toBe(true);
    expect(near(stopBadge.top, rect.top - 20)).toBe(true);
    // the pill reaches past the window's left edge here: the badge is kept inside it (R6)
    expect(rect.left < 0).toBe(true);
    expect(stopBadge.left >= 1 - 0.01).toBe(true);
    await build.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [PILL.Build], values: { date_stop: "2026-11-15 15:00:00" } },
    ]);
});

test("R-C-7 the difference of a badge keeps its text in en_US", async () => {
    await mountTimeline();
    const build = await pressHandle("Build", "stop");
    await build.to(build.start.x + 2 * partWidth());
    expect(badgeTexts()[1]).toBe("11/15/2026, 6:00 PM (+24 hours)");
    await build.drop();
    await settle();
});
