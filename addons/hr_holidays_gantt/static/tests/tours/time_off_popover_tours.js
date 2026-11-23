// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    assertNear,
    breadcrumb,
    bringIntoView,
    clean,
    closeDialog,
    dataSettled,
    dateColumns,
    facets,
    gantt,
    leaveReady,
    noteMark,
    pickRange,
    pillsOf,
    pillTitles,
    pressKey,
    rangeName,
    realClick,
    rectOf,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    snapshot,
    step,
    texts,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";

/**
 * Tours of the leave popover of slice 002e2 (Task 5): opening, the title, the lines by unit, the
 * focus, closing, Escape, Expand, the reload. The records come from `tests/test_popover_tours.py`;
 * the clock is Wednesday 11 November 2026, so the Week range after one step reads Sunday 15 to
 * Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

/** The Week range of 15 to 21 November, and the search "Toff Act" (one row). */
async function openToffAct(name = "Toff Act") {
    await pickRange("week");
    await step(1);
    await searchFor(name);
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify([name]),
        `one row, ${name}: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
}

/** The date column that holds the x of a point. */
function dayAt(x) {
    return dateColumns().find((el) => {
        const rect = rectOf(el);
        return rect.left <= x && x < rect.right;
    })?.dataset.date;
}

/** The first day of a pill. */
const firstDayOf = (pill) => dayAt(rectOf(pill).left + 2);

/** The pill of the row whose first day is `date`. */
const pillOn = (name, date) => pillsOf(name).find((pill) => firstDayOf(pill) === date);

/** The package's press point: the centre of a one-day pill, else 40 px right of the left edge. */
function pressPoint(pill) {
    const rect = rectOf(pill);
    const days = rect.width / 190;
    return {
        x: days < 1.5 ? rect.left + rect.width / 2 : rect.left + 40,
        y: rect.top + rect.height / 2,
    };
}

const popover = () => $(".o_hhg_pop");

/** The popover has loaded its form (the title is the form's). */
const loaded = () => popover() && $(".o_hhg_pop_title")?.textContent && $(".o_hhg_pop .o_form_view");

/** What the page shows, for the message of a wait that timed out. */
const dump = () =>
    JSON.stringify({
        popover: Boolean(popover()),
        form: Boolean($(".o_action_manager .o_form_view")),
        dialog: clean($(".modal")?.textContent || ""),
        crumbs: breadcrumb(),
        url: window.location.pathname,
    });

/** Waits for the request's Community form in the window (the popover is gone). */
async function formOpens() {
    try {
        await until(() => $(".o_action_manager .o_form_view") && !popover(), "the request's form opens", 15000);
    } catch (error) {
        throw new Error(`${error.message}: ${dump()}`);
    }
    await settle(800);
}

async function clickPill(pill) {
    await bringIntoView(pill);
    await realClick(null, { at: pressPoint(pill) });
}

/** Clicks a pill and waits for its popover to be open, loaded and still. */
async function openPopoverOf(pill, { replace = false } = {}) {
    const before = popover();
    await clickPill(pill);
    await until(
        () => loaded() && (!replace || popover() !== before),
        "the popover of the pill, loaded",
        8000
    );
    await settle(600);
    return popover();
}

const titleOf = () => clean($(".o_hhg_pop_title").textContent);

/** One real key (Tab) through the DevTools protocol. */
async function pressTab() {
    const key = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 };
    await send({
        method: "Input.dispatchKeyEvent",
        events: [
            { type: "rawKeyDown", ...key },
            { type: "keyUp", ...key },
        ],
    });
}

async function closeWithEscape() {
    await pressKey("Escape");
    await until(() => !popover(), "Escape closes the popover");
}

// A11: the title -------------------------------------------------------------------------------------

scenario("hhg_a11_title_act", async () => {
    await openToffAct();
    const mark = noteMark();
    await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
    assertEqual(titleOf(), "Toff Act - 1 day", "the request To Approve's title");
    await closeWithEscape();
    assertEqual(writesSince(mark), [], "no write");
});

scenario("hhg_a11_titles_units", async () => {
    await openToffAct();
    await openPopoverOf(pillOn("Toff Act", "2026-11-16"));
    assertEqual(titleOf(), "Toff Act - 2 days", "the half-day request's title");
    await closeWithEscape();
    await openPopoverOf(pillOn("Toff Act", "2026-11-19"));
    assertEqual(titleOf(), "Toff Act - 4:00 hours", "the hour request's title");
    await closeWithEscape();
});

// A12: two clicks within 200 ms ----------------------------------------------------------------------

scenario("hhg_a12_double_click_dialog", async () => {
    await openToffAct();
    const mark = noteMark();
    const before = snapshot();
    const pill = pillOn("Toff Act", "2026-11-18");
    await bringIntoView(pill);
    const at = pressPoint(pill);
    // two clicks 60 ms apart: one dialog, no popover
    await realClick(null, { at, count: 2 });
    await until(() => $(".modal"), "the record dialog opens");
    await settle(1200);
    assertEqual($$(".modal").length, 1, "one record dialog");
    assert(!popover(), "no popover");
    assertEqual(writesSince(mark), [], "no write");
    await closeDialog();
    assertEqual(writesSince(mark), [], "closing the dialog writes nothing");
    assertEqual(snapshot(), before, "the view is unchanged");
    // two clicks 400 ms apart: the popover opens, the second click changes nothing
    await realClick(null, { at });
    await until(loaded, "the popover opens", 8000);
    const open = popover();
    await settle(400);
    await realClick(null, { at });
    await settle(1200);
    assert(!$(".modal"), "no dialog for the second click");
    assert(popover() === open, "the popover stays as it is");
});

// A18 to A21: the lines by unit ----------------------------------------------------------------------

scenario("hhg_a18_half_day_several_days", async () => {
    await openToffAct();
    await openPopoverOf(pillOn("Toff Act", "2026-11-16"));
    const halves = $$(".o_hhg_pop_halves .o_field_selection input").map((el) => clean(el.value));
    assertEqual(halves, ["Afternoon", "Morning"], `the two halves in ${$(".o_hhg_pop_dates")?.outerHTML}`);
    assert($(".o_hhg_pop_halves .oi[data-icon='east']"), "an arrow between them");
    assert(!$(".o_hhg_pop_choice"), "no duration choice");
    const days = clean($(".o_hhg_pop_days").textContent);
    assert(days.includes("2.00") && days.includes("day(s)"), `the number of days: "${days}"`);
});

scenario("hhg_a19_hours_and_days", async () => {
    await openToffAct();
    // the hour request of Thursday 19, 9:00 to 13:00
    await openPopoverOf(pillOn("Toff Act", "2026-11-19"));
    assert($(".o_hhg_pop_hours"), "the hours line");
    const hours = clean($(".o_hhg_pop_hours input")?.value || $(".o_hhg_pop_hours").textContent);
    assertEqual(hours, "4h", "the number of hours");
    const help = $(".o_hhg_pop_help");
    assert(help, "a question mark beside the clock icon");
    assert(help.dataset.tooltip, "it carries the Community's help of the hours field");
    assert(!$(".o_hhg_pop_days"), "no number of days");
    await closeWithEscape();
    // the day type's request of Friday 20: nothing but the number of days
    await openPopoverOf(pillOn("Toff Act", "2026-11-20"));
    for (const selector of [".o_hhg_pop_hours", ".o_hhg_pop_halves", ".o_hhg_pop_choice", ".o_hhg_pop_help"]) {
        assert(!$(selector), `nothing of ${selector} for a day type`);
    }
    assertEqual(
        clean($(".o_hhg_pop_days").textContent).replace(/ /g, ""),
        "1.00day(s)",
        "the number of days"
    );
});

scenario("hhg_a20_type_without_code", async () => {
    await openToffAct();
    const pill = pillOn("Toff Act", "2026-11-20");
    assert(pillTitles("Toff Act").includes("Toff Days 1d"), `the pill reads "Toff Days 1d": ${pillTitles("Toff Act")}`);
    await openPopoverOf(pill);
    const badge = $(".o_hhg_pop_type [class*='o_calendar_color_']");
    assert(badge, `the type's badge in ${$(".o_hhg_pop_type")?.outerHTML}`);
    assert(clean(badge.textContent).includes("Toff Days"), `the badge holds the name: "${clean(badge.textContent)}"`);
});

scenario("hhg_a21_allocation_warning", async () => {
    await openToffAct("Toff Alloc");
    await openPopoverOf(pillsOf("Toff Alloc")[0]);
    const warning = $(".o_hhg_pop_warning");
    assert(warning, "the warning box");
    assert(warning.classList.contains("alert-danger"), "a danger box");
    assert(clean(warning.textContent).includes("Only 1"), `the Community's text: "${clean(warning.textContent)}"`);
});

// A22: the focus -------------------------------------------------------------------------------------

scenario("hhg_a22_focus", async () => {
    await openToffAct();
    // the Approved request of Friday 20: the type's link
    await openPopoverOf(pillOn("Toff Act", "2026-11-20"));
    assert(
        document.activeElement?.matches(".o_hhg_pop_type a"),
        `the focus lies on the type's link, not on ${document.activeElement?.outerHTML.slice(0, 80)}`
    );
    await closeWithEscape();
    // the request To Approve: the type's input, then Tab moves to the duration choices
    await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
    assert(
        document.activeElement?.matches(".o_hhg_pop_type input"),
        `the focus lies on the type's input, not on ${document.activeElement?.outerHTML.slice(0, 80)}`
    );
    await pressTab();
    await settle(300);
    if ($(".o-autocomplete--dropdown-menu")) {
        await pressTab();
        await settle(300);
    }
    assert(
        document.activeElement?.closest(".o_hhg_pop_choice, .o_hhg_pop_halves"),
        `Tab moves to the duration choices, not to ${document.activeElement?.outerHTML.slice(0, 80)}`
    );
});

// A48, A49: Expand and the breadcrumb ----------------------------------------------------------------

scenario("hhg_a48_expand_breadcrumb", async () => {
    await openToffAct();
    const days = dateColumns().map((el) => el.dataset.date);
    await openPopoverOf(pillOn("Toff Act", "2026-11-20"));
    await realClick($(".o_hhg_pop_expand"));
    await formOpens();
    const crumbs = breadcrumb();
    assert(crumbs.startsWith("All Time Off"), `the breadcrumb leads with "All Time Off": "${crumbs}"`);
    assert(crumbs.split(" / ").length === 2, `and names the request: "${crumbs}"`);
    // the breadcrumb leads back to the same Gantt view, in its range and its search
    const first = $$(".o_breadcrumb .breadcrumb-item").find((el) => clean(el.textContent) === "All Time Off");
    assert(first, "the first item is a link");
    await realClick(first);
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the Gantt view is back", 15000);
    await dataSettled();
    await settle(500);
    assertEqual(rangeName(), "Week", "the Week range");
    assertEqual(dateColumns().map((el) => el.dataset.date), days, "the same days");
    assert(facets().some((facet) => facet.includes("Toff Act")), `the search is kept: ${facets()}`);
});

scenario("hhg_a49_back_after_expand", async () => {
    await openToffAct();
    await openPopoverOf(pillOn("Toff Act", "2026-11-20"));
    await realClick($(".o_hhg_pop_expand"));
    await formOpens();
    window.history.back();
    await until(() => $(".o_list_view"), "the browser's Back leads to the management list", 15000);
    assert(!$(".o_tl_renderer"), "not the Gantt view");
});

// A50: closing ---------------------------------------------------------------------------------------

scenario("hhg_a50_closing", async () => {
    await openToffAct();
    const mark = noteMark();
    const requests = gantt.requests;
    const toApprove = pillOn("Toff Act", "2026-11-18");
    const approved = pillOn("Toff Act", "2026-11-20");
    await openPopoverOf(toApprove);
    // the close icon
    await realClick($(".o_hhg_pop_close"));
    await until(() => !popover(), "the close icon closes it");
    // an empty place of the control bar
    await openPopoverOf(toApprove);
    await realClick(null, { at: { x: 1000, y: 123 } });
    await until(() => !popover(), "a click on the control bar closes it");
    // another pill opens its own popover in its place
    await openPopoverOf(toApprove);
    const title = titleOf();
    await openPopoverOf(approved, { replace: true });
    assert($$(".o_hhg_pop").length === 1, "one popover at a time");
    // the click on the pill whose popover is open leaves it open
    const open = popover();
    await clickPill(approved);
    await settle(800);
    assert(popover() === open, "the popover stays open as it is");
    assertEqual(gantt.requests, requests, "nothing reloaded");
    assertEqual(writesSince(mark), [], "no write");
    assert(title.length > 0, "the first popover had a title");
});

// A51: Escape ----------------------------------------------------------------------------------------

/** Types a note into the description of the open popover (the cursor stays in the field). */
async function typeDescription(text) {
    const area = await until(() => $(".o_hhg_pop textarea"), "the description area");
    area.focus();
    area.value = text;
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(300);
    return area;
}

scenario("hhg_a51_escape_in_the_field", async () => {
    await openToffAct();
    const mark = noteMark();
    const requests = gantt.requests;
    await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
    await typeDescription("Dentist");
    assert(document.activeElement === $(".o_hhg_pop textarea"), "the cursor is in the description");
    await pressKey("Escape");
    await until(() => !popover(), "one Escape closes the popover");
    assertEqual(writesSince(mark), [], "nothing written");
    assertEqual(gantt.requests, requests, "no reload");
});

scenario("hhg_a51_escape_after_leaving_the_field", async () => {
    await openToffAct();
    const mark = noteMark();
    const requests = gantt.requests;
    await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
    await typeDescription("Dentist");
    // the field is left: a click on the title
    await realClick($(".o_hhg_pop_title"));
    await settle(500);
    assert(document.activeElement !== $(".o_hhg_pop textarea"), "the field is left");
    await pressKey("Escape");
    await until(() => !popover(), "one Escape closes the popover");
    assertEqual(writesSince(mark), [], "nothing written");
    assertEqual(gantt.requests, requests, "no reload");
});

scenario("hhg_a51_escape_with_the_dropdown_open", async () => {
    await openToffAct();
    const mark = noteMark();
    const requests = gantt.requests;
    await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
    const input = $(".o_hhg_pop_type input");
    assert(document.activeElement === input, "the focus is on the type's input");
    // a letter opens the drop-down of the types
    input.value = "S";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await until(() => $(".o-autocomplete--dropdown-menu"), "the drop-down opens");
    await pressKey("Escape");
    await until(() => !popover(), "one Escape closes the popover");
    assert(!$(".o-autocomplete--dropdown-menu"), "and the drop-down with it");
    assertEqual(writesSince(mark), [], "nothing written");
    assertEqual(gantt.requests, requests, "no reload");
});

// R2.1: placement -----------------------------------------------------------------------------------

/** The window's height, through the DevTools protocol. */
async function resizeHeight(height) {
    await send({
        method: "Emulation.setDeviceMetricsOverride",
        events: [{ width: 1600, height, deviceScaleFactor: 1, mobile: false }],
    });
    await until(() => window.innerHeight === height, `a window ${height} px high`);
    await settle(400);
}

/** Where the popover lies against the pill: below, above, right, left or centred. */
function sideOf(pill, frame) {
    if (frame.top >= pill.bottom - 1) {
        return "below";
    }
    if (frame.bottom <= pill.top + 1) {
        return "above";
    }
    if (frame.left >= pill.right - 1) {
        return "right";
    }
    if (frame.right <= pill.left + 1) {
        return "left";
    }
    return "centre";
}

scenario("hhg_a10_placement", async () => {
    await pickRange("week");
    await step(1);
    await searchFor("Toff");
    await until(
        () => rowNames().includes("Toff Zed") && rowNames().includes("Toff Act"),
        `the rows: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
    // a pill low in the grid: no room below, room above
    const low = pillsOf("Toff Zed")[0];
    await openPopoverOf(low);
    let frame = rectOf($(".o_popover"));
    let pill = rectOf(low);
    assertEqual(sideOf(pill, frame), "above", "a pill near the bottom edge opens above");
    assert(frame.top >= 0, "inside the window");
    assertNear(frame.left + frame.width / 2, pill.left + pill.width / 2, "centred on the pill", 3);
    assert(pill.top - frame.bottom >= 6 && pill.top - frame.bottom <= 12, `8 px gap: ${pill.top - frame.bottom}`);
    await closeWithEscape();
    // the first pill, in a window too short for a place below: no room above either, so at its
    // right side, vertically centred on it
    const first = pillOn("Toff Act", "2026-11-18");
    await bringIntoView(first);
    await openPopoverOf(first);
    const height = rectOf($(".o_popover")).height;
    pill = rectOf(first);
    await closeWithEscape();
    assert(pill.top < height + 8, `no room above: pill top ${pill.top}, popover ${height}`);
    await resizeHeight(Math.round(pill.bottom + 8 + height - 30));
    await openPopoverOf(first);
    frame = rectOf($(".o_popover"));
    pill = rectOf(first);
    assertEqual(sideOf(pill, frame), "right", "neither below nor above: at the right side");
    assertNear(frame.top + frame.height / 2, pill.top + pill.height / 2, "vertically centred on the pill", 3);
    assert(frame.bottom <= window.innerHeight && frame.top >= 0, "inside the window");
    await closeWithEscape();
    await resizeHeight(900);
});

// A55: reloading the page ----------------------------------------------------------------------------

tours.add("hhg_a55_reload", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                await leaveReady();
                await openToffAct();
                await openPopoverOf(pillOn("Toff Act", "2026-11-18"));
                await typeDescription("Dentist");
                await realClick($(".o_hhg_pop_title"));
                await settle(500);
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
                assertEqual(facets(), ["Employee"], "the Employee facet alone");
                assert(!popover(), "no popover");
                assert(!$(".modal"), "no dialog");
                const days = dateColumns().map((el) => el.dataset.date);
                assert(days.includes("2026-11-11") && !days.includes("2026-11-18"), `the period around today: ${days}`);
            },
        },
    ],
});

// A69: a click on a pill's end -----------------------------------------------------------------------

scenario("hhg_a69_click_on_an_end", async () => {
    await openToffAct();
    const pill = pillOn("Toff Act", "2026-11-18");
    await bringIntoView(pill);
    const rect = rectOf(pill);
    // the centre of the 8 px end area, without moving
    await realClick(null, { at: { x: rect.right - 4, y: rect.top + rect.height / 2 } });
    await until(loaded, "the popover opens", 8000);
    assert(!$(".modal"), "no dialog");
});

// A83: Expand in the report view ---------------------------------------------------------------------

scenario("hhg_a83_report_expand", async () => {
    await pickRange("week");
    await step(1);
    const mark = noteMark();
    const pill = pillsOf("Toff Role Emp").find((candidate) => firstDayOf(candidate) === "2026-11-19");
    assert(pill, `Toff Role Emp's Approved request: ${rowNames()}`);
    await openPopoverOf(pill);
    assert($(".o_hhg_pop_report"), "the report variant");
    assertEqual(writesSince(mark), [], "no write");
    await realClick($(".o_hhg_pop_expand"));
    await formOpens();
    assert(texts(".o_breadcrumb .breadcrumb-item").length >= 1, `a breadcrumb leads back: ${breadcrumb()}`);
});

// A93: reloading after Expand ------------------------------------------------------------------------

tours.add("hhg_a93_reload_after_expand", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                await leaveReady();
                await openToffAct();
                await openPopoverOf(pillOn("Toff Act", "2026-11-20"));
                await realClick($(".o_hhg_pop_expand"));
                await formOpens();
                sessionStorage.setItem("hhg_a93_breadcrumb", breadcrumb());
                window.location.reload();
            },
        },
        {
            trigger: ".o_action_manager .o_form_view",
            timeout: 60000,
            async run() {
                await settle(1000);
                assert(!$(".o_tl_renderer"), "the form, not the Gantt view");
                assertEqual(
                    breadcrumb(),
                    sessionStorage.getItem("hhg_a93_breadcrumb"),
                    "the form comes back with its breadcrumb"
                );
                assert(breadcrumb().includes("All Time Off"), `the breadcrumb: ${breadcrumb()}`);
            },
        },
    ],
});

// What the tours of the footer's buttons (`time_off_button_tours.js`) use of this file.
export {
    clickPill,
    closeWithEscape,
    firstDayOf,
    loaded,
    openPopoverOf,
    openToffAct,
    pillOn,
    popover,
    pressPoint,
    titleOf,
    typeDescription,
};
