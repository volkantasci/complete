// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    barOf,
    clean,
    clearRemembered,
    closeSearchMenu,
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
    ready,
    realClick,
    rowNames,
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
