// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, hover, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { animationFrame, advanceTime } from "@odoo/hoot-mock";
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
 * 002d R1: what stays lit after a gesture released without a write (A1 to A9). The cases play the
 * scenarios' paths with the points of the page measured from the view's own elements.
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

/** The release points of the scenarios, from the view's own elements. */
const POINTS = {
    columnHeader: () => shownPoint(".o_tl_col"),
    rowHeader: () => shownPoint(".o_tl_row_header"),
    // the control panel lies above the window in the test page: the pointer events are sent to it
    // at the point of its middle
    outside: () => {
        const panel = queryOne(".o_control_panel");
        const rect = queryRect(panel);
        return { x: rect.left + 20, y: rect.top + rect.height / 2, over: panel };
    },
    onPill: (name) => () => centre(queryRect(pillEl(name))),
};

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

/** The pointer on Build, then a move: Build pressed at its middle, moved to `release` in 12 steps. */
async function move(release) {
    await hover(pillEl("Build"));
    await animationFrame();
    const start = centre(queryRect(pillEl("Build")));
    const held = await drag(pillEl("Build"), { position: start });
    const end = release();
    await moveInSteps(held, start, end, 12);
    return { held, end };
}

const BUILD_ARROWS = () => [arrowKey("Design", "Build"), arrowKey("Build", "Test")];

/** Releases and reads: the state at the release (pointer still), then after a 1 px move. */
async function release(held, end) {
    await held.drop();
    await settle();
    const atRelease = shown();
    // the browser's own mouse move at the same place changes nothing
    await pointerTo(end.x, end.y, end.over);
    const still = shown();
    expect(still).toEqual(atRelease);
    expect(log).toEqual([]);
    return atRelease;
}

test("A1: drawing released on an empty cell keeps the arrow lit at the start", async () => {
    await mountDependencies();
    const { held, end } = await draw(emptyPoint);
    expect(".o_tl_connect_path").toHaveCount(1);
    expect(await release(held, end)).toEqual(litWith([arrowKey("Build", "Test")]));
    expect(".o_tl_connect_path").toHaveCount(0);
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(NOTHING);
    expect(log).toEqual([]);
});

test("A2: drawing released over the column headers keeps the arrow lit, no handles", async () => {
    await mountDependencies();
    const { held, end } = await draw(POINTS.columnHeader);
    expect(await release(held, end)).toEqual(litWith([arrowKey("Build", "Test")]));
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(NOTHING);
});

test("A3: drawing released over the row headers lights nothing", async () => {
    await mountDependencies();
    const { held, end } = await draw(POINTS.rowHeader);
    expect(await release(held, end)).toEqual(NOTHING);
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(NOTHING);
});

test("A4: drawing released on its own pill keeps the arrow lit and shows Build's handles", async () => {
    await mountDependencies();
    const { held, end } = await draw(POINTS.onPill("Build"));
    expect(await release(held, end)).toEqual(litWith([arrowKey("Build", "Test")], 2));
    expect(handleEls("Build")).toHaveLength(2);
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(litWith(BUILD_ARROWS(), 2));
});

test("A5: drawing released on a pill that has the dependency writes it again, nothing lit", async () => {
    await mountDependencies();
    const { held, end } = await draw(POINTS.onPill("Test"));
    await held.drop();
    await settle();
    expect(log.filter((entry) => entry === "write")).toHaveLength(1);
    expect(log.includes("reload")).toBe(true);
    expect(shown()).toEqual({ lit: [], buttons: 0, handles: 2 });
    expect(handleEls("Test")).toHaveLength(2);
    await pointerTo(end.x, end.y);
    expect(lit()).toHaveLength(0);
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")], 2));
});

test("A6: drawing released outside the view keeps the arrow lit until the pointer moves over the grid", async () => {
    await mountDependencies();
    const { held, end } = await draw(POINTS.outside);
    expect(await release(held, end)).toEqual(litWith([arrowKey("Build", "Test")]));
    // moves outside the grid do not work the highlight out again
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(litWith([arrowKey("Build", "Test")]));
    const empty = emptyPoint();
    await pointerTo(empty.x, empty.y);
    expect(shown()).toEqual(NOTHING);
});

test("A7: a move released outside the view keeps Build's arrows lit until the pointer moves over the grid", async () => {
    await mountDependencies();
    const { held, end } = await move(POINTS.outside);
    expect(await release(held, end)).toEqual(litWith(BUILD_ARROWS()));
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(litWith(BUILD_ARROWS()));
    const empty = emptyPoint();
    await pointerTo(empty.x, empty.y);
    expect(shown()).toEqual(NOTHING);
});

test("A8: a move released over the row headers lights nothing", async () => {
    await mountDependencies();
    const { held, end } = await move(POINTS.rowHeader);
    expect(await release(held, end)).toEqual(NOTHING);
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(NOTHING);
});

test("A8: a move released over the column headers keeps Build's arrows lit, no handles", async () => {
    await mountDependencies();
    const { held, end } = await move(POINTS.columnHeader);
    expect(await release(held, end)).toEqual(litWith(BUILD_ARROWS()));
    await pointerTo(end.x + 1, end.y, end.over);
    expect(shown()).toEqual(NOTHING);
});

test("A9: a move released where it started writes nothing, reloads nothing, keeps the arrows lit", async () => {
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    const start = centre(queryRect(pillEl("Build")));
    const held = await drag(pillEl("Build"), { position: start });
    const away = { x: start.x + 40, y: start.y };
    await moveInSteps(held, start, away, 5);
    await moveInSteps(held, away, start, 5);
    const atRelease = await release(held, start);
    expect(atRelease).toEqual(litWith(BUILD_ARROWS(), 2));
    expect(handleEls("Build")).toHaveLength(2);
    expect(log).toEqual([]);
    await pointerTo(start.x + 1, start.y);
    expect(shown()).toEqual(litWith(BUILD_ARROWS(), 2));
    expect(log).toEqual([]);
});

test("A9: a resize released where it started writes nothing, then the band of Build to Test lights that arrow alone", async () => {
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    const handle = queryOne(".o_tl_handle[data-edge='stop']");
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    const away = { x: start.x - 65, y: start.y };
    await moveInSteps(held, start, away, 5);
    await moveInSteps(held, away, start, 5);
    await held.drop();
    await settle();
    expect(log).toEqual([]);
    expect(lit().map((arrow) => arrow.dataset.arrow).sort()).toEqual([...BUILD_ARROWS()].sort());
    expect(queryAll(".o_tl_arrow_remove")).toHaveLength(2);
    // the pointer on the band of "Build" to "Test", where it leaves Build's body
    const band = queryRect(`.o_tl_arrow[data-arrow="${arrowKey("Build", "Test")}"]`);
    const pillBox = queryRect(pillEl("Build"));
    const onBand = { x: pillBox.right + 1, y: start.y };
    await pointerTo(onBand.x, onBand.y);
    expect(band.width).toBeGreaterThan(0);
    expect(shown().lit).toEqual([arrowKey("Build", "Test")]);
    expect(log).toEqual([]);
});
