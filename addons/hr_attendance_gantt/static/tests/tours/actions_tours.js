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
    dataSettled,
    dateColumns,
    facets,
    foldedHeaders,
    labelOf,
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
    if (!phone) {
        // on the phone the search bar is behind its own button, and its facets are not drawn
        assertEqual(facets(), ["Employee"], "one facet, the Employee grouping");
        await until(() => labelOf("Mitchell Admin") === "0h / 8h", "the label of the row reads 0h / 8h");
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
    assert(!dialog, `no error dialog: ${dialog && clean(dialog.textContent).slice(0, 400)}`);
    assert($(".o_calendar_view"), `the calendar shows: ${clean($(".o_action_manager")?.textContent || "").slice(0, 300)}`);
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
    assert(week.includes("2026-11-09") && week.includes("2026-11-13"), `8 to 14 November: ${week}`);
    assert(!week.includes("2026-11-16"), "not 15 to 21 November");
});
