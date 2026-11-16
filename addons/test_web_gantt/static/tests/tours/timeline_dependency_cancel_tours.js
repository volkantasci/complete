// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    assert,
    buildArrows,
    cancelAndRelease,
    drawing,
    gridReady,
    gridSettled,
    holdEvents,
    moveTo,
    reachHandle,
    realMouse,
    REST,
    sentBodies,
    stepsTo,
    until,
    arrowBetween,
} from "./timeline_dependency_tours";

/**
 * Tours of A95 (002c R9): a move, a copy, a resize and a drawing cancelled with Escape keep the
 * arrows lit when the gesture started, with their remove buttons, until the pointer moves; the
 * handles show for the pill under the pointer. Real pointer events at the package's points; the
 * Escape key is sent to the document, as in the tours of A65 and A69.
 */

const tours = registry.category("web_tour.tours");

const BUILD = { x: 1300, y: 260 };
const EMPTY = { x: 1300, y: 225 };
/** Ctrl held (CDP modifier bit 2) makes a move a copy (002b2 R7). */
const CTRL = { modifiers: 2 };

/** A request that writes: a call of `write`, `create` or the rescheduling method. */
const writesSince = (index) =>
    sentBodies
        .slice(index)
        .filter((body) => /"method":\s*"(write|create|unlink|web_gantt_reschedule)"/.test(body));

/** Press at `from`, move through `points`, the button held, with `extra` on every event. */
const holdAt = (from, points, extra = {}) =>
    holdEvents(from, points).map((event) => ({ ...event, ...extra }));

/** A pill gesture of "Build": pressed at `BUILD`, moved 96 px left in 10 steps, then to `then`. */
async function holdBuild({ extra = {}, then = null } = {}) {
    await moveTo(BUILD);
    const end = { x: BUILD.x - 96, y: BUILD.y };
    const path = stepsTo(BUILD, end, 10);
    if (then) {
        path.push(...stepsTo(end, then, 4));
    }
    await realMouse(holdAt(BUILD, path, extra), { settle: false });
    await until(() => $(".o_tl_pill_moved"), "the pill is held");
    return then ?? end;
}

const move = (ended, at, expected, afterMove, written) => async () => {
    await cancelAndRelease({ ended, at, expected, afterMove });
    assert(writesSince(written).length === 0, "nothing is written");
};

for (const [name, then, expectedHandles] of [
    ["timeline_002c_a95_move_on_pill", null, 2],
    ["timeline_002c_a95_move_on_empty_cell", EMPTY, 0],
]) {
    // (a) the pointer ends on "Build" at (1204, 260); (b) it goes on to the empty cell (1300, 225)
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_arrow",
                async run() {
                    await gridSettled();
                    const mine = buildArrows();
                    const written = sentBodies.length;
                    const at = await holdBuild({ then });
                    const expected = { lit: mine, buttons: 2, handles: expectedHandles };
                    // after a move of 1 px: Build's two arrows on the pill, none on the empty cell
                    const afterMove = then ? { lit: [], buttons: 0, handles: 0 } : expected;
                    await move(() => !$(".o_tl_pill_moved"), at, expected, afterMove, written)();
                },
            },
        ],
    });
}

// (c) case (a) with Ctrl held, a copy
tours.add("timeline_002c_a95_copy_on_pill", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                const mine = buildArrows();
                const written = sentBodies.length;
                const at = await holdBuild({ extra: CTRL });
                assert($(".o_tl_pill_moved"), "a copy is held");
                const expected = { lit: mine, buttons: 2, handles: 2 };
                await move(() => !$(".o_tl_pill_moved"), at, expected, expected, written)();
            },
        },
    ],
});

// a resize cancelled with Escape, ending on an empty cell, as (b)
tours.add("timeline_002c_a95_resize_on_empty_cell", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                const mine = buildArrows();
                const written = sentBodies.length;
                const from = { x: 1505, y: 260 };
                await moveTo(from);
                const end = { x: 1409, y: 260 };
                await realMouse(holdEvents(from, [...stepsTo(from, end, 10), ...stepsTo(end, EMPTY, 4)]), {
                    settle: false,
                });
                await until(() => $(".o_tl_pill_resizing"), "the pill is held by its handle");
                const expected = { lit: mine, buttons: 2, handles: 0 };
                const afterMove = { lit: [], buttons: 0, handles: 0 };
                await move(() => !$(".o_tl_pill_resizing"), EMPTY, expected, afterMove, written)();
            },
        },
    ],
});

// (d) a drawing on A27's path cancelled over "Overlap C" or over the empty cell
for (const [name, over] of [
    ["timeline_002c_a95_drawing_on_pill", { x: 1133, y: 442 }],
    ["timeline_002c_a95_drawing_on_empty_cell", EMPTY],
]) {
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_arrow",
                async run() {
                    await gridSettled();
                    const written = sentBodies.length;
                    const from = await reachHandle("Build", "stop", REST.build);
                    const round = { x: from.x + 50, y: from.y + 60 };
                    await realMouse(holdEvents(from, [...stepsTo(from, round, 8), ...stepsTo(round, over, 12)]), {
                        settle: false,
                    });
                    await until(() => drawing(), "the line is drawn");
                    // only "Build" to "Test" is lit (the finger crossed its band before the threshold)
                    const lit = [arrowBetween("Build", "Test").dataset.arrow];
                    const onPill = over === EMPTY ? 0 : 2;
                    const expected = { lit, buttons: 1, handles: onPill };
                    const afterMove = { lit: [], buttons: 0, handles: onPill };
                    await move(() => !drawing(), over, expected, afterMove, written)();
                    assert(!drawing(), "the line is gone");
                },
            },
        ],
    });
}
