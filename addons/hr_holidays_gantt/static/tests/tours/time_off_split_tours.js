// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    assertNear,
    bringIntoView,
    clean,
    closeDialog,
    colByDate,
    cellOfDate,
    dataSettled,
    dateColumns,
    facets,
    gantt,
    isGrey,
    labelOf,
    mouse,
    noteMark,
    leaveReady,
    pillsOf,
    pressKey,
    rangeName,
    realClick,
    rectOf,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    step,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";
import { fromList, openManagement } from "@hr_holidays_gantt/../tests/tours/time_off_button_tours";
import { phoneSearch, toTheWeek } from "@hr_holidays_gantt/../tests/tours/time_off_phone_tours";
import { openToffAct, pillOn, popover } from "@hr_holidays_gantt/../tests/tours/time_off_popover_tours";

/**
 * Tours of the split tool of slice 002e2 (Task 9): the tool's drawing and area, a split and its
 * Undo, the places where the tool never shows, a second split, Undo after a deletion, the days of
 * a split Approved request, a pill cut by the range's edge, the right-to-left language, a split
 * the server refuses, a reload after a split. Real pointer events at the package's points (2 px
 * right of the named border at the pill's vertical centre); the records come from
 * `tests/test_split_tours.py`, which reads the server after each tour. The clock is Wednesday 11
 * November 2026, so the Week range after one step reads Sunday 15 to Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

const ACT = "Toff Act";
const FIRST = "2026-11-16";
const SECOND = "2026-11-17";
const THIRD = "2026-11-18";

// the points --------------------------------------------------------------------------------------

const tool = () => $(".o_hhg_split_tool");

/** The x of the border before `day` (the later day of the border), in a left-to-right grid. */
const borderBefore = (day) => rectOf(colByDate(day)).left;

/** The width of one day column. */
const dayWidth = () => rectOf(colByDate(SECOND)).left - rectOf(colByDate(FIRST)).left;

/** The vertical centre of a pill. */
const centreY = (pill) => {
    const rect = rectOf(pill);
    return rect.top + rect.height / 2;
};

/** The pointer rests on a point (no button). */
async function restAt(x, y) {
    await send({ events: [mouse("mouseMoved", x, y, { button: "none", buttons: 0 })] });
    await settle(250);
}

const clickAt = (x, y) => realClick(null, { at: { x, y } });

/** The split point of the package: 2 px right of the named border, at the pill's vertical centre. */
const splitPoint = (pill, day) => ({ x: borderBefore(day) + 2, y: centreY(pill) });

// what the user sees ------------------------------------------------------------------------------

const noticeEl = () => $(".o_notification");
const noticeText = () => clean($(".o_notification .o_notification_content")?.textContent || "");
const undoButton = () =>
    $$(".o_notification button").find((button) => clean(button.textContent) === "Undo");

async function noticeSays(pattern, what, timeout = 10000) {
    await until(() => pattern.test(noticeText()), `${what}: "${noticeText()}"`, timeout);
}

/** The split is done: the reload is drawn, the notification is up. */
async function splitIsDone() {
    await noticeSays(/split in two/i, "the notification of the split");
    await dataSettled();
    await settle(500);
}

/** Opens "Toff Act" on the Week range and rests the pointer at the split point after `day`. */
async function restAtSplit(day = SECOND) {
    await openToffAct(ACT);
    const pill = pillOn(ACT, FIRST);
    assert(pill, "the request of Monday 16");
    const point = splitPoint(pill, day);
    await restAt(point.x, point.y);
    return { pill, point };
}

/** The label "16h" of a row, as hours. */
const hoursOf = (name) => Number(/(\d+(?:\.\d+)?)h/.exec(labelOf(name))?.[1]);

// A40 ---------------------------------------------------------------------------------------------

/**
 * A40's drawing (M57 to M60). `dark`: the colours of the dark scheme. The spec prescribes the
 * literal black line and the black/white scissors with their halos (M58, M59), whatever the scheme.
 */
const a40Body = (dark) => async () => {
    await openToffAct(ACT);
    const pill = pillOn(ACT, FIRST);
    assert(pill, "the request of Monday 16");
    const rect = rectOf(pill);
    const bx = borderBefore(SECOND);
    const mark = noteMark();
    const point = splitPoint(pill, SECOND);
    assert(!tool(), "no tool before the pointer rests there");
    await restAt(point.x, point.y);
    assertEqual($$(".o_hhg_split_tool").length, 1, "one tool shows");
    const box = rectOf(tool());
    // the box lies over the day after the border, at the pill's outer box (M57)
    assertNear(box.left, bx, "the box starts at the border", 1);
    assertNear(box.width, dayWidth(), "the box is one day wide", 1);
    assertNear(box.height, 25, "the box is 25 px tall", 0.5);
    assertNear(box.top, rect.top - 1, "the box starts at the pill's outer top", 1);
    // the dashed line: 2 px, black at 60 %, from 1.5 px before the border to 0.5 px after (M58)
    const line = $(".o_hhg_split_line");
    const style = getComputedStyle(line);
    assertEqual(style.borderLeftStyle, "dashed", "the line is dashed");
    assertEqual(style.borderLeftWidth, "2px", "the line is 2 px");
    assertEqual(style.opacity, "0.6", "the line's opacity");
    assertEqual(style.borderLeftColor, "rgb(0, 0, 0)", "the line is black");
    const lineBox = rectOf(line);
    assertNear(lineBox.left, bx - 1.5, "the line starts 1.5 px before the border", 0.8);
    assertNear(lineBox.top, box.top + 2, "the line starts 2 px under the box's top", 0.8);
    assertNear(lineBox.height, 21.75, "the line is 87 % of the box", 0.8);
    // the scissors: a quarter turn, 15 x 17.5, centre 1.3 px before the border (M59)
    const scissors = $(".o_hhg_split_scissors");
    const cut = rectOf(scissors);
    assertNear(cut.width, 15, "the scissors' width", 1);
    assertNear(cut.height, 17.5, "the scissors' height", 1);
    assertNear(cut.left + cut.width / 2, bx - 1.3, "the scissors' centre", 1);
    assertNear(cut.top, box.top + 25 + 4.3, "the scissors lie under the pill", 1.2);
    const scissorsStyle = getComputedStyle(scissors);
    const [ink, halo] = dark ? ["rgb(255, 255, 255)", "rgb(0, 0, 0)"] : ["rgb(0, 0, 0)", "rgb(255, 255, 255)"];
    assertEqual(scissorsStyle.color, ink, "the scissors' colour");
    assert(scissorsStyle.textShadow.includes(halo), `with a ${halo} halo: ${scissorsStyle.textShadow}`);
    // the glyph is drawn (its icon text is there, the box is not empty) and turned a quarter
    const glyph = getComputedStyle(scissors, "::before").content;
    assert(glyph && glyph !== "none" && glyph !== "normal" && glyph !== '""', `the glyph is drawn: ${glyph}`);
    assert(scissors.getAttribute("data-icon") && cut.width > 10 && cut.height > 10, "the glyph box is not empty");
    const turn = new DOMMatrix(scissorsStyle.transform);
    assertNear(Math.abs(turn.b), 1, "the scissors are turned a quarter", 0.01);
    assertNear(turn.a, 0, "a quarter turn, not a flip", 0.01);
    // the dashed line over the pill's colour: black at 60 % (dark olive on the yellow)
    const [r, g, b] = getComputedStyle(pill).backgroundColor.match(/\d+/g).map(Number);
    const drawn = [r, g, b].map((v) => Math.round(v * 0.4));
    const wanted = dark ? [95, 83, 41] : [96, 86, 48];
    assert(drawn.every((v, i) => Math.abs(v - wanted[i]) <= 4), `the line over the pill reads ${drawn}, wanted about ${wanted}`);
    // the pointer keeps the hand (M60) and the tool takes no pointer event of its own
    const under = document.elementFromPoint(point.x, point.y);
    assertEqual(getComputedStyle(under).cursor, "pointer", "the pointer is the hand");
    assert(pill.contains(under), "the pill lies under the pointer, not the tool");
    assertEqual(writesSince(mark), [], "no write");
};

scenario("hhg_a40_split_tool", a40Body(false));
scenario("hhg_a40_split_tool_dark", a40Body(true));

// A41, A42 ----------------------------------------------------------------------------------------

async function splitAndCheck() {
    const { point } = await restAtSplit();
    await clickAt(point.x, point.y);
    await splitIsDone();
    assert(!popover(), "no popover opens");
    assertEqual(pillsOf(ACT).length, 2, "two pills");
    assert(pillOn(ACT, FIRST), "the first part lies on Monday 16");
    assert(pillOn(ACT, SECOND), "the second part starts on Tuesday 17");
    assert(undoButton(), "the notification offers Undo");
    assertEqual($$(".o_notification").length, 1, "one notification");
}

scenario("hhg_a41_split", splitAndCheck);

scenario("hhg_a42_split_undo", async () => {
    await splitAndCheck();
    await realClick(undoButton());
    await noticeSays(/one request again/i, "the notification of Undo");
    await dataSettled();
    await settle(500);
    assertEqual(pillsOf(ACT).length, 1, "one pill again");
    assert(pillOn(ACT, FIRST), "it starts on Monday 16");
    assertNear(rectOf(pillsOf(ACT)[0]).width, 3 * dayWidth(), "and covers three days", 3);
    assertEqual($$(".o_notification").length, 1, "one notification");
    assert(!undoButton(), "no Undo on the result");
});

// A43: the area ------------------------------------------------------------------------------------

scenario("hhg_a43_split_area", async () => {
    await openToffAct(ACT);
    const pill = pillOn(ACT, FIRST);
    const bx = borderBefore(SECOND);
    const y = centreY(pill);
    const mark = noteMark();
    const shown = [];
    // 1 px steps from 14 px left to 14 px right of the border (the offset keeps the edges of the
    // 16 px area away from a step)
    for (let k = 0; k <= 28; k++) {
        const x = bx - 14 + 0.012 + k;
        await restAt(x, y);
        if (tool()) {
            shown.push(k);
        }
    }
    assertEqual(shown, Array.from({ length: 16 }, (_, i) => i + 6), "the tool shows from 8 px left to 8 px right");
    // the pill's whole 25 px box, its 1 px inset included (R16): from the box's top edge to 0.5 px
    // above its bottom edge; 1 px inside either edge shows, 2 px out does not
    const rect = rectOf(pill);
    const boxTop = rect.top - 1;
    const boxBottom = rect.bottom + 1;
    const x = bx + 3;
    const rows = [
        [boxTop - 2, false],
        [boxTop, true],
        [boxTop + 1, true],
        [centreY(pill), true],
        [boxBottom - 1, true],
        [boxBottom + 2, false],
    ];
    for (const [yy, wanted] of rows) {
        await restAt(x, yy);
        assertEqual(Boolean(tool()), wanted, `the tool at ${Math.round(yy)} (box ${Math.round(boxTop)} to ${Math.round(boxBottom)})`);
    }
    assertEqual(writesSince(mark), [], "no write");
});

// A44: where the tool never shows -----------------------------------------------------------------

/** A click on the pill opens its popover, and no split call was made. */
async function clickOpensPopover(point, what) {
    await clickAt(point.x, point.y);
    await until(() => popover() && $(".o_hhg_pop_title")?.textContent, `${what}: the popover opens`, 8000);
    await settle(300);
    assert(!$(".o_notification"), `${what}: no notification`);
    await pressKey("Escape");
    await until(() => !popover(), `${what}: Escape closes the popover`);
}

scenario("hhg_a44_edges_and_one_day", async () => {
    await openToffAct(ACT);
    const mark = noteMark();
    const pill = pillOn(ACT, FIRST);
    const y = centreY(pill);
    // the first edge: Monday 16's left border
    const left = { x: borderBefore(FIRST) + 2, y };
    await restAt(left.x, left.y);
    assert(!tool(), "no tool at the pill's first edge");
    await clickOpensPopover(left, "first edge");
    // the last edge: Wednesday 18's right border
    const right = { x: rectOf(colByDate(THIRD)).right - 2, y };
    await restAt(right.x, right.y);
    assert(!tool(), "no tool at the pill's last edge");
    await clickOpensPopover(right, "last edge");
    // a one-day pill: Friday 20
    const one = pillOn(ACT, "2026-11-20");
    assert(one, "the one-day request of Friday 20");
    for (const x of [rectOf(one).left + 2, rectOf(one).left + rectOf(one).width / 2, rectOf(one).right - 2]) {
        await restAt(x, centreY(one));
        assert(!tool(), `no tool on a one-day pill at ${Math.round(x)}`);
    }
    await clickOpensPopover({ x: rectOf(one).left + rectOf(one).width / 2, y: centreY(one) }, "one day");
    assertEqual(writesSince(mark), [], "no write");
});

/** The role user sees no tool: the split point of the request of 16 to 18 shows nothing. */
async function noToolFor(what, { management = false } = {}) {
    const name = what;
    const mark = noteMark();
    const pill = pillOn(name, FIRST);
    assert(pill, `${name}'s request of Monday 16`);
    const point = splitPoint(pill, SECOND);
    await restAt(point.x, point.y);
    assert(!tool(), `${what}: no tool`);
    await clickOpensPopover(point, what);
    assertEqual(writesSince(mark), [], "no write");
    return management;
}

fromList("hhg_a44_role_emp", async () => {
    await openManagement("Toff Role Emp");
    await noToolFor("Toff Role Emp", { management: true });
});

fromList("hhg_a44_role_approver", async () => {
    await openManagement("Toff Peer");
    await noToolFor("Toff Peer", { management: true });
});

scenario("hhg_a44_report_for_officer", async () => {
    await pickRangeWeek();
    await searchFor("Toff Role Officer");
    await until(() => JSON.stringify(rowNames()) === JSON.stringify(["Toff Role Officer"]), `one row: ${rowNames()}`, 8000);
    await dataSettled();
    await settle(500);
    await noToolFor("Toff Role Officer");
});

scenario("hhg_a44_phone", async () => {
    // a window of the phone's size and a mouse: the tool never shows on the small screen, and a
    // click at the border opens the bottom sheet
    await toTheWeek();
    await phoneSearch(ACT);
    const pill = pillOn(ACT, FIRST);
    assert(pill, "the request of Monday 16");
    await bringIntoView(pill);
    const point = splitPoint(pill, SECOND);
    await restAt(point.x, point.y);
    assert(!tool(), "no tool on the phone");
    await realClick(pill);
    await until(() => popover(), "the sheet opens", 8000);
    assert(!$(".o_notification"), "no notification");
});

async function pickRangeWeek() {
    $(".o_tl_range_button").click();
    const item = await until(() => $(".o_tl_range_menu .o_tl_range_week"), "the week item");
    item.click();
    await settle(800);
    await step(1);
    await dataSettled();
}

// A45: a split closes the popover, a second split replaces the notification ------------------------

scenario("hhg_a45_split_twice", async () => {
    await openToffAct(ACT);
    const pill = pillOn(ACT, FIRST);
    // the popover is open (clicked 40 px right of the pill's left edge)
    const rect = rectOf(pill);
    await clickAt(rect.left + 40, centreY(pill));
    await until(() => popover() && $(".o_hhg_pop_title")?.textContent, "the popover opens", 8000);
    await settle(400);
    const point = splitPoint(pill, SECOND);
    await restAt(point.x, point.y);
    assert(tool(), "the tool shows while the popover is open");
    await clickAt(point.x, point.y);
    await splitIsDone();
    assert(!popover(), "the popover closes");
    assertEqual(pillsOf(ACT).length, 2, "two pills");
    // the second part (17 to 18) at the border between Tuesday 17 and Wednesday 18
    const second = pillOn(ACT, SECOND);
    const next = splitPoint(second, THIRD);
    const first = noticeEl();
    await restAt(next.x, next.y);
    assert(tool(), "the tool shows on the second part");
    await clickAt(next.x, next.y);
    await until(() => noticeEl() && noticeEl() !== first, "the second notification replaces the first", 10000);
    await splitIsDone();
    assertEqual($$(".o_notification").length, 1, "one notification");
    assertEqual(pillsOf(ACT).length, 3, "three pills");
});

// A46: Undo after the first part was deleted -----------------------------------------------------

/** The notification waits for the tour (test only): the pointer's enter, with the leave swallowed. */
function holdNotice() {
    const el = noticeEl();
    assert(el, "the notification to hold");
    el.addEventListener("mouseleave", (event) => event.stopImmediatePropagation(), true);
    el.dispatchEvent(new MouseEvent("mouseenter"));
}

/** A point inside the first day of a pill, away from its borders. */
const insideFirstDay = (pill) => ({ x: rectOf(pill).left + dayWidth() / 2, y: centreY(pill) });

/** The popover's Delete, by real clicks: open the part's popover, press Delete, the view reloads. */
async function deleteByPopover(pill) {
    const at = insideFirstDay(pill);
    await clickAt(at.x, at.y);
    await until(() => popover() && $(".o_hhg_pop_title")?.textContent && $(".o_hhg_pop .o_form_view"), "the popover loads", 8000);
    await settle(500);
    await realClick($(".o_hhg_pop_delete"));
    await until(() => !popover(), "the popover closes", 10000);
    await dataSettled();
    await settle(600);
}

scenario("hhg_a46_undo_after_delete", async () => {
    const { point } = await restAtSplit();
    await clickAt(point.x, point.y);
    await splitIsDone();
    holdNotice();
    await deleteByPopover(pillOn(ACT, FIRST));
    assert(!pillOn(ACT, FIRST), "the first part is gone");
    assert(undoButton(), "the split's notification is still open");
    await realClick(undoButton());
    await until(
        () => $(".o_notification.o_tl_notification_danger") && /could not be undone/i.test(noticeText()),
        `the danger notification: "${noticeText()}"`,
        10000
    );
    await dataSettled();
    assertEqual($$(".o_notification").length, 1, "one notification");
    assert(pillOn(ACT, SECOND), "the second part still shows");
});

/** The ids of the requests of `name` that start on `day`, by a call as the administrator. */
async function leaveIdsOf(name, day) {
    const rows = await rpc("/web/dataset/call_kw/hr.leave/search_read", {
        model: "hr.leave",
        method: "search_read",
        args: [[["employee_id.name", "=", name], ["request_date_from", "=", day]]],
        kwargs: { fields: ["id"], context: { active_test: false } },
    });
    assertEqual(rows.length, 1, `one request of ${name} from ${day}`);
    return rows.map((row) => row.id);
}

// A47: the days of a split Approved request -----------------------------------------------------

scenario("hhg_a47_split_days", async () => {
    const { point } = await restAtSplit();
    await clickAt(point.x, point.y);
    await splitIsDone();
    holdNotice();
    for (const day of [FIRST, SECOND, THIRD]) {
        assert(isGrey(cellOfDate(ACT, day)), `${day} stays greyed`);
    }
    assertEqual(hoursOf(ACT), 16, "the label stays 16h");
    // the second part's Delete frees its days alone
    await deleteByPopover(pillOn(ACT, SECOND));
    await until(() => hoursOf(ACT) === 32, `the label reads 32h: ${labelOf(ACT)}`);
    assert(isGrey(cellOfDate(ACT, FIRST)), "Monday 16 stays greyed");
    assert(!isGrey(cellOfDate(ACT, SECOND)), "Tuesday 17 is free");
    assert(!isGrey(cellOfDate(ACT, THIRD)), "Wednesday 18 is free");
});

/** The attendance management view: the label of "Toff Act" for the week of 15 to 21 November. */
async function attendanceLabel(wanted) {
    $(".o_tl_range_button").click();
    const item = await until(() => $(".o_tl_range_menu .o_tl_range_week"), "the week item");
    item.click();
    await settle(800);
    await step(1);
    await searchFor(ACT);
    await until(() => rowNames().includes(ACT), `the row of ${ACT}: ${rowNames()}`, 8000);
    await dataSettled();
    await settle(500);
    await until(() => labelOf(ACT) === wanted, `the label reads ${wanted}: "${labelOf(ACT)}"`, 10000);
}

scenario("hhg_a47_attendance_16", () => attendanceLabel("0h / 16h"));
scenario("hhg_a47_attendance_32", () => attendanceLabel("0h / 32h"));

// A70: the split tool at the range's edge ---------------------------------------------------------

scenario("hhg_a70_split_tool_at_the_edge", async () => {
    await openToffAct(ACT);
    const pill = pillOn(ACT, "2026-11-20");
    assert(pill, "the pill that starts on Friday 20");
    const bx = borderBefore("2026-11-21");
    const y = centreY(pill);
    const mark = noteMark();
    // from 8 px left to 8 px right of the border between Friday 20 and Saturday 21
    for (const [dx, wanted] of [[-9, false], [-7.9, true], [0, true], [7.9, true], [9, false]]) {
        await restAt(bx + dx, y);
        assertEqual(Boolean(tool()), wanted, `the tool ${dx} px from the border at ${Math.round(bx)}`);
    }
    // the pill's cut end (the grid's right edge) takes none
    await restAt(rectOf(pill).right - 3, y);
    assert(!tool(), "no tool at the cut end");
    assertEqual(writesSince(mark), [], "no write");
});

// A76: right to left -------------------------------------------------------------------------------

/** The search of the view without the English texts of the autocomplete (the language is Arabic). */
async function searchByEnter(text) {
    const input = await until(() => $(".o_searchview_input"), "the search input");
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const item = await until(() => $(".o_searchview_autocomplete .o-dropdown-item"), "an autocomplete entry");
    const requested = gantt.requests;
    item.click();
    await until(() => facets().some((facet) => facet.includes(text)), `the facet of "${text}"`);
    await until(() => gantt.requests > requested, `the data of the search "${text}"`);
    await dataSettled();
}

scenario("hhg_a76_split_tool_rtl", async () => {
    assertEqual(getComputedStyle(document.body).direction, "rtl", "the page runs from right to left");
    $(".o_tl_range_button").click();
    const item = await until(() => $(".o_tl_range_menu .o_tl_range_week"), "the week item");
    item.click();
    await settle(900);
    await step(1);
    await searchByEnter(ACT);
    await until(() => rowNames().includes(ACT), `the row of ${ACT}: ${rowNames()}`, 8000);
    await dataSettled();
    await settle(600);
    const first = rectOf(colByDate(FIRST));
    const second = rectOf(colByDate(SECOND));
    assert(first.left > second.left, "Monday 16 lies to the right of Tuesday 17");
    const pill = $$(".o_tl_pill", $$(".o_tl_row:not(.o_tl_total_row)").find((row) => row.textContent.includes(ACT)))[0];
    assert(pill, "the pill");
    const y = centreY(pill);
    const bx = first.left;
    const mark = noteMark();
    // 7.6 px left of the border between Monday 16 and Tuesday 17 (Monday's left edge)
    await restAt(bx - 7.6, y);
    assert(tool(), "the tool shows 7.6 px left of the border");
    const box = rectOf(tool());
    assertNear(box.right, bx, "the box lies over Tuesday 17, left of the border", 1);
    const line = rectOf($(".o_hhg_split_line"));
    assertNear(line.left, bx - 0.5, "the line starts 0.5 px before the border (R16's worked value)", 0.8);
    assertNear(line.top, box.top + 2, "from 2 px under the box's top", 0.8);
    assertNear(line.height, 21.75, "21.8 px tall", 0.8);
    const cut = rectOf($(".o_hhg_split_scissors"));
    assertNear(cut.left + cut.width / 2, bx + 1.3, "the scissors' centre lies 1.3 px on the earlier day's side", 1);
    // the second border (between Tuesday 17 and Wednesday 18): Tuesday's left edge
    await restAt(second.left - 7.6, y);
    assert(tool(), "the tool shows at the next border");
    assertNear(rectOf(tool()).right, second.left, "on Tuesday 17's left edge", 1);
    // a click at the first border splits at Tuesday 17
    await restAt(bx - 7.6, y);
    await clickAt(bx - 7.6, y);
    await noticeSays(/./, "a notification of the split");
    await dataSettled();
    await settle(500);
    assertEqual($$(".o_tl_pill", $$(".o_tl_row:not(.o_tl_total_row)").find((row) => row.textContent.includes(ACT))).length, 2, "two pills");
    assertEqual(writesSince(mark).length, 0, "no write call of the Community's names");
});

// A90: a split the server refuses --------------------------------------------------------------------

scenario("hhg_a90_refused_split", async () => {
    await openToffAct(ACT);
    const pill = pillOn(ACT, FIRST);
    // the request is deleted by a direct call after the view was loaded
    await rpc("/web/dataset/call_kw/hr.leave/unlink", {
        model: "hr.leave",
        method: "unlink",
        args: [await leaveIdsOf(ACT, FIRST)],
        kwargs: {},
    });
    const point = splitPoint(pill, SECOND);
    await restAt(point.x, point.y);
    assert(tool(), "the tool still shows on the drawn pill");
    await clickAt(point.x, point.y);
    await until(() => $(".modal .modal-body"), "the Community's error dialog", 10000);
    const text = clean($(".modal .modal-body").textContent);
    // E11: the Community's error of a missing record
    assert(/does not exist or has been deleted/i.test(text), `the error of a missing record: "${text}"`);
    assert(!$(".o_notification"), "no notification");
    await closeDialog();
    await settle(400);
    assert(pillOn(ACT, FIRST) === pill, "the pill is still the one that was drawn");
    // the tool works again on the other border
    const other = splitPoint(pill, THIRD);
    await restAt(other.x, other.y);
    assert(tool(), "the split tool shows again, at the border between Tuesday 17 and Wednesday 18");
});

// A93: a reload after a split ----------------------------------------------------------------------------

tours.add("hhg_a93_split_reload", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                await leaveReady();
                const { point } = await restAtSplit();
                await clickAt(point.x, point.y);
                await splitIsDone();
                // reloaded within the notification's life
                window.location.reload();
            },
        },
        {
            trigger: ".o_tl_renderer .o_tl_row",
            timeout: 60000,
            async run() {
                await dataSettled();
                await settle(1000);
                assertEqual(rangeName(), "Week", "the Week range comes back");
                const days = dateColumns().map((el) => el.dataset.date);
                assert(days.includes("2026-11-11") && !days.includes("2026-11-16"), `the week of 8 to 14 November: ${days}`);
                assertEqual(facets(), ["Employee"], "the Employee facet alone");
                assert(!$(".o_notification"), "no notification");
                await step(1);
                await dataSettled();
                await settle(500);
                assertEqual(pillsOf(ACT).length, 2, "the row of Toff Act shows the two requests");
            },
        },
    ],
});
