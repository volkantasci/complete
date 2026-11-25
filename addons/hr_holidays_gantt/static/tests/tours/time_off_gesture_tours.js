// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    assertNear,
    assertNothing,
    bringIntoView,
    cellOfDate,
    centre,
    clean,
    closeDialog,
    colByDate,
    dataSettled,
    mouse,
    noteMark,
    pickRange,
    pillsOf,
    realClick,
    realTap,
    rectOf,
    rowEl,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    step,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";
import {
    closeWithEscape,
    loaded,
    openPopoverOf,
    openToffAct,
    pillOn,
    popover,
    titleOf,
} from "@hr_holidays_gantt/../tests/tours/time_off_popover_tours";
import { errorText, fromList, openManagement } from "@hr_holidays_gantt/../tests/tours/time_off_button_tours";
import { actPill, phoneSearch, toTheWeek } from "@hr_holidays_gantt/../tests/tours/time_off_phone_tours";

/**
 * Tours of the gestures of slice 002e2 (Task 8): the pointer shapes and handles, the moves, the
 * resizes and the copies of the pills To Approve, the lock of the pills at Second Approval and
 * Approved (decision D7), the report view's pills that nothing moves, the time zones of a move and
 * the phone's hold. Real pointer events at the package's points; the records come from
 * `tests/test_gesture_tours.py`, which reads the server after each tour. The clock is Wednesday 11
 * November 2026, so the Week range after one step reads Sunday 15 to Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

const ACT = "Toff Act";
const OTHER = "Toff Other";
const PEER = "Toff Peer";
const ROLE_EMP = "Toff Role Emp";

// the points --------------------------------------------------------------------------------------

/** The width of one day column. */
function dayWidth() {
    return rectOf(colByDate("2026-11-17")).left - rectOf(colByDate("2026-11-16")).left;
}

/** The package's press point: the centre of a one-day pill, else 40 px right of the left edge. */
function pressPoint(pill) {
    const rect = rectOf(pill);
    return {
        x: rect.width / dayWidth() < 1.5 ? rect.left + rect.width / 2 : rect.left + 40,
        y: rect.top + rect.height / 2,
    };
}

const modifiersOf = (keys) => (keys.includes("ctrl") ? 2 : 0);

/** The pointer rests on a point (no button). */
async function hoverAt(point) {
    await send({ events: [mouse("mouseMoved", point.x, point.y, { button: "none", buttons: 0 })] });
    await settle(400);
}

/** A press at `from` and moves with the button down: 30 px first, then to `end`. */
async function holdAndMove(from, end, { keys = [] } = {}) {
    const modifiers = modifiersOf(keys);
    const points = [
        { x: from.x + Math.sign(end.x - from.x || 1) * 30, y: from.y },
        { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 },
        end,
    ];
    await send({
        events: [
            mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0, modifiers }),
            mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1, modifiers }),
            ...points.map((point) => mouse("mouseMoved", point.x, point.y, { buttons: 1, modifiers })),
        ],
    });
    await settle(400);
}

async function releaseAt(point, { keys = [] } = {}) {
    await send({
        events: [mouse("mouseReleased", point.x, point.y, { buttons: 0, clickCount: 1, modifiers: modifiersOf(keys) })],
    });
}

// what the user sees ------------------------------------------------------------------------------

const noticeText = () => clean($(".o_notification .o_notification_content")?.textContent || "");
const undoButton = () => $$(".o_notification button").find((button) => clean(button.textContent) === "Undo");

/** The notification of an accepted move or resize (or copy) with its Undo. */
async function noticeOf(text) {
    await until(() => noticeText().startsWith(text), `the notification "${text}": "${noticeText()}"`, 10000);
    assert(undoButton(), "the notification offers Undo");
    await dataSettled();
    await settle(700);
}

/** The cursor drawn at a point. */
const cursorAt = (point) => getComputedStyle(document.elementFromPoint(point.x, point.y)).cursor;

const shapes = ["default", "auto"];

/**
 * The locked lift while the button is held: the pill raised in place with its lock icon at the
 * right end, the not-allowed pointer, nothing highlighted, no badge, no notification.
 */
function assertLocked(what, pill, at) {
    const raised = $(".o_tl_pill_moved");
    assert(raised, `${what}: the pill is raised`);
    assert($(".o_tl_pill_lock", raised), `${what}: the lock icon shows`);
    assertEqual($$(".o_tl_pill_lock").length, 1, `${what}: one lock icon`);
    assert($(".o_timeline_view.o_tl_drag_lock"), `${what}: the view holds the locked state`);
    assertEqual(cursorAt(at), "not-allowed", `${what}: the pointer`);
    assert(!$(".o_tl_drop"), `${what}: nothing is highlighted`);
    assert(!$(".o_tl_selection_badge"), `${what}: no badge`);
    assert(!$(".o_tl_pill_faded"), `${what}: no faded copy`);
    const origin = rectOf(pill);
    const box = rectOf(raised);
    assertNear(box.left, origin.left - 1, `${what}: the raised pill's left`, 2);
    assertNear(box.top, origin.top - 1, `${what}: the raised pill's top`, 2);
    assert(!$(".o_notification"), `${what}: no notification`);
    assert(!$(".modal"), `${what}: no dialog`);
}

/** Nothing opened or written once the held pill is released. */
async function assertNothingOpened(what, mark) {
    await settle(1000);
    assert(!$(".o_tl_pill_moved"), `${what}: the raised pill is gone`);
    assert(!popover(), `${what}: no popover`);
    assert(!$(".modal"), `${what}: no dialog`);
    assert(!$(".o_notification"), `${what}: no notification`);
    assertEqual(writesSince(mark), [], `${what}: no write`);
}

/** A press, a drag one day to the right and a release on a locked pill (also with Ctrl). */
async function lockedDrag(what, pill, { at = null, keys = [] } = {}) {
    const mark = noteMark();
    await bringIntoView(pill);
    const from = at || pressPoint(pill);
    // one day to the right, or to the left where the grid ends
    const sign = from.x + 2 * dayWidth() > window.innerWidth ? -1 : 1;
    const end = { x: from.x + sign * dayWidth(), y: from.y };
    await holdAndMove(from, end, { keys });
    assertLocked(what, pill, end);
    await releaseAt(end, { keys });
    await assertNothingOpened(what, mark);
}

// A23: pointer shapes and handles ---------------------------------------------------------------------

scenario("hhg_a23_pointers_and_handles", async () => {
    await openToffAct();
    const mark = noteMark();
    const waiting = pillOn(ACT, "2026-11-18");
    await bringIntoView(waiting);
    const rect = rectOf(waiting);
    const y = rect.top + rect.height / 2;
    await hoverAt({ x: rect.left + rect.width / 2, y });
    assertEqual($$(".o_tl_handle").length, 2, "the request To Approve shows two handles");
    const start = rectOf($(".o_tl_handle_start"));
    const stop = rectOf($(".o_tl_handle_stop"));
    assertNear(start.width, 8, "the start handle's width");
    assertNear(start.height, 23, "the start handle's height");
    assertNear(start.left, rect.left, "the start handle lies at the pill's left end", 2);
    assertNear(stop.right, rect.right, "the end handle lies at the pill's right end", 2);
    assertEqual(cursorAt({ x: rect.left + rect.width / 2, y }), "pointer", "the hand at the centre");
    assertEqual(cursorAt({ x: start.left + 4, y }), "w-resize", "the west pointer on the start handle");
    assertEqual(cursorAt({ x: stop.left + 4, y }), "e-resize", "the east pointer on the end handle");
    // Second Approval (19) and Approved (20): the hand, no handle
    for (const day of ["2026-11-19", "2026-11-20"]) {
        const pill = pillOn(ACT, day);
        const box = rectOf(pill);
        await hoverAt({ x: box.left + box.width / 2, y });
        assertEqual($$(".o_tl_handle").length, 0, `${day}: no handle`);
        for (const x of [box.left + 4, box.left + box.width / 2, box.right - 4]) {
            assertEqual(cursorAt({ x, y }), "pointer", `${day}: the hand at ${Math.round(x)}`);
        }
    }
    // an empty cell keeps the default shape (002e D4)
    const cell = rectOf(cellOfDate(ACT, "2026-11-16"));
    assert(shapes.includes(cursorAt({ x: cell.left + 10, y: cell.top + cell.height / 2 })), "the default shape over an empty cell");
    assertEqual(writesSince(mark), [], "no write");
});

// A24: a move, and Undo --------------------------------------------------------------------------------

/** The request To Approve of Monday 16, one day to the right. */
async function moveMonday({ undo = false, keys = [] } = {}) {
    await openToffAct();
    const pill = pillOn(ACT, "2026-11-16");
    assert(pill, "the request To Approve on Monday 16");
    await bringIntoView(pill);
    const from = pressPoint(pill);
    const end = { x: from.x + dayWidth(), y: from.y };
    await holdAndMove(from, end, { keys });
    assert(!$(".o_tl_pill_lock"), "a request To Approve is not locked");
    await releaseAt(end, { keys });
    await noticeOf("Dates changed");
    assert(pillOn(ACT, "2026-11-17"), "the request runs on Tuesday 17");
    assert(!pillOn(ACT, "2026-11-16"), "and no longer on Monday 16");
    if (undo) {
        await realClick(undoButton());
        await until(() => noticeText() === "Change undone", `the result of Undo: "${noticeText()}"`, 10000);
        await dataSettled();
        await settle(700);
        assert(pillOn(ACT, "2026-11-16"), "Undo puts it back on Monday 16");
        assert(!pillOn(ACT, "2026-11-17"), "and off Tuesday 17");
    }
}

scenario("hhg_a24_move", () => moveMonday());
scenario("hhg_a24_move_undo", () => moveMonday({ undo: true }));

// A25: an Approved pill is locked ---------------------------------------------------------------------

scenario("hhg_a25_approved_is_locked", async () => {
    await openToffAct();
    await lockedDrag("A25", pillOn(ACT, "2026-11-18"));
    assert(pillOn(ACT, "2026-11-18"), "the request still lies on Wednesday 18");
});

// A27: a resize, and Undo ------------------------------------------------------------------------------

async function resizeMonday({ undo = false } = {}) {
    await openToffAct();
    const pill = pillOn(ACT, "2026-11-16");
    await bringIntoView(pill);
    const rect = rectOf(pill);
    const y = rect.top + rect.height / 2;
    await hoverAt({ x: rect.left + rect.width / 2, y });
    const handle = rectOf($(".o_tl_handle_stop"));
    const from = { x: handle.left + handle.width / 2, y };
    await holdAndMove(from, { x: from.x + dayWidth(), y });
    await releaseAt({ x: from.x + dayWidth(), y });
    await noticeOf("Dates changed");
    const grown = pillOn(ACT, "2026-11-16");
    assertNear(rectOf(grown).width, 2 * dayWidth(), "the request runs over two days", 3);
    if (undo) {
        await realClick(undoButton());
        await until(() => noticeText() === "Change undone", `the result of Undo: "${noticeText()}"`, 10000);
        await dataSettled();
        await settle(700);
        assertNear(rectOf(pillOn(ACT, "2026-11-16")).width, dayWidth(), "Undo gives back one day", 3);
    }
}

scenario("hhg_a27_resize", () => resizeMonday());
scenario("hhg_a27_resize_undo", () => resizeMonday({ undo: true }));

// A28: an Approved pill has no handles -----------------------------------------------------------------

scenario("hhg_a28_approved_has_no_handles", async () => {
    await openToffAct();
    const pill = pillOn(ACT, "2026-11-18");
    await bringIntoView(pill);
    const rect = rectOf(pill);
    const at = { x: rect.right - 4, y: rect.top + rect.height / 2 };
    await hoverAt(at);
    assertEqual($$(".o_tl_handle").length, 0, "no handle shows");
    assertEqual(cursorAt(at), "pointer", "the pointer is the hand");
    await lockedDrag("A28", pill, { at });
    assert(pillOn(ACT, "2026-11-18"), "the request still runs on 18 November only");
    assertNear(rectOf(pillOn(ACT, "2026-11-18")).width, dayWidth(), "one day wide", 3);
});

// A29, A30: copies --------------------------------------------------------------------------------------

scenario("hhg_a29_copy_refused", async () => {
    await openToffAct();
    const pill = pillOn(ACT, "2026-11-16");
    await bringIntoView(pill);
    const from = pressPoint(pill);
    const end = { x: from.x + 2 * dayWidth(), y: from.y };
    const keys = ["ctrl"];
    await holdAndMove(from, end, { keys });
    await releaseAt(end, { keys });
    const text = await errorText();
    assert(/cannot be duplicated/i.test(text), `the Community's error: "${text}"`);
    await closeDialog();
    await dataSettled();
    await settle(500);
    assertEqual(pillsOf(ACT).length, 2, "the employee still has two requests");
    assert(pillOn(ACT, "2026-11-16"), "the request is where it was");
});

fromList("hhg_a30_copy_refused_request", async () => {
    await openManagement(PEER);
    const pill = pillOn(PEER, "2026-11-19");
    assert(pill, "Toff Peer's Refused request on Thursday 19");
    await bringIntoView(pill);
    const from = pressPoint(pill);
    const end = { x: from.x + dayWidth(), y: from.y };
    const keys = ["ctrl"];
    await holdAndMove(from, end, { keys });
    await releaseAt(end, { keys });
    await noticeOf("Record copied");
    await until(() => pillOn(PEER, "2026-11-20"), "the copy on Friday 20", 10000);
    assert(pillOn(PEER, "2026-11-19"), "the Refused request is where it was");
});

// A68: the empty cells still wait for 002e3 -------------------------------------------------------------

scenario("hhg_a68_empty_cells", async () => {
    await openToffAct();
    const mark = noteMark();
    const cell = cellOfDate(ACT, "2026-11-17");
    const rect = rectOf(cell);
    const point = { x: rect.left + 10, y: rect.top + rect.height / 2 };
    assert(shapes.includes(cursorAt(point)), `the default shape over an empty cell: ${cursorAt(point)}`);
    await realClick(null, { at: point });
    await settle(1000);
    assertNothing("click", mark);
    await realClick(null, { at: point, count: 2 });
    await settle(1000);
    assertNothing("double click", mark);
    // inside the cell: a drag into the next cell would rest on a pill and show its handles
    await holdAndMove(point, { x: point.x + 60, y: point.y });
    assertNothing("press and drag", mark);
    await releaseAt({ x: point.x + 60, y: point.y });
    await settle(800);
    assertNothing("released", mark);
});

// A70: a request cut at the range's end ----------------------------------------------------------------

scenario("hhg_a70_cut_pill", async () => {
    await openToffAct();
    const pill = pillsOf(ACT)[0];
    assert(pill, "the cut pill");
    await bringIntoView(pill);
    const rect = rectOf(pill);
    assertNear(rect.width, 2 * dayWidth(), "the pill covers Friday 20 and Saturday 21", 3);
    const y = rect.top + rect.height / 2;
    await hoverAt({ x: rect.left + 40, y });
    assertEqual($$(".o_tl_handle").length, 1, "one handle shows");
    assert($(".o_tl_handle_start"), "the start handle");
    assertEqual(cursorAt({ x: rect.left + 4, y }), "w-resize", "the west pointer at the start");
    assertEqual(cursorAt({ x: rect.right - 4, y }), "pointer", "the hand at the cut end");
    await lockedDrag("A70", pill);
    await openPopoverOf(pillsOf(ACT)[0]);
    assertEqual(titleOf(), "Toff Act - 3 days", "the popover's title");
});

// A71, A72: half-day and hour requests ------------------------------------------------------------------

async function moveOneDay(day) {
    await openToffAct();
    const pill = pillOn(ACT, day);
    assert(pill, `a request on ${day}`);
    await bringIntoView(pill);
    const from = pressPoint(pill);
    await holdAndMove(from, { x: from.x + dayWidth(), y: from.y });
    await releaseAt({ x: from.x + dayWidth(), y: from.y });
    await noticeOf("Dates changed");
}

scenario("hhg_a71_move_half_day", () => moveOneDay("2026-11-16"));
scenario("hhg_a72_move_hours", () => moveOneDay("2026-11-19"));

// A73: a move onto another request ------------------------------------------------------------------------

scenario("hhg_a73_move_onto_another", async () => {
    await openToffAct();
    const mark = noteMark();
    const pill = pillOn(ACT, "2026-11-16");
    await bringIntoView(pill);
    const from = pressPoint(pill);
    const end = { x: from.x + 2 * dayWidth(), y: from.y };
    await holdAndMove(from, end);
    await releaseAt(end);
    const text = await errorText();
    assert(/overlap/i.test(text), `the Community's error about overlapping requests: "${text}"`);
    await closeDialog();
    await dataSettled();
    await settle(500);
    assert(!$(".o_notification"), "no notification");
    assert(pillOn(ACT, "2026-11-16"), "the request is where it was");
    assertEqual(writesSince(mark).filter((call) => !call.endsWith(".write")), [], "no other write");
});

// A75: another employee's row -----------------------------------------------------------------------------

scenario("hhg_a75_other_row", async () => {
    await pickRange("week");
    await step(1);
    await searchFor("Toff");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify([ACT, OTHER]),
        `the two rows: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
    const pill = pillOn(ACT, "2026-11-16");
    await bringIntoView(pill);
    const from = pressPoint(pill);
    const row = rectOf(rowEl(OTHER));
    const end = { x: from.x, y: row.top + row.height / 2 };
    await holdAndMove(from, end);
    await releaseAt(end);
    await noticeOf("Dates changed");
    assert(pillOn(OTHER, "2026-11-16"), "the request is on Toff Other's row");
    assert(!pillOn(ACT, "2026-11-16"), "and off Toff Act's");
});

// A79: the report view: nothing moves ---------------------------------------------------------------------

scenario("hhg_a79_report_no_move", async () => {
    await pickRange("week");
    await step(1);
    await dataSettled();
    await settle(500);
    for (const day of ["2026-11-18", "2026-11-19"]) {
        const pill = pillOn(ROLE_EMP, day);
        assert(pill, `a request on ${day}`);
        await bringIntoView(pill);
        const rect = rectOf(pill);
        const y = rect.top + rect.height / 2;
        await hoverAt({ x: rect.left + rect.width / 2, y });
        assertEqual($$(".o_tl_handle").length, 0, `${day}: no handle`);
        for (const x of [rect.left + 4, rect.left + rect.width / 2, rect.right - 4]) {
            assertEqual(cursorAt({ x, y }), "pointer", `${day}: the hand`);
        }
        await lockedDrag(`A79 ${day}`, pill);
        assert(pillOn(ROLE_EMP, day), `${day}: the request is where it was`);
    }
    // a short click opens the popover
    const mark = noteMark();
    await openPopoverOf(pillOn(ROLE_EMP, "2026-11-19"));
    assert($(".o_hhg_pop_report"), "the report's popover");
    assertEqual(writesSince(mark), [], "no write");
});

// A86: the pills at Second Approval and Approved are locked for every user --------------------------------

scenario("hhg_a86_locked", async () => {
    await openToffAct();
    const mark = noteMark();
    for (const day of ["2026-11-19", "2026-11-20"]) {
        let pill = pillOn(ACT, day);
        await bringIntoView(pill);
        const rect = rectOf(pill);
        await hoverAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        assertEqual($$(".o_tl_handle").length, 0, `${day}: no handle shows`);
        await lockedDrag(`A86 ${day}`, pill);
        await lockedDrag(`A86 ${day} with Ctrl`, pill, { keys: ["ctrl"] });
        // a click opens the popover; a second click within 200 ms opens the record dialog
        pill = pillOn(ACT, day);
        await openPopoverOf(pill);
        await closeWithEscape();
        pill = pillOn(ACT, day);
        await bringIntoView(pill);
        await realClick(pill, { count: 2 });
        await until(() => $(".modal"), `${day}: two clicks open the record dialog`, 10000);
        await settle(1000);
        assertEqual($$(".modal").length, 1, `${day}: one dialog`);
        assert(!popover(), `${day}: no popover`);
        await closeDialog();
        await settle(500);
    }
    assertEqual(writesSince(mark), [], "no write");
});

// A59: gestures on the phone ------------------------------------------------------------------------------

/** The Week range and "Toff Act" on the phone. */
async function phoneAct() {
    await toTheWeek();
    await phoneSearch(ACT);
}

const finger = (type, x, y) => ({ type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });

scenario("hhg_a59_phone_hold_and_move", async () => {
    await phoneAct();
    assertEqual($$("[class*='o_hhg_split']").length, 0, "no split tool shows");
    const pill = actPill(0);
    await bringIntoView(pill);
    const day = dayWidth();
    // the visible part of the grid is 260 px wide (130 to 390) and a day 192: the finger starts
    // just right of the left edge zone (30 px) so that one day to the right ends before the right
    // one, where the grid would scroll under the held finger (002b2 R14)
    $(".o_tl_renderer").scrollLeft += centre(pill).x - 164;
    await settle(400);
    const from = centre(pill);
    await send({ touch: true, events: [finger("touchStart", from.x, from.y)] });
    // held 300 ms before the finger moves
    await settle(500);
    const steps = [1, 2, 3, 4, 5, 6].map((n) => finger("touchMove", from.x + (day * n) / 6, from.y));
    await send({ touch: true, events: steps });
    await settle(300);
    await send({ touch: true, events: [finger("touchEnd", from.x + day, from.y)] });
    await noticeOf("Dates changed");
    assertEqual($$("[class*='o_hhg_split']").length, 0, "still no split tool");
});

scenario("hhg_a59_phone_tap", async () => {
    await phoneAct();
    const mark = noteMark();
    const pill = actPill(0);
    await bringIntoView(pill);
    await realTap(pill);
    await until(() => loaded() && $(".o_hhg_pop.o_tl_popover_sheet"), "a short tap opens the sheet", 10000);
    assert(!$(".o_notification"), "no notification");
    assertEqual(writesSince(mark), [], "no write");
});
