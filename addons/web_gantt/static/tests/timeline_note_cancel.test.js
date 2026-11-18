// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { after, beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import { mountView, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import {
    DEPENDENCY_ATTRS,
    linkPills,
    PILL_ID,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

/**
 * 002d R4: what cancels a gesture (A20 to A26). The cases play the scenarios' paths with the
 * points of the page measured from the view's own elements; a script plays what the harness cannot
 * (a hidden page, a lost focus, a second finger).
 */

describe.current.tags("desktop");

setupTimelineFixtures();

const ARCH = timelineArch(DEPENDENCY_ATTRS);

let controller;
/** The calls the server saw: writes, rescheduling calls, reloads. */
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
    timelineMock.beforeReply = () => log.push("reload");
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
const handleEls = (name) => queryAll(`.o_tl_connect[data-pill-id="${PILL_ID[name]}"] .o_tl_connect_handle`);
const lit = () => queryAll(".o_tl_arrow.o_tl_arrow_lit");
const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const arrowKey = (source, target) =>
    queryOne(`.o_tl_arrow[data-arrow*="|${PILL_ID[source]}>"][data-arrow$="|${PILL_ID[target]}"]`).dataset.arrow;

/** What is lit and shown now: the keys of the lit arrows, their buttons and the drawing handles. */
const shown = () => ({
    lit: lit()
        .map((arrow) => arrow.dataset.arrow)
        .sort(),
    buttons: queryAll(".o_tl_arrow_remove").length,
    handles: queryAll(".o_tl_connect_handle").length,
});

/** Lit state with these arrows (keys), each with its remove button. */
const litWith = (keys, handles = 0) => ({ lit: [...keys].sort(), buttons: keys.length, handles });
const NOTHING = { lit: [], buttons: 0, handles: 0 };

async function settle() {
    await advanceTime(100);
    await animationFrame();
}

async function pointerTo(x, y, over = null) {
    const target = over || document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
    await hover(target, { position: { x, y } });
    await animationFrame();
}

/** Moves a held pointer to (x, y) in `steps` equal steps. */
async function moveInSteps(held, from, to, steps) {
    for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        const over = i === steps ? to.over : null;
        const target = over || document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
        await held.moveTo(target, { position: { x, y } });
        await animationFrame();
    }
}

/** A point of the pills layer that lies on no pill, no arrow and no handle. */
function emptyPoint() {
    const rect = queryRect(queryAll(".o_tl_pills")[0]);
    for (let x = rect.right - 30; x > rect.left + 200; x -= 25) {
        for (let y = rect.top + 4; y < rect.bottom; y += 6) {
            const names = document
                .elementsFromPoint(x, y)
                .map((element) => element.className?.baseVal ?? element.className);
            if (!names.some((name) => /o_tl_pill|o_tl_arrow|o_tl_connect/.test(name))) {
                return { x, y };
            }
        }
    }
    throw new Error("no empty point");
}

/** The first element of `selector` that the page shows, with the point of its middle. */
function shownPoint(selector) {
    for (const element of queryAll(selector)) {
        const rect = queryRect(element);
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (x >= 0 && x < window.innerWidth && y >= 0 && y < window.innerHeight) {
            if (document.elementFromPoint(x, y)?.closest(selector)) {
                return { x, y };
            }
        }
    }
    throw new Error(`no ${selector} on the screen`);
}

/** The pointer on Build, then A27's path to `release`; returns the held pointer. */
async function draw(release) {
    await hover(pillEl("Build"));
    await animationFrame();
    const handle = queryOne(`.o_tl_connect[data-pill-id="${PILL_ID.Build}"] .o_tl_connect_stop`);
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    // the pointer crossed the band of "Build" to "Test" before the threshold (R9)
    controller.selection.renderer.arrows.focusArrow(arrowKey("Build", "Test"));
    await animationFrame();
    const around = { x: start.x + 50, y: start.y + 60 };
    await moveInSteps(held, start, around, 8);
    const end = release();
    await moveInSteps(held, around, end, 12);
    return { held, end };
}


const overlapC = () => centre(queryRect(pillEl("Overlap C")));
const BUILD_ARROWS = () => [arrowKey("Design", "Build"), arrowKey("Build", "Test")];

/** The pointer on Build, pressed at its middle and moved 96 px to the left in 12 steps. */
async function moveBuild() {
    await hover(pillEl("Build"));
    await animationFrame();
    const start = centre(queryRect(pillEl("Build")));
    const held = await drag(pillEl("Build"), { position: start });
    const end = { x: start.x - 96, y: start.y };
    await moveInSteps(held, start, end, 12);
    return { held, end };
}

const writesOf = () => log.filter((entry) => entry === "write" || entry === "reschedule");

async function hidePage() {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
    await animationFrame();
}

// -- the mouse -----------------------------------------------------------------------------------

test("A20: a drawing cancelled by the key a: Build to Test stays lit, Overlap C's handles, nothing written", async () => {
    await mountDependencies();
    const { held, end } = await draw(overlapC);
    expect(".o_tl_connect_path").toHaveCount(1);
    await keyDown("a");
    await keyUp("a");
    await settle();
    expect(".o_tl_connect_path").toHaveCount(0);
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")], 2));
    expect(handleEls("Overlap C")).toHaveLength(2);
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")], 2));
    await pointerTo(end.x + 1, end.y);
    expect(lit()).toHaveLength(0);
    expect(writesOf()).toEqual([]);
});

test("A20: a move cancelled by the key a: Build's arrows stay lit, Build's handles, nothing written", async () => {
    await mountDependencies();
    const { held, end } = await moveBuild();
    expect(".o_tl_pill_moved").toHaveCount(1);
    await keyDown("a");
    await keyUp("a");
    await settle();
    expect(".o_tl_pill_moved").toHaveCount(0);
    expect(shown()).toEqual(litWith(BUILD_ARROWS(), 2));
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
    await pointerTo(end.x + 1, end.y);
    expect(shown()).toEqual(litWith(BUILD_ARROWS(), 2));
    expect(writesOf()).toEqual([]);
});

test("A21: Shift pressed and released does not cancel a drawing: the release writes", async () => {
    await mountDependencies();
    const { held } = await draw(overlapC);
    await keyDown("Shift");
    await keyUp("Shift");
    await animationFrame();
    expect(".o_tl_connect_path").toHaveCount(1);
    await held.drop();
    await settle();
    expect(log.filter((entry) => entry === "write")).toHaveLength(1);
    expect(log.includes("reload")).toBe(true);
});

test("A21: Alt and Meta do not cancel a move either; Control turns it into a copy, not a cancel", async () => {
    await mountDependencies();
    const { held } = await moveBuild();
    for (const key of ["Alt", "Meta", "Shift"]) {
        await keyDown(key);
        await keyUp(key);
        await animationFrame();
        expect(".o_tl_pill_moved").toHaveCount(1, { message: key });
    }
    await keyDown("Control");
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(1);
    expect(queryOne(".o_timeline_view")).toHaveClass("o_tl_drag_copy");
    await keyUp("Control");
    await animationFrame();
    expect(queryOne(".o_timeline_view")).not.toHaveClass("o_tl_drag_copy");
    expect(".o_tl_pill_moved").toHaveCount(1);
    await held.drop();
    await settle();
    expect(log.includes("reschedule") || log.includes("write")).toBe(true);
});

test("A25: the page hidden cancels a drawing as Escape does", async () => {
    await mountDependencies();
    const { held, end } = await draw(overlapC);
    await hidePage();
    await settle();
    expect(".o_tl_connect_path").toHaveCount(0);
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")], 2));
    expect(handleEls("Overlap C")).toHaveLength(2);
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
    await pointerTo(end.x + 1, end.y);
    expect(lit()).toHaveLength(0);
});

test("A25: the page hidden cancels a move as Escape does", async () => {
    await mountDependencies();
    const { held } = await moveBuild();
    await hidePage();
    await settle();
    expect(".o_tl_pill_moved").toHaveCount(0);
    expect(shown()).toEqual(litWith(BUILD_ARROWS(), 2));
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
});

test("A26: a lost window focus does not cancel a drawing: the release writes", async () => {
    await mountDependencies();
    const { held } = await draw(overlapC);
    window.dispatchEvent(new Event("blur"));
    await animationFrame();
    expect(".o_tl_connect_path").toHaveCount(1);
    await held.drop();
    await settle();
    expect(log.filter((entry) => entry === "write")).toHaveLength(1);
});

test("A26: a lost window focus does not cancel a move: the release writes", async () => {
    await mountDependencies();
    const { held } = await moveBuild();
    window.dispatchEvent(new Event("blur"));
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(1);
    await held.drop();
    await settle();
    expect(log.includes("reschedule") || log.includes("write")).toBe(true);
});

test("R4: a second cancel cause after a cancel is harmless", async () => {
    await mountDependencies();
    const { held } = await draw(overlapC);
    await keyDown("Escape");
    await keyUp("Escape");
    await hidePage();
    await keyDown("a");
    await keyUp("a");
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
    expect(".o_tl_connect_path").toHaveCount(0);
    // Escape cancelled it: Build to Test stays lit, and none of the later causes lit another
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")], 2));
});

/** A finger's put-down on `target`. */
function fingerDownOn(target, id) {
    finger("pointerdown", target, id);
}

/** A finger's lift from `target` and the tap click a browser sends after it. */
function fingerUpOn(target, id) {
    finger("pointerup", target, id);
    target.dispatchEvent(
        new PointerEvent("click", { pointerId: id, pointerType: "touch", bubbles: true, cancelable: true })
    );
}

/** Review pressed on its right resize handle (the pointer first on the pill), moved 61 px left. */
async function resizeReview() {
    await hover(pillEl("Review"));
    await animationFrame();
    const body = queryRect(pillEl("Review"));
    const start = { x: body.right - 4, y: body.top + body.height / 2 };
    const held = await drag(pillEl("Review").querySelector(".o_tl_handle_stop"), { position: start });
    const end = { x: start.x - 61, y: start.y };
    await moveInSteps(held, start, end, 6);
    return { held, end };
}

/** The gestures a finger may cancel, with what is lit while each is held (A23). */
const MOUSE_GESTURES = {
    drawing: {
        start: () => draw(overlapC),
        lit: () => litWith([arrowKey("Build", "Test")], 2),
        gone: () => expect(".o_tl_connect_path").toHaveCount(0),
    },
    move: {
        start: () => moveBuild(),
        lit: () => litWith(BUILD_ARROWS(), 2),
        gone: () => expect(".o_tl_pill_moved").toHaveCount(0),
    },
    resize: {
        start: () => resizeReview(),
        lit: () => litWith([arrowKey("Review", "Overlap A")], 2),
        gone: () => expect(".o_tl_pill_moved").toHaveCount(0),
    },
};

/** Where the cancelling finger goes: an element of the grid each. */
const FINGER_PLACES = {
    "an empty cell": () => pillEl("Overlap C").closest(".o_tl_row").querySelector(".o_tl_cell"),
    "a pill": () => pillEl("Test"),
    "a row header": () => queryAll(".o_tl_row_header").at(0),
    "a column header": () => queryAll(".o_tl_col").at(0),
    "an arrow": () => queryOne(`.o_tl_arrow[data-arrow="${arrowKey("Design", "Build")}"] .o_tl_arrow_band`),
};

for (const [gesture, spec] of Object.entries(MOUSE_GESTURES)) {
    for (const [place, pick] of Object.entries(FINGER_PLACES)) {
        for (const order of ["finger first", "mouse first"]) {
            test(`A23 (F1): a finger on ${place} cancels a mouse ${gesture} and does nothing else; lifted, ${order}`, async () => {
                await mountDependencies();
                const { held } = await spec.start();
                const target = pick();
                fingerDownOn(target, 77);
                await animationFrame();
                spec.gone();
                // the arrows lit at the start stay lit while the finger is down
                expect(shown()).toEqual(spec.lit());
                if (order === "finger first") {
                    fingerUpOn(target, 77);
                    await animationFrame();
                    // they go out at the finger's lift, the button still held
                    expect(lit()).toHaveLength(0);
                    expect(".o_tl_arrow_remove").toHaveCount(0);
                    await held.drop();
                } else {
                    await held.drop();
                    await animationFrame();
                    // the mouse release does not light them out: the finger is still down
                    expect(shown().lit).toEqual(spec.lit().lit);
                    fingerUpOn(target, 77);
                    await animationFrame();
                    expect(lit()).toHaveLength(0);
                }
                await advanceTime(1000);
                await animationFrame();
                expect(lit()).toHaveLength(0);
                expect(".o_tl_arrow_remove").toHaveCount(0);
                expect(".o_dialog").toHaveCount(0);
                expect(".o_popover").toHaveCount(0);
                expect(".o_tl_selection_badge").toHaveCount(0);
                expect(".o_tl_pill_moved").toHaveCount(0);
                expect(".o_tl_connect_path").toHaveCount(0);
                expect(writesOf()).toEqual([]);
            });
        }
    }
}

test("A24: a finger put down outside the grid does not cancel a mouse drawing", async () => {
    await mountDependencies();
    const { held } = await draw(overlapC);
    finger("pointerdown", queryOne(".o_control_panel"), 77);
    await animationFrame();
    expect(".o_tl_connect_path").toHaveCount(1);
    finger("pointerup", queryOne(".o_control_panel"), 77);
    await held.drop();
    await settle();
    expect(log.filter((entry) => entry === "write")).toHaveLength(1);
});

// -- the finger ----------------------------------------------------------------------------------

let firstFinger;

/** The id of the pointer put down next: the first finger of the gesture. */
function watchFinger() {
    firstFinger = undefined;
    const remember = (ev) => (firstFinger ??= ev.pointerId);
    document.addEventListener("pointerdown", remember, true);
    after(() => document.removeEventListener("pointerdown", remember, true));
}

/** A tap on Build, then A17's drawing held over "Overlap C": the held pointer. */
async function touchDrawingHeld() {
    freezeTime();
    mockTouch(true);
    const body = queryRect(pillEl("Build"));
    await click(pillEl("Build"), { position: { x: body.left + 300, y: (body.top + body.bottom) / 2 } });
    await advanceTime(600);
    await animationFrame();
    watchFinger();
    const handle = queryOne(`.o_tl_connect[data-pill-id="${PILL_ID.Build}"] .o_tl_connect_stop`);
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    await advanceTime(400);
    await animationFrame();
    await moveInSteps(held, start, overlapC(), 10);
    await advanceTime(400);
    return held;
}

function finger(type, target, id) {
    target.dispatchEvent(
        new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            isPrimary: false,
            bubbles: true,
            cancelable: true,
        })
    );
}

const handlesOfBuild = () => handleEls("Build").length;

test("A22: a pointer cancel ends a touch drawing: nothing written, no arrow lit, Build's handles", async () => {
    await mountDependencies();
    const held = await touchDrawingHeld();
    expect(".o_tl_connect_path").toHaveCount(1);
    expect(lit().length).toBeGreaterThan(0);
    document.dispatchEvent(
        new PointerEvent("pointercancel", {
            pointerId: firstFinger,
            pointerType: "touch",
            bubbles: true,
        })
    );
    for (const wait of [0, 1000]) {
        await advanceTime(wait);
        await animationFrame();
        expect(".o_tl_connect_path").toHaveCount(0);
        expect(lit()).toHaveLength(0);
        expect(".o_tl_arrow_remove").toHaveCount(0);
        expect(handlesOfBuild()).toBe(2);
        expect(handleEls("Overlap C")).toHaveLength(0);
    }
    expect(writesOf()).toEqual([]);
    await held.drop().catch(() => {});
    await settle();
    expect(writesOf()).toEqual([]);
});

test("A22: a finger put on a pill that turns into a scroll (pointer cancel) leaves no arrow lit", async () => {
    await mountDependencies();
    freezeTime();
    mockTouch(true);
    const body = queryRect(pillEl("Build"));
    watchFinger();
    const held = await drag(pillEl("Build"), {
        position: { x: body.left + 300, y: (body.top + body.bottom) / 2 },
    });
    await advanceTime(100);
    await animationFrame();
    expect(lit()).toHaveLength(2);
    document.dispatchEvent(
        new PointerEvent("pointercancel", {
            pointerId: firstFinger,
            pointerType: "touch",
            bubbles: true,
        })
    );
    await animationFrame();
    expect(lit()).toHaveLength(0);
    expect(".o_tl_arrow_remove").toHaveCount(0);
    await held.drop().catch(() => {});
    await settle();
    expect(writesOf()).toEqual([]);
});

test("A23: a second finger inside the grid cancels a touch drawing; the arrows go out when one finger lifts", async () => {
    await mountDependencies();
    const held = await touchDrawingHeld();
    const during = shown();
    expect(during.lit.length).toBeGreaterThan(0);
    const cell = pillEl("Overlap C").closest(".o_tl_row").querySelector(".o_tl_cell");
    finger("pointerdown", cell, 77);
    await animationFrame();
    expect(".o_tl_connect_path").toHaveCount(0);
    // the arrows lit at the start stay lit while both fingers stay down
    expect(lit().map((arrow) => arrow.dataset.arrow).sort()).toEqual(during.lit);
    expect(".o_tl_arrow_remove").toHaveCount(during.lit.length);
    // the first finger lifts, the second stays down: nothing lit, nothing written
    await held.drop();
    await settle();
    expect(lit()).toHaveLength(0);
    expect(".o_tl_arrow_remove").toHaveCount(0);
    finger("pointerup", cell, 77);
    await settle();
    expect(lit()).toHaveLength(0);
    expect(writesOf()).toEqual([]);
});

test("A23: the arrows lit at the start go out as soon as the second finger lifts, the first still down", async () => {
    await mountDependencies();
    const held = await touchDrawingHeld();
    const cell = pillEl("Overlap C").closest(".o_tl_row").querySelector(".o_tl_cell");
    finger("pointerdown", cell, 77);
    await animationFrame();
    expect(lit().length).toBeGreaterThan(0);
    finger("pointerup", cell, 77);
    await animationFrame();
    expect(lit()).toHaveLength(0);
    expect(".o_tl_arrow_remove").toHaveCount(0);
    await held.drop();
    await settle();
    expect(writesOf()).toEqual([]);
    expect(lit()).toHaveLength(0);
});

test("A22: a touch drawing cancelled by the key a keeps Build to Test lit only while the finger is down", async () => {
    await mountDependencies();
    const held = await touchDrawingHeld();
    await keyDown("a");
    await keyUp("a");
    await settle();
    expect(".o_tl_connect_path").toHaveCount(0);
    expect(shown().lit).toEqual([arrowKey("Build", "Test")]);
    expect(".o_tl_arrow_remove").toHaveCount(1);
    await held.drop();
    await settle();
    for (const wait of [0, 2000]) {
        await advanceTime(wait);
        await animationFrame();
        expect(lit()).toHaveLength(0);
        expect(".o_tl_arrow_remove").toHaveCount(0);
    }
    expect(writesOf()).toEqual([]);
});

for (const [place, pick] of [
    ["a pill without arrows", () => pillEl("Overlap C")],
    ["a pill with arrows", () => pillEl("Review")],
    ["a header of the grid", () => queryAll(".o_tl_col").at(0)],
]) {
    test(`A23: a second finger on ${place} cancels a touch drawing and starts or lights nothing`, async () => {
        await mountDependencies();
        const held = await touchDrawingHeld();
        const during = shown();
        finger("pointerdown", pick(), 78);
        await animationFrame();
        expect(".o_tl_connect_path").toHaveCount(0);
        // the arrows of the start stay lit while both fingers are down, no others join them
        expect(shown().lit).toEqual(during.lit);
        await held.drop();
        await settle();
        expect(lit()).toHaveLength(0);
        finger("pointerup", pick(), 78);
        await settle();
        await advanceTime(2000);
        await animationFrame();
        expect(lit()).toHaveLength(0);
        expect(".o_tl_arrow_remove").toHaveCount(0);
        expect(".o_tl_connect_path").toHaveCount(0);
        expect(".o_tl_pill_moved").toHaveCount(0);
        expect(writesOf()).toEqual([]);
    });
}

test("A24: a second finger outside the grid does not cancel; the release writes", async () => {
    await mountDependencies();
    const held = await touchDrawingHeld();
    // the control panel, and the scrolling area itself (below the last row: not a cell, a pill or a header)
    finger("pointerdown", queryOne(".o_control_panel"), 77);
    finger("pointerdown", queryOne(".o_tl_renderer"), 78);
    await animationFrame();
    expect(".o_tl_connect_path").toHaveCount(1);
    await held.drop();
    await settle();
    expect(log.filter((entry) => entry === "write")).toHaveLength(1);
    finger("pointerup", queryOne(".o_control_panel"), 77);
    finger("pointerup", queryOne(".o_tl_renderer"), 78);
    // P3: after the write no arrow is lit and Build, the pill last tapped, keeps its handles
    await advanceTime(1500);
    await animationFrame();
    expect(lit()).toHaveLength(0);
    expect(".o_tl_arrow_remove").toHaveCount(0);
    expect(handlesOfBuild()).toBe(2);
    expect(handleEls("Overlap C")).toHaveLength(0);
});

test("A23: a second finger inside the grid cancels a touch move as it cancels a drawing", async () => {
    await mountDependencies();
    freezeTime();
    mockTouch(true);
    const body = queryRect(pillEl("Build"));
    const at = { x: body.left + 300, y: (body.top + body.bottom) / 2 };
    const held = await drag(pillEl("Build"), { position: at });
    await advanceTime(500);
    await animationFrame();
    await moveInSteps(held, at, { x: at.x - 120, y: at.y }, 10);
    expect(".o_tl_pill_moved").toHaveCount(1);
    const cell = pillEl("Overlap C").closest(".o_tl_row").querySelector(".o_tl_cell");
    finger("pointerdown", cell, 77);
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(0);
    await held.drop();
    finger("pointerup", cell, 77);
    await settle();
    expect(writesOf()).toEqual([]);
    expect(lit()).toHaveLength(0);
});
