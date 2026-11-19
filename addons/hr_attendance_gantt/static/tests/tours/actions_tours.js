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
    if (!phone) {
        // on the phone the search bar is behind its own button, and its facets are not drawn
        assertEqual(facets(), ["Employee"], "one facet, the Employee grouping");
    }
};
scenario("hr_actions_a4_my_gantt", CALENDAR, myGantt(false));
scenario("hr_actions_a4_my_gantt_phone", CALENDAR, myGantt(true));

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
