// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    arrowBetween,
    assert,
    centreOf,
    finger,
    fingerEvents,
    assertShown,
    buildArrows,
    $$,
    drawing,
    gridReady,
    gridSettled,
    handleCount,
    handleOf,
    holdEvents,
    mouse,
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
function scenarioTour(name, scenario, { writes = 0, pointer = true } = {}) {
    // `writes: null`: the scenario counts the calls itself
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_arrow",
                timeout: 60000,
                async run() {
                    await gridSettled();
                    const written = sentBodies.length;
                    if (pointer) {
                        await pointerOnBuild();
                    }
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

// ---------------------------------------------------------------------------------------------
// R2 and D2 (A11 to A16): an open popover and a press that can start a gesture
// ---------------------------------------------------------------------------------------------

const popoverOpen = () => Boolean($(".o_tl_popover"));
const escape = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const rootHas = (name) => $(".o_timeline_view").classList.contains(name);

/** A click on Build at (1300, 260) with the mouse: its popover is open 400 ms later. */
async function openPopoverWithMouse() {
    await realMouse([...holdEvents(BUILD, []), ...releaseAt(BUILD)], { settle: false });
    await pause(400);
    assert(popoverOpen(), "the popover of Build is open");
}

/** The mouse moves to `from`, the button goes down there and rests 300 ms. */
async function pressAt(from) {
    await realMouse(holdEvents(from, []), { settle: false });
    await pause(300);
}

/** The held pointer goes `distance` px to the left of `from`. */
const leftBy = (from, distance) =>
    realMouse([mouse("mouseMoved", from.x - distance, from.y, { buttons: 1 })], { settle: false });

/** The popover is up at 9 px and the gesture `started` is on at 10 px, which closes it. */
async function checkMouseThreshold(from, started) {
    assert(popoverOpen(), "the popover stays open under the held button");
    await leftBy(from, 9);
    await pause(150);
    assert(popoverOpen(), "the popover stays open at 9 px");
    assert(!started(), "nothing started at 9 px");
    await leftBy(from, 10);
    await until(started, "the gesture starts at 10 px");
    assert(!popoverOpen(), "the popover is gone once the gesture started");
}

/** Escape, then the release where the pointer is: nothing is written. */
async function escapeAndRelease(at) {
    escape();
    await pause(200);
    await realMouse(releaseAt(at), { settle: false });
    await pause(300);
}

scenarioTour("tl_note_a11_popover_and_drawing_handle", async () => {
    await openPopoverWithMouse();
    const from = await reachHandle("Build", "stop", BUILD);
    assert(Math.abs(from.x - 1502) <= 1.5 && Math.abs(from.y - 280) <= 1.5, `the handle, got ${from.x}, ${from.y}`);
    await pressAt(from);
    await checkMouseThreshold(from, () => drawing());
    await escapeAndRelease({ x: from.x - 10, y: from.y });
    assert(!drawing(), "Escape cancelled the drawing");
});

scenarioTour("tl_note_a12_popover_and_resize_handle", async () => {
    await openPopoverWithMouse();
    const from = { x: 1505, y: 260 };
    await moveTo(from);
    await pressAt(from);
    await checkMouseThreshold(from, () => rootHas("o_tl_drag_resize"));
    await escapeAndRelease({ x: from.x - 10, y: from.y });
    assert(!rootHas("o_tl_dragging"), "Escape cancelled the resize");
});

scenarioTour("tl_note_a13_popover_and_body", async () => {
    await openPopoverWithMouse();
    const from = { x: 1200, y: 260 };
    await moveTo(from);
    await pressAt(from);
    await checkMouseThreshold(from, () => rootHas("o_tl_drag_move"));
    await escapeAndRelease({ x: from.x - 10, y: from.y });
    assert(!rootHas("o_tl_dragging"), "Escape cancelled the move");
    // a press and a release without moving is a click: the popover opens
    await pause(600);
    await realMouse([...holdEvents(from, []), ...releaseAt(from)], { settle: false });
    await pause(400);
    assert(popoverOpen(), "the click opens the popover of Build again");
});

/** The outer box of "Build" (its body and the 1 px around it) and its middle height. */
function outerBox() {
    const body = pillNamed("Build").getBoundingClientRect();
    return { L: body.left - 1, R: body.right + 1, T: body.top - 1, B: body.bottom + 1, M: (body.top + body.bottom) / 2 };
}

/** A tap on Build at (L + 368, M): after 600 ms its popover is open and its handles show. */
async function tapBuild(box) {
    await realMouse(fingerEvents({ x: box.L + 368, y: box.M }, []), { touch: true, settle: false });
    await pause(600);
    assert(popoverOpen(), "the popover of the tap is open after 600 ms");
    assert(handleCount() === 2, `the tap shows two handles, got ${handleCount()}`);
}

/** A finger put down at `at` and held 500 ms. */
async function fingerDown(at) {
    await realMouse([finger("touchStart", at.x, at.y)], { touch: true, settle: false });
    await pause(500);
}

const fingerTo = (x, y) => realMouse([finger("touchMove", x, y)], { touch: true, settle: false });
const fingerUp = (x, y) => realMouse([finger("touchEnd", x, y)], { touch: true, settle: false });

// A14: a finger on the drawing handle: popover and Build's two arrows up to 8 px, a drawing at 12 px
scenarioTour("tl_note_a14_touch_drawing_handle", async () => {
    const box = outerBox();
    await tapBuild(box);
    const from = centreOf(handleOf("Build", "stop"));
    assert(Math.abs(from.x - (box.R - 7)) <= 1.5 && Math.abs(from.y - (box.B + 7)) <= 1.5, `end handle, got ${from.x}, ${from.y}`);
    await fingerDown(from);
    assert(popoverOpen(), "the popover stays open under the finger");
    assertShown({ lit: buildArrows(), buttons: 2, handles: 2 }, "finger down on the handle");
    await fingerTo(from.x - 8, from.y);
    await pause(150);
    assert(popoverOpen(), "the popover stays open at 8 px");
    assert(!drawing(), "no drawing at 8 px");
    await fingerTo(from.x - 12, from.y);
    await until(() => drawing(), "the drawing starts by 12 px");
    assert(!popoverOpen(), "the popover is gone");
    // back over Build, lifted there: nothing is written
    const over = centreOf(pillNamed("Build"));
    await fingerTo(over.x, over.y);
    await fingerUp(over.x, over.y);
    await pause(400);
}, { pointer: false });

// A15: a finger on the body: popover up to 8 px, the move at 12 px, Escape before lifting
scenarioTour("tl_note_a15_touch_body", async () => {
    const box = outerBox();
    await tapBuild(box);
    const at = { x: box.L + 267, y: box.M };
    await fingerDown(at);
    assert(popoverOpen(), "the popover stays open under the finger");
    await fingerTo(at.x - 8, at.y);
    await pause(150);
    assert(popoverOpen(), "the popover stays open at 8 px");
    assert(!$(".o_tl_pill_moved"), "no move at 8 px");
    await fingerTo(at.x - 12, at.y);
    await until(() => $(".o_tl_pill_moved"), "the move starts by 12 px");
    assert(!popoverOpen(), "the popover is gone");
    escape();
    await pause(300);
    assert(!$(".o_tl_pill_moved"), "Escape cancelled the move");
    await fingerUp(at.x - 12, at.y);
    await pause(400);
}, { pointer: false });

/**
 * A16 (decision D2): a finger at `x` (from the box) held 500 ms and moved 60 px in 20 steps (toward
 * `sign`) moves Build: open at 8 px, closed once the move starts, no resize, the lifted finger
 * writes the move.
 */
function fingerOnHandlePlace(name, pointOf, sign, { tap }) {
    scenarioTour(
        name,
        async () => {
            const box = outerBox();
            if (tap) {
                await tapBuild(box);
            }
            const at = { x: pointOf(box), y: box.M };
            const mark = sentBodies.length;
            await fingerDown(at);
            if (tap) {
                assert(popoverOpen(), "the popover stays open under the finger");
            }
            // 3 px a step: the first three steps one by one (6 px and 9 px are still no move)
            for (let step = 1; step <= 3; step++) {
                await fingerTo(at.x + sign * 3 * step, at.y);
                if (step === 2 && tap) {
                    assert(popoverOpen(), "the popover is open at 6 px");
                }
            }
            await pause(100);
            assert(!$(".o_tl_pill_moved"), "no move at 9 px");
            if (tap) {
                assert(popoverOpen(), "the popover is open at 9 px");
            }
            const rest = [];
            for (let step = 4; step <= 20; step++) {
                rest.push(finger("touchMove", at.x + sign * 3 * step, at.y));
            }
            await realMouse(rest, { touch: true, settle: false });
            await until(() => $(".o_tl_pill_moved"), "the pill follows the finger");
            assert(rootHas("o_tl_drag_move") && !rootHas("o_tl_drag_resize"), "a move, never a resize");
            assert($$(".o_tl_selection_badge").length === 2, "the badges of the move show");
            assert(!popoverOpen(), "the popover is gone once the move started");
            await fingerUp(at.x + sign * 60, at.y);
            await until(() => callsSince(mark, WRITES).length === 1, "the move is written");
            await gridSettled();
        },
        { writes: null, pointer: false }
    );
}

const PLACES = [
    ["r4", (box) => box.R - 4, -1],
    ["r2", (box) => box.R - 2, -1],
    ["l1", (box) => box.L + 1, 1],
    ["l4", (box) => box.L + 4, 1],
];
for (const [label, pointOf, sign] of PLACES) {
    fingerOnHandlePlace(`tl_note_a16_${label}_after_a_tap`, pointOf, sign, { tap: true });
    fingerOnHandlePlace(`tl_note_a16_${label}_without_a_tap`, pointOf, sign, { tap: false });
}

// A16: with a mouse a press at (R - 4, M) still resizes
scenarioTour("tl_note_a16_mouse_resizes", async () => {
    const body = pillNamed("Build").getBoundingClientRect();
    const from = { x: body.right - 3, y: 260 };
    await moveTo(from);
    await realMouse(holdEvents(from, stepsTo(from, { x: from.x - 60, y: from.y }, 20)), { settle: false });
    await until(() => rootHas("o_tl_drag_resize"), "a resize starts");
    assert(!$(".o_tl_pill_moved"), "no move");
    escape();
    await pause(200);
    await realMouse(releaseAt({ x: from.x - 60, y: from.y }), { settle: false });
    await pause(300);
});
