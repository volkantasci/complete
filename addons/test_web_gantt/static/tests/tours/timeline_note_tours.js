// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    arrowBetween,
    assert,
    chooseLine,
    clearChoices,
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
    openMethodMenu,
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

/** What the browser kept of the method choice is not left to the next tour. */
async function chooseManualMethod() {
    clearChoices();
    await openMethodMenu();
    await chooseLine("Manual Reschedule");
    // the data is loaded again 500 ms after the choice, and the method applies from then on
    await pause(900);
    await gridSettled();
}

/** Build pressed at (1300, 260), moved to (1340, 260) in 5 steps, back to `back` in 5, released there. */
async function moveAndBack(back) {
    const away = { x: BUILD.x + 40, y: BUILD.y };
    await realMouse(holdEvents(BUILD, [...stepsTo(BUILD, away, 5), ...stepsTo(away, back, 5)]), {
        settle: false,
    });
    await until(() => $(".o_tl_pill_moved"), "the pill is held");
}

// A9, manual method: Build moved to (1340, 260) in 5 steps and back to (1310, 260) in 5 (its
// starting sub-column, 10 px right of the press point), released: no call, no reload, Build's two
// arrows lit and its handles shown; after the next move Build's two arrows are lit. The same when
// it is released exactly at (1300, 260).
scenarioTour(
    "tl_note_a9_move_released_where_it_started",
    async () => {
        await chooseManualMethod();
        try {
            await pointerOnBuild();
            const mark = sentBodies.length;
            const expected = { lit: buildArrows(), buttons: 2, handles: 2 };
            for (const back of [{ x: 1310, y: 260 }, BUILD]) {
                await moveAndBack(back);
                await releaseAndRead(back, expected, [{ to: right(back), expected }]);
                assert(!$(".o_tl_pill_moved"), "the pill is back");
            }
            assert(callsSince(mark, WRITES).length === 0, "no call is sent");
            assert(callsSince(mark, RELOADS).length === 0, "the view does not reload");
        } finally {
            clearChoices();
        }
    },
    { writes: null, pointer: false }
);

// A9, the default method (keep buffer): the same move released at (1310, 260) makes one call of the
// rescheduling method with no value, the success notification with Undo shows, the view reloads and
// no arrow is lit until the pointer moves (002c R16 point 4, A44)
scenarioTour(
    "tl_note_a9_keep_buffer_move_released_where_it_started",
    async () => {
        clearChoices();
        const mark = sentBodies.length;
        await moveAndBack({ x: 1310, y: 260 });
        await realMouse(releaseAt({ x: 1310, y: 260 }), { settle: false });
        await until(() => callsSince(mark, RELOADS).length > 0, "the view reloads");
        await gridSettled();
        await pause(400);
        const calls = callsSince(mark, /"method":\s*"web_gantt_reschedule"/);
        assert(calls.length === 1, `one rescheduling call, got ${calls.length}`);
        assert(/"args":\s*\[\s*\{\s*\}/.test(calls[0]), `no value: ${calls[0]}`);
        assert(
            [...document.querySelectorAll(".o_notification_buttons button")].some(
                (button) => button.textContent.trim() === "Undo"
            ),
            "the success notification with Undo"
        );
        assertShown({ lit: [], buttons: 0, handles: 2 }, "after the reload");
    },
    { writes: 1, pointer: true }
);

// A9, resize: with the pointer on "Review" at (1077, 285), to Review's right resize handle at
// (1121, 285) in 3 steps, pressed, moved to (1060, 285) in 5 steps and back to (1121, 285) in 5,
// released. The handle lies outside the 150 px edge zone: the grid does not scroll (Review keeps its
// place, M47), no call is sent, "Review" to "Overlap A" stays lit with its button and Review's
// handles show (M44); after the next move to (1122, 285), still over Review's body (the band begins
// at x 1125), the same arrow stays lit and the handles show.
scenarioTour(
    "tl_note_a9_resize_released_where_it_started",
    async () => {
        clearChoices();
        const mark = sentBodies.length;
        const from = { x: 1121, y: 285 };
        const away = { x: 1060, y: 285 };
        await moveTo(REST.review);
        await pause(300);
        const before = pillNamed("Review").getBoundingClientRect();
        const scrollBefore = $(".o_tl_renderer").scrollLeft;
        await realMouse(
            stepsTo(REST.review, from, 3).map(({ x, y }) =>
                mouse("mouseMoved", x, y, { button: "none", buttons: 0 })
            ),
            { settle: false }
        );
        await realMouse(holdEvents(from, [...stepsTo(from, away, 5), ...stepsTo(away, from, 5)]), {
            settle: false,
        });
        await until(() => $(".o_tl_pill_resizing"), "the pill is held by its handle");
        await realMouse(releaseAt(from), { settle: false });
        await pause(600);
        await gridSettled();
        const after = pillNamed("Review").getBoundingClientRect();
        assert($(".o_tl_renderer").scrollLeft === scrollBefore, "the grid does not scroll (M47)");
        assert(after.left === before.left && after.width === before.width, "Review stays where it was (M47)");
        assert(callsSince(mark, WRITES).length === 0, "no call is sent");
        assert(callsSince(mark, RELOADS).length === 0, "the view does not reload");
        const reviewToOverlap = arrowBetween("Review", "Overlap A").dataset.arrow;
        const expected = { lit: [reviewToOverlap], buttons: 1, handles: 2 };
        assertShown(expected, "at the release");
        await moveTo({ x: 1122, y: 285 });
        await pause(400);
        assertShown(expected, "after the next move to (1122, 285)");
    },
    { writes: null, pointer: false }
);

// R1a, where the band of an arrow begins (M41 to M43): the pointer moved from (1300, 260) to
// (1506, 260) is over the end of Build's body (both arrows lit, the handles shown); at x 1508, the
// outer box's last column, both stay lit and the handles are gone; from x 1509 the band of
// "Build" to "Test" alone is lit
scenarioTour("tl_note_a9_band_begins_at_the_outer_box", async () => {
    const stop = { x: 1506, y: 260 };
    await realMouse(
        stepsTo(BUILD, stop, 6).map(({ x, y }) => mouse("mouseMoved", x, y, { button: "none", buttons: 0 })),
        { settle: false }
    );
    await pause(400);
    assertShown({ lit: buildArrows(), buttons: 2, handles: 2 }, "at (1506, 260)");
    await moveTo({ x: 1508, y: 260 });
    await pause(400);
    assertShown({ lit: buildArrows(), buttons: 2, handles: 0 }, "at (1508, 260)");
    await moveTo({ x: 1509, y: 260 });
    await pause(400);
    assertShown({ lit: [buildToTest()], buttons: 1, handles: 0 }, "at (1509, 260)");
});

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

// A11, the second path: the handle at (1502, 280) pressed and released without moving (a click on
// the drawing handle): the popover stays open, Build's two arrows stay lit and its handles show
scenarioTour("tl_note_a11_click_on_the_drawing_handle", async () => {
    await openPopoverWithMouse();
    const from = await reachHandle("Build", "stop", BUILD);
    await realMouse([...holdEvents(from, []), ...releaseAt(from)], { settle: false });
    await pause(400);
    assert(popoverOpen(), "the popover stays open");
    assert(!drawing(), "nothing is drawn");
    assertShown({ lit: buildArrows(), buttons: 2, handles: 2 }, "after the click");
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
    // no guard time: the popover is drawn 150 to 750 ms after the click, a check waits up to 1 s
    await until(() => popoverOpen(), "the click opens the popover of Build again", 1000);
});

// A13, the second path: Build pressed at (1300, 260), moved 96 px to the left in 10 steps, Escape,
// the button released, and Build clicked at (1300, 260) 100 ms later: its popover opens at once
scenarioTour("tl_note_a13_click_after_a_cancelled_move", async () => {
    await realMouse(
        holdEvents(BUILD, stepsTo(BUILD, { x: BUILD.x - 96, y: BUILD.y }, 10)),
        { settle: false }
    );
    await until(() => rootHas("o_tl_drag_move"), "the move starts");
    escape();
    await pause(200);
    await realMouse(releaseAt({ x: BUILD.x - 96, y: BUILD.y }), { settle: false });
    await pause(100);
    await realMouse([...holdEvents(BUILD, []), ...releaseAt(BUILD)], { settle: false });
    // no guard time: a check waits up to 1 s (the popover is drawn 150 to 750 ms after the click)
    await until(() => popoverOpen(), "the click opens the popover of Build at once", 1000);
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
    // P2: no arrow is lit after the lift and Build keeps its handles until the next tap
    assertShown({ lit: [], buttons: 0, handles: 2 }, "after the lift over Build");
    assert(handleOwners().every((owner) => owner === idOf("Build")), "the handles are Build's");
    await pause(1500);
    assertShown({ lit: [], buttons: 0, handles: 2 }, "1.5 s after the lift");
    // a tap on the empty cell (1300, 239) hides them
    await realMouse(fingerEvents({ x: 1300, y: 239 }, []), { touch: true, settle: false });
    await pause(600);
    assertShown({ lit: [], buttons: 0, handles: 0 }, "after the tap on the empty cell");
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
 * writes the move (a call; 60 px change no date, 130 px move Build by 12 hours, N2, A16).
 */
function fingerOnHandlePlace(name, pointOf, sign, { tap, distance = 60 }) {
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
                // 3 px a step up to 60 px; a longer path ends at `distance` in the same steps
                const offset = 9 + ((distance - 9) * (step - 3)) / 17;
                rest.push(finger("touchMove", at.x + sign * offset, at.y));
            }
            await realMouse(rest, { touch: true, settle: false });
            await until(() => $(".o_tl_pill_moved"), "the pill follows the finger");
            assert(rootHas("o_tl_drag_move") && !rootHas("o_tl_drag_resize"), "a move, never a resize");
            assert($$(".o_tl_selection_badge").length === 2, "the badges of the move show");
            assert(!popoverOpen(), "the popover is gone once the move started");
            await fingerUp(at.x + sign * distance, at.y);
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

// A16, 130 px: the lift writes the move, 12 hours (the test reads the dates)
for (const [label, pointOf, sign] of [...PLACES, ["r12", (box) => box.R - 12, -1]]) {
    fingerOnHandlePlace(`tl_note_a16_${label}_after_a_tap_far`, pointOf, sign, { tap: true, distance: 130 });
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

// A17: a tap on Build, then a touch move of Build one row down (finger on (L + 368, M), held 600 ms,
// 80 px down in 20 steps, lifted): after the write and the reload Build shows no handles and
// "Review", whose lower strip now covers the tapped place, shows its handles
scenarioTour(
    "tl_note_a17_tap_then_move_one_row_down",
    async () => {
        const box = outerBox();
        await tapBuild(box);
        const at = { x: box.L + 368, y: box.M };
        const mark = sentBodies.length;
        await fingerDown(at);
        await pause(100);
        await realMouse(stepsTo(at, { x: at.x, y: at.y + 80 }, 20).map((point) => finger("touchMove", point.x, point.y)), {
            touch: true,
            settle: false,
        });
        await fingerUp(at.x, at.y + 80);
        await until(() => callsSince(mark, WRITES).length === 1, "the move is written");
        await gridSettled();
        await pause(1000);
        assertShown({ lit: [], buttons: 0, handles: 2 }, "after the reload");
        assert(
            handleOwners().every((owner) => owner === idOf("Review")),
            `the handles are Review's, got ${handleOwners()}`
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

// A23: the first finger stays down, the second lifts: the arrows lit at the start go out at once;
// the first finger's lift writes nothing
scenarioTour(
    "tl_note_a23_second_finger_lifts_first",
    async () => {
        const { end, shown } = await touchDrawingHeld();
        const second = { x: 300, y: end.y };
        await realMouse(twoFingers(end, second), { touch: true, settle: false });
        await pause(300);
        assert(shown.lit.length > 0 && assertShownNow().lit.length > 0, "the arrows stay lit while both are down");
        await realMouse([{ type: "touchEnd", touchPoints: [{ x: end.x, y: end.y, id: 1 }] }], {
            touch: true,
            settle: false,
        });
        await pause(300);
        assertShown({ lit: [], buttons: 0, handles: handleCount() }, "after the second finger lifted");
        await touchEndAll();
        await pause(500);
        assertShown({ lit: [], buttons: 0, handles: handleCount() }, "after both fingers lifted");
    },
    { pointer: false }
);

// A22: a key cancels a touch drawing: Build to Test stays lit while the finger is down, nothing
// is lit after it lifts, also 2 s later
scenarioTour(
    "tl_note_a22_key_cancels_a_touch_drawing",
    async () => {
        const { end } = await touchDrawingHeld();
        pressKey("a");
        await pause(300);
        assert(!drawing(), "the line is gone");
        assertShown({ lit: [buildToTest()], buttons: 1, handles: 2 }, "the finger still down");
        await touchEndAll();
        for (const when of ["at the lift", "2 s later"]) {
            await pause(when === "at the lift" ? 300 : 2000);
            assertShown({ lit: [], buttons: 0, handles: handleCount() }, when);
        }
        assert(end, "the finger was over Overlap C");
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
        // P3: no arrow is lit and Build, the pill last tapped, keeps its handles until the next tap
        await pause(1500);
        assertShown({ lit: [], buttons: 0, handles: 2 }, "after the write");
        assert(handleOwners().every((owner) => owner === idOf("Build")), "the handles are Build's");
        // a tap on the empty cell (1300, 239) hides them
        await realMouse(fingerEvents({ x: 1300, y: 239 }, []), { touch: true, settle: false });
        await pause(600);
        assertShown({ lit: [], buttons: 0, handles: 0 }, "after the tap on the empty cell");
    },
    { writes: 1, pointer: false }
);

// A23, the mouse: a mouse drawing held over Overlap C, a finger put down on the empty cell
// (300, 430) and lifted: the drawing is cancelled as with Escape; the release of the mouse button
// writes nothing and leaves no arrow lit; the finger's lift puts the arrows out and opens nothing
scenarioTour("tl_note_a23_finger_cancels_a_mouse_drawing", async () => {
    await drawTo(OVERLAP_C);
    await realMouse(fingerEvents({ x: 300, y: 430 }, []), { touch: true, settle: false });
    // the finger's lift put the arrows out (the button still held) and opened nothing (R4 point 3)
    await pause(300);
    assert(!drawing(), "the line is gone");
    assertShown({ lit: [], buttons: 0, handles: 2 }, "after the finger's lift");
    nothingElseOpen("after the finger's lift");
    await realMouse(releaseAt(OVERLAP_C), { settle: false });
    await pause(400);
    assertShown({ lit: [], buttons: 0, handles: 2 }, "after the release of the mouse button");
    nothingElseOpen("after the release");
});

// --- F1 (R4 point 3): the finger that cancels a gesture does nothing else ----------------------

const FINGER_AT = {
    cell: { x: 300, y: 430 },
    plan: { x: 1000, y: 220 },
    row_header: { x: 100, y: 430 },
    column_header: { x: 800, y: 194 },
    band: { x: 1300, y: 293 },
};
const fingerDownAt = ({ x, y }) =>
    realMouse([finger("touchStart", x, y)], { touch: true, settle: false });
const fingerLift = () => realMouse([{ type: "touchEnd", touchPoints: [] }], { touch: true, settle: false });
const nothingElseOpen = (when) => {
    assert(!$(".o_dialog"), `no dialog ${when}`);
    assert(!popoverOpen(), `no popover ${when}`);
    assert(!$(".o_tl_selection_badge"), `no selection ${when}`);
};

/** What each gesture is, how it is held and what is lit while it is, and where its button is. */
const HELD_GESTURES = {
    async drawing() {
        await pointerOnBuild();
        await drawTo(OVERLAP_C);
        return { end: OVERLAP_C, expected: buildToTestOnly() };
    },
    async move() {
        await pointerOnBuild();
        const end = { x: BUILD.x - 96, y: BUILD.y };
        await moveTo12(end);
        return { end, expected: { lit: buildArrows(), buttons: 2, handles: 2 } };
    },
    async resize() {
        await moveTo(REST.review);
        await pause(300);
        const from = { x: 1121, y: 285 };
        await realMouse(
            stepsTo(REST.review, from, 3).map(({ x, y }) => mouse("mouseMoved", x, y, { button: "none", buttons: 0 })),
            { settle: false }
        );
        const end = { x: from.x - 61, y: from.y };
        await realMouse(holdEvents(from, stepsTo(from, end, 6)), { settle: false });
        await until(() => rootHas("o_tl_drag_resize"), "the resize starts");
        return {
            end,
            expected: { lit: [arrowBetween("Review", "Overlap A").dataset.arrow], buttons: 1, handles: 2 },
        };
    },
};

for (const [gesture, hold] of Object.entries(HELD_GESTURES)) {
    for (const [place, at] of Object.entries(FINGER_AT)) {
        scenarioTour(
            `tl_note_a23_f1_${gesture}_${place}`,
            async () => {
                for (const order of ["lifted before the release", "lifted after the release"]) {
                    const { end, expected } = await hold();
                    await fingerDownAt(at);
                    await pause(300);
                    assert(!drawing() && !$(".o_tl_pill_moved") && !rootHas("o_tl_drag_resize"), `cancelled (${order})`);
                    assertShown(expected, `the arrows of the start stay lit while the finger is down (${order})`);
                    nothingElseOpen(`at the put-down (${order})`);
                    const gone = { lit: [], buttons: 0, handles: expected.handles };
                    if (order === "lifted before the release") {
                        await fingerLift();
                        await pause(1000);
                        assertShown(gone, "the arrows go out at the finger's lift, the button held");
                        nothingElseOpen("after the lift");
                        await realMouse(releaseAt(end), { settle: false });
                    } else {
                        await realMouse(releaseAt(end), { settle: false });
                        await pause(400);
                        assertShown(expected, "still lit after the release, the finger down");
                        await fingerLift();
                    }
                    await pause(1000);
                    assertShown(gone, `after both ${order}`);
                    nothingElseOpen(`after both (${order})`);
                    // the next round starts clean: a move of the pointer onto Build
                    await moveTo(REST.test);
                    await pause(300);
                }
            },
            { pointer: false }
        );
    }
}

// F1's control: a plain tap on the empty cell, no gesture held, opens the cell's dialog
scenarioTour(
    "tl_note_a23_f1_plain_tap",
    async () => {
        await realMouse(fingerEvents(FINGER_AT.cell, []), { touch: true, settle: false });
        await until(() => $(".o_dialog"), "a tap on the empty cell opens its dialog");
    },
    { pointer: false }
);

// --- R1 point 7, A7 (decision D5): back in the grid by two paths ------------------------------

/** The pointer, no button, from `from` to `to` in `count` steps. */
const walkTo = (from, to, count = 6) =>
    realMouse(
        stepsTo(from, to, count).map(({ x, y }) => mouse("mouseMoved", x, y, { button: "none", buttons: 0 })),
        { settle: false }
    );

/** A7 (a) and (b): the release outside the view, 1 px there, then the path into the grid. */
for (const [name, to] of [
    ["tl_note_a7_straight_down_to_the_empty_cell", EMPTY],
    ["tl_note_a7_slanting_to_the_empty_cell", { x: 700, y: 225 }],
]) {
    scenarioTour(name, async () => {
        await moveTo12(OUTSIDE);
        const lit = { lit: buildArrows(), buttons: 2, handles: 0 };
        await releaseAndRead(OUTSIDE, lit, [{ to: right(OUTSIDE), expected: lit }]);
        // from (1301, 60) in 6 steps; straight down ends at (1300, 225), right above Build
        await walkTo(right(OUTSIDE), to, 6);
        await pause(400);
        assertShown(NOTHING, `both arrows rest at (${to.x}, ${to.y})`);
    });
}

// --- P1 (R1a, A12, M66, M67): a resize cancelled after the grid scrolled, or not ---------------

for (const withPopover of [true, false]) {
    const suffix = withPopover ? "popover" : "no_popover";
    // Build's right handle at (1505, 260) lies in the edge zone: held, the grid scrolls; at Escape
    // the highlight is worked out from what lies under the pointer, Build has moved away: no arrow
    scenarioTour(`tl_note_a12_right_handle_scrolls_${suffix}`, async () => {
        if (withPopover) {
            await openPopoverWithMouse();
        }
        const from = { x: 1505, y: 260 };
        await moveTo(from);
        await pressAt(from);
        const end = { x: from.x - 30, y: from.y };
        await realMouse(
            stepsTo(from, end, 6).map(({ x, y }) => mouse("mouseMoved", x, y, { buttons: 1 })),
            { settle: false }
        );
        await until(() => rootHas("o_tl_drag_resize"), "the resize starts");
        // held in the zone the grid scrolls
        const scroller = $(".o_tl_renderer");
        const before = scroller.scrollLeft;
        await pause(1000);
        assert(scroller.scrollLeft > before, "the grid scrolled");
        escape();
        await pause(400);
        assert(!rootHas("o_tl_dragging"), "Escape cancelled the resize");
        assert(assertShownNow().lit.length === 0, "no arrow lit at Escape");
        await realMouse(releaseAt(end), { settle: false });
        await pause(400);
        assert(assertShownNow().lit.length === 0, "no arrow lit at the release");
        await moveTo({ x: end.x + 1, y: end.y });
        await pause(400);
        assert(assertShownNow().lit.length === 0, "no arrow lit after the next 1 px move");
    });
    // Build's left handle at (938, 260) (here (936, 270), R1A-5) moved 30 px right outside the zone: no scroll, Escape,
    // release: Build's two arrows stay lit with their buttons and its handles (M66), also after a
    // 1 px move over Build (M67)
    scenarioTour(`tl_note_a12_left_handle_no_scroll_${suffix}`, async () => {
        if (withPopover) {
            await openPopoverWithMouse();
        }
        // the package presses at (938, 260); on Complete the lit arrow's remove button of "Design" to
        // "Build" covers that point, so the press is at (936, 270) on the same handle (R1A-5)
        const from = { x: 936, y: 270 };
        await walkTo(BUILD, from, 3);
        await pause(300);
        await pressAt(from);
        const scroller = $(".o_tl_renderer");
        const before = scroller.scrollLeft;
        const end = { x: from.x + 30, y: from.y };
        await realMouse(
            stepsTo(from, end, 6).map(({ x, y }) => mouse("mouseMoved", x, y, { buttons: 1 })),
            { settle: false }
        );
        await until(() => rootHas("o_tl_drag_resize"), "the resize starts");
        await pause(400);
        assert(scroller.scrollLeft === before, "the grid does not scroll");
        escape();
        await pause(300);
        await realMouse(releaseAt(end), { settle: false });
        await pause(400);
        const kept = { lit: buildArrows(), buttons: 2, handles: 2 };
        assertShown(kept, "Build's arrows and handles after Escape and the release (M66)");
        await moveTo({ x: end.x + 1, y: end.y });
        await pause(400);
        assertShown(kept, "the same after a 1 px move over Build (M67)");
    });
}

// --- A13, R2 point 1: a click and a double click at the release spot of a cancelled move -------

const clickEvents = (at, count) => [
    mouse("mouseMoved", at.x, at.y, { button: "none", buttons: 0 }),
    mouse("mousePressed", at.x, at.y, { buttons: 1, clickCount: count }),
    mouse("mouseReleased", at.x, at.y, { buttons: 0, clickCount: count }),
];

/** Build pressed at (1300, 260), moved 96 px left in 10 steps, Escape, released: the spot. */
async function cancelledMoveReleased() {
    const spot = { x: BUILD.x - 96, y: BUILD.y };
    await realMouse(holdEvents(BUILD, stepsTo(BUILD, spot, 10)), { settle: false });
    await until(() => rootHas("o_tl_drag_move"), "the move starts");
    escape();
    await pause(200);
    await realMouse(releaseAt(spot), { settle: false });
    return spot;
}

// the click counts of a script (1) and of a browser, which counts the release's click first (2)
for (const [label, count] of [["counted_from_one", 1], ["counted_by_the_browser", 2]]) {
    scenarioTour(`tl_note_a13_click_at_the_release_spot_${label}`, async () => {
        const spot = await cancelledMoveReleased();
        await realMouse(clickEvents(spot, count), { settle: false });
        // no guard time: a check waits up to 1 s (the popover is drawn 150 to 750 ms after the click)
        await until(() => popoverOpen(), "the click at the release spot opens the popover", 1000);
        assert(!$(".o_dialog"), "no dialog");
    });
}

for (const [label, counts] of [["counted_from_one", [1, 2]], ["counted_by_the_browser", [2, 3]]]) {
    scenarioTour(`tl_note_a13_double_click_at_the_release_spot_${label}`, async () => {
        const spot = await cancelledMoveReleased();
        for (const count of counts) {
            await realMouse(clickEvents(spot, count), { settle: false });
            await pause(60);
        }
        await until(() => $(".o_dialog"), "the double click at the release spot opens the record dialog", 1000);
        await pause(800);
        assert(!popoverOpen(), "no popover beside the dialog");
    });
}
