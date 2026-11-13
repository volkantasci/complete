// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, hover, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    defineWebModels,
    mountView,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    edgeVelocity,
    MOVE_EDGE,
    SELECT_EDGE,
    TimelineEdgeScroll,
} from "@web_gantt/timeline_edge_scroll";

import { HOST_ARCHS, setupTimelineFixtures } from "./timeline_test_helpers";

describe.current.tags("desktop");

const near = (value, expected, slack = 0.1) => Math.abs(value - expected) <= slack;

/** An area of the viewport from (100, 50) to (1100, 650) that scrolls without end. */
function area(options = {}) {
    const state = { x: 0, y: 0, calls: 0, scrolled: 0, limit: Infinity, ...options };
    const edge = new TimelineEdgeScroll({
        edges: () => ({ left: 100, right: 1100, top: 50, bottom: 650 }),
        scrollBy: (dx, dy) => {
            const next = {
                x: Math.max(0, Math.min(state.limit, state.x + dx)),
                y: Math.max(0, Math.min(state.limit, state.y + dy)),
            };
            const done = { dx: next.x - state.x, dy: next.y - state.y };
            Object.assign(state, next);
            return done;
        },
        onScrolled: () => {
            state.scrolled++;
        },
        axes: state.axes || "x",
    });
    return { edge, state };
}

test("edgeVelocity follows v = V (1 - d / Z)", () => {
    expect(near(edgeVelocity(100, SELECT_EDGE), 833.3)).toBe(true);
    expect(near(edgeVelocity(50, SELECT_EDGE), 1666.7)).toBe(true);
    expect(near(edgeVelocity(10, MOVE_EDGE), 416.7)).toBe(true);
    expect(near(edgeVelocity(20, MOVE_EDGE), 208.3)).toBe(true);
    expect(edgeVelocity(0, SELECT_EDGE)).toBe(2500);
    // beyond the edge: the full speed; from the width of the zone on: none
    expect(edgeVelocity(-40, SELECT_EDGE)).toBe(2500);
    expect(edgeVelocity(150, SELECT_EDGE)).toBe(0);
    expect(edgeVelocity(400, SELECT_EDGE)).toBe(0);
    expect(edgeVelocity(30, MOVE_EDGE)).toBe(0);
});

test("A65: a selection held 100 px from the right edge scrolls about 208 px per 250 ms", async () => {
    freezeTime();
    const { edge, state } = area();
    edge.follow(1000, 300, SELECT_EDGE);
    await advanceTime(250);
    edge.stop();
    expect(near(state.x, 208, 12)).toBe(true);
    expect(state.y).toBe(0);
    expect(state.scrolled).toBeGreaterThan(5);
});

test("A65: held 50 px from the right edge it scrolls about 417 px per 250 ms", async () => {
    freezeTime();
    const { edge, state } = area();
    edge.follow(1050, 300, SELECT_EDGE);
    await advanceTime(250);
    edge.stop();
    expect(near(state.x, 417, 20)).toBe(true);
});

test("a move scrolls by its own numbers, to the left as well", async () => {
    freezeTime();
    const { edge, state } = area({ x: 5000 });
    edge.follow(110, 300, MOVE_EDGE);
    await advanceTime(1000);
    edge.stop();
    // 10 px from the left edge: 416.7 px per second towards the start
    expect(near(5000 - state.x, 417, 20)).toBe(true);
    // 40 px from an edge: outside the zone of a move
    const calm = area();
    calm.edge.follow(1060, 300, MOVE_EDGE);
    await advanceTime(500);
    calm.edge.stop();
    expect(calm.state.x).toBe(0);
});

test("a slow speed still scrolls, the fraction of a frame is kept", async () => {
    freezeTime();
    const { edge, state } = area();
    // 29 px from the edge of a move: 625 × (1 / 30) = 20.8 px per second, 0.35 px per frame
    edge.follow(1071, 300, MOVE_EDGE);
    await advanceTime(1000);
    edge.stop();
    expect(near(state.x, 20.8, 1.5)).toBe(true);
});

test("the zone is never wider than half of the area", async () => {
    freezeTime();
    const state = { x: 0 };
    const edge = new TimelineEdgeScroll({
        edges: () => ({ left: 0, right: 200 }),
        scrollBy: (dx) => {
            state.x += dx;
            return { dx, dy: 0 };
        },
        onScrolled: () => {},
    });
    // a zone of 150 px is 100 px here: the middle is outside, 20 px from the edge is inside
    edge.follow(100, 0, SELECT_EDGE);
    await advanceTime(200);
    expect(state.x).toBe(0);
    edge.follow(180, 0, SELECT_EDGE);
    await advanceTime(200);
    edge.stop();
    expect(near(state.x, 2000 * 0.2, 80)).toBe(true);
});

test("it stops at the end of the grid and when it is told to", async () => {
    freezeTime();
    const { edge, state } = area({ limit: 60 });
    edge.follow(1100, 300, SELECT_EDGE);
    await advanceTime(500);
    expect(state.x).toBe(60);
    const calls = state.scrolled;
    await advanceTime(500);
    expect(state.scrolled).toBe(calls);

    const other = area();
    other.edge.follow(1100, 300, SELECT_EDGE);
    await advanceTime(100);
    other.edge.stop();
    const at = other.state.x;
    await advanceTime(200);
    expect(other.state.x).toBe(at);
});

test("the vertical axis scrolls with axes xy, and only then", async () => {
    freezeTime();
    const both = area({ axes: "xy" });
    // 10 px from the bottom edge, in the middle horizontally
    both.edge.follow(600, 640, MOVE_EDGE);
    await advanceTime(1000);
    both.edge.stop();
    expect(near(both.state.y, 417, 20)).toBe(true);
    expect(both.state.x).toBe(0);

    // 10 px from the top edge: up
    const up = area({ axes: "xy", y: 5000 });
    up.edge.follow(600, 60, MOVE_EDGE);
    await advanceTime(1000);
    up.edge.stop();
    expect(near(5000 - up.state.y, 417, 20)).toBe(true);

    // the corner scrolls both ways
    const corner = area({ axes: "xy" });
    corner.edge.follow(1100, 650, MOVE_EDGE);
    await advanceTime(1000);
    corner.edge.stop();
    expect(near(corner.state.x, 625, 25)).toBe(true);
    expect(near(corner.state.y, 625, 25)).toBe(true);

    const flat = area();
    flat.edge.follow(600, 650, MOVE_EDGE);
    await advanceTime(500);
    flat.edge.stop();
    expect(flat.state.y).toBe(0);
});

// ----------------------------------------------------------------------------
// Edge scrolling while a pill is held (R14, A53 to A55), on the mounted view
// ----------------------------------------------------------------------------

describe("while a pill is held", () => {
    setupTimelineFixtures();
    defineWebModels();

    beforeEach(async () => {
        mockTimeZone(3);
        mockDate("2026-11-11 21:30:00");
        patchWithCleanup(localization, { weekStart: 7 });
        await resize({ width: 1600, height: 900 });
    });

    const RECORD_ROW = ".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)";
    const PILL = { Build: 5, Review: 6 };
    const renderer = () => queryOne(".o_tl_renderer");
    const pillEl = (name) =>
        queryOne(`.o_tl_pill[data-pill-id="${PILL[name]}"]:not(.o_tl_pill_moved)`);
    /** Right edge of the scrolling area: the scrollbar is not part of it. */
    const areaRight = () => queryRect(renderer()).left + renderer().clientLeft + renderer().clientWidth;
    const areaBottom = () => queryRect(renderer()).top + renderer().clientTop + renderer().clientHeight;
    const badges = () => queryAll(".o_tl_selection_badge").map((badge) => badge.textContent);

    async function mountTimeline({ arch = HOST_ARCHS.H1, ...rest } = {}) {
        await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
        // the grid shows Thursday 12 in the middle (R39), where the pills are
        await animationFrame();
    }

    /** Press the pill `name` in its middle and move 15 px: the move has begun. */
    async function pressMove(name) {
        const rect = queryRect(pillEl(name));
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const helpers = await drag(pillEl(name), { position: start });
        const move = async (x, y) => {
            await helpers.moveTo(document.elementFromPoint(x, y) || renderer(), {
                position: { x, y },
            });
            await animationFrame();
        };
        await move(start.x + 15, start.y);
        return { ...helpers, start, move };
    }

    /** Press the handle `edge` of `name` and move 15 px: the resize has begun. */
    async function pressResize(name, edge) {
        await hover(pillEl(name));
        await animationFrame();
        const handle = queryOne(`.o_tl_pill[data-pill-id="${PILL[name]}"] .o_tl_handle_${edge}`);
        const rect = queryRect(handle);
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const helpers = await drag(handle, { position: start });
        const move = async (x, y = start.y) => {
            await helpers.moveTo(document.elementFromPoint(x, y) || renderer(), {
                position: { x, y },
            });
            await animationFrame();
        };
        return { ...helpers, start, move };
    }

    /** Hold a moved Review `distance` px from the right edge for 250 ms: what the grid scrolled. */
    async function moveHeld(distance) {
        await mountTimeline();
        const review = await pressMove("Review");
        const before = renderer().scrollLeft;
        freezeTime();
        await review.move(areaRight() - distance, review.start.y);
        await advanceTime(250);
        const scrolled = renderer().scrollLeft - before;
        await review.cancel();
        return scrolled;
    }

    test("A53 a move held 10 px from the right edge scrolls about 104 px per 250 ms", async () => {
        const scrolled = await moveHeld(10);
        expect(scrolled).toBeGreaterThan(92);
        expect(scrolled).toBeLessThan(118);
    });

    test("A53 held 20 px from the edge it scrolls about 52 px per 250 ms", async () => {
        const scrolled = await moveHeld(20);
        expect(scrolled).toBeGreaterThan(42);
        expect(scrolled).toBeLessThan(62);
    });

    test("A53 held 40 px from the edge it does not scroll", async () => {
        expect(await moveHeld(40)).toBe(0);
    });

    test("A53 the target, the highlight and the badges follow the scroll", async () => {
        await mountTimeline();
        const review = await pressMove("Review");
        const x = areaRight() - 5;
        freezeTime();
        await review.move(x, review.start.y);
        const before = {
            badges: badges(),
            moved: queryRect(".o_tl_pill_moved"),
            highlight: queryRect(".o_tl_drop"),
            scroll: renderer().scrollLeft,
        };
        await advanceTime(300);
        await animationFrame();
        expect(renderer().scrollLeft).toBeGreaterThan(before.scroll + 100);
        // the pill stays under the pointer while the grid moves under it
        const moved = queryRect(".o_tl_pill_moved");
        expect(Math.abs(moved.left - before.moved.left)).toBeLessThan(4);
        // the target is another place: the badges and the highlight changed, the highlight is
        // still under the pill
        expect(badges()).not.toEqual(before.badges);
        const highlight = queryRect(".o_tl_drop");
        expect(Math.abs(highlight.left - before.highlight.left)).toBeLessThan(
            before.highlight.width
        );
        expect(Math.abs(highlight.left - moved.left)).toBeLessThan(highlight.width);
        await review.cancel();
    });

    test("A53 the scroll stops at the end of the grid", async () => {
        await mountTimeline();
        const review = await pressMove("Review");
        const element = renderer();
        const max = element.scrollWidth - element.clientWidth;
        element.scrollLeft = max - 60;
        await animationFrame();
        freezeTime();
        await review.move(areaRight() - 2, review.start.y);
        await advanceTime(600);
        const gridRight = queryRect(".o_tl_grid").right;
        const beyond = queryAll(".o_tl_grid *")
            .filter((el) => queryRect(el).right > gridRight + 1 && queryRect(el).width)
            .map((el) => `${el.className} ${queryRect(el).right - gridRight}`);
        expect(beyond).toEqual([]);
        // the end of the grid, give or take the rounding of a sub-pixel
        expect(Math.abs(element.scrollLeft - max)).toBeLessThan(3);
        const reached = element.scrollLeft;
        await advanceTime(300);
        expect(Math.abs(element.scrollLeft - reached)).toBeLessThan(2);
        await review.cancel();
    });

    test("A53 vertical: near the bottom the grid scrolls down, the moved pill stays drawn", async () => {
        await resize({ width: 1600, height: 380 });
        await mountTimeline({ groupBy: ["parent_id"] });
        const element = renderer();
        expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
        const review = await pressMove("Review");
        const before = element.scrollTop;
        const height = element.scrollHeight;
        freezeTime();
        // 10 px from the bottom edge of the scrolling area, horizontally outside the zones
        await review.move(review.start.x, areaBottom() - 10);
        await advanceTime(250);
        const scrolled = element.scrollTop - before;
        expect(scrolled).toBeGreaterThan(92);
        expect(scrolled).toBeLessThan(118);
        // held to the end: the pill's own row is long out of view, the moved pill is still drawn
        await advanceTime(2000);
        expect(element.scrollTop).toBe(element.scrollHeight - element.clientHeight);
        const row = pillEl("Review").closest(".o_tl_row");
        expect(queryRect(row).bottom).toBeLessThan(queryRect(element).top + 200);
        expect(queryAll(".o_tl_pill_moved")).toHaveLength(1);
        // the drag adds nothing to the rows' overflow: the end is the end of the rows
        // (one pixel of rounding of the fractional rows at most)
        expect(Math.abs(element.scrollHeight - height)).toBeLessThan(2);
        const gridBottom = queryRect(".o_tl_grid").bottom;
        const below = queryAll(".o_tl_grid *")
            .filter((el) => queryRect(el).width && queryRect(el).bottom > gridBottom + 1)
            .map((el) => `${el.className} ${queryRect(el).bottom - gridBottom}`);
        expect(below).toEqual([]);
        await review.cancel();
    });

    test("A54 a resize held 100 px from the right edge scrolls about 208 px per 250 ms and the end grows", async () => {
        await mountTimeline();
        const build = await pressResize("Build", "stop");
        freezeTime();
        await build.move(areaRight() - 100);
        const stopBadge = badges()[1];
        const before = {
            scroll: renderer().scrollLeft,
            width: queryRect(".o_tl_pill_resizing").width,
        };
        await advanceTime(250);
        await animationFrame();
        // the stop badge follows the grid scrolling under the pointer
        expect(badges()[1]).not.toBe(stopBadge);
        const scrolled = renderer().scrollLeft - before.scroll;
        expect(scrolled).toBeGreaterThan(190);
        expect(scrolled).toBeLessThan(225);
        await animationFrame();
        // the grid moved left under the pointer: the pill's end is still at the pointer
        const resizing = queryRect(".o_tl_pill_resizing");
        expect(Math.abs(resizing.right - (areaRight() - 100))).toBeLessThan(80);
        // the start goes with the grid, the end stays at the pointer (to a border's precision)
        expect(resizing.width).toBeGreaterThan(before.width + scrolled - 100);
        await build.cancel();
    });

    test("A55 the pointer on the right edge of the row header scrolls left to the start", async () => {
        await mountTimeline({ groupBy: ["parent_id"] });
        const review = await pressMove("Review");
        const element = renderer();
        element.scrollLeft += 300;
        await animationFrame();
        const before = element.scrollLeft;
        const title = queryRect(".o_tl_title_cell");
        freezeTime();
        await review.move(title.right - 2, review.start.y);
        await advanceTime(1000);
        const middle = element.scrollLeft;
        expect(middle).toBeLessThan(before - 400);
        await advanceTime(4000);
        expect(element.scrollLeft).toBe(0);
        await review.cancel();
    });

    test("A55 the row header column does not count: 200 px right of it nothing scrolls", async () => {
        await mountTimeline({ groupBy: ["parent_id"] });
        const review = await pressMove("Review");
        const title = queryRect(".o_tl_title_cell");
        const before = renderer().scrollLeft;
        freezeTime();
        await review.move(title.right + 200, review.start.y);
        await advanceTime(500);
        expect(renderer().scrollLeft).toBe(before);
        await review.cancel();
    });

    test("A54 phone: a resize handle held inside the outer 150 px scrolls the grid", async () => {
        await resize({ width: 390, height: 844 });
        await mountTimeline();
        const element = renderer();
        // bring Build to the middle of the narrow area
        const pill = queryRect(pillEl("Build"));
        const box = queryRect(element);
        element.scrollLeft += pill.left + pill.width / 2 - (box.left + box.right) / 2;
        await animationFrame();
        const build = await pressResize("Build", "stop");
        const before = element.scrollLeft;
        freezeTime();
        await build.move(areaRight() - 100);
        await advanceTime(250);
        expect(element.scrollLeft - before).toBeGreaterThan(150);
        await build.cancel();
    });

    test("a release stops the scrolling", async () => {
        await mountTimeline();
        const review = await pressMove("Review");
        freezeTime();
        await review.move(areaRight() - 5, review.start.y);
        await advanceTime(100);
        await review.cancel();
        const after = renderer().scrollLeft;
        await advanceTime(500);
        expect(renderer().scrollLeft).toBe(after);
    });
    test("R16 a touch press held inside an edge zone without moving does not scroll", async () => {
        freezeTime();
        await resize({ width: 390, height: 844 });
        await mountTimeline();
        await hover(pillEl("Review"));
        await animationFrame();
        const handle = queryOne(".o_tl_pill .o_tl_handle_stop");
        mockTouch(true);
        const rect = queryRect(handle);
        const x = Math.min(rect.left + rect.width / 2, areaRight() - 5);
        const y = rect.top + rect.height / 2;
        const before = renderer().scrollLeft;
        const helpers = await drag(handle, { position: { x, y } });
        await advanceTime(1500);
        await animationFrame();
        expect(renderer().scrollLeft).toBe(before);
        await helpers.cancel();
    });

    /** Whether the held pointer at the abscissa `x` scrolls the grid in half a second. */
    async function scrollsAt(holder, x) {
        const before = renderer().scrollLeft;
        await holder.move(x, holder.start.y);
        await advanceTime(500);
        await animationFrame();
        return renderer().scrollLeft !== before;
    }

    test("R16 phone: a move scrolls inside x 0 to 30 and 360 to 390 only", async () => {
        await resize({ width: 390, height: 844 });
        await mountTimeline();
        const left = queryRect(renderer()).left + renderer().clientLeft;
        const right = areaRight();
        expect(right - left).toBe(390);
        const review = await pressMove("Review");
        freezeTime();
        expect(await scrollsAt(review, right - 35)).toBe(false);
        expect(await scrollsAt(review, right - 25)).toBe(true);
        expect(await scrollsAt(review, left + 35)).toBe(false);
        expect(await scrollsAt(review, left + 25)).toBe(true);
        await review.cancel();
    });

    test("R16 phone: a resize scrolls inside x 0 to 150 and 240 to 390 only", async () => {
        await resize({ width: 390, height: 844 });
        await mountTimeline();
        const element = renderer();
        const box = queryRect(element);
        const pill = queryRect(pillEl("Build"));
        element.scrollLeft += pill.left + pill.width / 2 - (box.left + box.right) / 2;
        await animationFrame();
        const left = box.left + element.clientLeft;
        const right = areaRight();
        const build = await pressResize("Build", "stop");
        freezeTime();
        expect(await scrollsAt(build, right - 160)).toBe(false);
        expect(await scrollsAt(build, right - 140)).toBe(true);
        expect(await scrollsAt(build, left + 160)).toBe(false);
        expect(await scrollsAt(build, left + 140)).toBe(true);
        await build.cancel();
    });

});
