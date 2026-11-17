// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import { mountView, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    DEPENDENCY_ATTRS,
    linkPills,
    PILL_ID,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

/**
 * 002d R2 and decision D2 (A11 to A16): an open popover stays open while a press that can start a
 * gesture is held and the pointer has moved less than the threshold (10 px), and closes when the
 * gesture starts; with touch at desktop size a finger on the place of a resize handle moves the
 * pill, there is never a resize by touch.
 */

describe.current.tags("desktop");

setupTimelineFixtures();

const ARCH = timelineArch(DEPENDENCY_ATTRS);

/** The calls the server saw: writes and rescheduling calls. */
let log;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    log = [];
    timelineMock.beforeReply = () => {};
    onRpc("write", () => {
        log.push("write");
    });
    onRpc("web_gantt_reschedule", () => {
        log.push("reschedule");
        return { type: "success", message: "Records rescheduled", old_vals_per_pill_id: {} };
    });
    await resize({ width: 1600, height: 900 });
});

async function mountDependencies() {
    await linkPills();
    await mountView({ type: "gantt", resModel: "pill", arch: ARCH, groupBy: ["parent_id"] });
    await animationFrame();
    await animationFrame();
    log.length = 0;
}

const pillEl = (name) => queryOne(`.o_tl_pill[data-pill-id="${PILL_ID[name]}"]:not(.o_tl_pill_moved)`);
const connectHandle = (name, edge) =>
    queryOne(`.o_tl_connect[data-pill-id="${PILL_ID[name]}"] .o_tl_connect_${edge}`);
const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const root = () => queryOne(".o_timeline_view");
const lit = () => queryAll(".o_tl_arrow.o_tl_arrow_lit");
const popover = () => queryAll(".o_tl_popover").length;

async function settle() {
    await advanceTime(100);
    await animationFrame();
}

/** Moves the held pointer to (x, y) over whatever lies there. */
async function moveHeld(held, x, y) {
    const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
    await held.moveTo(target, { position: { x, y } });
    await animationFrame();
}

/** A click on Build with a mouse: the popover is open after its delay. */
async function openPopoverWithMouse() {
    await hover(pillEl("Build"));
    await animationFrame();
    await click(pillEl("Build"));
    await advanceTime(400);
    await animationFrame();
    expect(popover()).toBe(1);
}

/** The outer box of Build (its body and the 1 px around it) and its middle height. */
function outerBox() {
    const body = queryRect(pillEl("Build"));
    return { L: body.left - 1, R: body.right + 1, T: body.top - 1, B: body.bottom + 1, M: (body.top + body.bottom) / 2 };
}

/** A tap on Build at (L + 368, M): after 600 ms its popover is open and its handles show. */
async function tapBuild() {
    mockTouch(true);
    const box = outerBox();
    await click(pillEl("Build"), { position: { x: box.L + 368, y: box.M } });
    await advanceTime(600);
    await animationFrame();
    expect(popover()).toBe(1);
    expect(queryAll(".o_tl_connect_handle")).toHaveLength(2);
    return box;
}

/** A finger put down at (x, y) and held 500 ms. */
async function fingerDown(x, y, target) {
    const held = await drag(target, { position: { x, y } });
    await advanceTime(500);
    await animationFrame();
    return held;
}

// ---------------------------------------------------------------------------------------------
// A mouse (R2 point 1)
// ---------------------------------------------------------------------------------------------

test("A11: a mouse press on the drawing handle keeps the popover up to 9 px, 10 px starts the drawing", async () => {
    freezeTime();
    await mountDependencies();
    await openPopoverWithMouse();
    // the pointer goes to the handle in the pill's strip, the handles stay
    const start = centre(queryRect(connectHandle("Build", "stop")));
    await hover(connectHandle("Build", "stop"), { position: start });
    await animationFrame();
    const held = await drag(connectHandle("Build", "stop"), { position: start });
    await advanceTime(300);
    await animationFrame();
    expect(popover()).toBe(1);
    await moveHeld(held, start.x - 9, start.y);
    expect(popover()).toBe(1);
    expect(".o_tl_connect_path").toHaveCount(0);
    await moveHeld(held, start.x - 10, start.y);
    expect(".o_tl_connect_path").toHaveCount(1);
    expect(popover()).toBe(0);
    await keyDown("Escape");
    await keyUp("Escape");
    await held.drop();
    await settle();
    expect(".o_tl_connect_path").toHaveCount(0);
    expect(log).toEqual([]);
});

test("A12: a mouse press on the right resize handle keeps the popover up to 9 px, 10 px starts the resize", async () => {
    freezeTime();
    await mountDependencies();
    await openPopoverWithMouse();
    const body = queryRect(pillEl("Build"));
    const point = { x: body.right - 4, y: body.top + body.height / 2 };
    await hover(pillEl("Build"), { position: point });
    await animationFrame();
    const target = queryOne(".o_tl_pill .o_tl_handle_stop");
    expect(target).toHaveClass("o_tl_handle_stop");
    const held = await drag(target, { position: point });
    await advanceTime(300);
    expect(popover()).toBe(1);
    await moveHeld(held, point.x - 9, point.y);
    expect(popover()).toBe(1);
    expect(root()).not.toHaveClass("o_tl_drag_resize");
    await moveHeld(held, point.x - 10, point.y);
    expect(root()).toHaveClass("o_tl_drag_resize");
    expect(popover()).toBe(0);
    await keyDown("Escape");
    await keyUp("Escape");
    await held.drop();
    await settle();
    expect(log).toEqual([]);
});

test("A13: a mouse press on the body keeps the popover up to 9 px, 10 px starts the move; a plain click opens it", async () => {
    freezeTime();
    await mountDependencies();
    await openPopoverWithMouse();
    const body = queryRect(pillEl("Build"));
    const point = { x: body.left + 267, y: body.top + body.height / 2 };
    const held = await drag(pillEl("Build"), { position: point });
    await advanceTime(300);
    expect(popover()).toBe(1);
    await moveHeld(held, point.x - 9, point.y);
    expect(popover()).toBe(1);
    expect(root()).not.toHaveClass("o_tl_drag_move");
    await moveHeld(held, point.x - 10, point.y);
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(popover()).toBe(0);
    await keyDown("Escape");
    await keyUp("Escape");
    await held.drop();
    await settle();
    expect(log).toEqual([]);
    // a press and a release without moving is a click: the popover of Build opens
    await advanceTime(600);
    expect(popover()).toBe(0);
    await click(pillEl("Build"), { position: point });
    await advanceTime(400);
    await animationFrame();
    expect(popover()).toBe(1);
    expect(".o_tl_popover .o_popover_header").toHaveText("Build");
});

// ---------------------------------------------------------------------------------------------
// A finger (R2 points 2 and 3)
// ---------------------------------------------------------------------------------------------

test("A14: a finger on the drawing handle keeps the popover and the two arrows lit up to 8 px, 12 px starts the drawing", async () => {
    freezeTime();
    await mountDependencies();
    const box = await tapBuild();
    const start = centre(queryRect(connectHandle("Build", "stop")));
    expect(Math.abs(start.x - (box.R - 7))).toBeLessThan(1.5);
    const held = await fingerDown(start.x, start.y, connectHandle("Build", "stop"));
    expect(popover()).toBe(1);
    expect(lit()).toHaveLength(2);
    await moveHeld(held, start.x - 8, start.y);
    expect(popover()).toBe(1);
    expect(".o_tl_connect_path").toHaveCount(0);
    await moveHeld(held, start.x - 12, start.y);
    expect(".o_tl_connect_path").toHaveCount(1);
    expect(popover()).toBe(0);
    await held.drop();
    await settle();
    expect(log).toEqual([]);
});

test("A15: a finger on the body keeps the popover up to 8 px, 12 px starts the move, Escape writes nothing", async () => {
    freezeTime();
    await mountDependencies();
    const box = await tapBuild();
    const x = box.L + 267;
    const held = await fingerDown(x, box.M, pillEl("Build"));
    expect(popover()).toBe(1);
    await moveHeld(held, x - 8, box.M);
    expect(popover()).toBe(1);
    await moveHeld(held, x - 12, box.M);
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(popover()).toBe(0);
    await keyDown("Escape");
    await keyUp("Escape");
    await held.drop();
    await settle();
    expect(log).toEqual([]);
});

/** The four points of D2: a finger in the first or last 8 px of the body, and where it goes. */
const D2_POINTS = [
    ["R - 4", (box) => box.R - 4, -1],
    ["R - 2", (box) => box.R - 2, -1],
    ["L + 1", (box) => box.L + 1, 1],
    ["L + 4", (box) => box.L + 4, 1],
];

for (const [label, pointOf, sign] of D2_POINTS) {
    test(`A16: a finger at (${label}, M) held 500 ms and moved 60 px moves the pill, with a tap before`, async () => {
        freezeTime();
        await mountDependencies();
        const box = await tapBuild();
        const x = pointOf(box);
        // the finger lies on the place of a resize handle
        const handle = queryOne(`.o_tl_pill .o_tl_handle_${sign < 0 ? "stop" : "start"}`);
        const held = await fingerDown(x, box.M, handle);
        expect(popover()).toBe(1);
        let started = null;
        for (let step = 1; step <= 20; step++) {
            await moveHeld(held, x + sign * 3 * step, box.M);
            if (step === 2) {
                // 6 px
                expect(popover()).toBe(1);
            }
            if (step === 3) {
                // 9 px
                expect(popover()).toBe(1);
                expect(".o_tl_pill_moved").toHaveCount(0);
            }
            if (!started && root().classList.contains("o_tl_drag_move")) {
                started = step;
            }
        }
        // 12 px: the move started and closed the popover; never a resize
        expect(started).toBeLessThan(5);
        expect(root()).not.toHaveClass("o_tl_drag_resize");
        expect(popover()).toBe(0);
        expect(".o_tl_pill_moved").toHaveCount(1);
        expect(".o_tl_selection_badge").toHaveCount(2);
        // far enough to change the dates
        await moveHeld(held, x + sign * 260, box.M);
        await held.drop();
        await settle();
        // the move goes through the rescheduling call: one call, never a resize
        expect(log).toEqual(["reschedule"]);
    });

    test(`A16: a finger at (${label}, M) without a tap before moves the pill`, async () => {
        freezeTime();
        await mountDependencies();
        mockTouch(true);
        const box = outerBox();
        const x = pointOf(box);
        const held = await fingerDown(x, box.M, pillEl("Build"));
        for (let step = 1; step <= 20; step++) {
            await moveHeld(held, x + sign * 3 * step, box.M);
        }
        expect(root()).toHaveClass("o_tl_drag_move");
        expect(root()).not.toHaveClass("o_tl_drag_resize");
        expect(".o_tl_pill_moved").toHaveCount(1);
        await moveHeld(held, x + sign * 260, box.M);
        await held.drop();
        await settle();
        expect(log).toEqual(["reschedule"]);
    });
}

test("A16: with a mouse a press at (R - 4, M) still resizes", async () => {
    freezeTime();
    await mountDependencies();
    const body = queryRect(pillEl("Build"));
    const point = { x: body.right - 4, y: body.top + body.height / 2 };
    await hover(pillEl("Build"));
    await animationFrame();
    const held = await drag(queryOne(".o_tl_pill .o_tl_handle_stop"), { position: point });
    await moveHeld(held, point.x - 60, point.y);
    expect(root()).toHaveClass("o_tl_drag_resize");
    expect(".o_tl_pill_moved").toHaveCount(0);
    await keyDown("Escape");
    await keyUp("Escape");
    await held.drop();
    await settle();
    expect(log).toEqual([]);
});
