// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
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

import { setupTimelineFixtures, timelineArch, useRtl } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

const DEPENDENCIES = `string="Pills" default_range="week" color="x_color"
    dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"`;
const ARCH = timelineArch(DEPENDENCIES);

// pills of the scratch host
const ID = {
    Design: 4,
    Build: 5,
    Review: 6,
    Test: 7,
    Deploy: 8,
    Plan: 9,
    "Long task": 10,
    "Overlap A": 11,
    "Overlap B": 12,
    "Overlap C": 13,
};

let controller;
/** The write calls the server saw, in order. */
let log;
/** Makes the writes wait for the test, or null. */
let gate = null;

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

/** The three links of H42: Design to Build, Build to Test, Review to Overlap A. */
async function linkPills() {
    await makeMockServer();
    const pills = MockServer.current.env["pill"];
    const set = (id, sources) => (pills.find((record) => record.id === id).dependency_field = sources);
    set(ID.Build, [ID.Design]);
    set(ID.Test, [ID.Build]);
    set(ID["Overlap A"], [ID.Review]);
}

async function mountDependencies({ arch = ARCH, groupBy = ["parent_id"], ...rest } = {}) {
    await linkPills();
    await mountView({ type: "gantt", resModel: "pill", arch, groupBy, ...rest });
    await animationFrame();
    await animationFrame();
    log.length = 0;
}

const pillEl = (name) => queryOne(`.o_tl_pill[data-pill-id="${ID[name]}"]:not(.o_tl_pill_moved)`);
const handleEls = (name) => queryAll(`.o_tl_connect[data-pill-id="${ID[name]}"] .o_tl_connect_handle`);
const handleEl = (name, edge) => queryOne(`.o_tl_connect[data-pill-id="${ID[name]}"] .o_tl_connect_${edge}`);
const css = (element, property) => getComputedStyle(element)[property];
const root = () => queryOne(".o_timeline_view");
const writes = () => log.filter((entry) => entry.call === "write");
const lit = () => queryAll(".o_tl_arrow.o_tl_arrow_lit");
const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** Let the write and its reload settle. */
async function settle() {
    await advanceTime(100);
    await animationFrame();
}

/**
 * Rest the pointer on the pill `name`, then press its handle `edge` ("start" or "stop") at its
 * centre. Returns the drag helpers, the press point and `move(x, y)`.
 */
async function pressHandle(name, edge) {
    await hover(pillEl(name));
    await animationFrame();
    const handle = handleEl(name, edge);
    const start = centre(queryRect(handle));
    const helpers = await drag(handle, { position: start });
    const move = async (x, y) => {
        const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x, y } });
        await animationFrame();
    };
    return { ...helpers, start, move };
}

/** Move to the point (x, y) in `steps` equal steps from where the pointer is. */
async function moveInSteps(held, from, to, steps) {
    for (let i = 1; i <= steps; i++) {
        await held.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
}

test("002c A26: drawing handles", async () => {
    await mountDependencies();
    expect(".o_tl_connect_handle").toHaveCount(0);
    await hover(pillEl("Build"));
    await animationFrame();
    expect(handleEls("Build")).toHaveLength(2);
    expect(".o_tl_connect_handle").toHaveCount(2);
    const body = queryRect(pillEl("Build"));
    const start = queryRect(handleEl("Build", "start"));
    const stop = queryRect(handleEl("Build", "stop"));
    // M15, M17: 16 x 16, the start above the leading end, the end below the other end
    expect([start.width, start.height, stop.width, stop.height]).toEqual([16, 16, 16, 16]);
    expect(start.left).toBeWithin(body.left - 0.5, body.left + 0.5);
    expect(start.top).toBeWithin(body.top - 16.5, body.top - 15.5);
    expect(stop.left).toBeWithin(body.right - 14.5, body.right - 13.5);
    expect(stop.top).toBeWithin(body.bottom - 0.5, body.bottom + 0.5);
    expect(css(handleEl("Build", "start"), "cursor")).toBe("grab");
    expect(css(handleEl("Build", "stop"), "cursor")).toBe("grab");
    // M16: the dot, 6 px, round, in the pill's palette colour, outlined in the cell background
    const dot = handleEl("Build", "stop").querySelector(".o_tl_connect_dot");
    expect(css(dot, "width")).toBe("6px");
    expect(css(dot, "height")).toBe("6px");
    expect(css(dot, "borderTopLeftRadius")).toBe("50%");
    expect(css(dot, "backgroundColor")).toBe("rgb(220, 133, 52)");
    expect(css(dot, "outlineWidth")).toBe("1px");
    expect(css(dot, "outlineStyle")).toBe("solid");
    // M18: the corner line, 8 x 8, 1 px left and bottom in the pill's colour (the end handle)
    const corner = handleEl("Build", "stop").querySelector(".o_tl_connect_corner");
    const cornerRect = queryRect(corner);
    expect([cornerRect.width, cornerRect.height]).toEqual([8, 8]);
    expect(cornerRect.left).toBeWithin(stop.left - 0.5, stop.left + 0.5);
    expect(cornerRect.top).toBeWithin(body.bottom + 0.5, body.bottom + 1.5);
    for (const side of ["Left", "Bottom"]) {
        expect(css(corner, `border${side}Width`)).toBe("1px");
        expect(css(corner, `border${side}Style`)).toBe("solid");
        expect(css(corner, `border${side}Color`)).toBe("rgb(220, 133, 52)");
    }
    // M19: the halo, 3 px left and bottom, shifted 2 px towards the corner
    const halo = handleEl("Build", "stop").querySelector(".o_tl_connect_halo");
    expect(css(halo, "borderBottomWidth")).toBe("3px");
    expect(css(halo, "borderLeftWidth")).toBe("3px");
    expect(css(halo, "transform")).toBe("matrix(1, 0, 0, 1, -2, 2)");
    // the resize handles are the ones of 002b2, not ours
    expect(".o_tl_handle").toHaveCount(2);
    expect(".o_tl_handle .o_tl_connect_handle").toHaveCount(0);
    // the pointer leaves: the handles go
    await hover(".o_tl_col");
    await animationFrame();
    expect(".o_tl_connect_handle").toHaveCount(0);
});

test("002c A26: none on a group row's pill, none without edit, none without a dependency field", async () => {
    await mountDependencies({ groupBy: ["parent_id", "x_contact"] });
    const bar = queryAll(".o_tl_group_pill")[0];
    expect(bar).not.toBe(null);
    await hover(bar);
    await animationFrame();
    expect(".o_tl_connect_handle").toHaveCount(0);
});

test("002c A26: none on a view that cannot edit (H49)", async () => {
    await mountDependencies({ arch: timelineArch(`${DEPENDENCIES} edit="0"`) });
    await hover(pillEl("Build"));
    await animationFrame();
    expect(".o_tl_connect_handle").toHaveCount(0);
    // the arrows are lit as ever
    expect(lit()).toHaveLength(2);
});

test("002c A26: none without a dependency field", async () => {
    await mountDependencies({ arch: timelineArch(`string="Pills" default_range="week"`) });
    await hover(pillEl("Build"));
    await animationFrame();
    expect(".o_tl_connect_handle").toHaveCount(0);
});

test("002c A26: none while a pill is moved", async () => {
    await mountDependencies();
    const rect = queryRect(pillEl("Review"));
    const start = centre(rect);
    const held = await drag(pillEl("Review"), { position: start });
    await held.moveTo(document.elementFromPoint(start.x + 40, start.y), {
        position: { x: start.x + 40, y: start.y },
    });
    await animationFrame();
    await hover(pillEl("Build"));
    await animationFrame();
    expect(".o_tl_connect_handle").toHaveCount(0);
    await held.cancel();
});

test("002c A26: the handles are mirrored in a right-to-left language (A17)", async () => {
    useRtl();
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    const body = queryRect(pillEl("Build"));
    const start = queryRect(handleEl("Build", "start"));
    const stop = queryRect(handleEl("Build", "stop"));
    // the start handle above the right end, the end handle below the left end
    expect(start.right).toBeWithin(body.right - 0.5, body.right + 0.5);
    expect(start.bottom).toBeWithin(body.top - 0.5, body.top + 0.5);
    expect(stop.right).toBeWithin(body.left + 13.5, body.left + 14.5);
    expect(stop.top).toBeWithin(body.bottom - 0.5, body.bottom + 0.5);
    const halo = handleEl("Build", "stop").querySelector(".o_tl_connect_halo");
    expect(css(halo, "transform")).toBe("matrix(1, 0, 0, 1, 2, 2)");
});

test("002c A27: drawing from the end handle onto Overlap C writes one link", async () => {
    await mountDependencies();
    const build = await pressHandle("Build", "stop");
    expect(lit()).toHaveLength(2);
    // below the threshold nothing is drawn
    await build.move(build.start.x + 4, build.start.y);
    expect(".o_tl_connect_line").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_drag_connect");
    const around = { x: build.start.x + 50, y: build.start.y + 60 };
    await moveInSteps(build, build.start, around, 8);
    const over = centre(queryRect(pillEl("Overlap C")));
    await moveInSteps(build, around, over, 12);
    // M22: a grey line at full opacity, 2 px, not catching the pointer
    const path = queryOne(".o_tl_connect_line .o_tl_connect_path");
    expect(css(path, "stroke")).toBe("rgb(143, 143, 143)");
    expect(css(path, "strokeWidth")).toBe("2px");
    expect(css(path, "pointerEvents")).toBe("none");
    expect(css(queryOne(".o_tl_connect_line"), "pointerEvents")).toBe("none");
    // the line starts at the handle's centre and ends at the pointer
    const box = queryRect(".o_tl_connect_line");
    const box0 = queryRect(path);
    expect(box0.width).toBeGreaterThan(0);
    expect(box.width).toBeGreaterThan(0);
    // the line starts at the centre of the pressed handle (R12.2)
    const first = path.getPointAtLength(0);
    const origin = queryRect(".o_tl_connect_line");
    expect(origin.left + first.x).toBeWithin(build.start.x - 1, build.start.x + 1);
    expect(origin.top + first.y).toBeWithin(build.start.y - 1, build.start.y + 1);
    // M23: the closed hand over the whole view
    expect(root()).toHaveClass("o_tl_dragging");
    expect(root()).toHaveClass("o_tl_drag_connect");
    expect(css(queryOne(".o_tl_renderer"), "cursor")).toBe("grabbing");
    expect(css(queryAll(".o_tl_col")[0], "cursor")).toBe("grabbing");
    // M25, M24: Build keeps its handles and Overlap C shows its own; Review has none
    expect(handleEls("Build")).toHaveLength(2);
    expect(handleEls("Overlap C")).toHaveLength(2);
    expect(handleEls("Review")).toHaveLength(0);
    // the resize handles are hidden
    expect(".o_tl_handle").toHaveCount(0);
    // the source lies over the other pills
    expect(pillEl("Build")).toHaveClass("o_tl_pill_source");
    expect(Number(css(pillEl("Build"), "zIndex"))).toBeGreaterThan(Number(css(pillEl("Review"), "zIndex")));
    // the arrows lit when the drawing started stay lit (until then the highlight follows the
    // pointer, R9)
    const frozen = lit().map((arrow) => arrow.dataset.arrow);
    await hover(pillEl("Review"));
    expect(lit().map((arrow) => arrow.dataset.arrow)).toEqual(frozen);
    await build.move(over.x, over.y);
    await build.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID["Overlap C"]], values: { dependency_field: [[4, ID.Build]] } }]);
    expect(root()).not.toHaveClass("o_tl_drag_connect");
    expect(".o_tl_connect_line").toHaveCount(0);
    expect(".o_notification").toHaveCount(0);
});

/** Rest the pointer at the viewport point (x, y), as a plain pointer move. */
async function pointerTo(x, y) {
    const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
    await hover(target, { position: { x, y } });
    await animationFrame();
}

test("002c A90: no arrow lit after a drawing ends, until the pointer moves", async () => {
    await mountDependencies();
    const build = await pressHandle("Build", "stop");
    const around = { x: build.start.x + 50, y: build.start.y + 60 };
    await moveInSteps(build, build.start, around, 8);
    const over = centre(queryRect(pillEl("Overlap C")));
    await moveInSteps(build, around, over, 12);
    await build.drop();
    await settle();
    // the write went through and the new arrow is drawn, none is lit
    expect(writes()).toHaveLength(1);
    expect(".o_tl_arrow").toHaveCount(4);
    expect(lit()).toHaveLength(0);
    // the browser's own mouse move at the same place does not light them either
    await pointerTo(over.x, over.y);
    expect(lit()).toHaveLength(0);
    // the pointer moves by 1 px: the arrow of "Overlap C" is lit
    await pointerTo(over.x + 1, over.y);
    expect(lit()).toHaveLength(1);
    expect(lit()[0].dataset.arrow.endsWith(`|${ID["Overlap C"]}`)).toBe(true);
});

test("002c A90: no arrow lit after a move ends, until the pointer moves", async () => {
    // the automatic method sends one call to the rescheduling method of the server
    const rescheduled = [];
    onRpc("web_gantt_reschedule", ({ args }) => {
        rescheduled.push(args);
        return { type: "success", message: "Records rescheduled", old_vals_per_pill_id: {} };
    });
    await mountDependencies();
    const rect = queryRect(pillEl("Build"));
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const held = await drag(pillEl("Build"), { position: start });
    let end = start;
    for (const dx of [20, 50, 80]) {
        end = { x: start.x + dx, y: start.y };
        const target = document.elementFromPoint(end.x, end.y) || queryOne(".o_tl_renderer");
        await held.moveTo(target, { position: end });
        await animationFrame();
    }
    await held.drop();
    await settle();
    expect(rescheduled).toHaveLength(1);
    expect(lit()).toHaveLength(0);
    // the pointer moves by 1 px over the pill, which still stands under it
    await pointerTo(end.x + 1, end.y);
    expect(lit()).toHaveLength(2);
});

test("002c A28: drawing from the start handle of Review onto Plan: Plan gets Review", async () => {
    await mountDependencies();
    const review = await pressHandle("Review", "start");
    const over = centre(queryRect(pillEl("Plan")));
    await moveInSteps(review, review.start, over, 10);
    expect(handleEls("Plan")).toHaveLength(2);
    await review.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID.Plan], values: { dependency_field: [[4, ID.Review]] } }]);
});

test("002c A29: five endings that write nothing (itself, empty cell, group row, Escape, pointercancel)", async () => {
    await mountDependencies({ groupBy: ["parent_id", "x_contact"] });
    const gesture = async (target) => {
        const build = await pressHandle("Build", "stop");
        await moveInSteps(build, build.start, { x: build.start.x + 30, y: build.start.y + 30 }, 4);
        const to = target(build);
        await moveInSteps(build, { x: build.start.x + 30, y: build.start.y + 30 }, to, 6);
        expect(".o_tl_connect_line").toHaveCount(1);
        return build;
    };
    // over Build itself
    let build = await gesture(() => centre(queryRect(pillEl("Build"))));
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_tl_connect_line").toHaveCount(0);
    // over an empty cell: the last column of the Plan row's group
    build = await gesture(() => {
        const cell = queryAll(".o_tl_row[data-row-id] .o_tl_cell").at(0);
        const rect = queryRect(cell);
        return { x: rect.left + 5, y: rect.top + 5 };
    });
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    // over a group row
    build = await gesture(() => {
        const group = queryAll(".o_tl_group_row")[0];
        const cell = group.querySelectorAll(".o_tl_cell")[3];
        const rect = queryRect(cell);
        return { x: rect.left + 5, y: rect.top + 2 };
    });
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    // Escape while held, then the release over another pill
    build = await gesture(() => centre(queryRect(pillEl("Overlap C"))));
    await keyDown("Escape");
    await keyUp("Escape");
    await animationFrame();
    expect(".o_tl_connect_line").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_drag_connect");
    await build.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    // a lost pointer cancels as well
    build = await gesture(() => centre(queryRect(pillEl("Overlap C"))));
    await build.cancel();
    await animationFrame();
    expect(".o_tl_connect_line").toHaveCount(0);
    expect(writes()).toHaveLength(0);
});

test("002c A30: a drawing clears the selection after 40 px", async () => {
    const arch = timelineArch(
        `${DEPENDENCIES} multi_create_view="test_web_gantt.host_form_template_one"`
    );
    await mountDependencies({ arch });
    const cell = queryAll(".o_tl_row[data-row-id] .o_tl_cell").at(8);
    await click(cell);
    await animationFrame();
    expect(controller.selection.state.cellCount).toBeGreaterThan(0);
    const build = await pressHandle("Build", "stop");
    await build.move(build.start.x + 40, build.start.y);
    expect(controller.selection.state.cellCount).toBe(0);
    expect(".o_tl_cell_picked").toHaveCount(0);
    await build.cancel();
});

test("002c A31: held near the right edge, the grid scrolls", async () => {
    await mountDependencies();
    const build = await pressHandle("Build", "stop");
    const renderer = queryOne(".o_tl_renderer");
    const before = renderer.scrollLeft;
    freezeTime();
    await build.move(queryRect(renderer).right - 5, build.start.y);
    await advanceTime(1000);
    await animationFrame();
    expect(renderer.scrollLeft).toBeGreaterThan(before + 100);
    // the line still starts at the handle
    expect(".o_tl_connect_line").toHaveCount(1);
    await build.cancel();
});

test("002c A32: a cycle is drawn like any link, no message", async () => {
    await mountDependencies();
    const test_ = await pressHandle("Test", "stop");
    const over = centre(queryRect(pillEl("Design")));
    await moveInSteps(test_, test_.start, over, 10);
    await test_.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID.Design], values: { dependency_field: [[4, ID.Test]] } }]);
    expect(".o_notification").toHaveCount(0);
});

test("002c A91: a tap shows the handles, a finger on a handle draws and writes", async () => {
    await mountDependencies();
    mockTouch(true);
    await click(pillEl("Build"));
    await advanceTime(400);
    await animationFrame();
    // the tap opened the popover and left the pill in the pointer-over state with its handles
    expect(".o_popover").toHaveCount(1);
    expect(handleEls("Build")).toHaveLength(2);
    expect(css(handleEl("Build", "stop"), "touchAction")).toBe("none");
    const handle = handleEl("Build", "stop");
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    const over = centre(queryRect(pillEl("Overlap C")));
    for (let i = 1; i <= 12; i++) {
        const x = start.x + ((over.x - start.x) * i) / 12;
        const y = start.y + ((over.y - start.y) * i) / 12;
        await held.moveTo(document.elementFromPoint(x, y) || queryOne(".o_tl_renderer"), {
            position: { x, y },
        });
        await animationFrame();
    }
    expect(".o_tl_connect_line .o_tl_connect_path").toHaveCount(1);
    expect(".o_tl_selection").toHaveCount(0);
    await held.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID["Overlap C"]], values: { dependency_field: [[4, ID.Build]] } }]);
});

test("002c A87: handles on a pill cut at both ends, drawing from its end handle to Deploy", async () => {
    await mountDependencies();
    // the grid at the end of its loaded period: "Long task" is cut at both ends (002b2 locks it)
    const scroller = queryOne(".o_tl_renderer");
    scroller.scrollLeft = scroller.scrollWidth;
    await animationFrame();
    await animationFrame();
    const longTask = pillEl("Long task");
    // cut at both ends: 002b2 shows no resize handle on it
    expect(longTask.querySelector(".o_tl_handle")).toBe(null);
    await hover(longTask);
    await animationFrame();
    expect(handleEls("Long task")).toHaveLength(2);
    // the end handle stands below the pill's right end (its centre 6 px in, S2)
    const body = queryRect(longTask);
    const stopRect = queryRect(handleEl("Long task", "stop"));
    expect(stopRect.right).toBeWithin(body.right + 1.5, body.right + 2.5);
    expect(stopRect.top).toBeWithin(body.bottom - 0.5, body.bottom + 0.5);
    const held = await pressHandle("Long task", "stop");
    const over = centre(queryRect(pillEl("Deploy")));
    await moveInSteps(held, held.start, over, 10);
    await held.drop();
    await settle();
    expect(writes()).toEqual([
        { call: "write", ids: [ID.Deploy], values: { dependency_field: [[4, ID["Long task"]]] } },
    ]);
});

test("002c A87: handles with drag and drop off", async () => {
    await mountDependencies({ arch: timelineArch(`${DEPENDENCIES} disable_drag_drop="1"`) });
    await hover(pillEl("Build"));
    await animationFrame();
    expect(handleEls("Build")).toHaveLength(2);
});

test("002c A29: a record in two rows: its other pill is no other pill", async () => {
    await mountDependencies({ groupBy: ["x_tags"] });
    const builds = queryAll(`.o_tl_pill[data-pill-id="${ID.Build}"]:not(.o_tl_pill_moved)`);
    expect(builds).toHaveLength(2);
    await hover(builds[0]);
    await animationFrame();
    const handle = queryOne(`.o_tl_connect[data-pill-id="${ID.Build}"] .o_tl_connect_stop`);
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    const over = centre(queryRect(builds[1]));
    for (let i = 1; i <= 10; i++) {
        const x = start.x + ((over.x - start.x) * i) / 10;
        const y = start.y + ((over.y - start.y) * i) / 10;
        await held.moveTo(document.elementFromPoint(x, y) || queryOne(".o_tl_renderer"), {
            position: { x, y },
        });
        await animationFrame();
    }
    // the other pill of the record shows no handle as a target
    expect(`.o_tl_connect[data-pill-id="${ID.Build}"]`).toHaveCount(1);
    await held.drop();
    await settle();
    expect(writes()).toHaveLength(0);
});

test("002c A29: the release of a drawing and a short click on a handle open nothing", async () => {
    const arch = timelineArch(
        `${DEPENDENCIES} multi_create_view="test_web_gantt.host_form_template_one"`
    );
    await mountDependencies({ arch });
    // released over an empty cell of the row
    let build = await pressHandle("Build", "stop");
    const cell = queryAll(".o_tl_row[data-row-id] .o_tl_cell").at(2);
    const rect = queryRect(cell);
    await build.move(build.start.x, build.start.y + 30);
    await build.move(rect.left + 5, rect.top + 5);
    await build.drop();
    await settle();
    await advanceTime(1000);
    expect(".o_dialog").toHaveCount(0);
    expect(".o_popover").toHaveCount(0);
    expect(".o_tl_cell_picked").toHaveCount(0);
    expect(controller.selection.state.cellCount).toBe(0);
    expect(writes()).toHaveLength(0);
    // a press and a release on the handle without a move
    build = await pressHandle("Build", "stop");
    await build.drop();
    await settle();
    await advanceTime(1000);
    expect(".o_dialog").toHaveCount(0);
    expect(".o_popover").toHaveCount(0);
    expect(writes()).toHaveLength(0);
});
