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
    idOf,
    mouse,
    moveTo,
    pillNamed,
    reachHandle,
    realMouse,
    releaseAt,
    REST,
    sentBodies,
    stepsTo,
    strokeOf,
    until,
} from "./timeline_dependency_tours";

/**
 * Tours of slice 002d's notes on the earlier parts, on 002c's host H42, with real pointer events at
 * the package's points, the browser clock at Thursday 12 November 2026, 09:00 in a zone three hours
 * ahead of UTC. R1 (A1 to A9): what stays lit after a gesture released without a write. R4 (A20 to
 * A26): what cancels a gesture.
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

// ---------------------------------------------------------------------------------------------
// R3 (A17, A18): with touch at desktop size the handles follow the pill last tapped
// ---------------------------------------------------------------------------------------------

/** The owners (pill ids) of the drawing handles shown now. */
function handleOwners() {
    return $$(".o_tl_connect_handle").map((handle) => handle.closest(".o_tl_connect").dataset.pillId);
}

const arrows = () => $$(".o_tl_arrow");
const redAtRest =() => strokeOf(arrowBetween("Build", "Overlap C"));

/**
 * A17's state: a tap on Build at (L + 368, M), 600 ms; a finger on (R - 7, B + 7) held 400 ms, to the
 * middle of "Overlap C" in 10 steps, held 400 ms, lifted; the link is written and the view reloads.
 * Returns the outer box of Build.
 */
async function touchDrawingSaved() {
    const box = outerBox();
    await tapBuild(box);
    const from = centreOf(handleOf("Build", "stop"));
    const end = centreOf(pillNamed("Overlap C"));
    const mark = sentBodies.length;
    await realMouse([finger("touchStart", from.x, from.y)], { touch: true, settle: false });
    await pause(400);
    await realMouse(stepsTo(from, end, 10).map((point) => finger("touchMove", point.x, point.y)), {
        touch: true,
        settle: false,
    });
    await pause(400);
    await fingerUp(end.x, end.y);
    await until(() => callsSince(mark, WRITES).length === 1, "the link is written");
    await until(() => arrows().length === 4, "the new arrow");
    return box;
}

/** What A17 sees 1.5 s and 3 s after the lift: no arrow lit, Build's handles, none on Overlap C. */
function assertBuildKeepsItsHandles(when) {
    assertShown({ lit: [], buttons: 0, handles: 2 }, when);
    assert(
        handleOwners().every((owner) => owner === idOf("Build")),
        `the handles are Build's, got ${handleOwners()}`
    );
    assert(!$(`.o_tl_connect[data-pill-id="${idOf("Overlap C")}"]`), "Overlap C shows no handles");
}

scenarioTour(
    "tl_note_a17_after_touch_drawing_saved",
    async () => {
        await touchDrawingSaved();
        await pause(1500);
        assertBuildKeepsItsHandles("1.5 s after the lift");
        assert(redAtRest() === "rgba(211, 65, 59, 0.5)", `the new arrow at rest, got ${redAtRest()}`);
        await pause(1500);
        assertBuildKeepsItsHandles("3 s after the lift");
    },
    { writes: 1, pointer: false }
);

scenarioTour(
    "tl_note_a17_tap_on_an_empty_cell",
    async () => {
        const box = await touchDrawingSaved();
        await pause(1500);
        assertBuildKeepsItsHandles("1.5 s after the lift");
        // the empty cell, 23 px above the box of Build
        await realMouse(fingerEvents({ x: 1300, y: box.T - 23 }, []), { touch: true, settle: false });
        await pause(600);
        assertShown(NOTHING, "after a tap on the empty cell");
    },
    { writes: 1, pointer: false }
);

scenarioTour(
    "tl_note_a17_tap_on_another_pill",
    async () => {
        await touchDrawingSaved();
        await pause(1500);
        await realMouse(fingerEvents(centreOf(pillNamed("Overlap C")), []), { touch: true, settle: false });
        await pause(600);
        assert(popoverOpen(), "the popover of Overlap C is open");
        assertShown({ lit: [], buttons: 0, handles: 2 }, "after a tap on Overlap C");
        assert(
            handleOwners().every((owner) => owner === idOf("Overlap C")),
            `the handles are Overlap C's, got ${handleOwners()}`
        );
    },
    { writes: 1, pointer: false }
);

// A18: no tap before; a finger on Build's body lights its two arrows with their buttons, no
// handles; moved 96 px to the left in 10 steps and lifted, the move is written; after the reload
// nothing is lit and no handles show
scenarioTour(
    "tl_note_a18_touch_move_from_untapped_pill",
    async () => {
        const box = outerBox();
        const at = { x: box.L + 267, y: box.M };
        const mark = sentBodies.length;
        await fingerDown(at);
        assertShown({ lit: buildArrows(), buttons: 2, handles: 0 }, "finger down on the body");
        const path = stepsTo(at, { x: at.x - 96, y: at.y }, 10);
        await realMouse(path.map((point) => finger("touchMove", point.x, point.y)), { touch: true, settle: false });
        await until(() => $(".o_tl_pill_moved"), "the move starts");
        await fingerUp(at.x - 96, at.y);
        await until(() => callsSince(mark, WRITES).length === 1, "the move is written");
        await gridSettled();
        await pause(1500);
        assertShown(NOTHING, "after the reload");
    },
    { writes: 1, pointer: false }
);

// ---------------------------------------------------------------------------------------------
// R4 (A20 to A26): what cancels a gesture
// ---------------------------------------------------------------------------------------------

const OVERLAP_C = { x: 1133, y: 442 };

/** A key put down and lifted by script, as Escape is in the tours above. */
function pressKey(key) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

/** The page marked hidden by script, as the harness cannot hide it; then shown again. */
function hidePage() {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
}

const buildToTestOnly = () => ({ lit: [buildToTest()], buttons: 1, handles: 2 });

/** A cancelled drawing over "Overlap C": the line is gone, the first arrow stays lit, Overlap C's handles. */
async function assertDrawingCancelled() {
    await pause(300);
    assert(!drawing(), "the line is gone");
    assertShown(buildToTestOnly(), "after the cancel");
    assert(
        handleOwners().every((owner) => owner === idOf("Overlap C")),
        `the handles are Overlap C's, got ${handleOwners()}`
    );
}

/** The release where the pointer is writes nothing; after the next move no arrow is lit. */
async function releaseAndMove(at, expected) {
    await realMouse(releaseAt(at), { settle: false });
    await pause(400);
    assertShown(expected, "after the release");
    await moveTo(right(at));
    await pause(400);
    // the pointer is over Overlap C: its handles show, and it has no arrow to light
    assertShown({ lit: [], buttons: 0, handles: 2 }, "after the next move");
}

// A20: the key "a" cancels a drawing as Escape does, and a move
scenarioTour("tl_note_a20_key_cancels_a_drawing", async () => {
    await drawTo(OVERLAP_C);
    pressKey("a");
    await assertDrawingCancelled();
    await releaseAndMove(OVERLAP_C, buildToTestOnly());
});

scenarioTour("tl_note_a20_key_cancels_a_move", async () => {
    const end = { x: 1200, y: 260 };
    await moveTo12(end);
    pressKey("a");
    await pause(300);
    assert(!$(".o_tl_pill_moved"), "the move is cancelled");
    const expected = { lit: buildArrows(), buttons: 2, handles: 2 };
    assertShown(expected, "after the cancel");
    await realMouse(releaseAt(end), { settle: false });
    await pause(400);
    assertShown(expected, "after the release");
    await moveTo(right(end));
    await pause(400);
    assertShown(expected, "after the next move (the pointer is on Build)");
});

// A21: Shift does nothing, the release over Overlap C writes; Control makes a copy, no cancel
scenarioTour(
    "tl_note_a21_shift_does_not_cancel",
    async () => {
        await drawTo(OVERLAP_C);
        pressKey("Shift");
        await pause(200);
        assert(drawing(), "the drawing goes on");
        const mark = sentBodies.length;
        await realMouse(releaseAt(OVERLAP_C), { settle: false });
        await until(() => callsSince(mark, WRITES).length === 1, "the link is written");
        await gridSettled();
    },
    { writes: 1 }
);

scenarioTour("tl_note_a21_control_makes_a_copy", async () => {
    const end = { x: 1200, y: 260 };
    await moveTo12(end);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }));
    await pause(200);
    assert($(".o_tl_pill_moved") && rootHas("o_tl_drag_copy"), "the move became a copy");
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));
    await pause(200);
    assert($(".o_tl_pill_moved") && rootHas("o_tl_drag_move"), "and back to a move, not cancelled");
    escape();
    await pause(200);
    await realMouse(releaseAt(end), { settle: false });
    await pause(300);
});

// A25: the page marked hidden cancels as Escape does
scenarioTour("tl_note_a25_hidden_page_cancels", async () => {
    await drawTo(OVERLAP_C);
    hidePage();
    await assertDrawingCancelled();
    await releaseAndMove(OVERLAP_C, buildToTestOnly());
});

// A26: a window blur sent by script does not cancel: the release writes
scenarioTour(
    "tl_note_a26_lost_focus_does_not_cancel",
    async () => {
        await drawTo(OVERLAP_C);
        window.dispatchEvent(new Event("blur"));
        await pause(300);
        assert(drawing(), "the drawing goes on");
        const mark = sentBodies.length;
        await realMouse(releaseAt(OVERLAP_C), { settle: false });
        await until(() => callsSince(mark, WRITES).length === 1, "the link is written");
        await gridSettled();
    },
    { writes: 1 }
);

// --- touch -------------------------------------------------------------------------------------

/** A tap on Build, then a finger on its end handle drawing to "Overlap C", held 400 ms there. */
async function touchDrawingHeld() {
    const box = outerBox();
    await tapBuild(box);
    const from = centreOf(handleOf("Build", "stop"));
    const end = centreOf(pillNamed("Overlap C"));
    await realMouse([finger("touchStart", from.x, from.y)], { touch: true, settle: false });
    await pause(400);
    await realMouse(stepsTo(from, end, 10).map((point) => finger("touchMove", point.x, point.y)), {
        touch: true,
        settle: false,
    });
    await until(() => drawing(), "the drawing is held");
    await pause(400);
    return { end, shown: assertShownNow() };
}

/** What is lit now: used to compare the state before and after a cancel. */
function assertShownNow() {
    return {
        lit: $$(".o_tl_arrow.o_tl_arrow_lit").map((arrow) => arrow.dataset.arrow).sort(),
        buttons: $$(".o_tl_arrow_remove").length,
    };
}

/** Two fingers: the first at `first`, a second at `second`. */
const twoFingers = (first, second) => [
    {
        type: "touchStart",
        touchPoints: [
            { x: first.x, y: first.y, id: 1 },
            { x: second.x, y: second.y, id: 2 },
        ],
    },
];
const touchEndAll = () => realMouse([{ type: "touchEnd", touchPoints: [] }], { touch: true, settle: false });

// A22: the touch is cancelled (the harness's touch cancel): nothing written, no arrow lit, Build's handles
scenarioTour(
    "tl_note_a22_pointer_cancel",
    async () => {
        await touchDrawingHeld();
        await realMouse([{ type: "touchCancel", touchPoints: [] }], { touch: true, settle: false });
        for (const when of ["at the cancel", "1 s later"]) {
            await pause(when === "at the cancel" ? 300 : 1000);
            assert(!drawing(), `the line is gone ${when}`);
            assertShown({ lit: [], buttons: 0, handles: 2 }, when);
            assert(
                handleOwners().every((owner) => owner === idOf("Build")),
                `Build keeps its handles ${when}, got ${handleOwners()}`
            );
        }
    },
    { pointer: false }
);

// A23: a second finger at (300, the middle of Overlap C), an empty cell of the grid, cancels the
// drawing as Escape does; both fingers lifting writes nothing and lights nothing
scenarioTour(
    "tl_note_a23_second_finger_inside_the_grid",
    async () => {
        const { end, shown } = await touchDrawingHeld();
        const second = { x: 300, y: end.y };
        await realMouse(twoFingers(end, second), { touch: true, settle: false });
        await pause(300);
        assert(!drawing(), "the line is gone");
        assert(
            JSON.stringify(assertShownNow()) === JSON.stringify(shown) && shown.lit.length > 0,
            `the arrows lit at the start stay lit, got ${JSON.stringify(assertShownNow())}`
        );
        await touchEndAll();
        await pause(500);
        assertShown({ lit: [], buttons: 0, handles: handleCount() }, "after both fingers lifted");
    },
    { pointer: false }
);

// A24: a second finger at (300, 600), below the last row, does not cancel; the lift over Overlap C writes
scenarioTour(
    "tl_note_a24_second_finger_outside_the_grid",
    async () => {
        const { end } = await touchDrawingHeld();
        const mark = sentBodies.length;
        await realMouse(twoFingers(end, { x: 300, y: 600 }), { touch: true, settle: false });
        await pause(300);
        assert(drawing(), "the drawing goes on");
        await touchEndAll();
        await until(() => callsSince(mark, WRITES).length === 1, "the link is written");
        await gridSettled();
    },
    { writes: 1, pointer: false }
);
