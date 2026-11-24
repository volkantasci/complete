// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import {
    $,
    $$,
    assert,
    assertEqual,
    bringIntoView,
    clean,
    closeDialog,
    dataSettled,
    noteMark,
    pickRange,
    pillByTitle,
    pillsOf,
    pressKey,
    realClick,
    realTap,
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
import { loaded, popover } from "@hr_holidays_gantt/../tests/tours/time_off_popover_tours";

/**
 * Tours of the leave popover on the phone of slice 002e2 (Task 7; R21, decision D5; A56 to A58,
 * A85): a tap opens 002a's bottom sheet with this part's header, stacked body and footer, whatever
 * the pill's row and the window's height; it covers neither the top bar nor the control panel; it
 * closes by its icon, a tap outside, the device's Back and Escape. The window is 390 x 844 (A57:
 * 390 x 801) with touch emulation; the records come from `tests/test_phone_tours.py`.
 */

// the sheet ----------------------------------------------------------------------------------------

/** The popover service's box of the sheet (its frame, 1 px border included, is inside it). */
const outerOf = () => $(".o_popover:has(.o_hhg_pop)");
const frameOf = () => $(".o_hhg_pop");

/** The checks of a tour: each one is kept, the tour fails with all that differ. */
function checker() {
    const failures = [];
    return {
        near(what, actual, expected, tolerance = 0.3) {
            if (!(Math.abs(actual - expected) <= tolerance)) {
                failures.push(`${what}: ${actual}, expected ${expected} (+-${tolerance})`);
            }
        },
        yes(what, ok, detail = "") {
            if (!ok) {
                failures.push(`${what}: ${detail}`);
            }
        },
        done(what) {
            if (failures.length) {
                throw new Error(`${what}: ${failures.join("; ")}`);
            }
        },
    };
}

/** A tap on a pill, and the wait for the sheet to be open, loaded and still. */
async function tapOpen(pill) {
    await bringIntoView(pill);
    await realTap(pill);
    await until(() => loaded() && frameOf()?.classList.contains("o_tl_popover_sheet"), "the sheet opens", 10000);
    await settle(700);
}

/** What lies above the sheet: the top bar and the control panel (their boxes and the elements). */
function checkAbove(check, what) {
    const outer = rectOf(outerOf());
    for (const [name, selector] of [
        ["top bar", ".o_navbar"],
        ["control panel", ".o_control_panel"],
    ]) {
        const el = $(selector);
        check.yes(`${what}: the ${name} is there`, Boolean(el));
        if (!el) {
            continue;
        }
        const box = rectOf(el);
        check.yes(
            `${what}: the ${name} (bottom ${box.bottom}) ends above the sheet (top ${outer.top})`,
            box.bottom <= outer.top + 0.5,
            `bottom ${box.bottom}, the sheet's top ${outer.top}`
        );
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        check.yes(
            `${what}: the element in the ${name}'s middle is not the sheet's`,
            Boolean(at) && !outerOf().contains(at),
            `${at?.className}`
        );
    }
}

/** Facts of the sheet's frame: size, place, colour, the screen above dimmed. */
function checkFrame(check, what, { height = 844, dark = false } = {}) {
    const outer = rectOf(outerOf());
    const frame = rectOf(frameOf());
    check.near(`${what}: the window's height`, window.innerHeight, height, 0.5);
    check.near(`${what}: the frame's width`, frame.width, 388, 0.5);
    check.near(`${what}: the frame's bottom`, frame.bottom, window.innerHeight - 1, 1.5);
    check.near(`${what}: the sheet's bottom`, outer.bottom, window.innerHeight, 1.5);
    check.near(`${what}: the sheet's left`, outer.left, 0, 1);
    check.near(`${what}: the sheet's width`, outer.width, 390, 1);
    if (height === 844) {
        check.near(`${what}: the frame's height`, frame.height, 698, 0.5);
    } else {
        // 002a's rule: the sheet keeps the 144 px of the top of the window free
        check.near(`${what}: the frame's height`, frame.height, window.innerHeight - 144 - 2, 1);
    }
    const background = dark ? "rgb(62, 63, 71)" : "rgb(255, 255, 255)";
    check.yes(
        `${what}: the frame's background is ${background}`,
        getComputedStyle(frameOf()).backgroundColor === background,
        getComputedStyle(frameOf()).backgroundColor
    );
    const dim = getComputedStyle(outerOf(), "::before");
    check.yes(
        `${what}: the screen above is dimmed`,
        dim.position === "fixed" && !/rgba?\(0, 0, 0, 0\)|transparent/.test(dim.backgroundColor),
        `${dim.position} ${dim.backgroundColor}`
    );
}

/** The header, the stacked body and the footer: R21 point 3's values. */
function checkContent(check, what, { badge = true, buttons = {}, choices = false, area = false } = {}) {
    const header = $(".o_hhg_pop_header");
    check.near(`${what}: the header's height`, rectOf(header).height, 28.2, 0.15);
    check.near(`${what}: the header's left padding`, parseFloat(getComputedStyle(header).paddingLeft), 16, 0.01);
    check.near(`${what}: the title's size`, parseFloat(getComputedStyle($(".o_hhg_pop_title")).fontSize), 16, 0.01);
    if (badge) {
        const tag = $(".o_hhg_pop_type [class*='o_calendar_color_']");
        const box = tag && rectOf(tag);
        check.near(`${what}: the type's badge width`, box?.width, 36.1, 0.3);
        check.near(`${what}: the type's badge height`, box?.height, 23, 0.3);
    }
    const frame = rectOf(frameOf());
    // the stacked boxes: each label icon and each value in a box of its own, as wide as the sheet
    // allows (the sheet less the form's 16 px paddings on both sides)
    const boxes = [];
    for (const line of $$(".o_hhg_pop_line")) {
        for (const child of [...line.children].filter((el) => rectOf(el).height > 0)) {
            boxes.push(child);
        }
    }
    check.yes(`${what}: the body has boxes`, boxes.length >= 6, `${boxes.length}`);
    for (const box of boxes) {
        const rect = rectOf(box);
        check.yes(
            `${what}: a box as wide as the sheet allows (${box.className}: ${rect.width})`,
            rect.width >= frame.width - 2 * 16 - 4 && rect.left >= frame.left && rect.right <= frame.right,
            `${rect.left} to ${rect.right} of ${frame.left} to ${frame.right}`
        );
    }
    const lines = $$(".o_hhg_pop_line").map((el) => rectOf(el));
    check.yes(
        `${what}: the lines are stacked`,
        lines.every((rect, index) => index === 0 || rect.top >= lines[index - 1].bottom - 0.5),
        JSON.stringify(lines.map((rect) => [rect.top, rect.bottom]))
    );
    if (choices) {
        const options = $$(".o_hhg_pop_choice .btn, .o_hhg_pop_choice .o_selection_badge");
        check.yes(`${what}: the duration choices are there`, options.length >= 2, `${options.length}`);
        for (const option of options) {
            check.near(`${what}: a duration choice's height`, rectOf(option).height, 37, 0.3);
        }
        const widths = Object.fromEntries(options.map((el) => [clean(el.textContent), rectOf(el).width]));
        check.near(`${what}: Full Day's width`, widths["Full Day"], 81.4, 0.5);
        check.near(`${what}: Morning's width`, widths.Morning, 80.6, 0.5);
    }
    if (area) {
        // the field's wrapper (`.o_field_widget`, the box with the border) is the 50 px area; its
        // textarea fills it
        const box = $(".o_hhg_pop_note > .o_field_widget");
        check.near(`${what}: the description area's height`, rectOf(box).height, 50, 0.3);
    }
    const footer = $(".o_hhg_pop_footer");
    const style = getComputedStyle(footer);
    check.near(`${what}: the footer's height`, rectOf(footer).height, 53, 0.3);
    check.near(`${what}: the footer's left padding`, parseFloat(style.paddingLeft), 16, 0.01);
    check.near(`${what}: the footer's right padding`, parseFloat(style.paddingRight), 16, 0.01);
    check.near(`${what}: the footer's bottom padding`, parseFloat(style.paddingBottom), 16, 0.01);
    check.near(`${what}: the footer's bottom on the frame's (1 px border)`, rectOf(footer).bottom, frame.bottom - 1, 1);
    const names = $$(".o_hhg_pop_footer button").map((el) => clean(el.textContent));
    check.yes(
        `${what}: the footer's buttons read ${JSON.stringify(Object.keys(buttons))}`,
        JSON.stringify(names) === JSON.stringify(Object.keys(buttons)),
        JSON.stringify(names)
    );
    for (const button of $$(".o_hhg_pop_footer button")) {
        const label = clean(button.textContent);
        const box = rectOf(button);
        check.near(`${what}: ${label}'s height`, box.height, 37, 0.3);
        check.near(`${what}: ${label}'s text`, parseFloat(getComputedStyle(button).fontSize), 14, 0.01);
        if (buttons[label]) {
            check.near(`${what}: ${label}'s width`, box.width, buttons[label], 0.3);
        }
    }
}

const sheetOpen = () => Boolean($(".o_hhg_pop"));

/** The grid on the phone's Week range of 15 to 21 November. */
async function toTheWeek() {
    await pickRange("week");
    await step(1);
}

/** The button of the control panel that shows and folds the search bar (not the bar's own icon). */
const searchToggler = () =>
    $$(".o_control_panel button.btn-secondary").find((el) => $("i[data-icon='search']", el));

/** Opens the search bar of the phone's control panel and searches an employee. */
async function phoneSearch(name, { fold = true } = {}) {
    if (!$(".o_searchview_input")) {
        const button = searchToggler();
        assert(button, "the control panel's search button");
        button.click();
        await until(() => $(".o_searchview_input"), "the search input");
    }
    await searchFor(name);
    await until(() => rowNames().every((row) => row.startsWith(name)), `only the rows of ${name}: ${rowNames()}`, 8000);
    await dataSettled();
    if (!fold) {
        await settle(500);
        return;
    }
    // The open search bar makes the control panel 176 px tall, more than the 144 px 002a's sheet
    // leaves free: A58 and A85 fold the bar (the search stays) by the button that opened it; A95
    // taps with it open, and the sheet covers the panel's lowest 32 px (decision D14).
    await realTap(searchToggler());
    await until(() => !$(".o_searchview_input"), "the search bar folds");
    await settle(500);
}

/** The pill of "Toff Act" by its place in the row: 18, 19 and 20 November. */
const actPill = (index) =>
    pillsOf("Toff Act")
        .slice()
        .sort((a, b) => rectOf(a).left - rectOf(b).left)[index];

// A56: the sheet -------------------------------------------------------------------------------------

async function sheetOfAnita({ dark }) {
    await toTheWeek();
    const mark = noteMark();
    const check = checker();
    const pill = pillByTitle("Anita Oliver", "PTO 1d");
    assert(pill, "Anita Oliver's PTO 1d");
    await tapOpen(pill);
    assertEqual(clean($(".o_hhg_pop_title").textContent), "Anita Oliver - 1 day", "the title");
    checkFrame(check, "A56", { dark });
    checkAbove(check, "A56");
    checkContent(check, "A56", { buttons: { Edit: 68.1, Delete: 84.5 } });
    check.done("A56");
    // the close icon closes it
    await realTap($(".o_hhg_pop_close"));
    await until(() => !sheetOpen(), "the close icon closes the sheet");
    assertEqual(writesSince(mark), [], "no write");
}

scenario("hhg_a56_phone_sheet", () => sheetOfAnita({ dark: false }));
// the same page in the dark scheme: the sheet's background as drawn (002a M43 phone)
scenario("hhg_a56_phone_sheet_dark", () => sheetOfAnita({ dark: true }));

// A57: a window of 390 x 801 -------------------------------------------------------------------------

scenario("hhg_a57_phone_short_window", async () => {
    await toTheWeek();
    const check = checker();
    const pill = pillByTitle("Anita Oliver", "PTO 1d");
    await tapOpen(pill);
    checkFrame(check, "A57", { height: 801 });
    checkAbove(check, "A57");
    // not beside the pill: the frame spans the window's width
    const frame = rectOf(frameOf());
    check.yes("A57: the sheet does not lie beside the pill", frame.left <= 1.5 && frame.right >= 388.5, `${frame.left} to ${frame.right}`);
    check.done("A57");
    await realTap($(".o_hhg_pop_close"));
    await until(() => !sheetOpen(), "the close icon closes the sheet");
});

// A58: the editable sheet, and closing ---------------------------------------------------------------

scenario("hhg_a58_phone_editable", async () => {
    await toTheWeek();
    await phoneSearch("Toff Act");
    const mark = noteMark();
    const check = checker();
    await tapOpen(actPill(0));
    assert($(".o_hhg_pop .o_form_editable"), "the request To Approve is editable");
    checkFrame(check, "A58");
    checkAbove(check, "A58");
    checkContent(check, "A58", {
        choices: true,
        area: true,
        buttons: { Approve: 96.2, Refuse: 88.4, Delete: 84.5 },
    });
    check.done("A58");
    await pressKey("Escape");
    await until(() => !sheetOpen(), "Escape closes the sheet");
    assertEqual(writesSince(mark), [], "no write");
});

// A56 (closing): the icon, a tap outside, the device's Back, Escape, a pending change dropped --------

/** A point of the control panel, above the sheet, that is no control (a tap there only closes the sheet). */
function emptyPointAbove() {
    const panel = rectOf($(".o_control_panel"));
    for (let y = panel.top + 4; y < panel.bottom - 4; y += 4) {
        for (let x = 20; x < 380; x += 6) {
            const el = document.elementFromPoint(x, y);
            if (
                el &&
                el.closest(".o_control_panel") &&
                !outerOf().contains(el) &&
                !el.closest("button, a, input, [role='button'], .o_searchview, .o_breadcrumb")
            ) {
                return { x, y };
            }
        }
    }
    throw new Error("no empty place in the control panel");
}

async function tapAt({ x, y }) {
    await send({
        touch: true,
        events: [
            { type: "touchStart", touchPoints: [{ x, y }] },
            { type: "touchEnd", touchPoints: [] },
        ],
    });
}

scenario("hhg_a56_phone_closing", async () => {
    await toTheWeek();
    await phoneSearch("Toff Act");
    const mark = noteMark();
    const url = window.location.pathname + window.location.search;
    // the icon
    await tapOpen(actPill(0));
    await realTap($(".o_hhg_pop_close"));
    await until(() => !sheetOpen(), "the close icon closes the sheet");
    // a tap outside the sheet
    await tapOpen(actPill(0));
    await tapAt(emptyPointAbove());
    await until(() => !sheetOpen(), "a tap outside closes the sheet");
    // the device's Back: the sheet closes and the view stays
    await tapOpen(actPill(0));
    window.history.back();
    await until(() => !sheetOpen(), "Back closes the sheet");
    await settle(800);
    assert($(".o_tl_renderer .o_tl_pill"), "the view is still there after Back");
    assertEqual(window.location.pathname + window.location.search, url, "Back leaves the address as it was");
    // Escape
    await tapOpen(actPill(0));
    await pressKey("Escape");
    await until(() => !sheetOpen(), "Escape closes the sheet");
    // Escape with a pending change: dropped, nothing written
    await tapOpen(actPill(0));
    const area = $(".o_hhg_pop textarea");
    assert(area, "the description area");
    await realClick(area);
    await until(() => document.activeElement === area, "the cursor is in the description");
    await send({ method: "Input.insertText", events: [{ text: "pending words" }] });
    await settle(300);
    // the field is left: the pending change shows
    await realClick($(".o_hhg_pop_title"));
    try {
        await until(
            () => $$(".o_hhg_pop_footer button").some((el) => clean(el.textContent) === "Discard"),
            "a pending change shows Discard",
            6000
        );
    } catch (error) {
        throw new Error(
            `${error.message}: value "${area.value}", focus ${document.activeElement?.tagName}, ` +
                `buttons ${$$(".o_hhg_pop_footer button").map((el) => clean(el.textContent))}`
        );
    }
    await pressKey("Escape");
    await until(() => !sheetOpen(), "Escape closes the sheet with a pending change");
    await tapOpen(actPill(0));
    assertEqual($(".o_hhg_pop textarea").value, "", "the dropped change did not come back");
    await pressKey("Escape");
    await until(() => !sheetOpen(), "Escape closes the sheet");
    assertEqual(writesSince(mark), [], "no write");
});

// R21 point 5: two taps within 200 ms open the record dialog -----------------------------------------

scenario("hhg_a56_phone_two_taps", async () => {
    await toTheWeek();
    await phoneSearch("Toff Act");
    const mark = noteMark();
    const pill = actPill(0);
    await bringIntoView(pill);
    await realTap(pill, { count: 2 });
    await until(() => $(".modal"), "two taps open the record dialog", 10000);
    await settle(1000);
    assertEqual($$(".modal").length, 1, "one record dialog");
    assert(!popover(), "no sheet");
    assertEqual(writesSince(mark), [], "no write");
    await closeDialog();
});

// A85: the first and the second row ------------------------------------------------------------------

scenario("hhg_a85_phone_rows", async () => {
    await toTheWeek();
    await phoneSearch("Toff");
    assertEqual(rowNames().filter((name) => name.startsWith("Toff")), ["Toff A", "Toff B"], "the two rows");
    const mark = noteMark();
    const check = checker();
    let top = null;
    for (const name of ["Toff A", "Toff B"]) {
        const pill = pillsOf(name)[0];
        assert(pill, `the pill of ${name}`);
        await tapOpen(pill);
        checkFrame(check, `A85 ${name}`);
        checkAbove(check, `A85 ${name}`);
        const outer = rectOf(outerOf());
        if (top !== null) {
            check.near(`A85 ${name}: the sheet's top is the first row's`, outer.top, top, 0.5);
        }
        top = outer.top;
        await realTap($(".o_hhg_pop_close"));
        await until(() => !sheetOpen(), `${name}: the close icon closes the sheet`);
    }
    check.done("A85");
    assertEqual(writesSince(mark), [], "no write");
});

// A95: the phone sheet with the search bar open (R21 point 1, decision D14) ----------------------------

scenario("hhg_a95_phone_open_search_bar", async () => {
    await toTheWeek();
    await phoneSearch("Toff Act", { fold: false });
    assert($(".o_searchview_input"), "the search bar is open");
    const mark = noteMark();
    const check = checker();
    const panel = rectOf($(".o_control_panel"));
    // M88: the opened panel ends at y 176
    check.near("A95: the control panel's bottom", panel.bottom, 176, 1);
    await tapOpen(actPill(0));
    const outer = rectOf(outerOf());
    const frame = rectOf(frameOf());
    // 002a keeps the sheet's place: its frame from y 145, its outer box from y 144 (M86, M87)
    checkFrame(check, "A95");
    check.near("A95: the sheet's frame top", frame.top, 145, 1);
    check.near("A95: the sheet's outer box top", outer.top, 144, 1);
    check.near("A95: the frame's width", frame.width, 388, 0.5);
    check.near("A95: the frame's height", frame.height, 698, 0.5);
    // it covers the panel's lowest 32 px
    check.near("A95: the sheet covers the panel's lowest 32 px", panel.bottom - outer.top, 32, 1);
    const at = document.elementFromPoint(panel.left + panel.width / 2, panel.bottom - 4);
    check.yes("A95: the panel's lowest part is the sheet's", Boolean(at) && outerOf().contains(at), `${at?.className}`);
    const top = rectOf($(".o_navbar"));
    check.yes("A95: the top bar ends above the sheet", top.bottom <= outer.top + 0.5, `${top.bottom}`);
    check.done("A95");
    await realTap($(".o_hhg_pop_close"));
    await until(() => !sheetOpen(), "the close icon closes the sheet");
    assertEqual(writesSince(mark), [], "no write");
});

// R21 point 4: Back with a dialog open over the sheet closes the dialog only -------------------------

scenario("hhg_a56_phone_back_with_a_dialog", async () => {
    await toTheWeek();
    await phoneSearch("Toff Act");
    const mark = noteMark();
    const url = window.location.pathname + window.location.search;
    await tapOpen(actPill(0));
    const dialogs = odoo.__WOWL_DEBUG__?.root?.env?.services?.dialog;
    assert(dialogs, "the dialog service");
    dialogs.add(AlertDialog, { title: "Over the sheet", body: "A dialog over the sheet" });
    await until(() => $(".o_dialog .modal"), "the dialog opens over the sheet");
    await settle(500);
    window.history.back();
    await until(() => !$(".o_dialog .modal"), "Back closes the dialog");
    await settle(500);
    assert(sheetOpen(), "the sheet stays open under the dialog's Back");
    window.history.back();
    await until(() => !sheetOpen(), "the next Back closes the sheet");
    await settle(800);
    assert($(".o_tl_renderer .o_tl_pill"), "the view is still there");
    assertEqual(window.location.pathname + window.location.search, url, "the address is as it was");
    assertEqual(writesSince(mark), [], "no write");
});

// What the gesture tours (`time_off_gesture_tours.js`) use of this file.
export { actPill, phoneSearch, toTheWeek };
