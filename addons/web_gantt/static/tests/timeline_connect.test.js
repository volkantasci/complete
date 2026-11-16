// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
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
    Plan: 9,
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
    // the arrows lit at the start stay lit
    expect(lit()).toHaveLength(2);
    await hover(pillEl("Review"));
    expect(lit()).toHaveLength(2);
    await build.move(over.x, over.y);
    await build.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID["Overlap C"]], values: { dependency_field: [[4, ID.Build]] } }]);
    expect(root()).not.toHaveClass("o_tl_drag_connect");
    expect(".o_tl_connect_line").toHaveCount(0);
    expect(".o_notification").toHaveCount(0);
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

test("002c A29: four releases that write nothing", async () => {
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

test("002c A87: handles on a cut pill, drawing from it", async () => {
    await mountDependencies();
    // Test is cut by the end of the week: 002b2 locks it
    await hover(pillEl("Test"));
    await animationFrame();
    expect(handleEls("Test").length).toBe(2);
    const test_ = await pressHandle("Test", "start");
    const over = centre(queryRect(pillEl("Plan")));
    await moveInSteps(test_, test_.start, over, 10);
    await test_.drop();
    await settle();
    expect(writes()).toEqual([{ call: "write", ids: [ID.Plan], values: { dependency_field: [[4, ID.Test]] } }]);
});

test("002c A87: handles with drag and drop off", async () => {
    await mountDependencies({ arch: timelineArch(`${DEPENDENCIES} disable_drag_drop="1"`) });
    await hover(pillEl("Build"));
    await animationFrame();
    expect(handleEls("Build")).toHaveLength(2);
});
