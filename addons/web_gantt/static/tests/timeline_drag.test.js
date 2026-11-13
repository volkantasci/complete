// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    dblclick,
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
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { drag } from "@odoo/hoot-dom";
import { TimelineController } from "@web_gantt/timeline_controller";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

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
    onRpc("copy", async ({ args, kwargs }) => {
        log.push({ call: "copy", ids: args[0], default: kwargs.default });
        await gate;
        if (gate?.refuse) {
            throw new Error("Access denied");
        }
    });
    await resize({ width: 1600, height: 900 });
});

const RECORD_ROW = ".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)";
const PILL = { Design: 4, Build: 5, Review: 6, Plan: 9, "Long task": 10, "Color ten": 14, "Three days": 2, "Next month": 3 };

async function mountTimeline({ arch = HOST_ARCHS.H1, groupBy, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, groupBy, ...rest });
    // the grid shows Thursday 12 in the middle (R39), where the pills of the tests are
    await animationFrame();
    log.length = 0;
    timelineMock.calls.length = 0;
}

const rowAt = (row = 0) => queryAll(RECORD_ROW)[row];
const rowIndexOf = (name) =>
    queryAll(RECORD_ROW).findIndex(
        (row) => row.querySelector(".o_tl_row_label")?.textContent === name
    );
const pillEl = (name) =>
    queryOne(`.o_tl_pill[data-pill-id="${PILL[name]}"]:not(.o_tl_pill_moved)`);
const indexOfDate = (date) => Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index);
const cellAt = (date, row = 0) => rowAt(row).querySelectorAll(".o_tl_cell")[indexOfDate(date)];
const partWidth = () => queryRect(cellAt("2026-11-12")).width / 2;
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
const rowMiddle = (row) => {
    const rect = queryRect(rowAt(row));
    return rect.top + rect.height / 2;
};
const css = (element, property) => getComputedStyle(element)[property];

/**
 * Press the pill `name` at `at` (0 to 1) of its width. Returns the drag helpers, the press point,
 * `move(x, y)` (to a viewport point) and `by(dx, dy)` (from the press point).
 */
async function pressPill(name, at = 0.5) {
    const element = pillEl(name);
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width * at, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const move = async (x, y) => {
        const target = document.elementFromPoint(x, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x, y } });
        await animationFrame();
    };
    return { ...helpers, start, move, by: (dx, dy = 0) => move(start.x + dx, start.y + dy) };
}

/** Let the write and its reload settle. */
async function settle() {
    await advanceTime(100);
    await animationFrame();
}

const root = () => queryOne(".o_timeline_view");
const moved = () => queryAll(".o_tl_pill_moved");
const badgeTexts = () => queryAllTexts(".o_tl_selection_badge");
const writes = () => log.filter((entry) => entry.call === "write");
const copies = () => log.filter((entry) => entry.call === "copy");

// ----------------------------------------------------------------------------
// Moving
// ----------------------------------------------------------------------------

test("A1 move one day: the moved pill follows, faded copy, highlight, badges, one write", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    const origin = queryRect(pillEl("Review"));
    await review.by(2 * partWidth());

    // the moved pill follows the pointer (M1 to M4), the pressed pill stays, faded (M5)
    expect(moved()).toHaveCount(1);
    // M1: the box that carries opacity and shadow is the span's box, one pixel around the body
    const ghost = queryRect(moved()[0]);
    expect(near(ghost.left, origin.left - 1 + 2 * partWidth())).toBe(true);
    expect(near(ghost.top, origin.top - 1)).toBe(true);
    expect(near(ghost.width, origin.width + 2)).toBe(true);
    expect(near(ghost.height, origin.height + 2)).toBe(true);
    expect(css(moved()[0], "opacity")).toBe("0.8");
    expect(css(moved()[0], "boxShadow")).toBe("rgb(0, 0, 0) 0px 5px 25px -10px");
    // M3: the body, one pixel inside, with its shadow
    const body = queryRect(".o_tl_pill_moved > .o_tl_pill");
    expect(near(body.left, ghost.left + 1)).toBe(true);
    expect(near(body.top, ghost.top + 1)).toBe(true);
    expect(near(body.width, ghost.width - 2)).toBe(true);
    expect(near(body.height, 23)).toBe(true);
    expect(css(queryOne(".o_tl_pill_moved > .o_tl_pill"), "boxShadow")).toBe(
        "rgb(0, 0, 0) 0px 5px 25px -10px"
    );
    // M5: the copy left at the starting place, half faded, in the same kind of box
    expect(".o_tl_pill_faded").toHaveCount(1);
    const faded = queryRect(".o_tl_pill_faded");
    expect(css(queryOne(".o_tl_pill_faded"), "opacity")).toBe("0.5");
    expect(near(faded.left, origin.left - 1)).toBe(true);
    expect(near(faded.width, origin.width + 2)).toBe(true);
    expect(near(faded.height, origin.height + 2)).toBe(true);
    const fadedBody = queryRect(".o_tl_pill_faded > .o_tl_pill");
    expect(near(fadedBody.left, origin.left)).toBe(true);
    expect(near(fadedBody.width, origin.width)).toBe(true);
    // the pressed pill itself keeps its place but is not drawn twice
    expect(near(queryRect(pillEl("Review")).left, origin.left)).toBe(true);
    expect(css(pillEl("Review"), "opacity")).toBe("0");

    // the highlight: Friday 13's second half over the row's height, under the pills (M7)
    expect(".o_tl_drop").toHaveCount(1);
    const highlight = queryRect(".o_tl_drop");
    const friday = queryRect(cellAt("2026-11-13"));
    expect(near(highlight.left, friday.left + friday.width / 2)).toBe(true);
    expect(near(highlight.width, partWidth())).toBe(true);
    expect(near(highlight.height, queryRect(rowAt(0)).height)).toBe(true);
    expect(css(queryOne(".o_tl_drop"), "backgroundColor")).toBe("rgba(0, 160, 157, 0.3)");
    expect(css(queryOne(".o_tl_drop"), "borderRightWidth")).toBe("1px");
    expect(css(queryOne(".o_tl_drop"), "borderBottomWidth")).toBe("1px");

    // the badges: the record's own bounds, success colour (M9)
    expect(badgeTexts()).toEqual(["11/13/2026, 1:00 PM", "11/13/2026, 5:00 PM"]);
    expect(queryAll(".o_tl_selection_badge").map((badge) => badge.classList.contains("text-success"))).toEqual([
        true,
        true,
    ]);

    await review.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL.Review],
            values: { date_start: "2026-11-13 10:00:00", date_stop: "2026-11-13 14:00:00" },
        },
    ]);
    expect(moved()).toHaveCount(0);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    // the notification of the accepted write (Task 10) and the pill at its new place
    expect(".o_notification").toHaveCount(1);
    const friday13 = queryRect(cellAt("2026-11-13"));
    expect(near(queryRect(pillEl("Review")).left, friday13.left + friday13.width / 2 + 1)).toBe(true);
});

test("A3 the popover closes, the root takes the move shape and shields the buttons, no click follows", async () => {
    freezeTime();
    await mountTimeline();
    await click(pillEl("Review"));
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);

    const review = await pressPill("Review");
    await review.by(40);
    expect(".o_tl_popover").toHaveCount(0);
    expect(root()).toHaveClass("o_tl_dragging");
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(css(root(), "cursor")).toBe("move");
    expect(css(queryOne(".o_tl_next"), "cursor")).toBe("move");
    expect(css(queryOne(".o_control_panel"), "pointerEvents")).toBe("none");
    expect(css(queryOne(".o_tl_controls"), "pointerEvents")).toBe("none");

    // released over the pressed pill itself, whose click would open the popover
    await review.by(0);
    await review.drop();
    await animationFrame();
    await advanceTime(600);
    await animationFrame();
    expect(root()).not.toHaveClass("o_tl_dragging");
    expect(css(queryOne(".o_control_panel"), "pointerEvents")).not.toBe("none");
    expect(".o_tl_popover").toHaveCount(0);
    expect(".o_dialog").toHaveCount(0);
    expect(log).toHaveLength(0);
});

test("A4 Escape, a letter and an arrow key cancel; Shift, Alt and Meta do not, Meta makes no copy", async () => {
    await mountTimeline();
    for (const key of ["Escape", "a", "ArrowLeft"]) {
        const review = await pressPill("Review");
        await review.by(2 * partWidth());
        expect(moved()).toHaveCount(1);
        await keyDown(key);
        await keyUp(key);
        await animationFrame();
        expect(moved()).toHaveCount(0);
        expect(".o_tl_drop").toHaveCount(0);
        expect(".o_tl_selection_badge").toHaveCount(0);
        expect(root()).not.toHaveClass("o_tl_dragging");
        expect(".o_tl_pill_faded").toHaveCount(0);
        // the button comes up later: nothing is written
        await review.drop().catch(() => {});
        await settle();
        expect(log).toHaveLength(0);
    }

    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    for (const key of ["shift", "alt", "meta"]) {
        await keyDown(key);
        await keyUp(key);
    }
    await animationFrame();
    expect(moved()).toHaveCount(1);
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(root()).not.toHaveClass("o_tl_drag_copy");
    await review.drop();
    await settle();
    expect(writes()).toHaveLength(1);
    expect(copies()).toHaveLength(0);
});

test("A4 the pointer over a column header hides the highlight and the badges; a release there writes nothing", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    expect(".o_tl_drop").toHaveCount(1);
    expect(".o_tl_selection_badge").toHaveCount(2);
    const header = queryRect(".o_tl_col[data-date='2026-11-13']");
    await review.move(header.left + 20, header.top + header.height / 2);
    expect(moved()).toHaveCount(1);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    await review.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
});

test("A4 the pointer over the control panel is no target either", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    const panel = queryRect(".o_control_panel");
    await review.move(panel.left + 300, panel.top + 10);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    await review.drop();
    await settle();
    expect(log).toHaveLength(0);
});

test("A5 8 px is a click: the popover opens; 12 px starts a move", async () => {
    freezeTime();
    await mountTimeline();
    const small = await pressPill("Review");
    await small.by(8);
    expect(moved()).toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    await small.drop();
    await animationFrame();
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
    expect(log).toHaveLength(0);
    await click(document.body);
    await advanceTime(1100);
    await animationFrame();

    const large = await pressPill("Review");
    await large.by(12);
    expect(moved()).toHaveCount(1);
    expect(root()).toHaveClass("o_tl_dragging");
    await large.drop();
    await settle();
    // within the starting sub-column: nothing to write (A6)
    expect(log).toHaveLength(0);
});

test("A6 a release that changes nothing: no write, no notification, no reload", async () => {
    await mountTimeline();
    // 15 px within the sub-column
    let review = await pressPill("Review");
    await review.by(15);
    expect(".o_tl_drop").toHaveCount(1);
    await review.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(timelineMock.calls).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_tl_pill_faded").toHaveCount(0);

    // one day right, then back to the starting sub-column
    review = await pressPill("Review");
    await review.by(2 * partWidth());
    expect(badgeTexts()).toEqual(["11/13/2026, 1:00 PM", "11/13/2026, 5:00 PM"]);
    await review.by(3);
    await review.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(timelineMock.calls).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);
});

test("A7 the pill stays inside the grid: Color ten stops at Saturday 21, 24:00", async () => {
    await mountTimeline();
    const renderer = queryOne(".o_tl_renderer");
    renderer.scrollLeft = renderer.scrollWidth;
    await animationFrame();
    const colorTen = await pressPill("Color ten", 0.1);
    const box = queryRect(renderer);
    await colorTen.move(box.left + renderer.clientWidth - 3, colorTen.start.y);
    expect(".o_tl_drop").toHaveCount(1);
    const last = queryRect(cellAt("2026-11-21"));
    expect(near(queryRect(".o_tl_drop").right, last.right)).toBe(true);
    // the whole pill (four sub-columns) is inside
    expect(near(queryRect(".o_tl_drop").width, 4 * partWidth())).toBe(true);
    await colorTen.drop();
    await settle();
    expect(writes()[0].values).toEqual({
        date_start: "2026-11-20 05:00:00",
        date_stop: "2026-11-21 15:00:00",
    });
});

test("A8 a folded column keeps the highlight where it was", async () => {
    timelineMock.unavailability = {
        x_contact: Object.fromEntries(
            [1, 2, 3].map((id) => [
                id,
                [{ start: "2026-11-14 21:00:00", stop: "2026-11-16 21:00:00" }],
            ])
        ),
    };
    await mountTimeline({
        arch: HOST_ARCHS.H12,
        groupBy: ["x_contact"],
        domain: [["id", "in", [4, 5, 6, 9]]],
    });
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    const before = queryRect(".o_tl_drop");
    const folded = queryRect(".o_tl_col.o_tl_folded");
    await review.move(folded.left + folded.width / 2, review.start.y);
    expect(".o_tl_drop").toHaveCount(1);
    expect(near(queryRect(".o_tl_drop").left, before.left)).toBe(true);
    expect(badgeTexts()).toEqual(["11/13/2026, 1:00 PM", "11/13/2026, 5:00 PM"]);
    await review.drop();
    await settle();
    expect(writes()[0].values.date_start).toBe("2026-11-13 10:00:00");
});

const BASE_ATTRS = `string="Pills" default_range="week" color="x_color"`;
for (const [label, attrs] of [
    ["edit off", `edit="0"`],
    ["drag and drop off (H31)", `disable_drag_drop="1"`],
]) {
    test(`R1 ${label}: a pill does not move`, async () => {
        await mountTimeline({ arch: timelineArch(`${BASE_ATTRS} ${attrs}`) });
        const review = await pressPill("Review");
        await review.by(2 * partWidth());
        expect(root()).toHaveClass("o_tl_drag_lock");
        expect(".o_tl_drop").toHaveCount(0);
        await review.drop();
        await settle();
        expect(log).toHaveLength(0);
    });
}

test("R1 a cut pill does not move: Long task starts before the range and ends after it", async () => {
    await mountTimeline();
    const longTask = await pressPill("Long task");
    await longTask.by(2 * partWidth());
    // it does not follow the pointer: it is only held (R11)
    expect(root()).toHaveClass("o_tl_drag_lock");
    expect(".o_tl_drop").toHaveCount(0);
    await longTask.drop();
    await settle();
    expect(log).toHaveLength(0);
});

const DAY = HOST_ARCHS.H1.replace('default_range="week"', 'default_range="day"');

/** The locked pill held: its raised copy, its lock icon and where the pill is. */
function lockState(name) {
    const raised = queryOne(".o_tl_pill_moved");
    const body = raised.querySelector(".o_tl_pill");
    return { raised, body, icon: raised.querySelector(".o_tl_pill_lock"), origin: pillEl(name) };
}

test("A47 Day: Design cut at start: lock state, icon at right end, not-allowed, nothing written, no icon at rest", async () => {
    await mountTimeline({ arch: DAY });
    expect(".o_tl_pill_lock").toHaveCount(0);
    const design = await pressPill("Design", 0.8);
    await design.by(0);
    await design.by(60, 40);
    const { raised, body, icon, origin } = lockState("Design");
    expect(icon).not.toBe(null);
    // raised in place: 80 % opacity, the shadow, the box of the pill (M41)
    expect(css(raised, "opacity")).toBe("0.8");
    expect(css(raised, "boxShadow")).not.toBe("none");
    const box = queryRect(raised);
    const at = queryRect(origin);
    expect(near(box.left, at.left - 1) && near(box.top, at.top - 1)).toBe(true);
    // the icon: 14 x 14, black, 8 px from the body's right edge (M39)
    const iconRect = queryRect(icon);
    expect(near(iconRect.width, 14) && near(iconRect.height, 14)).toBe(true);
    expect(near(queryRect(body).right - iconRect.right, 8)).toBe(true);
    expect(css(icon, "color")).toBe("rgb(0, 0, 0)");
    // M39: the Community's own icon font, 14 px, no box of its own
    expect(icon.dataset.icon).toBe("lock");
    expect(css(icon, "fontFamily")).toInclude("Material Symbols Outlined");
    expect(css(icon, "fontSize")).toBe("14px");
    expect(css(icon, "lineHeight")).toBe("14px");
    expect(css(icon, "fontWeight")).toBe("400");
    expect(css(icon, "fontStyle")).toBe("normal");
    expect(css(icon, "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(css(icon, "marginRight")).toBe("8px");
    expect(css(icon, "paddingLeft")).toBe("0px");
    expect(css(icon, "borderTopWidth")).toBe("0px");
    expect(css(icon, "boxShadow")).toBe("none");
    expect(root()).toHaveClass("o_tl_drag_lock");
    expect(css(root(), "cursor")).toBe("not-allowed");
    // no highlight, no badge, no faded copy
    expect(".o_tl_drop").toHaveCount(0);
    expect(".o_tl_selection_badge").toHaveCount(0);
    expect(".o_tl_pill_faded").toHaveCount(0);
    await design.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(".o_tl_pill_lock").toHaveCount(0);
    expect(".o_tl_pill_moved").toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    // no click follows the release (R9)
    expect(".o_popover").toHaveCount(0);
});

for (const [label, arch, edit] of [
    ["H31 Review lock", timelineArch(`${BASE_ATTRS} disable_drag_drop="1"`), true],
    ["H19 lock and no handle", timelineArch(`${BASE_ATTRS} edit="0"`), false],
]) {
    test(`A48 ${label}`, async () => {
        await mountTimeline({ arch });
        const element = pillEl("Review");
        await hover(element);
        await animationFrame();
        // H19 shows no handle; H31 keeps them (resizing stays possible)
        expect(".o_tl_handle").toHaveCount(edit ? 2 : 0);
        const review = await pressPill("Review");
        await review.by(2 * partWidth());
        const { icon, body } = lockState("Review");
        expect(icon).not.toBe(null);
        expect(".o_tl_handle").toHaveCount(0);
        expect(near(queryRect(body).right - queryRect(icon).right, 8)).toBe(true);
        expect(css(icon, "color")).toBe("rgb(0, 0, 0)");
        await review.drop();
        await settle();
        expect(log).toHaveLength(0);
        expect(".o_tl_pill_lock").toHaveCount(0);
    });
}

test("A49 Long task: icon at the pill's right end, outside the visible grid", async () => {
    await mountTimeline();
    const longTask = await pressPill("Long task");
    await longTask.by(partWidth());
    const { raised, icon } = lockState("Long task");
    expect(icon).not.toBe(null);
    const grid = queryRect(".o_tl_renderer");
    const iconRect = queryRect(icon);
    expect(iconRect.left).toBeGreaterThan(grid.right);
    expect(near(queryRect(raised).right - iconRect.right, 8 + 1)).toBe(true);
    await longTask.drop();
    await settle();
    expect(log).toHaveLength(0);
    expect(".o_tl_pill_lock").toHaveCount(0);
});

test("A13 a press on a group pill reaches the cell: a click there toggles the row, nothing moves", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H1,
        groupBy: ["parent_id", "x_contact"],
    });
    const group = queryAll(".o_tl_group_row")[0];
    const bar = group.querySelector(".o_tl_group_pill");
    expect(css(bar, "pointerEvents")).toBe("none");
    expect(bar.classList.contains("o_tl_pill")).toBe(false);
    const rect = queryRect(bar);
    const point = { x: rect.left + 3, y: rect.top + 1 };
    const under = document.elementFromPoint(point.x, point.y);
    expect(under).toHaveClass("o_tl_cell");
    const helpers = await drag(under, { position: point });
    await helpers.moveTo(under, { position: { x: point.x + 40, y: point.y + 40 } });
    await animationFrame();
    expect(moved()).toHaveCount(0);
    await helpers.drop();
    await settle();
    expect(log).toHaveLength(0);
    await advanceTime(1100);
    const wasCollapsed = group.classList.contains("o_tl_collapsed");
    await click(document.elementFromPoint(point.x, point.y));
    await animationFrame();
    expect(group.classList.contains("o_tl_collapsed")).toBe(!wasCollapsed);
});

test("A14 the sample state has no pill to move: a press and a move start nothing", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H8, domain: [["id", "<", 0]] });
    expect(".o_tl_pill").toHaveCount(0);
    const cell = queryAll(".o_tl_cell")[3];
    const rect = queryRect(cell);
    const start = { x: rect.left + 5, y: rect.top + 5 };
    const helpers = await drag(cell, { position: start });
    await helpers.moveTo(cell, { position: { x: start.x + 200, y: start.y } });
    await animationFrame();
    expect(moved()).toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    await helpers.drop();
    await settle();
    expect(log).toHaveLength(0);
});

// ----------------------------------------------------------------------------
// Badges
// ----------------------------------------------------------------------------

test("A18 the badges: 20 px above and below the moved pill, 20 px tall", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    const pill = queryRect(moved()[0]);
    const [start, stop] = queryAll(".o_tl_selection_badge").map((badge) => queryRect(badge));
    expect(near(start.bottom, pill.top)).toBe(true);
    expect(near(start.height, 20, 0.1)).toBe(true);
    expect(near(start.left, pill.left)).toBe(true);
    expect(near(stop.top, pill.bottom)).toBe(true);
    expect(near(stop.height, 20, 0.1)).toBe(true);
    expect(near(stop.right, pill.right)).toBe(true);
    expect(css(queryAll(".o_tl_selection_badge")[0], "backgroundColor")).toBe("rgb(255, 255, 255)");
    await review.drop();
    await settle();
});

test("A20 a move to the left: danger badges", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(-partWidth());
    expect(badgeTexts()).toEqual(["11/12/2026, 1:00 AM", "11/12/2026, 5:00 AM"]);
    expect(queryAll(".o_tl_selection_badge").map((badge) => badge.classList.contains("text-danger"))).toEqual([
        true,
        true,
    ]);
    await review.drop();
    await settle();
    expect(writes()[0].values).toEqual({
        date_start: "2026-11-11 22:00:00",
        date_stop: "2026-11-12 02:00:00",
    });
});

// ----------------------------------------------------------------------------
// Touch
// ----------------------------------------------------------------------------

test("A17 touch: a 600 ms hold then five steps; a quick swipe scrolls", async () => {
    freezeTime();
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountTimeline();
    const rect = queryRect(pillEl("Review"));
    const renderer = queryRect(".o_tl_renderer");
    // the visible middle of the pill
    const x = Math.min(Math.max(rect.left + rect.width / 2, renderer.left + 5), renderer.right - 5);
    const y = rect.top + rect.height / 2;
    const helpers = await drag(pillEl("Review"), { position: { x, y } });
    await advanceTime(600);
    // five equal steps, 120 ms apart, ending one sub-column to the left (R-C-4)
    let at = x;
    for (let i = 0; i < 5; i++) {
        at -= partWidth() / 5;
        const target = document.elementFromPoint(at, y) || queryOne(".o_tl_renderer");
        await helpers.moveTo(target, { position: { x: at, y } });
        await advanceTime(120);
        await animationFrame();
    }
    expect(moved()).toHaveCount(1);
    expect(badgeTexts()).toEqual(["11/12/2026, 1:00 AM", "11/12/2026, 5:00 AM"]);
    expect(
        queryAll(".o_tl_selection_badge").map((badge) => badge.classList.contains("text-danger"))
    ).toEqual([true, true]);
    await helpers.drop();
    await settle();
    expect(writes()[0].values).toEqual({
        date_start: "2026-11-11 22:00:00",
        date_stop: "2026-11-12 02:00:00",
    });

    // a quick swipe: no hold, the grid scrolls on its own
    const swipe = await drag(pillEl("Review"), { position: { x, y } });
    await advanceTime(100);
    await swipe.moveTo(queryOne(".o_tl_renderer"), { position: { x: x - 80, y } });
    await advanceTime(300);
    await animationFrame();
    expect(moved()).toHaveCount(0);
    expect(root()).not.toHaveClass("o_tl_dragging");
    await swipe.drop();
    await settle();
    expect(writes()).toHaveLength(1);
});

// ----------------------------------------------------------------------------
// Copying
// ----------------------------------------------------------------------------

test("A21 Ctrl copy into Gamma: the copy shape, the original stays faded, the duplicate with defaults", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const gamma = rowIndexOf("Gamma");
    await keyDown("ctrl");
    const review = await pressPill("Review");
    await review.move(review.start.x + 2 * partWidth(), rowMiddle(gamma));
    expect(root()).toHaveClass("o_tl_drag_copy");
    expect(css(root(), "cursor")).toBe("copy");
    expect(".o_tl_pill_faded").toHaveCount(1);
    // the highlight is in the Gamma row only, Friday 13's second half
    expect(".o_tl_drop").toHaveCount(1);
    expect(rowAt(gamma).querySelector(".o_tl_drop")).not.toBe(null);
    expect(queryAll(".o_tl_drop")[0].closest(".o_tl_row")).toBe(rowAt(gamma));
    await review.drop();
    await keyUp("ctrl");
    await settle();
    expect(writes()).toHaveLength(0);
    expect(copies()).toEqual([
        {
            call: "copy",
            ids: [PILL.Review],
            default: {
                date_start: "2026-11-13 10:00:00",
                date_stop: "2026-11-13 14:00:00",
                parent_id: 3,
            },
        },
    ]);
    expect(".o_notification").toHaveCount(1);
});

test("A22 Ctrl pressed then released: copy shape, then move shape, the release moves", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    expect(root()).toHaveClass("o_tl_drag_move");
    await keyDown("ctrl");
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_copy");
    expect(root()).not.toHaveClass("o_tl_drag_move");
    await keyUp("ctrl");
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_move");
    expect(root()).not.toHaveClass("o_tl_drag_copy");
    await review.drop();
    await settle();
    expect(copies()).toHaveLength(0);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].ids).toEqual([PILL.Review]);
});

test("A23 copy straight down into Beta: start and stop given explicitly, Parent Beta", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const beta = rowIndexOf("Beta");
    await keyDown("ctrl");
    const review = await pressPill("Review");
    await review.move(review.start.x, rowMiddle(beta));
    // no move in time: the badges keep the black role
    expect(
        queryAll(".o_tl_selection_badge").map((badge) => [
            badge.classList.contains("text-success"),
            badge.classList.contains("text-danger"),
        ])
    ).toEqual([
        [false, false],
        [false, false],
    ]);
    await review.drop();
    await keyUp("ctrl");
    await settle();
    expect(copies()).toEqual([
        {
            call: "copy",
            ids: [PILL.Review],
            default: {
                date_start: "2026-11-12 10:00:00",
                date_stop: "2026-11-12 14:00:00",
                parent_id: 2,
            },
        },
    ]);
});

test("A24 phone size with a mouse: Ctrl copy of Plan into Beta", async () => {
    await resize({ width: 390, height: 844 });
    await mountTimeline({ groupBy: ["parent_id"] });
    const plan = pillEl("Plan");
    const rect = queryRect(plan);
    const renderer = queryRect(".o_tl_renderer");
    const x = Math.min(Math.max(rect.left + rect.width / 2, renderer.left + 5), renderer.right - 5);
    await keyDown("ctrl");
    const helpers = await drag(plan, { position: { x, y: rect.top + rect.height / 2 } });
    const beta = rowIndexOf("Beta");
    const y = rowMiddle(beta);
    await helpers.moveTo(document.elementFromPoint(x, y) || queryOne(".o_tl_renderer"), {
        position: { x, y },
    });
    await animationFrame();
    expect(root()).toHaveClass("o_tl_drag_copy");
    expect(badgeTexts()).toHaveLength(2);
    await helpers.drop();
    await keyUp("ctrl");
    await settle();
    expect(copies()).toHaveLength(1);
    expect(copies()[0].ids).toEqual([PILL.Plan]);
    expect(copies()[0].default.parent_id).toBe(2);
});

// ----------------------------------------------------------------------------
// Review Focus
// ----------------------------------------------------------------------------

test("Focus 1: a gesture ended by blur, pointercancel, a hidden tab or a second finger ends cleanly", async () => {
    await mountTimeline();
    const endings = {
        blur: () => window.dispatchEvent(new Event("blur")),
        pointercancel: (pointerId) =>
            document.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true })),
        visibilitychange: () => {
            // a tab that comes back does nothing; one that is hidden ends the gesture
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
            document.dispatchEvent(new Event("visibilitychange"));
            expect(moved()).toHaveCount(1, { message: "visible tab" });
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
            document.dispatchEvent(new Event("visibilitychange"));
            delete document.visibilityState;
        },
        "second finger": (pointerId) =>
            document.dispatchEvent(
                new PointerEvent("pointerdown", { pointerId: pointerId + 1, bubbles: true })
            ),
    };
    for (const [name, end] of Object.entries(endings)) {
        let pointerId = 1;
        document.addEventListener("pointerdown", (ev) => (pointerId = ev.pointerId), {
            once: true,
        });
        const review = await pressPill("Review");
        await review.by(2 * partWidth());
        expect(moved()).toHaveCount(1, { message: name });
        end(pointerId);
        await animationFrame();
        expect(moved()).toHaveCount(0, { message: name });
        expect(".o_tl_drop").toHaveCount(0, { message: name });
        expect(".o_tl_selection_badge").toHaveCount(0, { message: name });
        expect(root()).not.toHaveClass("o_tl_dragging");
        expect(root()).not.toHaveClass("o_tl_drag_move");
        // the listeners are gone: moving and releasing now do nothing
        await review.by(3 * partWidth());
        expect(moved()).toHaveCount(0, { message: name });
        await review.drop().catch(() => {});
        await settle();
        expect(log).toHaveLength(0, { message: name });
    }
});

test("Focus 2: a reload during a held move keeps the gesture; the release uses the values read at the press", async () => {
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    // the record changes on the server and the view reloads meanwhile
    const record = MockServer.current.env.pill.find((candidate) => candidate.name === "Review");
    record.date_start = "2026-11-13 07:00:00";
    record.date_stop = "2026-11-13 08:00:00";
    await controller.model.reload();
    await animationFrame();
    expect(moved()).toHaveCount(1);
    expect(".o_tl_drop").toHaveCount(1);
    expect(badgeTexts()).toEqual(["11/13/2026, 1:00 PM", "11/13/2026, 5:00 PM"]);
    await review.drop();
    await settle();
    expect(writes()[0].values).toEqual({
        date_start: "2026-11-13 10:00:00",
        date_stop: "2026-11-13 14:00:00",
    });
});

test("Focus 4 no click after a release, a fast second press included", async () => {
    freezeTime();
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(40);
    await review.by(0);
    await review.drop();
    await animationFrame();
    // a double click straight after the release counts neither as a click nor as a double click
    await dblclick(pillEl("Review"));
    await advanceTime(300);
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(".o_tl_popover").toHaveCount(0);
    // a while later a click is a click again
    await advanceTime(1100);
    await click(pillEl("Review"));
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
});

test("R9 a click on another pill right after a release opens its popover", async () => {
    freezeTime();
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    await review.drop();
    await animationFrame();
    // 20 ms later, a single click on a pill that was not part of the gesture
    await advanceTime(20);
    await click(pillEl("Build"));
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(1);
    expect(".o_tl_popover .o_popover_header").toHaveText("Build");
});

test("R9 a fast double click on another pill right after a release opens the record dialog", async () => {
    freezeTime();
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    await review.drop();
    await animationFrame();
    await advanceTime(20);
    // the pair of clicks begins on a pill that was not part of the gesture: it is a double click
    await dblclick(pillEl("Build"));
    await advanceTime(250);
    await animationFrame();
    expect(".o_dialog .o_form_view").toHaveCount(1);
});

test("R9 a double click that begins with the release click opens neither popover nor dialog", async () => {
    freezeTime();
    await mountTimeline();
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    await review.drop();
    // the click that follows the release is swallowed
    pillEl("Review").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await animationFrame();
    await advanceTime(20);
    // the click after it, within the guard, is the second click of the pair
    pillEl("Review").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    pillEl("Review").dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    await advanceTime(250);
    await animationFrame();
    expect(".o_tl_popover").toHaveCount(0);
    expect(".o_dialog").toHaveCount(0);
});

test("Focus 1 unmounting during a held move leaves no hold class and writes nothing", async () => {
    const view = await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1,
    });
    await animationFrame();
    log.length = 0;
    const review = await pressPill("Review");
    await review.by(2 * partWidth());
    const element = root();
    expect(element).toHaveClass("o_tl_dragging");
    const app = view.__owl__?.app || view.app;
    app.destroy();
    expect(element).not.toHaveClass("o_tl_dragging");
    expect(element).not.toHaveClass("o_tl_drag_move");
    await review.drop().catch(() => {});
    await settle();
    expect(log).toHaveLength(0);
});

/** Collapse the group row `name` by a click on its header. */
async function collapseGroup(name) {
    const row = queryAll(".o_tl_group_row").find(
        (element) => element.querySelector(".o_tl_row_label")?.textContent === name
    );
    await click(row.querySelector(".o_tl_row_header"));
    await advanceTime(1100);
    await animationFrame();
    return row;
}

const groupRow = (name) =>
    queryAll(".o_tl_group_row").find(
        (element) => element.querySelector(".o_tl_row_label")?.textContent === name
    );

for (const mode of ["move", "copy"]) {
    test(`R7 R15 a closed group row opens after the server accepted the ${mode}`, async () => {
        freezeTime();
        await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
        await collapseGroup("Beta");
        expect(groupRow("Beta")).toHaveClass("o_tl_collapsed");
        let release;
        gate = new Promise((resolve) => (release = resolve));
        if (mode === "copy") {
            await keyDown("ctrl");
        }
        const review = await pressPill("Review");
        const rect = queryRect(groupRow("Beta"));
        await review.move(review.start.x + 2 * partWidth(), rect.top + rect.height / 2);
        expect(".o_tl_drop").toHaveCount(1);
        await review.drop();
        if (mode === "copy") {
            await keyUp("ctrl");
        }
        await advanceTime(50);
        await animationFrame();
        // sent, not answered yet: the row is still closed
        expect(log).toHaveLength(1);
        expect(groupRow("Beta")).toHaveClass("o_tl_collapsed");
        release();
        await advanceTime(100);
        await animationFrame();
        expect(groupRow("Beta")).not.toHaveClass("o_tl_collapsed");
    });
}

test("R7 R15 a refused copy leaves the closed group row closed", async () => {
    freezeTime();
    expect.errors(1);
    await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
    await collapseGroup("Beta");
    gate = Promise.resolve();
    gate.refuse = true;
    await keyDown("ctrl");
    const review = await pressPill("Review");
    const rect = queryRect(groupRow("Beta"));
    await review.move(review.start.x + 2 * partWidth(), rect.top + rect.height / 2);
    await review.drop();
    await keyUp("ctrl");
    await advanceTime(100);
    await animationFrame();
    expect(copies()).toHaveLength(1);
    expect(groupRow("Beta")).toHaveClass("o_tl_collapsed");
    expect.verifyErrors(["RPC_ERROR: Access denied"]);
});

// ----------------------------------------------------------------------------
// Date-only fields (R17)
// ----------------------------------------------------------------------------

/** H25: the second model on Month, half-day precision (each day column 52 px wide at this size). */
const H25 = timelineArch(`string="Dated pills" default_range="month" scales="day,week,month" plan="0"`);
const dayWidth = () => queryRect(cellAt("2026-11-12")).width;
const leftOf = (date) => queryRect(cellAt(date)).left;
const badgeRolesOf = () =>
    queryAll(".o_tl_selection_badge").map((badge) =>
        badge.classList.contains("text-danger")
            ? "danger"
            : badge.classList.contains("text-success")
              ? "success"
              : "black"
    );

/** Press "Three days" at the abscissa `x` (on its line) and give the drag helpers. */
async function pressThreeDays(x) {
    const rect = queryRect(pillEl("Three days"));
    return pressPill("Three days", (x - rect.left) / rect.width);
}

test("A58 H10 Three days one day to the left: whole days, dates without time, two dates written", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    const day = dayWidth();
    const three = await pressPill("Three days");
    await three.by(-day);
    expect(badgeTexts()).toEqual(["11/10/2026", "11/12/2026"]);
    expect(badgeRolesOf()).toEqual(["danger", "danger"]);
    expect(near(queryRect(".o_tl_drop").left, leftOf("2026-11-10"))).toBe(true);
    expect(near(queryRect(".o_tl_drop").width, 3 * day)).toBe(true);
    await three.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL["Three days"]],
            values: { date_start: "2026-11-10", date_stop: "2026-11-12" },
        },
    ]);
    // the pill covers the written days (002a D9)
    expect(near(queryRect(pillEl("Three days")).left, leftOf("2026-11-10") + 1)).toBe(true);
    expect(near(queryRect(pillEl("Three days")).width, 3 * day - 2)).toBe(true);
});

test("A59.1 half-day precision: no jump inside Nov 12, the midnight into Nov 13 moves a whole day", async () => {
    await mountTimeline({ arch: H25, resModel: "pill2" });
    const day = dayWidth();
    const origin = queryRect(pillEl("Three days"));
    const three = await pressThreeDays(leftOf("2026-11-12") + 13);
    // past the middle of Nov 12, still inside it
    await three.move(leftOf("2026-11-12") + 45, three.start.y);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    expect(near(queryRect(".o_tl_drop").left, leftOf("2026-11-11"))).toBe(true);
    expect(near(queryRect(".o_tl_pill_moved").left, origin.left - 1)).toBe(true);
    // the midnight into Nov 13
    await three.move(leftOf("2026-11-13") + 2, three.start.y);
    expect(badgeTexts()).toEqual(["11/12/2026", "11/14/2026"]);
    expect(near(queryRect(".o_tl_drop").left, leftOf("2026-11-12"))).toBe(true);
    expect(near(queryRect(".o_tl_pill_moved").left, origin.left - 1 + day)).toBe(true);
    await three.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL["Three days"]],
            values: { date_start: "2026-11-12", date_stop: "2026-11-14" },
        },
    ]);
});

test("A59.2 back across the same midnight writes nothing; on to the left it jumps a day earlier", async () => {
    await mountTimeline({ arch: H25, resModel: "pill2" });
    const first = await pressThreeDays(leftOf("2026-11-12") + 13);
    await first.move(leftOf("2026-11-13") + 2, first.start.y);
    expect(badgeTexts()).toEqual(["11/12/2026", "11/14/2026"]);
    await first.move(leftOf("2026-11-13") - 2, first.start.y);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await first.drop();
    await settle();
    expect(writes()).toHaveLength(0);
    expect(".o_notification").toHaveCount(0);

    const second = await pressThreeDays(leftOf("2026-11-12") + 13);
    // the half day to the left of the press stays inside Nov 12; the midnight before moves
    await second.move(leftOf("2026-11-12") + 2, second.start.y);
    expect(badgeTexts()).toEqual(["11/11/2026", "11/13/2026"]);
    await second.move(leftOf("2026-11-12") - 2, second.start.y);
    expect(badgeTexts()).toEqual(["11/10/2026", "11/12/2026"]);
    await second.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL["Three days"]],
            values: { date_start: "2026-11-10", date_stop: "2026-11-12" },
        },
    ]);
});

test("A71 Ctrl copy one day later on a date-only model: badges without time, the copy gets Nov 12 to Nov 14", async () => {
    await mountTimeline({ arch: H25, resModel: "pill2" });
    await keyDown("ctrl");
    const three = await pressThreeDays(leftOf("2026-11-12") + 13);
    await three.move(leftOf("2026-11-13") + 2, three.start.y);
    expect(root()).toHaveClass("o_tl_drag_copy");
    expect(badgeTexts()).toEqual(["11/12/2026", "11/14/2026"]);
    await three.drop();
    await keyUp("ctrl");
    await settle();
    expect(writes()).toHaveLength(0);
    expect(copies()).toEqual([
        {
            call: "copy",
            ids: [PILL["Three days"]],
            default: { date_start: "2026-11-12", date_stop: "2026-11-14" },
        },
    ]);
});

test("A59.5 Year copy of H25: Next month crossing a month border becomes Jan 7 to Jan 22, 2027", async () => {
    const year = timelineArch(
        `string="Dated pills" default_range="year" scales="day,week,month,year" plan="0"`
    );
    await mountTimeline({ arch: year, resModel: "pill2" });
    const month = queryRect(cellAt("2026-12-01")).width;
    const next = await pressPill("Next month");
    // inside the same month: nothing moves
    await next.by(month / 4);
    expect(badgeTexts()).toEqual(["12/7/2026", "12/22/2026"]);
    await next.by(month);
    expect(badgeTexts()).toEqual(["1/7/2027", "1/22/2027"]);
    expect(near(queryRect(".o_tl_drop").left, leftOf("2027-01-01"))).toBe(true);
    await next.drop();
    await settle();
    expect(writes()).toEqual([
        {
            call: "write",
            ids: [PILL["Next month"]],
            values: { date_start: "2027-01-07", date_stop: "2027-01-22" },
        },
    ]);
});
