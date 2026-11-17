// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    arrowBetween,
    assert,
    assertShown,
    buildArrows,
    drawing,
    gridReady,
    gridSettled,
    holdEvents,
    moveTo,
    pillNamed,
    reachHandle,
    realMouse,
    releaseAt,
    REST,
    sentBodies,
    stepsTo,
    until,
} from "./timeline_dependency_tours";

/**
 * Tours of slice 002d's notes on the earlier parts, on 002c's host H42, with real pointer events at
 * the package's points, the browser clock at Thursday 12 November 2026, 09:00 in a zone three hours
 * ahead of UTC. R1 (A1 to A9): what stays lit after a gesture released without a write.
 */

const tours = registry.category("web_tour.tours");

const BUILD = { x: 1300, y: 260 };
const EMPTY = { x: 1300, y: 225 };
const COLUMN_HEADERS = { x: 1300, y: 170 };
const ROW_HEADERS = { x: 100, y: 300 };
const OUTSIDE = { x: 1300, y: 60 };
const TEST = { x: 1500, y: 326 };
const NOTHING = { lit: [], buttons: 0, handles: 0 };

/** The bodies of the calls that write or reload, sent from index `index` on. */
const callsSince = (index, pattern) => sentBodies.slice(index).filter((body) => pattern.test(body));
const WRITES = /"method":\s*"(write|create|unlink|web_gantt_reschedule)"/;
const RELOADS = /"method":\s*"get_gantt_data"/;

const buildToTest = () => arrowBetween("Build", "Test").dataset.arrow;

/** "The pointer on Build": rests at (1300, 260) for 300 ms. */
async function pointerOnBuild() {
    await moveTo(BUILD);
    await new Promise((resolve) => setTimeout(resolve, 300));
}

/** A27's path: to Build's end handle in 4 steps, press, to (1552, 340) in 8 steps, then to `end` in 12. */
async function drawTo(end) {
    const from = await reachHandle("Build", "stop", REST.build);
    const round = { x: from.x + 50, y: from.y + 60 };
    await realMouse(holdEvents(from, [...stepsTo(from, round, 8), ...stepsTo(round, end, 12)]), {
        settle: false,
    });
    await until(() => drawing(), "the line is drawn");
}

/** A move: Build pressed at (1300, 260), moved to `end` in 12 steps, the button held. */
async function moveTo12(end) {
    await realMouse(holdEvents(BUILD, stepsTo(BUILD, end, 12)), { settle: false });
    await until(() => $(".o_tl_pill_moved"), "the pill is held");
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Releases at `end`, reads 400 ms later, then after each of `then`: a list of
 * `{to, expected}` moves of the pointer with what must be shown after them.
 */
async function releaseAndRead(end, atRelease, then = []) {
    await realMouse(releaseAt(end), { settle: false });
    await pause(400);
    assertShown(atRelease, "at the release");
    for (const { to, expected } of then) {
        await moveTo(to);
        await pause(400);
        assertShown(expected, `after a move to (${to.x}, ${to.y})`);
    }
}

/** One scenario: a tour that starts on H42 and runs `scenario`, nothing written unless `writes`. */
function scenarioTour(name, scenario, { writes = 0 } = {}) {
    // `writes: null`: the scenario counts the calls itself
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_arrow",
                async run() {
                    await gridSettled();
                    const written = sentBodies.length;
                    await pointerOnBuild();
                    await scenario();
                    if (writes === null) {
                        return;
                    }
                    assert(
                        callsSince(written, WRITES).length === writes,
                        `${writes} write(s) expected, got ${callsSince(written, WRITES).length}`
                    );
                    if (!writes) {
                        assert(callsSince(written, RELOADS).length === 0, "the view does not reload");
                    }
                },
            },
        ],
    });
}

const right = ({ x, y }) => ({ x: x + 1, y });

// A1: a drawing released on an empty cell: "Build" to "Test" stays lit with its button, no handles;
// after the next move nothing is lit
scenarioTour("tl_note_a1_drawing_on_empty_cell", async () => {
    await drawTo(EMPTY);
    await releaseAndRead(EMPTY, { lit: [buildToTest()], buttons: 1, handles: 0 }, [
        { to: right(EMPTY), expected: NOTHING },
    ]);
});

// A2: released over the column headers
scenarioTour("tl_note_a2_drawing_on_column_headers", async () => {
    await drawTo(COLUMN_HEADERS);
    await releaseAndRead(COLUMN_HEADERS, { lit: [buildToTest()], buttons: 1, handles: 0 }, [
        { to: right(COLUMN_HEADERS), expected: NOTHING },
    ]);
});

// A3: released over the row headers: nothing lit, at the release and after the next move
scenarioTour("tl_note_a3_drawing_on_row_headers", async () => {
    await drawTo(ROW_HEADERS);
    await releaseAndRead(ROW_HEADERS, NOTHING, [{ to: right(ROW_HEADERS), expected: NOTHING }]);
});

// A4: released on its own pill: the arrow stays lit, Build's handles show; after the next move Build's two
scenarioTour("tl_note_a4_drawing_on_own_pill", async () => {
    await drawTo(BUILD);
    await releaseAndRead(BUILD, { lit: [buildToTest()], buttons: 1, handles: 2 }, [
        { to: right(BUILD), expected: { lit: buildArrows(), buttons: 2, handles: 2 } },
    ]);
});

// A5: released on a pill that already has the dependency: one write, the view reloads, nothing lit,
// Test's handles show; after the next move "Build" to "Test" is lit
scenarioTour(
    "tl_note_a5_drawing_on_a_pill_with_the_dependency",
    async () => {
        const mark = sentBodies.length;
        const key = buildToTest();
        await drawTo(TEST);
        await realMouse(releaseAt(TEST), { settle: false });
        await until(() => callsSince(mark, RELOADS).length > 0, "the view reloads");
        await gridSettled();
        await pause(400);
        assertShown({ lit: [], buttons: 0, handles: 2 }, "at the release");
        await moveTo(right(TEST));
        await pause(400);
        assertShown({ lit: [key], buttons: 1, handles: 2 }, "after the next move");
    },
    { writes: 1 }
);

// A6: released outside the view: the arrow stays lit, also after a 1 px move there; the first move
// over the grid works the highlight out again
scenarioTour("tl_note_a6_drawing_outside_the_view", async () => {
    await drawTo(OUTSIDE);
    const lit = { lit: [buildToTest()], buttons: 1, handles: 0 };
    await releaseAndRead(OUTSIDE, lit, [
        { to: right(OUTSIDE), expected: lit },
        { to: EMPTY, expected: NOTHING },
    ]);
});

// A7: a move released outside the view: Build's two arrows stay lit, also after a 1 px move there;
// a move to an empty cell of the grid turns them to rest
scenarioTour("tl_note_a7_move_outside_the_view", async () => {
    await moveTo12(OUTSIDE);
    const lit = { lit: buildArrows(), buttons: 2, handles: 0 };
    await releaseAndRead(OUTSIDE, lit, [
        { to: right(OUTSIDE), expected: lit },
        { to: EMPTY, expected: NOTHING },
    ]);
});

// A8: a move released over the row headers lights nothing, also after the next move
scenarioTour("tl_note_a8_move_on_row_headers", async () => {
    await moveTo12(ROW_HEADERS);
    await releaseAndRead(ROW_HEADERS, NOTHING, [{ to: right(ROW_HEADERS), expected: NOTHING }]);
});

// A8: a move released over the column headers: Build's two arrows stay lit, no handles; none after the next move
scenarioTour("tl_note_a8_move_on_column_headers", async () => {
    await moveTo12(COLUMN_HEADERS);
    await releaseAndRead(COLUMN_HEADERS, { lit: buildArrows(), buttons: 2, handles: 0 }, [
        { to: right(COLUMN_HEADERS), expected: NOTHING },
    ]);
});

// A9: a move to (1340, 260) in 5 steps and back in 5, released: no call, no reload, Build's two
// arrows lit and its handles shown; after the next move Build's two arrows are lit
scenarioTour("tl_note_a9_move_released_where_it_started", async () => {
    const away = { x: BUILD.x + 40, y: BUILD.y };
    await realMouse(holdEvents(BUILD, [...stepsTo(BUILD, away, 5), ...stepsTo(away, BUILD, 5)]), {
        settle: false,
    });
    await until(() => $(".o_tl_pill_moved"), "the pill is held");
    const expected = { lit: buildArrows(), buttons: 2, handles: 2 };
    await releaseAndRead(BUILD, expected, [{ to: right(BUILD), expected }]);
    assert(!$(".o_tl_pill_moved"), "the pill is back");
});

// A9: the right resize handle pressed at (1505, 260), moved to (1440, 260) in 5 steps and back in 5,
// released. The handle lies in the edge zone of a resize (002b2 R14), so Complete's grid may scroll
// under the held pointer. What the tour asserts is what Complete does on this exact path: when the
// grid did not scroll, nothing is called and Build's two arrows stay lit, and the next move onto the
// band of "Build" to "Test" lights that arrow alone; when it did scroll, the pointer back on the
// press pixel is not back on the starting border, so the release is a real resize and is written
// (ruling T1-1, T1-3). The result is logged for the report.
scenarioTour(
    "tl_note_a9_resize_released_where_it_started",
    async () => {
        const mark = sentBodies.length;
        const from = { x: 1505, y: 260 };
        const away = { x: 1440, y: 260 };
        const scroll = () => $(".o_tl_renderer").scrollLeft;
        const before = scroll();
        await moveTo(from);
        await realMouse(holdEvents(from, [...stepsTo(from, away, 5), ...stepsTo(away, from, 5)]), {
            settle: false,
        });
        await until(() => $(".o_tl_pill_resizing"), "the pill is held by its handle");
        const scrolled = scroll() !== before;
        const shown = () => ({
            lit: [...document.querySelectorAll(".o_tl_arrow.o_tl_arrow_lit")].map((a) => a.dataset.arrow).sort(),
            buttons: document.querySelectorAll(".o_tl_arrow_remove").length,
        });
        await realMouse(releaseAt(from), { settle: false });
        await pause(600);
        await gridSettled();
        const writes = callsSince(mark, WRITES).length;
        console.warn(`A9 RESIZE EVIDENCE scrolled=${scrolled} writes=${writes} shift=${scroll() - before}`);
        if (scrolled) {
            assert(writes === 1, `the grid scrolled, so the release is a resize: 1 write, got ${writes}`);
            return;
        }
        assert(writes === 0, "the grid did not scroll: nothing is written");
        assert(callsSince(mark, RELOADS).length === 0, "the view does not reload");
        const both = { lit: buildArrows(), buttons: 2 };
        assert(JSON.stringify(shown()) === JSON.stringify(both), `at the release: ${JSON.stringify(shown())}`);
        const end = Math.round(pillNamed("Build").getBoundingClientRect().right);
        await moveTo({ x: end, y: 260 });
        await pause(400);
        const alone = { lit: [buildToTest()], buttons: 1 };
        assert(JSON.stringify(shown()) === JSON.stringify(alone), `after the next move: ${JSON.stringify(shown())}`);
    },
    { writes: null }
);
