// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, hover, queryAll, queryOne, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    makeMockServer,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

const DEPENDENCIES = `string="Pills" default_range="week" color="x_color"
    dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"`;
const ARCH = timelineArch(DEPENDENCIES);

// pills of the scratch host
const ID = { Design: 4, Build: 5, Review: 6, Test: 7, Plan: 9, "Overlap A": 11 };

let controller;
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
    onRpc("write", ({ args }) => {
        log.push({ call: "write", ids: args[0], values: args[1] });
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
const arrowEls = () => queryAll(".o_tl_arrow");
const arrowOf = (source, target) =>
    queryOne(`.o_tl_arrow[data-arrow*="|${ID[source]}>"][data-arrow$="|${ID[target]}"]`);
const isLit = (arrow) => arrow.classList.contains("o_tl_arrow_lit");
const lit = () => arrowEls().filter(isLit);

/** A point of the line of `arrow` (a fraction of its length), in the page's coordinates. */
function pointOn(arrow, fraction) {
    const line = arrow.querySelector(".o_tl_arrow_line");
    const at = line.getPointAtLength(line.getTotalLength() * fraction);
    const box = arrow.getBoundingClientRect();
    return { x: box.left + at.x, y: box.top + at.y };
}

/** Rest the pointer on `arrow` at a point of its line. */
async function hoverArrow(arrow, fraction = 0.5) {
    const band = arrow.querySelector(".o_tl_arrow_band");
    const { x, y } = pointOn(arrow, fraction);
    const rect = band.getBoundingClientRect();
    await hover(band, { position: { x: x - rect.left, y: y - rect.top } });
    await animationFrame();
}

test("002c A11: where arrows exist", async () => {
    await mountDependencies();
    expect(arrowEls()).toHaveLength(3);
    expect("svg.o_tl_arrow").toHaveCount(3);
    // each arrow is a layer as large as the area of the cells (M7)
    const cells = queryAll(".o_tl_row .o_tl_pills")[0].getBoundingClientRect();
    for (const arrow of arrowEls()) {
        const box = arrow.getBoundingClientRect();
        expect(box.left).toBeWithin(cells.left - 0.5, cells.left + 0.5);
        expect(box.width).toBeWithin(cells.width - 0.5, cells.width + 0.5);
        expect(box.top).toBeWithin(cells.top - 0.5, cells.top + 0.5);
    }
});

test("002c A11: no dependency field, no arrow", async () => {
    await mountDependencies({ arch: timelineArch(`string="Pills" default_range="week"`) });
    expect(".o_tl_arrow").toHaveCount(0);
    expect(".o_tl_arrows").toHaveCount(0);
});

test("002c A11: no arrow on sample data", async () => {
    await mountDependencies({
        arch: timelineArch(`${DEPENDENCIES} sample="1"`),
        domain: [["name", "=", "no such record"]],
    });
    expect(".o_tl_arrow").toHaveCount(0);
});

test("002c A11: no arrow on a phone", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountDependencies();
    expect(".o_tl_arrow").toHaveCount(0);
});

test("002c A13: only arrows between loaded pills", async () => {
    // "Build" is not loaded: its arrows are not drawn, "Test" has none
    await mountDependencies({ domain: [["name", "!=", "Build"]] });
    expect(`.o_tl_pill[data-pill-id="${ID.Test}"]`).toHaveCount(1);
    expect(`.o_tl_pill[data-pill-id="${ID.Build}"]`).toHaveCount(0);
    expect(arrowEls()).toHaveLength(1);
    expect(arrowOf("Review", "Overlap A")).not.toBe(null);
});

test("002c A13: a search keeping the two ends keeps the arrow between them", async () => {
    await mountDependencies({
        searchViewArch: `<search>
            <filter name="two" string="Two" domain="[('name', 'in', ['Build', 'Test'])]"/>
        </search>`,
    });
    await toggleSearchBarMenu();
    await toggleMenuItem("Two");
    await animationFrame();
    await animationFrame();
    expect(arrowEls()).toHaveLength(1);
    expect(arrowOf("Build", "Test")).toHaveCount(1);
});

test("002c A20: arrows lie under the pills", async () => {
    await mountDependencies();
    const arrowZ = Number(getComputedStyle(arrowOf("Design", "Build")).zIndex);
    const pillZ = Number(getComputedStyle(pillEl("Build")).zIndex);
    expect(arrowZ).toBe(2);
    expect(pillZ).toBe(10);
    expect(getComputedStyle(arrowOf("Design", "Build")).pointerEvents).toBe("none");
    // the pill layers of the rows keep no stacking context that would trap the pills
    expect(getComputedStyle(queryAll(".o_tl_row .o_tl_pills")[0]).zIndex).toBe("auto");
    // the headers stay above both
    expect(Number(getComputedStyle(queryAll(".o_tl_row_header")[0]).zIndex)).toBeGreaterThan(20);
    expect(Number(getComputedStyle(queryAll(".o_tl_col")[0]).zIndex)).toBeGreaterThan(20);
});

test("002c A15: the line, its outline and its band", async () => {
    await mountDependencies();
    const arrow = arrowOf("Build", "Test");
    const line = getComputedStyle(arrow.querySelector(".o_tl_arrow_line"));
    expect(line.stroke).toBe("rgba(236, 151, 31, 0.5)");
    expect(line.strokeWidth).toBe("2px");
    expect(line.fill).toBe("none");
    expect(line.pointerEvents).toBe("stroke");
    const halo = getComputedStyle(arrow.querySelector(".o_tl_arrow_halo"));
    expect(halo.stroke).toBe("rgba(255, 255, 255, 0.5)");
    expect(halo.strokeWidth).toBe("3px");
    const band = getComputedStyle(arrow.querySelector(".o_tl_arrow_band"));
    expect(band.stroke).toBe("none");
    expect(band.strokeWidth).toBe("13px");
    expect(band.pointerEvents).toBe("stroke");
    expect(getComputedStyle(arrowOf("Design", "Build").querySelector(".o_tl_arrow_line")).stroke).toBe(
        "rgba(143, 143, 143, 0.5)"
    );
    expect(getComputedStyle(arrowOf("Review", "Overlap A").querySelector(".o_tl_arrow_line")).stroke).toBe(
        "rgba(211, 65, 59, 0.5)"
    );
});

test("002c A21: pointer over a pill", async () => {
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    expect(lit()).toHaveLength(2);
    expect(isLit(arrowOf("Design", "Build"))).toBe(true);
    expect(isLit(arrowOf("Build", "Test"))).toBe(true);
    expect(isLit(arrowOf("Review", "Overlap A"))).toBe(false);
    const arrow = arrowOf("Build", "Test");
    expect(getComputedStyle(arrow).zIndex).toBe("20");
    expect(getComputedStyle(arrow.querySelector(".o_tl_arrow_line")).stroke).toMatch(/^rgba?\(236, 151, 31(, 1)?\)$/);
    expect(getComputedStyle(arrow.querySelector(".o_tl_arrow_halo")).stroke).toMatch(/^rgba?\(255, 255, 255(, 1)?\)$/);
    expect(".o_tl_arrow_remove").toHaveCount(2);
    const button = arrow.querySelector(".o_tl_arrow_remove");
    expect(getComputedStyle(button.querySelector("circle")).cursor).toBe("pointer");
    expect(getComputedStyle(button.querySelector(".o_tl_arrow_cross")).fill).toBe("rgb(221, 60, 79)");
    expect(button).toHaveAttribute("aria-label", "Remove this dependency");
    // the button stands in the middle of the anchors of its arrow
    const build = pillEl("Build").getBoundingClientRect();
    const test_ = pillEl("Test").getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    expect(rect.left + rect.width / 2).toBeWithin(
        (build.right + test_.left) / 2 - 0.6,
        (build.right + test_.left) / 2 + 0.6
    );
    expect(rect.top + rect.height / 2).toBeWithin(
        (build.top + build.bottom + test_.top + test_.bottom) / 4 - 0.6,
        (build.top + build.bottom + test_.top + test_.bottom) / 4 + 0.6
    );
    // the pointer leaves: back to rest
    await hover(".o_tl_col");
    await animationFrame();
    expect(lit()).toHaveLength(0);
    expect(".o_tl_arrow_remove").toHaveCount(0);
});

test("002c A22: pointer over an arrow", async () => {
    await mountDependencies();
    const arrow = arrowOf("Review", "Overlap A");
    await hoverArrow(arrow, 0.5);
    expect(lit()).toHaveLength(1);
    expect(isLit(arrow)).toBe(true);
    expect(".o_tl_arrow_remove").toHaveCount(1);
    await hover(".o_tl_col");
    await animationFrame();
    expect(lit()).toHaveLength(0);
});

test("002c A24: removing a dependency", async () => {
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    const calls = timelineMock.calls.length;
    await click(".o_tl_arrow[data-arrow$='|" + ID.Test + "'] .o_tl_arrow_remove");
    await advanceTime(100);
    await animationFrame();
    await animationFrame();
    expect(log).toEqual([{ call: "write", ids: [ID.Test], values: { dependency_field: [[3, ID.Build]] } }]);
    // the view loaded the data again, and the arrow is gone; no notification
    expect(timelineMock.calls.length).toBe(calls + 1);
    expect(arrowEls()).toHaveLength(2);
    expect(".o_notification").toHaveCount(0);
});

test("002c A24: a refused removal loads the view again", async () => {
    expect.errors(1);
    await mountDependencies();
    onRpc("write", () => {
        throw new Error("Access refused");
    });
    await hover(pillEl("Build"));
    await animationFrame();
    const calls = timelineMock.calls.length;
    expect(queryAll(".o_tl_arrow_remove")).toHaveLength(2);
    await click(queryAll(".o_tl_arrow_remove")[0]);
    await advanceTime(100);
    await animationFrame();
    expect.verifyErrors(["RPC_ERROR: Access refused"]);
    // the dependency stays, and the view read the data again
    expect(timelineMock.calls.length).toBe(calls + 1);
    expect(arrowEls()).toHaveLength(3);
});

test("002c A25: no remove button without edit permission", async () => {
    await mountDependencies({ arch: timelineArch(`${DEPENDENCIES} edit="0"`) });
    await hover(pillEl("Build"));
    await animationFrame();
    expect(lit()).toHaveLength(2);
    expect(".o_tl_arrow_remove").toHaveCount(0);
});

test("002c A33: hidden arrows", async () => {
    await mountDependencies();
    controller.dependencies.shown = false;
    await animationFrame();
    for (const arrow of arrowEls()) {
        const style = getComputedStyle(arrow);
        expect(style.opacity).toBe("0");
        expect(style.pointerEvents).toBe("none");
        expect(getComputedStyle(arrow.querySelector(".o_tl_arrow_band")).pointerEvents).toBe("none");
    }
    await hover(pillEl("Build"));
    await animationFrame();
    expect(getComputedStyle(arrowOf("Design", "Build")).opacity).toBe("1");
    expect(getComputedStyle(arrowOf("Design", "Build")).pointerEvents).toBe("none");
    expect(getComputedStyle(arrowOf("Build", "Test")).opacity).toBe("1");
    // not connected to "Build": stays hidden
    expect(getComputedStyle(arrowOf("Review", "Overlap A")).opacity).toBe("0");
    controller.dependencies.shown = true;
    await hover(".o_tl_col");
    await animationFrame();
    expect(getComputedStyle(arrowOf("Review", "Overlap A")).opacity).toBe("1");
});

test("002c A75: a lit arrow over another pill keeps both lit", async () => {
    await mountDependencies();
    await hover(pillEl("Build"));
    await animationFrame();
    expect(isLit(arrowOf("Build", "Test"))).toBe(true);
    // Review lies over the orange arrow's horizontal part: aim at the part of the line in Review
    const arrow = arrowOf("Build", "Test");
    const review = pillEl("Review").getBoundingClientRect();
    const line = arrow.querySelector(".o_tl_arrow_line");
    const box = arrow.getBoundingClientRect();
    let target = null;
    for (let at = 0; at <= 1; at += 0.005) {
        const p = line.getPointAtLength(line.getTotalLength() * at);
        const x = box.left + p.x;
        const y = box.top + p.y;
        if (x > review.left + 4 && x < review.right - 4 && y > review.top && y < review.bottom) {
            target = { x, y };
            break;
        }
    }
    expect(target).not.toBe(null);
    const band = arrow.querySelector(".o_tl_arrow_band");
    const rect = band.getBoundingClientRect();
    await hover(band, { position: { x: target.x - rect.left, y: target.y - rect.top } });
    await animationFrame();
    // the pointer moves on the band: the event carries its place
    band.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: target.x, clientY: target.y })
    );
    await animationFrame();
    expect(isLit(arrowOf("Build", "Test"))).toBe(true);
    expect(isLit(arrowOf("Review", "Overlap A"))).toBe(true);
    expect(isLit(arrowOf("Design", "Build"))).toBe(false);
    expect(arrowOf("Review", "Overlap A").querySelector(".o_tl_arrow_remove")).not.toBe(null);
});

test("002c A76: a click on a lit arrow over a pill opens no popover", async () => {
    await mountDependencies();
    // a click on the pill alone opens its popover (002a)
    await click(pillEl("Review"));
    await advanceTime(400);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
    await click(".o_tl_col");
    await advanceTime(400);
    expect(".o_tl_popover").toHaveCount(0);
    // the same click on the lit arrow that passes over it
    await hover(pillEl("Build"));
    await animationFrame();
    const arrow = arrowOf("Build", "Test");
    const review = pillEl("Review").getBoundingClientRect();
    const line = arrow.querySelector(".o_tl_arrow_line");
    const box = arrow.getBoundingClientRect();
    let target = null;
    for (let at = 0; at <= 1; at += 0.005) {
        const p = line.getPointAtLength(line.getTotalLength() * at);
        const x = box.left + p.x;
        const y = box.top + p.y;
        if (x > review.left + 4 && x < review.right - 4 && y > review.top && y < review.bottom) {
            target = { x, y };
            break;
        }
    }
    const band = arrow.querySelector(".o_tl_arrow_band");
    const rect = band.getBoundingClientRect();
    await click(band, { position: { x: target.x - rect.left, y: target.y - rect.top } });
    await advanceTime(400);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(0);
});

test("002c A20: the arrows follow a pill that moved when they are drawn again", async () => {
    await mountDependencies();
    const line = () => arrowOf("Design", "Build").querySelector(".o_tl_arrow_line").getAttribute("d");
    const before = line();
    const build = pillEl("Build");
    build.style.insetInlineStart = `${parseFloat(getComputedStyle(build).left) + 40}px`;
    controller.selection.renderer.refreshArrows();
    await animationFrame();
    expect(line()).not.toBe(before);
});
