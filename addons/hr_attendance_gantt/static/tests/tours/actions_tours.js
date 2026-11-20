// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import {
    $,
    $$,
    assert,
    assertEqual,
    assertNear,
    barOf,
    cellsOf,
    centre,
    clean,
    clearRemembered,
    closeDialog,
    closeSearchMenu,
    countDataCalls,
    dataSettled,
    dateColumns,
    facets,
    foldedHeaders,
    labelOf,
    menuItem,
    mouse,
    openSearchMenu,
    pager,
    pickRange,
    pillTitles,
    pillsOf,
    pointerAway,
    popoverOfView,
    ready,
    realClick,
    realDrag,
    realHover,
    realTap,
    rectOf,
    rangeName,
    renderer,
    resizeTo,
    rowEl,
    rowNames,
    searchFor,
    send,
    settle,
    step,
    texts,
    until,
} from "@hr_attendance_gantt/../tests/tours/hr_rows_tours";

/**
 * Tours of the `ui` scenarios of slice 002d3: the actions of the attendance Gantt view (A2 to
 * A5, A79 here; later tasks add their own scenarios to this file). The browser clock, zone and
 * window are fixed by `tests/test_actions_tours.py`; the helpers are 002d2's
 * (`hr_rows_tours.js`).
 */

const tours = registry.category("web_tour.tours");

/** One step that waits for `trigger`, clears the remembered range, then runs `body`. */
const scenario = (name, trigger, body) =>
    tours.add(name, {
        steps: () => [
            {
                trigger,
                timeout: 60000,
                async run() {
                    clearRemembered();
                    await body();
                },
            },
        ],
    });

const GRID = ".o_tl_renderer .o_tl_row_header";
const SWITCHER = ".o_cp_switch_buttons";
const CALENDAR = ".o_calendar_view";
const onPhone = () => !$(`${SWITCHER} .o_switch_view`);
const VIEWS = ["Calendar", "Gantt", "List", "Pivot", "Graph"];

/** The views of the switcher in their order, with the active one, on desktop and on the phone. */
async function switcherEntries() {
    if (!onPhone()) {
        const buttons = $$(`${SWITCHER} .o_switch_view`);
        const active = buttons.filter((button) => button.classList.contains("active"));
        return {
            names: buttons.map((button) => button.dataset.tooltip),
            active: active.map((button) => button.dataset.tooltip),
        };
    }
    await realClick($(`${SWITCHER} > button`));
    const items = await until(() => {
        const found = $$(".o-dropdown--menu .o-dropdown-item");
        return found.length ? found : null;
    }, "the entries of the view menu");
    const entries = {
        names: items.map((item) => clean(item.textContent)),
        active: items
            .filter((item) => item.classList.contains("selected"))
            .map((item) => clean(item.textContent)),
    };
    await realClick($(`${SWITCHER} > button`));
    await until(() => !$(".o-dropdown--menu"), "the view menu closes");
    return entries;
}

/** Chooses a view by its name, with the switcher of the desktop or the menu of the phone. */
async function switchTo(name) {
    if (!onPhone()) {
        const button = $$(`${SWITCHER} .o_switch_view`).find((el) => el.dataset.tooltip === name);
        assert(button, `a ${name} button in the switcher`);
        await realClick(button);
        return;
    }
    await realClick($(`${SWITCHER} > button`));
    await until(
        () => $$(".o-dropdown--menu .o-dropdown-item").find((el) => clean(el.textContent) === name),
        `the entry ${name} of the view menu`
    );
    // the menu is a sheet that slides in: click once it rests
    await settle(600);
    await realClick(
        $$(".o-dropdown--menu .o-dropdown-item").find((el) => clean(el.textContent) === name)
    );
}

// A2: the management action's search
scenario("hr_actions_a2_management_search", GRID, async () => {
    await ready(2);
    const rows = ["HRA Search A", "HRA Search B"];
    assertEqual(facets(), ["Employee"], "one facet, the Employee grouping, and no filter");
    assertEqual(rowNames(), rows, "one row per employee");
    // one removal: the view's own default grouping (Employee) applies again (002a R19)
    await realClick($(".o_searchview_facet .o_facet_remove"));
    await settle(1200);
    await dataSettled();
    assertEqual(rowNames(), rows, "the rows stay one per employee without the facet");
});

// A3: My Attendances opens on its calendar
const calendarOpens = async () => {
    const entries = await switcherEntries();
    assertEqual(entries.names, VIEWS, "the order of the views in the switcher");
    assertEqual(entries.active, ["Calendar"], "the calendar is the active view");
    assert($(CALENDAR), "the calendar shows");
};
scenario("hr_actions_a3_my_calendar", CALENDAR, async () => {
    await settle();
    assert(!onPhone(), "the desktop has the buttons");
    await calendarOpens();
});
scenario("hr_actions_a3_my_calendar_phone", CALENDAR, async () => {
    await settle();
    assert(onPhone(), "the phone's menu replaces the buttons");
    await calendarOpens();
});

// A4: the Gantt view of My Attendances
const myGantt = (phone) => async () => {
    await settle();
    await switchTo("Gantt");
    await until(() => $(GRID), "the grid of the Gantt view");
    await ready(1);
    assertEqual(rowNames(), ["Mitchell Admin"], "one row, the user's own employee");
    assertEqual($$(".o_tl_pill").length, 0, "no pill on 11 November");
    // 002d2 R17: the long form from 1400 px, the short form below it ("0h" when nothing is worked)
    const label = phone ? "0h" : "0h / 8h";
    await until(() => labelOf("Mitchell Admin") === label, `the label of the row reads ${label}`);
    // S2, 002d2 R20: the Community helper of an empty attendance view lies under the one empty row,
    // over the view's content on desktop and in the grid's place on the phone
    const helper = await until(() => $(".o_hag_helper"), "the Community attendance helper");
    assert(helper.getClientRects().length > 0, "the helper is drawn");
    assertEqual(helper.classList.contains("o_hag_helper_phone"), phone, "the phone's place of the helper");
    assert($(".o_view_nocontent", helper), "it holds the Community's helper");
    if (!phone) {
        // on the phone the search bar is behind its own button, and its facets are not drawn
        assertEqual(facets(), ["Employee"], "one facet, the Employee grouping");
    }
};
scenario("hr_actions_a4_my_gantt", CALENDAR, myGantt(false));
scenario("hr_actions_a4_my_gantt_phone", CALENDAR, myGantt(true));

// A65: the phone's switcher button opens a menu of the five views, and Gantt shows A4's one row
scenario("hr_actions_a65_phone_switcher", CALENDAR, async () => {
    await settle();
    assert(onPhone(), "the phone has one button for the views");
    await calendarOpens();
    await myGantt(true)();
});

// A5: a Self user
scenario("hr_actions_a5_self", CALENDAR, async () => {
    await settle();
    await switchTo("Gantt");
    await ready(1);
    assertEqual(rowNames(), ["Gantt Role Self"], "one row, the user's own employee");
    assertEqual(pillTitles("Gantt Role Self"), ["A - 2h"], "the pill of the attendance");
    await step(1);
    assertEqual(rowNames(), ["Gantt Role Self"], "the row stays on 12 November");
    assertEqual(pillsOf("Gantt Role Self").length, 0, "and has no pill");
});

// A5: a Self user with no employee
scenario("hr_actions_a5_without_employee", SWITCHER, async () => {
    const notice = await until(
        () =>
            texts(".o_notification").find((text) =>
                text.includes("not linked to an employee in the current company")
            ),
        "the notice that the user has no employee in the current company"
    );
    assert(notice, "the notice shows");
    await settle(1500);
    const dialog = $(".modal");
    assert(!dialog, "no error dialog shows");
    assert($(".o_calendar_view"), "the calendar shows");
    // the notice lies over the switcher: it closes by itself, or by its button
    const close = $(".o_notification .btn-close");
    if (close) {
        await realClick(close);
    }
    await until(() => !$(".o_notification"), "the notice is gone");
    await switchTo("Gantt");
    await until(() => $(".o_tl_renderer"), "the Gantt view");
    await settle();
    assertEqual($$(".o_tl_row:not(.o_tl_total_row)").length, 1, "one row");
    assertEqual(rowNames(), [""], "the row has no name");
    assertEqual($$(".o_tl_pill").length, 0, "and no pill");
    assert($(".o_hag_helper .o_view_nocontent"), "the helper of the empty view shows");
});

// A79: 002d2's employee rules in My Attendances
scenario("hr_actions_a79_self_rules", CALENDAR, async () => {
    await settle();
    await switchTo("Gantt");
    await ready(1);
    const name = "Gantt Role Self";
    assertEqual(rowNames(), [name], "one row");
    const header = $$(".o_tl_row_header").find((el) => el.textContent.includes(name));
    assert($(".o_hrg_avatar", header), "the row shows the avatar");
    await until(() => labelOf(name).startsWith("2h / 8h"), "the label of the row");
    assert(barOf(name), "the row has its bar");
    await realClick($(".o_hrg_avatar", header));
    await until(() => $(".o_avatar_card"), "the avatar's card opens");
    document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await until(() => !$(".o_avatar_card"), "the card closes");
    await pickRange("month");
    const dates = dateColumns().map((el) => el.dataset.date);
    assert(dates.includes("2026-11-02") && dates.includes("2026-11-30"), `November: ${dates}`);
    assertEqual(foldedHeaders().length, 4, "the four weekend pairs are folded");
    await pickRange("week");
    const week = dateColumns().map((el) => el.dataset.date);
    // 8 to 14 November: Sunday and Saturday are folded, so the date columns run Monday to Friday
    assertEqual(
        [week[0], week.at(-1), week.length, foldedHeaders().length],
        ["2026-11-09", "2026-11-13", 5, 2],
        "the week of 8 to 14 November"
    );
    assert(!week.includes("2026-11-16"), "not 15 to 21 November");
});

// -- the search menu and the contract filters (R5, R6) ----------------------------------------------

const GROUPINGS = ".o_group_by_menu .o_menu_item:not(.o_add_custom_group_menu)";
const FILTER_MENU = ".o_filter_menu";
const FILTERS = `${FILTER_MENU} .o_menu_item`;
const CONTRACT_FILTERS = ["Ongoing Contract", "No Active Contract"];

// A10: the Date grouping is hidden in the Gantt view, and offered by the list
scenario("hr_actions_a10_no_date_grouping", GRID, async () => {
    await ready(2);
    await openSearchMenu();
    assertEqual(
        texts(GROUPINGS),
        ["Employee", "Department", "Manager", "Method"],
        "the groupings of the Gantt view, without Date"
    );
    assert($(".o_add_custom_group_menu"), "Custom Group is offered");
    await closeSearchMenu();
    await switchTo("List");
    await until(() => $(".o_list_view"), "the list view");
    await settle();
    await openSearchMenu();
    assert(texts(GROUPINGS).includes("Date"), `the list offers Date: ${texts(GROUPINGS)}`);
});

// A11: a custom grouping on a date is dropped
scenario("hr_actions_a11_custom_group_dropped", GRID, async () => {
    await ready(2);
    const rows = rowNames();
    assertEqual(rows.length, 2, "one row per employee");
    await openSearchMenu();
    const select = $(".o_add_custom_group_menu");
    const option = $$("option", select).find((el) => clean(el.textContent) === "Check In");
    assert(option, `Check In in the custom groupings: ${texts(".o_add_custom_group_menu option")}`);
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await until(
        () => facets().some((facet) => facet.includes("Check In")),
        "the grouping facet of Check In"
    );
    await settle(1200);
    await dataSettled();
    assertEqual(rowNames(), rows, "the rows do not change");
});

// A12: the contract filters by role
const filtersShown = (shown) => async () => {
    await settle();
    await openSearchMenu();
    const filters = texts(FILTERS);
    if (!shown) {
        assertEqual(
            filters.filter((text) => CONTRACT_FILTERS.includes(text)),
            [],
            `no contract filter in ${filters}`
        );
        return;
    }
    const at = filters.indexOf("Ongoing Contract");
    assert(at > 0, `Ongoing Contract is offered: ${filters}`);
    assertEqual(filters[at - 1], "Date", "Ongoing Contract follows the Date filter");
    assertEqual(filters[at + 1], "No Active Contract", "No Active Contract follows it");
    assertEqual(
        filters.filter((text) => CONTRACT_FILTERS.includes(text)).length,
        2,
        "each of the two filters once"
    );
};
scenario("hr_actions_a12_filters_by_role_shown", GRID, filtersShown(true));
scenario("hr_actions_a12_filters_by_role_hidden", GRID, filtersShown(false));

// A13 to A15: employees without a contract today and employees with one
// (tests/test_actions_tours.py makes them relative to the server's today)
const NO_CONTRACT = ["HRC Former", "HRC Future", "HRC Never"];
const WITH_CONTRACT = ["HRC Ends today", "HRC Ongoing"];

scenario("hr_actions_a13_no_active_contract", GRID, async () => {
    await ready(5);
    assertEqual(rowNames().length, 5, "every employee has a row");
    await menuItem(FILTER_MENU, "No Active Contract");
    await until(() => rowNames().length === 3, "the three rows without a contract");
    assertEqual(rowNames(), NO_CONTRACT, "the employees without a contract today");
    assertEqual(pager(), "1-3 / 3", "the pager counts them");
    assertEqual($$(".o_tl_pill").length, 0, "no pill on 11 November");
});

scenario("hr_actions_a14_ongoing_contract", GRID, async () => {
    await ready(5);
    await menuItem(FILTER_MENU, "Ongoing Contract");
    await until(() => rowNames().length === 2, "the two rows with a contract");
    assertEqual(rowNames(), WITH_CONTRACT, "the employees with a contract today");
    assertEqual(pager(), "1-2 / 2", "the pager counts them");
    await menuItem(FILTER_MENU, "No Active Contract");
    await until(() => rowNames().length === 5, "both filters keep everyone");
    assertEqual(pager(), "1-5 / 5", "the pager counts all five");
});

// A15: the user's time zone is Pacific/Kiritimati (the test sets it): the employee whose
// contract ended the day before that zone's today is without a contract
scenario("hr_actions_a15_today_in_the_users_zone", GRID, async () => {
    await ready(5);
    await menuItem(FILTER_MENU, "No Active Contract");
    await until(() => rowNames().length === 4, "the four rows without a contract");
    assertEqual(rowNames(), ["HRC Edge", ...NO_CONTRACT], "the edge employee is without one");
    assertEqual(pager(), "1-4 / 4", "the pager counts them");
});

// -- the contract warning and its link (R7, R8) ----------------------------------------------------

const DIALOG = ".modal .o_form_view";
const WARNING = ".o_hag_contract_warning";
const LINK = ".o_hag_correct_employee";
const isDrawn = (el) => el.getClientRects().length > 0;
/** The warning lines that show in the open form (a hidden line is not counted). */
const warnings = () => $$(`.o_form_view ${WARNING}`).filter(isDrawn);
const links = () => $$(`.o_form_view ${LINK}`).filter(isDrawn);

/**
 * A click on the cell at `hour` of a row: 20 px right of the hour column's left edge, at the
 * vertical centre of the row's header (acceptance "Navigating").
 */
async function clickCellAt(name, hour) {
    const cell = cellsOf(name).find((el) => Number(el.dataset.column) === hour);
    assert(cell, `the cell of ${hour}:00 in the row of ${name}`);
    const header = $(".o_tl_row_header", rowEl(name)).getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    await realClick(null, { at: { x: box.left + 20, y: header.top + header.height / 2 } });
    await until(() => $(DIALOG), `the dialog of the cell at ${hour}:00 of ${name}`, 12000);
    await settle(600);
}

/** The employee of the open form is changed to `name`, with the field's own autocomplete. */
async function pickEmployee(name) {
    const input = await until(
        () => $(".modal .o_field_widget[name='employee_id'] input"),
        "the employee field"
    );
    input.focus();
    input.value = name;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const item = await until(
        () => $$(".o-autocomplete--dropdown-item").find((el) => clean(el.textContent) === name),
        `the entry ${name} of the employee field`
    );
    await realClick(item);
    await until(
        () => $(".modal .o_field_widget[name='employee_id'] input")?.value === name,
        `${name} in the employee field`
    );
    await settle(500);
}

/** A text is typed into the input of a form field, which is then left. */
async function typeInto(selector, text) {
    const input = await until(() => $(selector), `the field ${selector}`);
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
    await settle(500);
}

const lastCrumb = () => clean($(".o_breadcrumb .active")?.textContent || "");

/** After the link: no dialog, the employee's form fills the window, the crumb ends in the name. */
async function assertEmployeeForm(name) {
    await until(() => !$(".modal"), "no dialog is left", 8000);
    await until(() => $(".o_form_view [name='name']"), "the employee form");
    await until(() => lastCrumb() === name, `the breadcrumb ends in ${name}`);
    assert(!$(".modal"), "still no dialog");
    assert(!$(".o_tl_renderer"), "the Gantt view is not on screen");
}

// A19: no warning for an employee under contract
scenario("hr_actions_a19_no_warning", GRID, async () => {
    await ready();
    await clickCellAt("HRA Abigail", 15);
    assertEqual(clean($(".modal-title").textContent), "Create", "the dialog's title");
    assertEqual(warnings().length, 0, "no warning shows (M24)");
    await closeDialog();
});

// A21: the warning follows the form
scenario("hr_actions_a21_follows_form", GRID, async () => {
    await ready();
    await clickCellAt("HRA Abigail", 15);
    assertEqual(warnings().length, 0, "no warning for Abigail");
    await pickEmployee("HRA Beth");
    await until(() => warnings().length === 1, "the warning appears without saving");
    await pickEmployee("HRA Abigail");
    await until(() => warnings().length === 0, "the warning is gone");
    await closeDialog();
});

// A23: the link by group
const linkByGroup = (shown) => async () => {
    await ready();
    await clickCellAt("HRA Beth", 15);
    assertEqual(warnings().length, 1, "the warning shows");
    assertEqual(links().length, shown ? 1 : 0, shown ? "the link shows" : "no link");
    if (shown) {
        assertEqual(clean(links()[0].textContent), "Correct employee", "the link's text");
    }
    await closeDialog();
};
scenario("hr_actions_a23_link_without_group", GRID, linkByGroup(false));
scenario("hr_actions_a23_link_with_group", GRID, linkByGroup(true));

// A24: the link opens the employee and saves nothing
scenario("hr_actions_a24_link_opens_employee", GRID, async () => {
    await ready();
    await clickCellAt("HRA Beth", 15);
    assertEqual(warnings().length, 1, "the warning shows");
    assertEqual(links().length, 1, "with the link");
    await realClick(links()[0]);
    await assertEmployeeForm("HRA Beth");
    // the breadcrumb's first step leads back to the view, on the Day range of 11 November
    await realClick($(".o_breadcrumb .breadcrumb-item:not(.active)"));
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the Gantt view returns");
    await ready();
    assertEqual(rangeName(), "Day", "the Day range");
    assertEqual(dateColumns()[0].dataset.date.slice(0, 10), "2026-11-11", "the 11th of November");
    assertEqual(pillsOf("HRA Beth").length, 0, "Beth has no attendance");
});

// A22: the full-page form (opened from the list; its break is saved with the link)
scenario("hr_actions_a22_full_page_form", GRID, async () => {
    await ready();
    await switchTo("List");
    // the action's search default groups the list by employee: the one group is opened
    await until(
        () => $(".o_list_view .o_data_row, .o_list_view .o_group_header"),
        "the list of attendances"
    );
    if (!$(".o_list_view .o_data_row")) {
        await realClick($(".o_list_view .o_group_header"));
    }
    const row = await until(
        () => $$(".o_list_view .o_data_row").find((el) => el.textContent.includes("HRA Beth")),
        "the attendance of Beth in the list"
    );
    await realClick($(".o_data_cell", row));
    await until(() => $(".o_form_view [name='break_duration']"), "the form");
    await settle(600);
    assertEqual(warnings().length, 1, "the warning shows on the full-page form");
    assertEqual(links().length, 1, "with the link");
    // between the status bar and the sheet
    const bar = $(".o_form_statusbar").getBoundingClientRect();
    const line = warnings()[0].getBoundingClientRect();
    const sheet = $(".o_form_sheet").getBoundingClientRect();
    assert(
        bar.bottom <= line.top + 0.5 && line.bottom <= sheet.top + 0.5,
        `the line lies between the status bar and the sheet: ${bar.bottom} ${line.top} ${line.bottom} ${sheet.top}`
    );
    await typeInto(".o_form_view [name='break_duration'] input", "0:45");
    await realClick(links()[0]);
    await assertEmployeeForm("HRA Beth");
});

// A25: the link drops the changes of an opened record
scenario("hr_actions_a25_link_drops_changes", GRID, async () => {
    await ready();
    await step(-1);
    assertEqual(dateColumns()[0].dataset.date.slice(0, 10), "2026-11-10", "the 10th of November");
    const pill = await until(() => pillsOf("HRA Beth")[0], "the pill of Beth");
    // a click opens the record dialog (R9)
    await realClick(pill);
    await until(() => $(DIALOG), "the record dialog", 15000);
    await settle(600);
    assertEqual(clean($(".modal-title").textContent), "Open", "the dialog's title");
    assertEqual(warnings().length, 1, "the warning shows in the opened record");
    await typeInto(".modal [name='break_duration'] input", "0:30");
    await realClick(links()[0]);
    await assertEmployeeForm("HRA Beth");
});

// -- clicks, taps and the record dialog (R9 to R12, R20) -----------------------------------------------

const MODALS = () => $$(".modal");
const FOOTER = () => texts(".modal-footer button");
const titleOfDialog = () => clean($(".modal-title")?.textContent || "");
const stopKey = (key) =>
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

/** A footer button of the open dialog, by its text, pressed with a real click. */
async function pressFooter(text) {
    const button = $$(".modal-footer button").find((el) => clean(el.textContent) === text);
    assert(button, `the button ${text} in ${FOOTER()}`);
    await realClick(button);
}

/** The notification of the last change shows with its Undo button: pressed with a real click. */
async function pressUndo() {
    const button = await until(
        () => $(".o_tl_notification .o_notification_buttons button"),
        "the Undo button of the notification"
    );
    await realClick(button);
    await dataSettled();
}

/** The dialog shows with its form, once the click has been made. */
async function recordDialogShows() {
    await until(() => $(DIALOG), "the record dialog", 4000);
    await settle(500);
    assertEqual(MODALS().length, 1, "one dialog");
    assertEqual(titleOfDialog(), "Open", "the dialog's title");
    assert(!popoverOfView(), "no popover");
}

/** The dialog is gone, the data is read again, and the pill of `name` reads `title`. */
async function closedAndShows(name, title) {
    await until(() => !$(".modal"), "the dialog closes", 8000);
    await dataSettled();
    await until(() => pillTitles(name)[0] === title, `the pill of ${name} reads ${title}`, 8000);
}

// A26: a click opens the record dialog
scenario("hr_actions_a26_record_dialog", GRID, async () => {
    await ready();
    assertEqual(pillTitles("HRA Abigail"), ["A - 3h 30m"], "her pill");
    await realClick(pillsOf("HRA Abigail")[0]);
    // at once: the dialog is there, without the popover's wait (the clock of the check is the tour's)
    await until(() => $(".modal-title"), "the title of the dialog", 1500);
    await recordDialogShows();
    assertEqual(
        FOOTER().filter((text) => ["Save & Close", "Discard", "Delete"].includes(text)),
        ["Save & Close", "Discard", "Delete"],
        "the footer of the creation form"
    );
    assert(!$(".modal .o_form_button_remove"), "no Remove button");
    assert(texts(".modal .o_form_statusbar button").includes("Refuse"), "the form shows Refuse");
    const stages = texts(".modal .o_statusbar_status button");
    assert(stages.includes("Draft") && stages.includes("Validated"), `the stages: ${stages}`);
    await settle(400);
    assert(!popoverOfView(), "still no popover");
    await closeDialog();
});

// A27: Save & Close saves, Discard, Escape and the cross save nothing
scenario("hr_actions_a27_save_discard", GRID, async () => {
    await ready();
    const read = () => pillTitles("HRA Abigail")[0];
    await realClick(pillsOf("HRA Abigail")[0]);
    await recordDialogShows();
    await typeInto(".modal [name='break_duration'] input", "0:30");
    await pressFooter("Save & Close");
    await closedAndShows("HRA Abigail", "A - 3h");
    assertEqual(rangeName(), "Day", "the same Day range");
    assertEqual(dateColumns()[0].dataset.date.slice(0, 10), "2026-11-11", "the same day");
    for (const way of ["Discard", "Escape", "cross"]) {
        await settle(400);
        await realClick(pillsOf("HRA Abigail")[0]);
        await recordDialogShows();
        await typeInto(".modal [name='break_duration'] input", "0:45");
        if (way === "Discard") {
            await pressFooter("Discard");
        } else if (way === "Escape") {
            stopKey("Escape");
        } else {
            await realClick($(".modal .btn-close"));
        }
        await closedAndShows("HRA Abigail", "A - 3h");
        assertEqual(read(), "A - 3h", `${way} saved nothing`);
    }
});

// A28: Delete deletes at once
scenario("hr_actions_a28_delete_at_once", GRID, async () => {
    await ready();
    await searchFor("Gantt Exact");
    await step(-1, 2);
    assertEqual(dateColumns()[0].dataset.date.slice(0, 10), "2026-11-09", "the 9th of November");
    assertEqual(pillTitles("Gantt Exact"), ["A - 8h"], "his pill");
    await realClick(pillsOf("Gantt Exact")[0]);
    await recordDialogShows();
    await pressFooter("Delete");
    await settle(300);
    assert(
        !MODALS().some((modal) => modal.textContent.includes("Bye-bye")),
        "no confirmation shows"
    );
    await until(() => !$(".modal"), "the dialog closes", 8000);
    await dataSettled();
    await until(() => pillsOf("Gantt Exact").length === 0, "the pill is gone", 8000);
});

// A29: two clicks within 200 ms open one dialog
scenario("hr_actions_a29_double_click_one_dialog", GRID, async () => {
    await ready();
    await realClick(pillsOf("HRA Abigail")[0], { count: 2 });
    await recordDialogShows();
    await closeDialog();
    await until(() => !$(".modal"), "no dialog remains");
    await settle(600);
    assertEqual(MODALS().length, 0, "still none");
});

// A30 (touch at desktop size) and A31 (phone): a tap opens the record dialog
scenario("hr_actions_a30_tap_desktop_touch", GRID, async () => {
    await ready();
    await realTap(pillsOf("HRA Abigail")[0]);
    await recordDialogShows();
    await closeDialog();
});

scenario("hr_actions_a31_tap_phone", GRID, async () => {
    await ready();
    renderer().scrollLeft += 120;
    await settle(500);
    const pill = pillsOf("HRA Abigail")[0];
    const box = rectOf(pill);
    assert(box.right > 0 && box.left < window.innerWidth, `the pill is in the window: ${box.left}`);
    await realTap(pill);
    await recordDialogShows();
    const content = rectOf($(".modal-content"));
    assertEqual(
        [Math.round(content.width), Math.round(content.height)],
        [window.innerWidth, window.innerHeight],
        "the dialog fills the screen"
    );
    await closeDialog();
});

// A32: a press and release on a handle opens the dialog and changes nothing
scenario("hr_actions_a32_handle_press_release", GRID, async () => {
    await ready();
    const pill = pillsOf("HRA Abigail")[0];
    await realHover(pill);
    const handle = await until(() => $(".o_tl_handle_stop", pill), "the end handle");
    const box = rectOf(pill);
    const before = [box.left, box.right];
    assert(rectOf(handle).width > 0, "the handle is drawn");
    await realClick(null, { at: { x: box.right - 4, y: box.top + box.height / 2 } });
    await recordDialogShows();
    await closeDialog();
    await dataSettled();
    await settle(400);
    const after = rectOf(pillsOf("HRA Abigail")[0]);
    assertEqual([after.left, after.right], before, "the pill is where it was");
});

// A33: cut pills cannot be moved, their uncut end can be resized, a click opens
scenario("hr_actions_a33_cut_pills", GRID, async () => {
    await ready();
    const all = $$(".o_tl_pill");
    assertEqual(all.length, 4, "four pills on 11 November");
    const handlesOnHover = async (pill) => {
        await realHover(pill);
        await settle(300);
        return $$(".o_tl_handle", pill).length;
    };
    const counts = {};
    for (const pill of all) {
        counts[clean($(".o_tl_pill_title", pill).textContent) + "@" + Math.round(rectOf(pill).left)] =
            await handlesOnHover(pill);
    }
    // a cut pill has the handle of its uncut end only: the end of "A - 24h", not its start
    const titleOf = (pill) => clean($(".o_tl_pill_title", pill).textContent);
    const cutPill = pillsOf("HRA Anita").find((pill) => titleOf(pill) === "A - 24h");
    assert(cutPill?.classList.contains("o_tl_pill_cut_start"), "A - 24h is cut at the start");
    await realHover(cutPill);
    await until(() => $(".o_tl_handle_stop", cutPill), "the end handle of the cut pill");
    assert(!$(".o_tl_handle_start", cutPill), "no handle on the cut end");
    const movable = all.filter((pill) => !pill.classList.contains("o_tl_pill_cut_start") && !pill.classList.contains("o_tl_pill_cut_stop"));
    assertEqual(movable.length, 2, `two movable pills of four: ${JSON.stringify(counts)}`);
    // the cut pill "A - 24h" does not move under a drag, and its click opens its dialog
    const cut = pillsOf("HRA Anita").find((pill) => clean($(".o_tl_pill_title", pill).textContent) === "A - 24h");
    assert(cut, "the pill A - 24h");
    const before = rectOf(cut);
    const start = centre(cut);
    await realDrag(start, [
        { x: start.x + 20, y: start.y },
        { x: start.x + 90, y: start.y },
        { x: start.x + 140, y: start.y },
    ]);
    await settle(800);
    const still = pillsOf("HRA Anita").find((pill) => clean($(".o_tl_pill_title", pill).textContent) === "A - 24h");
    assertEqual(rectOf(still).left, before.left, "the cut pill did not move");
    assert(!$(".o_tl_notification"), "no write, no notification");
    await realClick(still);
    await recordDialogShows();
    await closeDialog();
    await dataSettled();
    await settle(400);
    // the demo database as created: its one time rule counts no demo attendance (R12), so nothing is
    // split. Anita's uncut end, one hour column to the right, meets her next attendance (it begins
    // at 4:00:10): the Community's overlap error shows, and the pill goes back
    const titles = () => pillTitles("HRA Anita");
    assertEqual(titles(), ["A - 24h", "A - 5h"], "Anita's pills before");
    const anitaBefore = await readAttendances("HRA Anita");
    const leftBefore = rectOf(pillsOf("HRA Anita")[0]).left;
    await dragHandle(pillsOf("HRA Anita")[0], "stop", HOUR);
    await anError("Cannot create new attendance record for HRA Anita");
    assert(
        /already checked in on .*0?4:00:10/.test(clean($(".modal")?.textContent || "")),
        "the error names her next attendance, which begins at 4:00:10"
    );
    await closeDialog();
    await dataSettled();
    await settle(500);
    assertEqual(titles(), ["A - 24h", "A - 5h"], "Anita's pills after the refusal");
    assertNear(rectOf(pillsOf("HRA Anita")[0]).left, leftBefore, "the pill went back", 1);
    assertEqual(await readAttendances("HRA Anita"), anitaBefore, "nothing was written");
    // Jennie Fletcher's "A - 12h", its uncut end one hour column to the right: one attendance, 10
    // November 20:00 to 11 November 9:00 Brussels time, and Undo gives back the one of 12 h
    const jennie = () => pillTitles("HRA Jennie");
    assertEqual(jennie(), ["A - 12h"], "Jennie's pill before");
    await dragHandle(pillsOf("HRA Jennie")[0], "stop", HOUR);
    await until(() => jennie()[0] === "A - 13h", "the attendance is one hour longer", 8000);
    await dataSettled();
    assertEqual(jennie(), ["A - 13h"], "one attendance of 13 h");
    assertEqual(
        await readAttendances("HRA Jennie"),
        [["2026-11-10 19:00:00", "2026-11-11 08:00:00"]],
        "10 November 20:00 to 11 November 9:00 Brussels time"
    );
    await pressUndo();
    await until(() => jennie()[0] === "A - 12h", "Undo gives the 12 hours back", 8000);
    assertEqual(
        await readAttendances("HRA Jennie"),
        [["2026-11-10 19:00:00", "2026-11-11 07:00:00"]],
        "the one attendance of 12 h"
    );
});

// A87: a time rule that counts the attendances splits the write; Undo leaves the overtime attendance
// (decision D7, the Community's): tests/test_actions_tours.py sets the rule and the server's day
scenario("hr_actions_a87_time_rule_split_undo", GRID, async () => {
    await ready();
    await settle(500);
    const jennie = () => pillTitles("HRA Jennie");
    assertEqual(jennie(), ["A - 12h"], "Jennie's pill before");
    await dragHandle(pillsOf("HRA Jennie")[0], "stop", HOUR);
    await until(() => jennie().length === 2, "the write is split in two attendances", 8000);
    await dataSettled();
    assertEqual(jennie(), ["A - 12h", "OT - 1h"], "two pills, 12 h and the overtime hour");
    assertEqual(
        (await readAttendances("HRA Jennie")).map((row) => row.join(" to ")),
        [
            "2026-11-10 19:00:00 to 2026-11-11 07:00:00",
            "2026-11-11 07:00:00 to 2026-11-11 08:00:00",
        ],
        "20:00 to 8:00 and the overtime attendance 8:00 to 9:00 Brussels time"
    );
    await pressUndo();
    await until(
        () => jennie().length === 2 && jennie().at(-1).startsWith("\u26a0"),
        "the overtime attendance remains, with the Community's review mark",
        8000
    );
    assertEqual(jennie()[0], "A - 12h", "the first attendance reads A - 12h");
    assert(jennie()[1].includes("OT - 1h"), `the overtime attendance: ${jennie()[1]}`);
    assertEqual(
        (await readAttendances("HRA Jennie")).map((row) => row.join(" to ")),
        [
            "2026-11-10 19:00:00 to 2026-11-11 07:00:00",
            "2026-11-11 07:00:00 to 2026-11-11 08:00:00",
        ],
        "the first attendance is back to 20:00 to 8:00 and the overtime one remains"
    );
});

// A74: where the user lands
scenario("hr_actions_a74_where_user_lands", GRID, async () => {
    await ready();
    await resizeTo(900, false);
    await pickRange("week");
    await dataSettled();
    const scroller = renderer();
    scroller.scrollLeft = Math.min(scroller.scrollWidth - scroller.clientWidth, scroller.scrollLeft + 150);
    await settle(500);
    const left = scroller.scrollLeft;
    const dates = dateColumns().map((el) => el.dataset.date).join();
    assert(left > 0, `the grid is scrolled to the right: ${left}`);
    const pill = pillsOf("HRA Abigail")[0];
    assert(rectOf(pill).right > 0 && rectOf(pill).left < window.innerWidth, "her pill is in view");
    assertEqual(pillTitles("HRA Abigail"), ["A - 3h 30m"], "the pill before");
    await realClick(pill);
    await recordDialogShows();
    // another user's change, made while the dialog is open: a write of the attendance's break through the
    // server's own call (the view's editor sends nothing), so the view can show it only by reading again
    const ids = await rpc("/web/dataset/call_kw/hr.attendance/search", {
        model: "hr.attendance",
        method: "search",
        args: [[["employee_id.name", "=", "HRA Abigail"]]],
        kwargs: {},
    });
    await rpc("/web/dataset/call_kw/hr.attendance/write", {
        model: "hr.attendance",
        method: "write",
        args: [ids, { break_duration: 1 }],
        kwargs: {},
    });
    await pressFooter("Discard");
    await until(() => !$(".modal"), "the dialog closes", 8000);
    await dataSettled();
    assertEqual(rangeName(), "Week", "the same range");
    assertEqual(dateColumns().map((el) => el.dataset.date).join(), dates, "the same period");
    assertNear(renderer().scrollLeft, left, "the same scroll position", 2);
    await until(() => pillTitles("HRA Abigail")[0] === "A - 2h 30m", "the change of the other user shows", 8000);
});

// A75: Escape closes the record dialog and the view reads again
scenario("hr_actions_a75_escape", GRID, async () => {
    await ready();
    await realClick(pillsOf("HRA Abigail")[0]);
    await recordDialogShows();
    const calls = countDataCalls();
    stopKey("Escape");
    await until(() => !$(".modal"), "Escape closes the dialog");
    await until(() => calls.count >= 1, "the view reads its data again", 8000);
    assertEqual(rangeName(), "Day", "the same range");
    await dataSettled();
    // the creation dialog closes the same way, without saving
    await clickCellAt("HRA Abigail", 15);
    const created = countDataCalls();
    stopKey("Escape");
    await until(() => !$(".modal"), "Escape closes the creation dialog");
    await until(() => created.count >= 1, "the view reads its data again", 8000);
    await dataSettled();
    assertEqual(rangeName(), "Day", "the same range after the creation dialog");
    assertEqual(pillTitles("HRA Abigail"), ["A - 3h 30m"], "nothing was saved");
});

// A82: a double click, one dialog; Escape; the next click opens at once
scenario("hr_actions_a82_double_click_then_next", GRID, async () => {
    await ready();
    await realClick(pillsOf("HRA Abigail")[0], { count: 2 });
    await recordDialogShows();
    const calls = countDataCalls();
    stopKey("Escape");
    await until(() => !$(".modal"), "Escape closes the one dialog");
    await until(() => calls.count >= 1, "the view reads its data again", 8000);
    await dataSettled();
    assertEqual(MODALS().length, 0, "no dialog remains");
    assertEqual(rangeName(), "Day", "the same range");
    await settle(300);
    await realClick(pillsOf("HRA Abigail")[0]);
    await recordDialogShows();
    await closeDialog();
});

// A86: two quick taps, on desktop with touch and on the phone
const quickTaps = async () => {
    await ready();
    if (onPhone()) {
        renderer().scrollLeft += 120;
        await settle(500);
    }
    await realTap(pillsOf("HRA Abigail")[0], { count: 2 });
    await recordDialogShows();
    await closeDialog();
    await settle(500);
    assertEqual(MODALS().length, 0, "none remains");
};
scenario("hr_actions_a86_two_quick_taps", GRID, quickTaps);

// -- creating (R13 to R16, R20; A34 to A48, A75, A78) ---------------------------------------------

const { DateTime } = luxon;
const DIALOG_BUTTON = ".modal-footer button";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date and time as the form shows it, as "MM-DD HH:MM" (24 h), whatever the language's format. */
function normalised(text) {
    const numeric = text.match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
    const named = text.match(/([A-Z][a-z]{2}) (\d{1,2})/);
    const [month, day] = numeric
        ? [Number(numeric[1]), Number(numeric[2])]
        : [MONTHS.indexOf(named?.[1]) + 1, Number(named?.[2])];
    const time = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s?(AM|PM)?/);
    let hours = Number(time?.[1]);
    if (time?.[3] === "PM" && hours < 12) {
        hours += 12;
    } else if (time?.[3] === "AM" && hours === 12) {
        hours = 0;
    }
    const two = (value) => String(value).padStart(2, "0");
    return `${two(month)}-${two(day)} ${two(hours)}:${time?.[2]}`;
}

const fieldText = (name) => {
    const el = $(`.modal [data-field='${name}']`);
    return clean(el ? el.value ?? el.textContent : "");
};
const employeeOfDialog = () =>
    clean($(".modal [name='employee_id'] input")?.value || "") ||
    clean($(".modal [name='employee_id']")?.textContent || "");

/** What the open creation dialog proposes: the employee, the check-in and out, the worked time. */
function proposal() {
    return {
        employee: employeeOfDialog(),
        from: normalised(fieldText("check_in")),
        to: normalised(fieldText("check_out")),
        worked: clean($(".modal [name='worked_hours']")?.textContent || ""),
    };
}

/** The dialog titled Create shows, alone, with the footer of the creation form, and no plan dialog. */
async function creationDialogShows() {
    await until(() => $(DIALOG), "the creation dialog", 12000);
    await settle(700);
    assertEqual(MODALS().length, 1, "one dialog");
    assertEqual(titleOfDialog(), "Create", "the dialog's title");
    assertEqual(
        FOOTER().filter((text) => ["Save & Close", "Discard", "Delete"].includes(text)),
        ["Save & Close", "Discard"],
        "the footer of the creation form"
    );
}

/** The vertical middle of a row's header, where a click on a cell of the row lands. */
const rowMiddle = (name) => {
    // a view without groups draws no row header: the row is measured
    const header = ($(".o_tl_row_header", rowEl(name)) || rowEl(name)).getBoundingClientRect();
    return header.top + header.height / 2;
};

/** The header of the column that starts with `date` ("2026-11-11", or "2026-04" for a month). */
const findColumn = (date) => dateColumns().find((el) => el.dataset.date.startsWith(date));
async function columnOf(date) {
    // the grid draws the columns near its viewport only: scroll from the left until it is drawn
    const scroller = renderer();
    for (let at = 0; !findColumn(date) && at <= scroller.scrollWidth; at += scroller.clientWidth / 2) {
        scroller.scrollLeft = at;
        await settle(400);
    }
    const column = findColumn(date);
    assert(
        column,
        `a column for ${date} in ${dateColumns().map((el) => el.dataset.date)} of ${$$(".o_tl_col").length}, range ${$(".o_tl_range_button")?.textContent}, scroll ${scroller.scrollWidth}/${scroller.clientWidth}`
    );
    return column;
}

/** The point inside the cell of `name`'s row in the column of `date`, `inset` px from its left. */
async function cellPoint(name, date, inset = 20) {
    const column = await columnOf(date);
    column.scrollIntoView({ inline: "center", block: "nearest" });
    await settle(500);
    return { x: column.getBoundingClientRect().left + inset, y: rowMiddle(name) };
}

/** The point 20 px inside the cell of `hour` of a row of the Day range. */
const hourPoint = (name, hour) => {
    const cell = cellsOf(name).find((el) => Number(el.dataset.column) === hour);
    assert(cell, `the cell of ${hour}:00 in the row of ${name}`);
    return { x: cell.getBoundingClientRect().left + 20, y: rowMiddle(name) };
};

/** A click on an empty cell of the grid (the Day range's hour when `date` is a number); the
 * creation dialog is waited for. */
async function clickCell(name, date, options = {}) {
    const at = typeof date === "number" ? hourPoint(name, date) : await cellPoint(name, date);
    await realClick(null, { at, ...options });
    await creationDialogShows();
}

/** The new check-in is typed into the dialog's field, with the language's own format. */
async function setCheckIn(month, day, hours, minutes = 0) {
    const button = $(".modal .o_daterange_start");
    if (button) {
        await realClick(button);
    }
    const input = await until(() => $(".modal input[data-field='check_in']"), "the check-in input");
    input.focus();
    input.select();
    input.value = DateTime.local(2026, month, day, hours, minutes).toFormat(
        luxon.Settings.defaultLocale.startsWith("en") ? "MM/dd/yyyy HH:mm:ss" : "yyyy-MM-dd HH:mm:ss"
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle(700);
}

// A34: a click on an empty cell on the Day range
scenario("hr_actions_a34_cell_day", GRID, async () => {
    await ready();
    await clickCellAt("HRA Abigail", 15);
    await creationDialogShows();
    assertEqual(
        proposal(),
        { employee: "HRA Abigail", from: "11-11 15:00", to: "11-11 16:00", worked: "1h" },
        "the cell's hour"
    );
    assertEqual(MODALS().length, 1, "no plan dialog");
    await pressFooter("Save & Close");
    await closedAndShows("HRA Abigail", "A - 3h 30m");
    await until(
        () => pillTitles("HRA Abigail").includes("A - 1h"),
        "the new pill reads A - 1h",
        8000
    );
});

// A35 to A38: the check-out default on the Week, Month, Year and Quarter ranges
const defaultOn = (kind, name, date, expected) => async () => {
    await ready();
    await pickRange(kind);
    await dataSettled();
    await settle(500);
    await clickCell(name, date);
    assertEqual(proposal(), { ...expected, worked: "8h" }, `the ${kind} range proposes a day of 8 h`);
    assert(!$(".modal-title")?.textContent.includes("Plan"), "no plan dialog");
    await closeDialog();
};
scenario(
    "hr_actions_a35_week",
    GRID,
    defaultOn("week", "HRA Cells", "2026-11-11", {
        employee: "HRA Cells",
        from: "11-11 00:00",
        to: "11-11 08:00",
    })
);
scenario(
    "hr_actions_a36_month",
    GRID,
    defaultOn("month", "HRA Cells", "2026-11-04", {
        employee: "HRA Cells",
        from: "11-04 00:00",
        to: "11-04 08:00",
    })
);
scenario("hr_actions_a37_year", GRID, async () => {
    await ready();
    await pickRange("year");
    await dataSettled();
    await settle(500);
    await clickCell("HRA Abigail", "2026-04");
    assertEqual(
        proposal(),
        { employee: "HRA Abigail", from: "04-01 00:00", to: "04-01 08:00", worked: "8h" },
        "April's first day, a working day"
    );
    assertEqual(warnings().length, 1, "the contract warning shows (her contract starts in October)");
    await closeDialog();
});
scenario(
    "hr_actions_a38_quarter",
    GRID,
    defaultOn("quarter", "HRA Cells", "2026-11-04", {
        employee: "HRA Cells",
        from: "11-04 00:00",
        to: "11-04 08:00",
    })
);

// A39: a double click on an empty cell opens one dialog
scenario("hr_actions_a39_double_click_cell", GRID, async () => {
    await ready();
    await clickCell("HRA Beth", 15, { count: 2 });
    await settle(600);
    assertEqual(MODALS().length, 1, "still one dialog");
    await closeDialog();
    await until(() => !$(".modal"), "no dialog remains");
    await settle(500);
    assertEqual(MODALS().length, 0, "none remains");
});

// A40: a press dragged over cells on the Day range
scenario("hr_actions_a40_drag_day", GRID, async () => {
    await ready();
    const left = (hour) =>
        cellsOf("HRA Beth").find((el) => Number(el.dataset.column) === hour).getBoundingClientRect().left;
    const y = rowMiddle("HRA Beth");
    const from = { x: left(13) + 10, y };
    const to = { x: left(16) + 10, y };
    await realDrag(from, [
        { x: from.x + 40, y },
        { x: left(15), y },
        to,
    ]);
    await creationDialogShows();
    const shown = proposal();
    assertEqual([shown.employee, shown.from, shown.to], ["HRA Beth", "11-11 13:00", "11-11 16:15"], "the span");
    await closeDialog();
});

// A41: a press dragged over cells on the Week range: one working day on the first day
scenario("hr_actions_a41_drag_week", GRID, async () => {
    await ready();
    await pickRange("week");
    await dataSettled();
    await settle(500);
    const from = await cellPoint("HRA Cells", "2026-11-09");
    const to = await cellPoint("HRA Cells", "2026-11-11");
    await realDrag(from, [
        { x: from.x + 40, y: from.y },
        { x: (from.x + to.x) / 2, y: from.y },
        to,
    ]);
    await creationDialogShows();
    assertEqual(
        proposal(),
        { employee: "HRA Cells", from: "11-09 00:00", to: "11-09 08:00", worked: "8h" },
        "one day of 8 h on the first day"
    );
    await closeDialog();
});

// A42: the default follows the check-in
scenario("hr_actions_a42_follows_checkin", GRID, async () => {
    await ready();
    await pickRange("week");
    await dataSettled();
    await settle(500);
    await clickCell("HRA Cells", "2026-11-11");
    await setCheckIn(11, 12, 9);
    const week = proposal();
    assertEqual([week.from, week.to], ["11-12 09:00", "11-12 17:00"], "the week follows the check-in");
    await closeDialog();
    await pickRange("day");
    await dataSettled();
    await clickCellAt("HRA Cells", 15);
    await creationDialogShows();
    await setCheckIn(11, 11, 9);
    const day = proposal();
    assertEqual([day.from, day.to], ["11-11 09:00", "11-11 16:00"], "the day keeps its end");
    await closeDialog();
    // an opened record on the Week range keeps its check-out
    await pickRange("week");
    await dataSettled();
    await settle(500);
    await realClick(pillsOf("HRA Abigail")[0]);
    await recordDialogShows();
    const before = proposal();
    await setCheckIn(11, 11, 5);
    const after = proposal();
    assertEqual([after.from, after.to], ["11-11 05:00", before.to], "the opened record keeps its check-out");
    await closeDialog();
});

// A45 and A46: the New button
const newProposes = (kind, expected) => async () => {
    await ready();
    if (kind !== "day") {
        await pickRange(kind);
        await dataSettled();
        await settle(500);
    }
    await realClick($(".o_tl_button_add"));
    await creationDialogShows();
    assertEqual(proposal(), expected, `New on the ${kind} range`);
    await closeDialog();
};
const MITCHELL = { employee: "Mitchell Admin" };
scenario(
    "hr_actions_a45_new_day",
    GRID,
    newProposes("day", { ...MITCHELL, from: "11-11 00:00", to: "11-12 00:00", worked: "24h" })
);
scenario(
    "hr_actions_a46_new_week",
    GRID,
    newProposes("week", { ...MITCHELL, from: "11-08 00:00", to: "11-08 08:00", worked: "8h" })
);

// A78: New on the Month, Quarter and Year ranges
scenario("hr_actions_a78_new_month_quarter_year", GRID, async () => {
    await ready();
    for (const [kind, from] of [
        ["month", "11-01 00:00"],
        ["quarter", "11-01 00:00"],
        ["year", "01-01 00:00"],
    ]) {
        await pickRange(kind);
        await dataSettled();
        await settle(500);
        await realClick($(".o_tl_button_add"));
        await creationDialogShows();
        const shown = proposal();
        assertEqual(
            [shown.employee, shown.from, shown.to, shown.worked],
            ["Mitchell Admin", from, from.replace("00:00", "08:00"), "8h"],
            `New on the ${kind} range`
        );
        await closeDialog();
        await until(() => !$(".modal"), "the dialog closes");
    }
});

// A47: without the right to create nothing opens and no New shows
scenario("hr_actions_a47_no_create_none", GRID, async () => {
    await ready();
    assert(!$(".o_tl_button_add"), "no New button");
    await realClick(null, { at: hourPoint("Gantt Role None", 15) });
    await settle(1200);
    assertEqual(MODALS().length, 0, "nothing opens for a click on an empty cell");
    assert(!$(".o_popover"), "no popover either");
});

// A48: the plan dialog never opens, on any range
scenario("hr_actions_a48_never_plan", GRID, async () => {
    await ready();
    const empty = {
        day: ["HRA Cells", 15],
        week: ["HRA Cells", "2026-11-11"],
        month: ["HRA Cells", "2026-11-04"],
        quarter: ["HRA Cells", "2026-11-04"],
        year: ["HRA Cells", "2026-04"],
    };
    for (const [kind, [name, date]] of Object.entries(empty)) {
        if (kind !== "day") {
            await pickRange(kind);
            await dataSettled();
            await settle(500);
        }
        await clickCell(name, date);
        assertEqual(titleOfDialog(), "Create", `the ${kind} range opens the creation dialog`);
        assertEqual(MODALS().length, 1, `one dialog on the ${kind} range`);
        await closeDialog();
        await until(() => !$(".modal"), "the dialog closes");
    }
});

// -- moving and resizing (R17 to R19) ----------------------------------------------------------------

const HOUR = 55.5; // one hour column of the Day range at 1600 px
const MODIFIER = { ctrl: 2 };

const readAttendances = (name) =>
    rpc("/web/dataset/call_kw/hr.attendance/search_read", {
        model: "hr.attendance",
        method: "search_read",
        args: [[["employee_id.name", "=", name]], ["check_in", "check_out"]],
        kwargs: { order: "check_in asc" },
    }).then((rows) => rows.map((row) => [row.check_in, row.check_out]));

/** Press at `from`, move to `dx` px on the right in `steps` equal moves and stay pressed. */
async function pressAndMove(from, dx, steps = 12, keys = []) {
    const modifiers = keys.reduce((sum, key) => sum + MODIFIER[key], 0);
    const moves = Array.from({ length: steps }, (_, index) =>
        mouse("mouseMoved", from.x + (dx * (index + 1)) / steps, from.y, { buttons: 1, modifiers })
    );
    await send({
        events: [
            mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0, modifiers }),
            mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1, modifiers }),
            ...moves,
        ],
    });
}

async function releaseAt(point, keys = []) {
    const modifiers = keys.reduce((sum, key) => sum + MODIFIER[key], 0);
    await send({
        events: [mouse("mouseReleased", point.x, point.y, { buttons: 0, clickCount: 1, modifiers })],
    });
}

/** The pill pressed at its centre, moved by `dx` and released; returns what was seen during it. */
async function movePill(pill, dx, { keys = [] } = {}) {
    const from = centre(pill);
    await pressAndMove(from, dx, 12, keys);
    const image = await until(() => $(".o_tl_pill_moved"), "the moved image of the pill");
    const during = rectOf(image);
    await releaseAt({ x: from.x + dx, y: from.y }, keys);
    return during;
}

/** An end handle (4 px inside the edge of the pill) pressed, dragged by `dx` and released. */
async function dragHandle(pill, edge, dx) {
    await realHover(pill);
    const handle = await until(() => $(`.o_tl_handle_${edge}`, pill), `the ${edge} handle`);
    assert(rectOf(handle).width > 0, "the handle is drawn");
    const box = rectOf(pill);
    const x = edge === "stop" ? box.right - 4 : box.left + 4;
    const from = { x, y: box.top + box.height / 2 };
    await pressAndMove(from, dx, 6);
    await releaseAt({ x: from.x + dx, y: from.y });
}

/** The notifications with an Undo button. */
const undoNotices = () => $$(".o_tl_notification").filter((el) => $(".o_notification_buttons button", el));

async function anError(text) {
    await until(() => $(".modal .o_error_dialog, .modal.o_technical_modal"), "an error dialog", 8000);
    const body = clean($(".modal")?.textContent || "");
    assert(body.includes(text), `the error dialog says "${text}": ${body.slice(0, 300)}`);
    // R17, R19 (RL-T8-2): the Community's own error dialog, with the Community's title and message
    // (its title is the Community's for the kind of error: a validation, an access or an invalid operation)
    assert(
        ["Validation Error", "Access Error", "Invalid Operation"].includes(titleOfDialog()),
        `the Community's title of the error dialog: ${titleOfDialog()}`
    );
}

/** Abigail's move by two hour columns, and the readings of it (A49). */
async function moveAbigail() {
    const pill = pillsOf("HRA Abigail")[0];
    const before = rectOf(pill);
    const during = await movePill(pill, 2 * HOUR);
    await until(() => !$(".o_tl_pill_moved"), "the drag is over");
    await until(() => pillTitles("HRA Abigail")[0] === "A - 3h 30m" && Math.abs(rectOf(pillsOf("HRA Abigail")[0]).left - before.left - 2 * HOUR) < 3, "the pill is drawn two hours later", 8000);
    await dataSettled();
    const after = rectOf(pillsOf("HRA Abigail")[0]);
    return {
        duringLeft: during.left,
        duringWidth: during.width,
        values: await readAttendances("HRA Abigail"),
        left: after.left,
        width: after.width,
        notices: undoNotices().length,
    };
}

// A49: moving a pill
scenario("hr_actions_a49_move", GRID, async () => {
    await ready();
    assertEqual(pillTitles("HRA Abigail"), ["A - 3h 30m"], "the pill before");
    const first = await moveAbigail();
    // M44: the outer box of the pill being dragged, M45 the pill after it, M46 one notification
    assertNear(first.duringLeft - 1, 766.781, "the pill's outer box during the drag", 1.5);
    assertNear(first.left - 1, 766.875, "the pill after the drop", 1.5);
    assertEqual(first.notices, 1, "one notification with Undo");
    assertEqual(
        first.values,
        [["2026-11-11 08:00:00", "2026-11-11 11:30:00"]],
        "9:00 to 12:30 Brussels time"
    );
    await pressUndo();
    await until(() => Math.abs(rectOf(pillsOf("HRA Abigail")[0]).left - first.left + 2 * HOUR) < 3, "the pill is back", 8000);
    // the same gesture again gives the same readings
    const second = await moveAbigail();
    assertEqual(second, first, "two runs, the same readings");
});

// A50: Undo of a move
scenario("hr_actions_a50_undo", GRID, async () => {
    await ready();
    await moveAbigail();
    await pressUndo();
    await until(() => pillTitles("HRA Abigail")[0] === "A - 3h 30m", "the pill is drawn", 8000);
    assertEqual(
        await readAttendances("HRA Abigail"),
        [["2026-11-11 06:00:00", "2026-11-11 09:30:00"]],
        "7:00 to 10:30 Brussels time again"
    );
});

// A51: resizing the end
scenario("hr_actions_a51_resize_end", GRID, async () => {
    await ready();
    await dragHandle(pillsOf("HRA Abigail")[0], "stop", HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(
        await readAttendances("HRA Abigail"),
        [["2026-11-11 06:00:00", "2026-11-11 10:30:00"]],
        "the check-out is 11:30 Brussels time, the check-in 7:00"
    );
});

// A52: a refused move
scenario("hr_actions_a52_refused_move", GRID, async () => {
    await ready();
    const before = rectOf(pillsOf("HRA Abigail")[0]);
    await movePill(pillsOf("HRA Abigail")[0], 2 * HOUR);
    await anError("Cannot create new attendance record");
    await closeDialog();
    await dataSettled();
    await settle(500);
    const after = rectOf(pillsOf("HRA Abigail")[0]);
    assertNear(after.left, before.left, "the pill went back", 1);
    assertEqual(pillTitles("HRA Abigail")[0], "A - 3h 30m", "with its title");
    assertEqual(
        (await readAttendances("HRA Abigail")).map((row) => row[0]),
        ["2026-11-11 06:00:00", "2026-11-11 11:00:00"],
        "the attendance was not written"
    );
});

// A53: Ctrl with a drag
scenario("hr_actions_a53_ctrl_copy", GRID, async () => {
    await ready();
    const before = rectOf(pillsOf("HRA Abigail")[0]);
    const rows = await readAttendances("HRA Abigail");
    await movePill(pillsOf("HRA Abigail")[0], 4 * HOUR, { keys: ["ctrl"] });
    await anError("cannot duplicate an attendance");
    await closeDialog();
    await dataSettled();
    await settle(500);
    assertEqual(await readAttendances("HRA Abigail"), rows, "nothing was added or moved");
    assertNear(rectOf(pillsOf("HRA Abigail")[0]).left, before.left, "the pill is where it was", 1);
});

// -- open attendances (R18, D4) --------------------------------------------------------------------

/**
 * The browser's clock of the view reads 11 November 11:00:02 (Brussels) for every load made while
 * `body` runs: the luxon clock the model takes the "now" of a load from stands still (the page's own
 * clock goes on). RL-T8-1: the check-out of an end drag is the load's "now" with its seconds, which a
 * running clock cannot give twice.
 */
const loadedAtEleven = (body) => async () => {
    const saved = luxon.Settings.now;
    luxon.Settings.now = () => Date.UTC(2026, 10, 11, 10, 0, 2);
    try {
        await body();
    } finally {
        luxon.Settings.now = saved;
    }
};

const MOVED = "Gantt Moved";
const movedScenario = (name, body) => scenario(name, GRID, loadedAtEleven(async () => {
    await ready();
    assertEqual(
        luxon.DateTime.now().toUTC().toFormat("HH:mm:ss"),
        "10:00:02",
        "the load instant is frozen"
    );
    await searchFor(MOVED);
    await until(() => pillsOf(MOVED).length === 1, "the pill of the open attendance");
    await dataSettled();
    await body();
}));

/** The pill of "Gantt Moved" reads "A" and is `hours` hour columns long. */
function assertDrawn(hours, what) {
    assertEqual(pillTitles(MOVED), ["A"], `${what}: the pill reads A`);
    assertNear(rectOf(pillsOf(MOVED)[0]).width, hours * HOUR, `${what}: its length`, 3);
}

const OPEN_FROM = (hour) => [[`2026-11-11 ${hour}:00:00`, false]];

// A54: moving an open attendance keeps it open
movedScenario("hr_actions_a54_move_open", async () => {
    assertDrawn(3.25, "before"); // 8:00 to 11:15
    const before = rectOf(pillsOf(MOVED)[0]);
    await movePill(pillsOf(MOVED)[0], 2 * HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(await readAttendances(MOVED), OPEN_FROM("09"), "check-in 09:00:00 UTC, no check-out");
    // M47 corrected by D4: the attendance is still open and its pill reads "A" alone
    assertEqual(pillTitles(MOVED), ["A"], "the pill still reads A");
    const after = rectOf(pillsOf(MOVED)[0]);
    assertNear(after.width, 1.25 * HOUR, "drawn from 10:00 to 11:15", 3);
    assertNear(after.right, before.right, "up to the same instant", 2);
});

// A55: resizing the start of an open attendance
movedScenario("hr_actions_a55_resize_start_open", async () => {
    await dragHandle(pillsOf(MOVED)[0], "start", -HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(await readAttendances(MOVED), OPEN_FROM("06"), "the check-in is 7:00 Brussels time");
    assertEqual(pillTitles(MOVED), ["A"], "the pill still reads A");
});

// A56: Undo after moving an open attendance
movedScenario("hr_actions_a56_undo_move_open", async () => {
    const before = rectOf(pillsOf(MOVED)[0]);
    await movePill(pillsOf(MOVED)[0], 2 * HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    await pressUndo();
    await until(() => Math.abs(rectOf(pillsOf(MOVED)[0]).width - before.width) < 3, "the pill is drawn from 8:00", 8000);
    assertEqual(await readAttendances(MOVED), OPEN_FROM("07"), "check-in 07:00:00 UTC, no check-out");
    assertEqual(pillTitles(MOVED), ["A"], "the pill reads A");
    assertNear(rectOf(pillsOf(MOVED)[0]).left, before.left, "drawn from 8:00", 2);
});

// A76: dragging the end of an open attendance
movedScenario("hr_actions_a76_end_drag_open", async () => {
    await dragHandle(pillsOf(MOVED)[0], "stop", HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(
        await readAttendances(MOVED),
        [["2026-11-11 07:00:00", "2026-11-11 11:00:02"]],
        "the check-out is the moment of the load plus an hour, with its seconds"
    );
    await until(() => pillTitles(MOVED)[0] === "A - 4h", "the pill reads A - 4h", 8000);
});

// A83: Undo after dragging the end of an open attendance
movedScenario("hr_actions_a83_undo_end_drag_open", async () => {
    await dragHandle(pillsOf(MOVED)[0], "stop", HOUR);
    await until(() => pillTitles(MOVED)[0] === "A - 4h", "the pill reads A - 4h", 8000);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await pressUndo();
    await until(() => pillTitles(MOVED)[0] === "A", "the attendance is open again", 8000);
    assertEqual(await readAttendances(MOVED), OPEN_FROM("07"), "check-in 07:00:00 UTC, no check-out");
});

// A63: a Self user cannot write a validated attendance
scenario("hr_actions_a63_self_validated", CALENDAR, async () => {
    await settle();
    await switchTo("Gantt");
    await ready(1);
    const name = rowNames()[0];
    const before = rectOf(pillsOf(name)[0]);
    await movePill(pillsOf(name)[0], 2 * HOUR);
    await anError("access to: - Attendance");
    await closeDialog();
    await dataSettled();
    await settle(500);
    assertNear(rectOf(pillsOf(name)[0]).left, before.left, "the pill went back", 1);
    assertEqual(
        await readAttendances(name),
        [["2026-11-11 07:00:00", "2026-11-11 09:00:00"]],
        "the attendance was not written"
    );
});

// -- the monthly view of an employee (R4, R22) -------------------------------------------------------

const WORKED_HOURS = "button[name='action_open_last_month_attendances']";
const EMPLOYEE_FORM = ".o_form_view .o_field_widget[name='name']";
const BAND = ".o_hag_overview_band";
/** The cards of the band as "29h Work": the hours, then the work entry type's name. */
const cards = () =>
    $$(`${BAND} .o_attendance_entry_card`).map(
        (card) =>
            `${clean($(".o_attendance_entry_duration", card).textContent)} ${clean(
                $(".o_attendance_entry_name", card).textContent
            )}`
    );

/**
 * The worked-hours button of the employee form that is open is pressed; the form's buttons are
 * behind the button-box toggle on the phone (R22), and `viaToggle` says which way is expected.
 */
async function pressWorkedHours({ viaToggle = null } = {}) {
    await until(() => $(EMPLOYEE_FORM), "the employee form", 30000);
    await settle(900);
    let button = $(WORKED_HOURS);
    if (viaToggle !== null) {
        assertEqual(!button, viaToggle, `the button is ${viaToggle ? "behind the toggle" : "in the bar"}`);
    }
    if (!button) {
        const toggle = await until(
            () => $(".o_form_view .o-form-buttonbox .o_button_more"),
            "the button-box toggle"
        );
        await realClick(toggle);
        button = await until(
            () => $(`.o-dropdown--menu ${WORKED_HOURS}`),
            "the worked-hours button in the menu of the toggle"
        );
        // the menu is a sheet that slides in: click once it rests
        await settle(900);
        button = $(`.o-dropdown--menu ${WORKED_HOURS}`);
    }
    await realClick(button);
    await until(() => $(".o_list_view"), "the list of the month", 20000);
    await settle(600);
}

/** Gantt is chosen in the switcher of the monthly action; the view and its band are drawn. */
async function showMonthlyGantt() {
    await switchTo("Gantt");
    await until(() => $(".o_tl_renderer .o_tl_row"), "the grid", 30000);
    await settle(300);
    await until(() => $(BAND), "the overview band");
    await dataSettled();
    await settle(900);
}

/** A range of the menu is chosen (the view has no row header, which `pickRange` waits for). */
async function chooseRange(kind) {
    const label = kind[0].toUpperCase() + kind.slice(1);
    $(".o_tl_range_button").click();
    const item = await until(() => $(`.o_tl_range_menu .o_tl_range_${kind}`), `the ${kind} item`);
    item.click();
    await until(() => rangeName() === label, `the range ${label}`);
    await dataSettled();
    await settle(800);
}

/** A pill's box: its body lies one pixel inside it (002a). */
const boxOfPill = (pill) => {
    const rect = rectOf(pill);
    return { left: rect.left - 1, width: rect.width + 2 };
};

// A6 and the phone's part of R22: the button, the list, the switcher
const monthlyList = (phone) => async () => {
    await pressWorkedHours({ viaToggle: phone });
    assertEqual(lastCrumb(), "Attendances This Month", "the action's name");
    const entries = await switcherEntries();
    assertEqual(entries.names, ["List", "Gantt"], "the switcher shows List and Gantt");
    assertEqual(entries.active, ["List"], "List is active");
    const groups = $$(".o_list_view .o_group_header");
    assert(groups.length > 0, "the list is grouped (by week)");
    assert(/W\d+/.test(clean(groups[0].textContent)), `a week group: ${groups[0].textContent}`);
};
scenario("hr_actions_a6_monthly_list", EMPLOYEE_FORM, monthlyList(false));
scenario("hr_actions_a6_monthly_list_phone", EMPLOYEE_FORM, monthlyList(true));

// A7 (structure) and A8: the overview follows the period
const overviewFollows = (phone) => async () => {
    await pressWorkedHours({ viaToggle: phone });
    await showMonthlyGantt();
    assertEqual(rangeName(), "Month", "the Month range");
    assert(
        dateColumns().every((el) => el.dataset.date.startsWith("2026-11")),
        "the days of November 2026"
    );
    await until(() => cards().length, "the card of the month");
    assertEqual(cards(), ["29h Work"], "the hours of the month by work entry type");
    const band = rectOf($(BAND));
    assertNear(band.height, 96, "the band's height", 0.5);
    assertNear(band.width, window.innerWidth, "as wide as the view", 1);
    assert(rectOf(renderer()).top >= band.bottom - 0.5, "the grid lies under the band");
    // one unnamed row: no header text, no avatar, no label, no bar
    assertEqual(rowNames(), [""], "one unnamed row");
    assertEqual(pillsOf("").length, 2, "its two pills");
    assert(!$(".o_tl_row_label"), "no label");
    assert(!$(".o_tl_row_header .o_hrg_avatar"), "no avatar");
    assert(!$(".o_tl_progress:not(.o_hag_bar_space)"), "no bar");
    // October: no card, the band keeps its height
    await step(-1);
    await until(() => cards().length === 0, "no card in October");
    assertNear(rectOf($(BAND)).height, 96, "the band keeps its height in October", 0.5);
    // December, after two steps
    await step(1, 2);
    await settle(1200);
    assertEqual(cards(), [], "no card in December");
    assertNear(rectOf($(BAND)).height, 96, "the band keeps its height in December", 0.5);
    // and back: the cards follow the period both ways
    await step(-1);
    await until(() => cards().length === 1, "the card of November again");
    assertEqual(cards(), ["29h Work"], "November again");
};
scenario("hr_actions_a8_overview_follows_period", EMPLOYEE_FORM, overviewFollows(false));
scenario("hr_actions_a8_overview_follows_period_phone", EMPLOYEE_FORM, overviewFollows(true));

// A66: the monthly view on the phone, reached through the button-box toggle
scenario("hr_actions_a66_monthly_phone", EMPLOYEE_FORM, async () => {
    await pressWorkedHours({ viaToggle: true });
    await showMonthlyGantt();
    await until(() => cards().length, "the card of the month");
    assertNear(rectOf($(BAND)).height, 96, "the band's height", 0.5);
    assert(rectOf(renderer()).top >= rectOf($(BAND)).bottom - 0.5, "the grid lies under the band");
});

// A9: the overview is the form's employee's
scenario("hr_actions_a9_overview_employee", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await until(() => cards().length, "the card of the employee");
    assertEqual(cards(), ["3h 30m Work"], "her attendance of 11 November, not Anita's 29 h");
});
scenario("hr_actions_a9_overview_open", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await settle(1500);
    assertEqual(pillsOf("").length, 1, "the open attendance is drawn");
    assertEqual(cards(), [], "an open attendance adds no card");
    assertNear(rectOf($(BAND)).height, 96, "the band keeps its height", 0.5);
});

// A77: creating proposes the form's employee
scenario("hr_actions_a77_create_form_employee", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await clickCell("", "2026-11-17");
    assertEqual(
        proposal(),
        { employee: "HRA Anita", from: "11-17 00:00", to: "11-17 08:00", worked: "8h" },
        "a click on 17 November"
    );
    assertEqual(warnings().length, 0, "no warning");
    await closeDialog();
    await until(() => !$(".modal"), "the dialog closes");
    await realClick($(".o_tl_button_add"));
    await creationDialogShows();
    assertEqual(
        proposal(),
        { employee: "HRA Anita", from: "11-01 00:00", to: "11-01 08:00", worked: "8h" },
        "the New button"
    );
    await closeDialog();
    await until(() => !$(".modal"), "the dialog closes");
    const from = await cellPoint("", "2026-11-17");
    const to = await cellPoint("", "2026-11-19");
    const y = rowMiddle("");
    await realDrag({ x: from.x, y }, [
        { x: from.x + 20, y },
        { x: (from.x + to.x) / 2, y },
        { x: to.x, y },
    ]);
    await creationDialogShows();
    assertEqual(
        proposal(),
        { employee: "HRA Anita", from: "11-17 00:00", to: "11-17 08:00", worked: "8h" },
        "a press dragged from 17 to 19 November"
    );
    await closeDialog();
});

// A80: the range chosen around today in the monthly view
scenario("hr_actions_a80_week_around_today", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    if (onPhone()) {
        // scrolled to the end of the month
        renderer().scrollLeft = renderer().scrollWidth;
        await settle(600);
    }
    await chooseRange("week");
    const dates = dateColumns().map((el) => el.dataset.date.slice(0, 10));
    assert(dates.includes("2026-11-11"), `today's day is in the week: ${dates}`);
    assert(
        dates.every((date) => date >= "2026-11-08" && date <= "2026-11-14"),
        `the week of 8 to 14 November: ${dates}`
    );
    assert(dates.includes("2026-11-09") && dates.includes("2026-11-13"), `Monday to Friday: ${dates}`);
});

// A81: lunch rounding in the monthly view (half days, as 002d2 S7 draws them)
scenario("hr_actions_a81_lunch_rounding", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    const pills = pillsOf("");
    assertEqual(pills.length, 5, "five pills");
    const column = (date) => rectOf(dateColumns().find((el) => el.dataset.date.startsWith(date)));
    const expectations = [
        ["2026-11-02", 0, 1], // 9:00 to 13:00, the morning half
        ["2026-11-03", 1, 1], // 12:30 to 17:00, the afternoon half
        ["2026-11-04", 1, 1], // 11:00 to 15:00, the afternoon half
        ["2026-11-05", 0, 2], // 10:00 to 15:00, both halves
        ["2026-11-06", 0, 1], // 11:30 to 12:15, the morning half
    ];
    for (const [date, from, size] of expectations) {
        const day = column(date);
        const half = day.width / 2;
        const pill = pills.find((candidate) => {
            const box = boxOfPill(candidate);
            return box.left >= day.left - 1 && box.left < day.right - 1;
        });
        assert(pill, `a pill on ${date}`);
        const box = boxOfPill(pill);
        assertNear(box.left, day.left + from * half, `${date}: left`);
        assertNear(box.width, size * half, `${date}: width`);
    }
});

// A85: the form's employee, its hours and its warning
const proposesOn17 = (employee, to, { warned = false, readonly = false } = {}) => async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await clickCell("", "2026-11-17");
    assertEqual(
        proposal(),
        { employee, from: "11-17 00:00", to: `11-17 ${to}`, worked: `${Number(to.slice(0, 2))}h` },
        `the dialog for ${employee}`
    );
    assertEqual(warnings().length, warned ? 1 : 0, warned ? "the warning shows" : "no warning");
    if (warned) {
        assertEqual(links().length, 1, "with the link");
        assertEqual(clean(links()[0].textContent), "Correct employee", "the link's text");
    }
    if (readonly) {
        assert(!$(".modal .o_field_widget[name='employee_id'] input"), "the employee is read-only");
    }
    await closeDialog();
};
scenario("hr_actions_a85_monthly_toni", EMPLOYEE_FORM, proposesOn17("HRA Toni", "04:00"));
scenario("hr_actions_a85_monthly_beth", EMPLOYEE_FORM, proposesOn17("HRA Beth", "08:00", { warned: true }));
scenario("hr_actions_a85_monthly_team", EMPLOYEE_FORM, proposesOn17("Gantt Role Peer", "08:00"));
scenario(
    "hr_actions_a85_monthly_self",
    EMPLOYEE_FORM,
    proposesOn17("Gantt Role Self", "08:00", { readonly: true })
);

// Self reaches the monthly view of its own employee alone: the button is not on another's form
scenario("hr_actions_a85_self_other_form", EMPLOYEE_FORM, async () => {
    await until(() => $(EMPLOYEE_FORM), "the employee form", 30000);
    await settle(1500);
    assert(!$(WORKED_HOURS), "no worked-hours button on another employee's form");
    assert(!$(".o_form_view .o-form-buttonbox .o_button_more"), "nothing behind a toggle either");
});

// No role: no New, and a click on a cell opens nothing
scenario("hr_actions_a85_monthly_none", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    assert(!$(".o_tl_button_add"), "no New button");
    await realClick(null, { at: await cellPoint("", "2026-11-17") });
    await settle(1200);
    assertEqual(MODALS().length, 0, "nothing opens for a click on a cell");
});

// In the list of the same action New opens the Community form with the user's own employee
scenario("hr_actions_a85_list_new", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await realClick(await until(() => $(".o_list_button_add"), "the New button of the list"));
    const input = await until(
        () => $(".o_form_view .o_field_widget[name='employee_id'] input"),
        "the Community form"
    );
    assertEqual(clean(input.value), "Mitchell Admin", "the user's own employee");
});

// A90: the monthly action's search menu is the Community's other attendance search view: no contract
// filter, its own Date grouping, in the Gantt view and in the List view alike (R5, R6; M98, M99)
const MONTHLY_FILTERS = [
    "My Attendances",
    "My Team",
    "To Validate",
    "Validated",
    "Refused",
    "Date",
    "Active Employees",
    "Archived Employees",
];
async function monthlyMenu(what) {
    await openSearchMenu();
    // the menu's own "Custom Filter..." entry is the framework's, not the search view's
    assertEqual(
        texts(FILTERS).filter((text) => !text.startsWith("Custom Filter")),
        MONTHLY_FILTERS,
        `the filters of ${what}`
    );
    assertEqual(texts(GROUPINGS), ["Employee", "Date"], `the groupings of ${what}`);
    assert($(".o_add_custom_group_menu"), `Custom Group is offered in ${what}`);
    await closeSearchMenu();
}
scenario("hr_actions_a90_monthly_search", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await monthlyMenu("the Gantt view");
    // Date is chosen as grouping: a facet shows, the one unnamed row does not change (002a R19)
    const pills = pillTitles("");
    await openSearchMenu();
    const date = $$(GROUPINGS).find((el) => clean(el.textContent) === "Date");
    date.click();
    // a grouping on a date offers its intervals: Month is chosen
    const month = await until(
        () =>
            $$(".o_group_by_menu .o_item_option, .o_group_by_menu .dropdown-item").find(
                (el) => clean(el.textContent) === "Month"
            ),
        "the Month interval of the Date grouping",
        3000
    ).catch(() => null);
    month?.click();
    await until(() => facets().some((facet) => facet.includes("Date")), "the facet of the Date grouping");
    await settle(1200);
    await dataSettled();
    assertEqual(rowNames(), [""], "the one unnamed row is unchanged");
    assertEqual(pillTitles(""), pills, "with the same pills");
    await closeSearchMenu();
    await switchTo("List");
    await until(() => $(".o_list_view"), "the list view");
    await settle();
    await monthlyMenu("the List view");
});

// A91: the overview is loaded again after a save in a dialog (R4 point 2)
scenario("hr_actions_a91_overview_after_save", EMPLOYEE_FORM, async () => {
    await pressWorkedHours();
    await showMonthlyGantt();
    await until(() => cards().length, "the card of the month");
    assertEqual(cards(), ["29h Work"], "the card before");
    const pill = pillsOf("").find((el) => clean($(".o_tl_pill_title", el).textContent) === "A - 5h");
    assert(pill, `her pill "A - 5h" in ${pillTitles("")}`);
    await realClick(pill);
    await recordDialogShows();
    await typeInto(".modal [name='break_duration'] input", "1:00");
    await pressFooter("Save & Close");
    await until(() => !$(".modal"), "the dialog closes", 8000);
    await dataSettled();
    await until(() => cards().join() === "28h Work", `the card reads 28h Work, it reads ${cards()}`, 8000);
});

// A92: the monthly view from the public profile, opened from the Employees application (R4 point 4)
scenario("hr_actions_a92_public_profile", ".o_kanban_view .o_kanban_record", async () => {
    await settle(900);
    const card = $$(".o_kanban_record").find((el) => clean(el.textContent).includes("Gantt Role Peer"));
    assert(card, `the card of Gantt Role Peer in ${texts(".o_kanban_record")}`);
    await realClick(card);
    await until(() => $(".o_form_view .o_field_widget[name='name']"), "the public profile", 30000);
    await pressWorkedHours();
    await showMonthlyGantt();
    await until(() => cards().length, "the card of the employee");
    assertEqual(cards(), ["2h Work"], "the overview shows the employee's card");
    await clickCell("", "2026-11-17");
    assertEqual(proposal().employee, "Gantt Role Peer", "a click on a cell proposes the employee");
    await closeDialog();
});

// -- the matrix of roles (R21; A57 to A63) ------------------------------------------------------------
// One user per role (tests/actions_fixtures.py). Where a role may not act the control is absent: what
// is counted here is what the user sees; the server's refusals are in tests/test_roles.py.

const NEW_BUTTON = ".o_tl_button_add";
const SECTIONS = () => texts(".o_menu_sections [data-menu-xmlid]");

/** The names of the applications of the home menu (the grid button at the left of the top bar). */
async function appsOfHomeMenu() {
    $(".o_navbar_apps_menu button").click();
    await until(() => $(".o_home_menu .o_app"), "the applications of the home menu");
    await settle(500);
    const apps = texts(".o_home_menu .o_app .o_caption");
    $(".o_navbar_apps_menu button").click();
    await until(() => !$(".o_home_menu") && $(CALENDAR), "the home menu closes and the calendar is back");
    return apps;
}

/**
 * My Attendances by its address (R3, R21): the calendar shows; the top bar offers `sections`
 * (the Community's menus); the home menu offers the Attendances application or not; the Gantt
 * view shows the user's own row (`row`, null for a user with no employee).
 */
const mineByAddress = ({ attendances, sections, row }) => async () => {
    await settle();
    assert($(CALENDAR), "the calendar shows");
    const apps = await appsOfHomeMenu();
    assertEqual(apps.includes("Attendances"), attendances, `the home menu: ${apps}`);
    assert(apps.includes("Employees"), `the Employees application stays: ${apps}`);
    assertEqual(SECTIONS(), sections, "the menus of the top bar");
    if (row) {
        await switchTo("Gantt");
        await ready(1);
        assertEqual(rowNames(), [row], "the user's own row");
        assertEqual(SECTIONS(), sections, "the menus of the top bar on the Gantt view too");
    }
};
const ALL_MENUS = ["My Attendances", "Management", "Kiosk Mode", "Reporting"];
// M57 (none), M63 (Self), M69 (Team), M75 (All), M81 (All and Employees officer)
scenario("hr_actions_r21_mine_none", CALENDAR, mineByAddress({ attendances: false, sections: [], row: "Gantt Role None" }));
scenario("hr_actions_r21_mine_self", CALENDAR, mineByAddress({ attendances: true, sections: ["My Attendances"], row: "Gantt Role Self" }));
scenario("hr_actions_r21_mine_team", CALENDAR, mineByAddress({ attendances: true, sections: [], row: "Gantt Role Team" }));
scenario("hr_actions_r21_mine_all", CALENDAR, mineByAddress({ attendances: true, sections: ALL_MENUS, row: "Gantt Role All" }));
scenario("hr_actions_r21_mine_allhr", CALENDAR, mineByAddress({ attendances: true, sections: ALL_MENUS, row: "Gantt Role Allhr" }));
scenario("hr_actions_r21_mine_admin", CALENDAR, mineByAddress({ attendances: true, sections: [...ALL_MENUS, "Configuration"], row: "Mitchell Admin" }));

/** The pills of the view, and how many of them show resize handles when the pointer rests on them. */
async function movablePills() {
    const pills = $$(".o_tl_pill");
    let movable = 0;
    for (const pill of pills) {
        await realHover(pill);
        await settle(150);
        if ($$(".o_tl_handle", pill).length) {
            movable++;
        }
    }
    await pointerAway();
    return { pills: pills.length, movable };
}

/** The search menu: the contract filters by role, and no Date grouping whatever the role. */
async function searchMenuOfRole(filters) {
    await filtersShown(filters)();
    assert(!texts(GROUPINGS).includes("Date"), `no Date grouping: ${texts(GROUPINGS)}`);
    await closeSearchMenu();
}

const FORM_ROOT = ".modal .o_form_view";
const headerButtons = () => texts(".modal .o_statusbar_buttons button");
const employeeInput = () => $(".modal .o_field_widget[name='employee_id'] input");

/** The record dialog of the pill of `name`: its footer, its status bar buttons and its employee. */
async function pillDialog(name, { footer, refuse, employeeEditable, readOnly = false }) {
    await realClick(pillsOf(name)[0]);
    await recordDialogShows();
    const shown = $$(".modal-footer button").filter(isDrawn).map((el) => clean(el.textContent));
    assertEqual(shown, footer, `the footer of the dialog of ${name}`);
    assertEqual(headerButtons().includes("Refuse"), refuse, `Refuse: ${headerButtons()}`);
    assertEqual(headerButtons().includes("Validate"), false, `no Validate: ${headerButtons()}`);
    assertEqual(Boolean(employeeInput()), employeeEditable, "the employee field is editable or not");
    const inputs = $$(`${FORM_ROOT} input:not([type=hidden]):not([readonly]):not([disabled])`);
    assertEqual(inputs.length === 0, readOnly, `the form is read only: ${inputs.length} inputs`);
    await closeDialog();
    await until(() => !$(".modal"), "the dialog closes");
}

/** A click on an empty cell of the row of `name`: the creation dialog proposes `employee`. */
async function creationFor(name, employee, { employeeEditable }) {
    await clickCell(name, 15);
    assertEqual(employeeOfDialog(), employee, "the employee of the creation dialog");
    assertEqual(Boolean(employeeInput()), employeeEditable, "the employee field is editable or not");
    await closeDialog();
    await until(() => !$(".modal"), "the dialog closes");
}

// A57 (M52 to M56): No role
scenario("hr_actions_a57_role_none", GRID, async () => {
    await ready(1);
    assertEqual(rowNames(), ["Gantt Role None"], "one row (M52)");
    assert(!$(NEW_BUTTON), "no New button (M53)");
    assertEqual(await movablePills(), { pills: 1, movable: 0 }, "one pill that cannot be moved (M54)");
    await searchMenuOfRole(false); // M55
    // a drag does nothing: no image of the pill follows the pointer, nothing is written
    const pillBefore = rectOf(pillsOf("Gantt Role None")[0]);
    const from = centre(pillsOf("Gantt Role None")[0]);
    await pressAndMove(from, 2 * HOUR);
    await settle(400);
    // A57 (R17): no handles, and the pill stays in its place under the press and drag
    assertEqual($$(".o_tl_handle").length, 0, "no handles under the press");
    assertNear(rectOf(pillsOf("Gantt Role None")[0]).left, pillBefore.left, "the pill stays in place", 1);
    // the framework holds a locked pill in place: its ghost does not follow the pointer
    const held = $(".o_tl_pill_moved");
    assert(!held || Math.abs(centre(held).x - from.x) < 5, "the pill did not follow the pointer");
    await releaseAt({ x: from.x + 2 * HOUR, y: from.y });
    await settle(900);
    assertNear(rectOf(pillsOf("Gantt Role None")[0]).left, pillBefore.left, "the pill is still in place", 1);
    assertEqual(MODALS().length, 0, "nothing opens after the drag");
    assertEqual(
        await readAttendances("Gantt Role None"),
        [["2026-11-11 07:00:00", "2026-11-11 09:00:00"]],
        "the attendance was not written"
    );
    // the dialog is the read-only form with Discard alone (M56)
    await pillDialog("Gantt Role None", { footer: ["Discard"], refuse: false, employeeEditable: false, readOnly: true });
});

// A58 (M58 to M62): Self
scenario("hr_actions_a58_role_self", GRID, async () => {
    await ready(1);
    assertEqual(rowNames(), ["Gantt Role Self"], "its own row only (M58)");
    assert($(NEW_BUTTON), "the New button (M59)");
    assertEqual(await movablePills(), { pills: 1, movable: 1 }, "its pill can be moved (M60)");
    await searchMenuOfRole(false); // M61
    await creationFor("Gantt Role Self", "Gantt Role Self", { employeeEditable: false });
    await pillDialog("Gantt Role Self", {
        footer: ["Save & Close", "Discard"], // M62
        refuse: false,
        employeeEditable: false,
    });
    await movePill(pillsOf("Gantt Role Self")[0], 2 * HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(
        await readAttendances("Gantt Role Self"),
        [["2026-11-11 09:00:00", "2026-11-11 11:00:00"]],
        "the move was written"
    );
});

// A59 (M64 to M68): Team
scenario("hr_actions_a59_role_team", GRID, async () => {
    await ready(2);
    assertEqual(rowNames(), ["Gantt Role Peer", "Gantt Role Team"], "the employees it manages (M64)");
    assert($(NEW_BUTTON), "the New button (M65)");
    assertEqual(await movablePills(), { pills: 2, movable: 2 }, "both pills can be moved (M66)");
    await searchMenuOfRole(true); // M67
    await creationFor("Gantt Role Peer", "Gantt Role Peer", { employeeEditable: true });
    await pillDialog("Gantt Role Team", {
        footer: ["Save & Close", "Discard", "Delete"], // M68
        refuse: true,
        employeeEditable: true,
    });
    await pillDialog("Gantt Role Peer", {
        footer: ["Save & Close", "Discard", "Delete"],
        refuse: true,
        employeeEditable: true,
    });
    await movePill(pillsOf("Gantt Role Peer")[0], 2 * HOUR);
    await until(() => undoNotices().length === 1, "the notification with Undo", 8000);
    await dataSettled();
    assertEqual(
        await readAttendances("Gantt Role Peer"),
        [["2026-11-11 09:00:00", "2026-11-11 11:00:00"]],
        "the move was written"
    );
});

/**
 * A60, A61 (M70 to M74, M76 to M80) and the administrator: every employee, twenty to a page
 * (the test makes 20 employees named "Gantt Page 01" to "20", four of them with an attendance, and
 * the fifth one without a contract); the warning follows the Employees officer group (`link`).
 */
const everyone = (link) => async () => {
    await ready(20);
    assert(/^1-20 \/ \d+$/.test(pager()), `twenty rows to the page (M70): ${pager()}`);
    assert($(NEW_BUTTON), "the New button (M71)");
    assertEqual(await movablePills(), { pills: 4, movable: 4 }, "the four pills can be moved (M72)");
    await searchMenuOfRole(true); // M73
    await pillDialog("Gantt Page 01", {
        footer: ["Save & Close", "Discard", "Delete"], // M74
        refuse: true,
        employeeEditable: true,
    });
    // the warning of an employee with no contract, with the link for the Employees officer only
    await clickCellAt("Gantt Page 05", 15);
    assertEqual(warnings().length, 1, "the warning shows");
    assertEqual(links().length, link ? 1 : 0, link ? "with the link" : "without the link");
    await closeDialog();
    await until(() => !$(".modal"), "the dialog closes");
};
scenario("hr_actions_a60_role_all", GRID, everyone(false));
scenario("hr_actions_a61_role_allhr", GRID, everyone(true));
scenario("hr_actions_r21_role_admin", GRID, everyone(true));

// R21 "the warning" and "the link": every role sees the warning on its attendance in the dialog;
// the link needs the Employees officer group (the test ended every contract before 11 November)
const warningOnPill = (link) => async () => {
    await ready();
    const name = rowNames().includes("Gantt Role Peer") ? "Gantt Role Peer" : rowNames()[0];
    await realClick(pillsOf(name)[0]);
    await recordDialogShows();
    await until(() => warnings().length === 1, `the warning shows on the attendance of ${name}`);
    assertEqual(links().length, link ? 1 : 0, link ? "with the link" : "without the link");
    await closeDialog();
};
scenario("hr_actions_r21_warning_link", GRID, warningOnPill(true));
scenario("hr_actions_r21_warning_no_link", GRID, warningOnPill(false));

// A62: a team officer of four employees (the demo's Marc Demo in CI is a created user)
scenario("hr_actions_a62_team_officer", GRID, async () => {
    await ready(5);
    assertEqual(
        rowNames(),
        ["Gantt Managed 1", "Gantt Managed 2", "Gantt Managed 3", "Gantt Managed 4", "Gantt Officer"],
        "five rows, the four employees it manages and its own"
    );
    await pillDialog("Gantt Managed 1", {
        footer: ["Save & Close", "Discard", "Delete"],
        refuse: true,
        employeeEditable: true,
    });
    await creationFor("Gantt Managed 4", "Gantt Managed 4", { employeeEditable: true });
});

// A62 with the demo data: Marc Demo
scenario("hr_actions_a62_demo_marc", GRID, async () => {
    await ready(5);
    assertEqual(rowNames().length, 5, `five rows: ${rowNames()}`);
    await pillDialog("Abigail Peterson", {
        footer: ["Save & Close", "Discard", "Delete"],
        refuse: true,
        employeeEditable: true,
    });
    await creationFor("Keith Byrd", "Keith Byrd", { employeeEditable: true });
});

// A71 (N3; M94, M95): 2 s on a name shows no tooltip of the page, 2 s on the avatar shows one
scenario("hr_actions_a71_tooltip_name", GRID, async () => {
    await ready();
    const row = rowEl("HRA Anita");
    await pointerAway();
    await realHover($(".o_tl_row_label", row));
    await settle(2000);
    assertEqual($$(".o-tooltip").length, 0, "no tooltip of the page after 2 s on the name (M94)");
    await pointerAway();
    await realHover($(".o_hrg_avatar", row));
    await until(() => $(".o-tooltip"), "the tooltip of the avatar");
    await settle(2000);
    assertEqual($$(".o-tooltip").length, 1, "one tooltip after 2 s on the avatar (M95)");
    assert(clean($(".o-tooltip").textContent).includes("HRA Anita"), "her name in it");
});

// A89 and A93 (R23, N5; decision D8): split cells in both directions of the language

/** The cell of a row in the column of a day. */
const cellOfDay = (name, date) => {
    const column = $(`.o_tl_col[data-date="${date}"]`);
    return cellsOf(name).find((cell) => Number(cell.dataset.column) === Number(column.dataset.index));
};

/** A range picked by its menu item (the labels are the language's, the classes are not). */
async function pickRangeByClass(kind, lastDate) {
    $(".o_tl_range_button").click();
    const item = await until(() => $(`.o_tl_range_menu .o_tl_range_${kind}`), `the ${kind} item`);
    item.click();
    await until(() => dateColumns().some((col) => col.dataset.date === lastDate), `the days up to ${lastDate}`, 8000);
    await settle(700);
}

/** The colours of a cell's stops in order ("grey" or "day") and the gradient's angle. */
function partsOf(cell) {
    const image = cell.style.backgroundImage || "";
    const names = { "var(--o-tl-unavailable-bg)": "grey", "var(--o-tl-available-bg)": "day" };
    const parts = image.match(/var\(--o-tl-(?:unavailable|available)-bg\) [\d.]+%/g) || [];
    return {
        angle: (image.match(/linear-gradient\((\d+)deg/) || [])[1],
        parts: parts.map((part) => names[part.split(" ")[0]]),
        direction: getComputedStyle(document.body).direction,
    };
}

// A89: the Week range of 8 to 14 November in Arabic (set as the administrator's language)
scenario("hr_actions_a89_split_cells_rtl", GRID, async () => {
    await ready();
    // (Arabic's week starts on another day than English's: the days shown are 7 to 13 or 8 to 14)
    await pickRangeByClass("week", "2026-11-13");
    assertEqual(dateColumns().length, 7, "seven days");
    assertEqual(getComputedStyle(document.body).direction, "rtl", "the page runs right to left");
    // the columns run from right to left: the first day lies right of the last
    const days = dateColumns();
    assert(
        rectOf(days[0]).left > rectOf(days[days.length - 1]).left,
        "the first day of the week is the rightmost column"
    );
    const friday = partsOf(cellOfDay("Gantt Hourly", "2026-11-13"));
    // from the right edge: grey up to 24 %, the day colour from 25 % to 49 %, grey from 50 %
    assertEqual(friday.angle, "270", "Friday's gradient runs from the right edge towards the left");
    assertEqual(friday.parts, ["grey", "day", "day", "grey", "grey", "grey"], "Friday's stops");
    // Monday (night / day / day / night) looks as in English
    const monday = partsOf(cellOfDay("Gantt Hourly", "2026-11-09"));
    assertEqual(monday.parts, ["grey", "day", "day", "day", "day", "grey"], "Monday's stops");
});

// A93: the diagonal halves of the Month range, in the language the test has set
async function diagonals(angle) {
    await ready();
    if (angle === "325") {
        // the search entry's text is the language's: in Arabic the prepared rows are the page's
        await searchFor("Gantt");
    }
    await pickRangeByClass("month", "2026-11-30");
    const direction = getComputedStyle(document.body).direction;
    assertEqual(direction, angle === "35" ? "rtl" : "ltr", "the direction of the page");
    const style = (name) => cellOfDay(name, "2026-11-06").style.backgroundImage;
    const grey = "var(--o-tl-unavailable-bg)";
    const day = "var(--o-hrg-available-bg, transparent)";
    // morning available, afternoon grey: the day colour is the first half's
    assertEqual(
        style("Gantt Hourly"),
        `linear-gradient(${angle}deg, ${day} 49%, ${grey} 50%)`,
        "Gantt Hourly's Friday 6"
    );
    // morning grey, afternoon available
    assertEqual(
        style("Gantt Afternoon"),
        `linear-gradient(${angle}deg, ${grey} 49%, ${day} 50%)`,
        "Gantt Afternoon's Friday 6"
    );
}

// English: grey triangle upper left for "Gantt Hourly" (afternoon grey), lower right for "Gantt Afternoon"
scenario("hr_actions_a93_diagonals_ltr", GRID, () => diagonals("325"));

// Arabic: the mirror image, upper right and lower left
scenario("hr_actions_a93_diagonals_rtl", GRID, () => diagonals("35"));
