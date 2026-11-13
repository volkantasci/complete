// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, freezeTime, test } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";

import {
    edgeVelocity,
    MOVE_EDGE,
    SELECT_EDGE,
    TimelineEdgeScroll,
} from "@web_gantt/timeline_edge_scroll";

describe.current.tags("headless");

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
