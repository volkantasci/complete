// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import {
    $,
    $$,
    allPillTitles,
    assert,
    assertEqual,
    assertUncovered,
    breadcrumb,
    centre,
    clean,
    clickCardButton,
    colByDate,
    dataSettled,
    dateColumns,
    datesWithin,
    expectLabel,
    facets,
    labelEl,
    leaveReady,
    menuItem,
    openCardOf,
    pager,
    pickRange,
    pillsOf,
    pillTitles,
    popoverOfView,
    rangeName,
    realClick,
    realTap,
    rectOf,
    removeFacet,
    rowEl,
    rowNames,
    scenario,
    searchFor,
    settle,
    step,
    texts,
    until,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";

/**
 * Tours of the `ui` scenarios of slice 002e in the time-off report view (Time Off > Overview as
 * anyone but an Officer or an administrator, or the Community dashboard action's address) and
 * of the roles (the menus, the Overview each role opens, the matrix of rows). The harness, the
 * real pointer and the readings are those of `time_off_tours.js`; the world of each tour is made
 * by `tests/test_report_tours.py`.
 */

const tours = registry.category("web_tour.tours");

const OVERVIEW = "/odoo/action-hr_holidays_gantt.action_hr_holidays_overview";

// --- what a user sees -------------------------------------------------------------------------

/** The header of the row header column: "Time Off" in the report view, "Days" in the leave view. */
const viewTitle = () => clean($(".o_tl_title_text")?.textContent || "");

/** The entries of the top bar of the open application, in order. */
const topBar = () => [
    ...new Set(
        $$(".o_menu_sections .o_nav_entry, .o_menu_sections .dropdown-toggle")
            .map((el) => clean(el.textContent))
            .filter(Boolean)
    ),
];

/** The entries of the gear beside the title; none when the view has no gear. */
async function gearEntries() {
    const toggle = $(".o_cp_action_menus .dropdown-toggle");
    if (!toggle) {
        return [];
    }
    await realClick(toggle);
    await settle(700);
    const entries = $$(".o-dropdown--menu .dropdown-item").map((el) => clean(el.textContent));
    if ($(".o-dropdown--menu")) {
        await realClick(toggle);
        await until(() => !$(".o-dropdown--menu"), "the gear closed");
    }
    return entries;
}

/** The lines and the pencil of the card of an employee row, once it is open. */
const cardParts = () => ({
    lines: $$(".o_avatar_card .o_hhg_card_line").length,
    pencil: Boolean($(".o_avatar_card .o_hhg_card_version")),
    schedule: Boolean($(".o_avatar_card .o_hhg_card_schedule")),
});

/** The day of the date column that lies under the middle of a pill. */
function dayOfPill(pill) {
    const box = rectOf(pill);
    const x = box.left + box.width / 2;
    const column = dateColumns().find((el) => {
        const rect = rectOf(el);
        return rect.left <= x && rect.right >= x;
    });
    return column?.dataset.date;
}

/** A Management > Time Off page: the Gantt view of the list's switcher, ready. */
async function openManagementGantt() {
    await until(() => $(".o_list_view"), "the list of Management > Time Off", 60000);
    await settle(500);
    await realClick($(".o_cp_switch_buttons .o_switch_view.o_gantt"));
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the leave view", 20000);
    await dataSettled();
    await settle(500);
}

// the home menu and the menus of Time Off -----------------------------------------------------------

async function homeMenuApps() {
    await until(() => $(".o_home_menu"), "the home menu", 60000);
    await settle(1000);
    return texts(".o_home_menu .o_app");
}

async function enterTimeOff() {
    const apps = await homeMenuApps();
    const app = $$(".o_home_menu .o_app").find((el) => clean(el.textContent) === "Time Off");
    assert(app, `the home menu offers Time Off: ${JSON.stringify(apps)}`);
    app.click();
    await until(() => topBar().includes("My Time"), `the top bar of Time Off: ${topBar()}`, 30000);
    await settle(600);
}

const menuEntry = (text) =>
    $$(".o_menu_sections a, .o_menu_sections button").find((el) => clean(el.textContent) === text);

/** A click on Overview in the top bar, and the wait for the view it opens. */
async function openOverview() {
    const entry = menuEntry("Overview");
    assert(entry, `the Overview entry: ${topBar()}`);
    entry.click();
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the Overview", 60000);
    await leaveReady();
}

/** Management > Time Off from the menus, then its Gantt view. */
async function openManagementByMenu() {
    const toggle = menuEntry("Management");
    assert(toggle, `the Management menu: ${topBar()}`);
    toggle.click();
    const item = await until(
        () => $$(".o-dropdown--menu .dropdown-item").find((el) => clean(el.textContent) === "Time Off"),
        "Time Off under Management"
    );
    item.click();
    await openManagementGantt();
}

/** A tour that starts on the home menu: `body` runs once it shows. */
const fromHome = (name, body) =>
    tours.add(name, {
        steps: () => [{ trigger: ".o_home_menu", timeout: 60000, run: body }],
    });

/** A tour that starts on the list of Management > Time Off. */
const fromList = (name, body) =>
    tours.add(name, {
        steps: () => [{ trigger: ".o_list_view", timeout: 60000, run: body }],
    });

// A4: the dashboard action ------------------------------------------------------------------------

scenario("hhg_a04_dashboard_action", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    const types = $$(".o_cp_switch_buttons .o_switch_view").map((el) =>
        [...el.classList].find((name) => /^o_(gantt|calendar|list|kanban)$/.test(name))
    );
    assertEqual(types, ["o_gantt", "o_calendar"], "the view switcher offers Gantt then Calendar");
    assert($(".o_switch_view.o_gantt.active"), "Gantt is the active view");
    await realClick($(".o_cp_switch_buttons .o_switch_view.o_calendar"));
    await until(() => $(".o_calendar_container"), "the Community calendar of the report", 30000);
    assert(!$(".o_tl_renderer"), "the Gantt view is gone");
});

// A13: the pill texts of the report by role --------------------------------------------------------

const DURATION_ONLY = /^(\d+(\.\d+)? days?|\d+(\.\d+)? hours?|\d+d)$/;

scenario("hhg_a13_employee_pills", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    const all = allPillTitles();
    assert(all.length > 0, "pills show");
    for (const title of all) {
        assert(DURATION_ONLY.test(title), `a pill reads its duration alone: "${title}"`);
    }
    assertEqual(pillTitles("Anita Oliver"), ["4 days", "1d", "6 days"], "Anita Oliver's pills");
    assertEqual(pillTitles("Mitchell Admin"), ["3 days", "3 days"], "Mitchell Admin's pills");
});

scenario("hhg_a13_administrator_pills", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    assertEqual(
        pillTitles("Anita Oliver"),
        ["PTO 4 days", "1d", "PTO 6 days"],
        "the administrator's pills carry the type code"
    );
    for (const title of allPillTitles()) {
        assert(/^(1d|[A-Z]+ \d+(\.\d+)? days?)$/.test(title), `a pill reads its code and duration: "${title}"`);
    }
});

// A14: the report shows every state but Refused ----------------------------------------------------

scenario("hhg_a14_states", async () => {
    await pickRange("week");
    await step(1);
    datesWithin("2026-11-15", "2026-11-21", "the week of 15 November");
    await searchFor("Toff States");
    await until(() => JSON.stringify(rowNames()) === JSON.stringify(["Toff States"]), "one row, Toff States", 8000);
    const pills = pillsOf("Toff States");
    assertEqual(pills.map(dayOfPill), ["2026-11-16", "2026-11-17", "2026-11-18"], "three pills, none on 19 November");
    assert(
        !$$(".o_tl_pill_mark, .o_tl_striped").length,
        "no pill carries a corner mark or stripes"
    );
});

// A15: the report's ranges -----------------------------------------------------------------------

scenario("hhg_a15_ranges", async () => {
    $(".o_tl_range_button").click();
    await until(() => $(".o_tl_range_menu .o_tl_range_item"), "the range menu");
    assertEqual(
        texts(".o_tl_range_menu .o_tl_range_item"),
        ["Day", "Week", "Month", "Quarter", "Year"],
        "the ranges offered"
    );
    assert(
        $(".o_tl_range_menu .o_tl_custom_line .o_tl_apply") && $(".o_tl_custom_start input"),
        "and a custom range"
    );
    $(".o_tl_range_button").click();
    await until(() => !$(".o_tl_range_menu"), "the range menu closed");
    await searchFor("Toff Fixed");
    await until(() => JSON.stringify(rowNames()) === JSON.stringify(["Toff Fixed"]), "one row, Toff Fixed", 8000);
    // a pill's width against its day column: whole days on the month scale (a day is one part)
    const ratio = (pill) => rectOf(pill).width / rectOf(colByDate(dayOfPill(pill))).width;
    const month = pillsOf("Toff Fixed").slice(0, 2);
    assertEqual(month.map(dayOfPill), ["2026-11-16", "2026-11-17"], "the whole and the morning day, in the month");
    for (const pill of month) {
        assert(ratio(pill) > 0.8 && ratio(pill) < 1.02, `a day pill fills its column in the month: ${ratio(pill)}`);
    }
    // on the week scale each day has two parts: a whole day covers both, a morning one of them
    await pickRange("week");
    await step(1);
    datesWithin("2026-11-15", "2026-11-21", "the week of 15 November");
    const week = pillsOf("Toff Fixed").slice(0, 2);
    assertEqual(week.map(dayOfPill), ["2026-11-16", "2026-11-17"], "the same two pills, in the week");
    assert(ratio(week[0]) > 0.85 && ratio(week[0]) < 1.02, `a whole day covers both parts: ${ratio(week[0])}`);
    assert(ratio(week[1]) > 0.35 && ratio(week[1]) < 0.65, `a morning covers one part: ${ratio(week[1])}`);
});

// A20 and A82: the card in the report view ----------------------------------------------------------

scenario("hhg_a20_card_for_an_employee", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    await openCardOf("Anita Oliver");
    assertEqual(cardParts(), { lines: 0, pencil: false, schedule: true }, "the schedule button alone");
    assertEqual(clean($(".o_hhg_card_schedule").textContent), "40 h / Week", "the schedule button");
    assert($(".o_hhg_card_band"), "the card holds its leave band");
});

scenario("hhg_a82_card_in_the_report", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    await openCardOf("Anita Oliver");
    const parts = cardParts();
    assert(parts.lines > 0, "the summary lines show");
    assert(parts.pencil && parts.schedule, "the pencil and the schedule button show");
    assert($(".o_hhg_card_band"), "the leave band shows");
});

// A26 to A28: the report's search defaults ----------------------------------------------------------

const defaultFacets = (name, expected) =>
    scenario(name, async () => {
        assertEqual(viewTitle(), "Time Off", "the report view");
        assertEqual([...facets()].sort(), [...expected].sort(), "the facets of the opening search");
    });
defaultFacets("hhg_a26_many_employees", ["My Department", "Employee"]);
defaultFacets("hhg_a27_many_employees_with_a_team", ["My Team", "Employee"]);
defaultFacets("hhg_a28_few_employees", ["Employee"]);

// A53: no New button (the report half) -------------------------------------------------------------

scenario("hhg_a53_report_no_new_button", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    assert(!$(".o_tl_button_add"), "no New button of the view");
    assert(
        !$$(".o_control_panel button").some((el) => clean(el.textContent) === "New"),
        `no button named New: ${texts(".o_control_panel button")}`
    );
});

// A45 and A46: the phone --------------------------------------------------------------------------

scenario("hhg_a45_tap_on_an_avatar", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    for (let run = 0; run < 2; run++) {
        const avatar = $(".o_hrg_avatar", rowEl("Anita Oliver"));
        assert(avatar, "Anita Oliver's avatar");
        assertUncovered(avatar, centre(avatar), "the avatar's centre");
        await realTap(avatar);
        await settle(1500);
        assert(!$(".o_avatar_card"), `tap ${run + 1}: no card opens`);
        assert(!popoverOfView() && !$(".modal"), `tap ${run + 1}: no popover, no dialog`);
    }
});

scenario("hhg_a46_no_gear_on_the_phone", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    const entries = await gearEntries();
    console.info(`hhg-finding: the phone's gear entries ${JSON.stringify(entries)}`);
    assert(!entries.includes("Import") && !entries.includes("Export"), `no Import or Export: ${entries}`);
    assert(
        !$$(".o_control_panel button, .o_control_panel .dropdown-item").some((el) =>
            ["Import", "Export"].includes(clean(el.textContent))
        ),
        "the control panel offers neither"
    );
    assert(!$(".o_cp_action_menus .dropdown-toggle"), "no gear button beside the title");
});

// A56: no role ------------------------------------------------------------------------------------

tours.add("hhg_a56_no_role", {
    steps: () => [
        {
            trigger: ".o_home_menu",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                const apps = await homeMenuApps();
                assert(!apps.includes("Time Off"), `Time Off is not offered: ${JSON.stringify(apps)}`);
                window.location.assign(OVERVIEW);
            },
        },
        {
            trigger: ".modal",
            timeout: 60000,
            async run() {
                await settle(800);
                const text = clean($(".modal").textContent);
                console.info(`hhg-finding: the Overview's address shows "${text.slice(0, 300)}"`);
                assert(/not allowed to access/i.test(text), `the Community's access error: ${text}`);
                assert(/hr\.leave\.report\.calendar/.test(text), `on the report model: ${text}`);
                assert(!$(".o_tl_renderer"), "no Gantt view behind it");
            },
        },
    ],
});

// A57 to A62: the roles ---------------------------------------------------------------------------

fromHome("hhg_a57_employee", async () => {
    await enterTimeOff();
    assertEqual(topBar(), ["My Time", "Overview"], "the top bar of an Employee");
    await openOverview();
    assertEqual(viewTitle(), "Time Off", "the Overview opens the report view");
    assert(!$(".o_tl_progress_label"), "no hours label");
    const entries = await gearEntries();
    assert(!entries.includes("Import") && !entries.includes("Export"), `no Import or Export: ${entries}`);
    assertEqual(pager(), "1-20 / 25", "every active employee has a row");
    await searchFor("Toff States");
    await until(() => JSON.stringify(rowNames()) === JSON.stringify(["Toff States"]), "one row", 8000);
    // the waiting, second-approval and approved requests show, the refused one does not
    assertEqual(pillTitles("Toff States"), ["1d", "1d", "1d"], "every request but the refused one");
});

fromHome("hhg_a58_approver", async () => {
    await enterTimeOff();
    assertEqual(topBar(), ["My Time", "Overview", "Management"], "the top bar of an Approver");
    await openOverview();
    assertEqual(viewTitle(), "Time Off", "the Overview opens the report view");
    await openManagementByMenu();
    assertEqual(viewTitle(), "Days", "Management > Time Off's Gantt is the leave view");
    await removeFacet("Waiting For Me");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Toff Peer", "Toff Role Approver"]),
        `the rows the read rules allow: ${JSON.stringify(rowNames())}`,
        10000
    );
    assertEqual(pillTitles("Toff Peer"), ["1d"], "the request of the employee the user approves");
    assert(!rowNames().includes("Anita Oliver"), "no request of an employee the user does not approve");
});

fromHome("hhg_a59_manager", async () => {
    await enterTimeOff();
    assertEqual(topBar(), ["My Time", "Overview"], "the top bar of a Manager without approval");
    await openOverview();
    assertEqual(viewTitle(), "Time Off", "the Overview opens the report view");
});

/** What an Officer and an Admin see on the Overview (the leave view). */
async function officerOverview(bar) {
    await enterTimeOff();
    assertEqual(topBar(), bar, "the top bar");
    await openOverview();
    assertEqual(viewTitle(), "Days", "the Overview opens the leave view");
    await expectLabel("Anita Oliver", "80h", "the hours label");
    assert(labelEl("Anita Oliver"), "labels show");
    assert(pillTitles("Anita Oliver").includes("PTO 4 days"), `the type code shows: ${pillTitles("Anita Oliver")}`);
    assertEqual(await gearEntries(), ["Import", "Export"], "the gear offers Import and Export");
    await openCardOf("Anita Oliver");
    const parts = cardParts();
    assert(parts.lines > 0 && parts.pencil, `the card's summary and pencil: ${JSON.stringify(parts)}`);
}

fromHome("hhg_a61_officer", () =>
    officerOverview(["My Time", "Overview", "Management", "Reporting"])
);
fromHome("hhg_a62_admin", () =>
    officerOverview(["My Time", "Overview", "Management", "Reporting", "Configuration"])
);

// A89: the schedule button by role ---------------------------------------------------------------------

/** The user's own login and name, read from the server. */
async function ownIdentity() {
    const [me] = await rpc("/web/dataset/call_kw/res.users/read", {
        model: "res.users",
        method: "read",
        args: [[user.userId], ["login", "name"]],
        kwargs: {},
    });
    return me;
}

/** The dashboard the schedule button of ``name``'s card opens: its requests, by the browser. */
async function dashboardOf(name) {
    await openCardOf(name);
    await clickCardButton(".o_hhg_card_schedule");
    await until(() => $(".o_calendar_container .o_calendar_header h5"), `the dashboard of ${name}`, 20000);
    await settle(1200);
    assert(breadcrumb().includes("Time Off Dashboard"), `the dashboard of ${name}: ${breadcrumb()}`);
    const requests = $$(".o_calendar_container .fc-event").length;
    await realClick($(".o_breadcrumb .breadcrumb-item:not(.active)"));
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the view again", 20000);
    await dataSettled();
    await settle(500);
    return requests;
}

scenario("hhg_a89_schedule_button_by_role", async () => {
    const me = await ownIdentity();
    await searchFor("Toff");
    await until(() => rowEl("Toff Peer"), "Toff Peer's row", 10000);
    if (rangeName() !== "Month") {
        await pickRange("month");
    }
    // Toff Peer's two requests of November, none for an Employee (an empty calendar)
    const wanted = me.login === "toff_emp" ? 0 : 2;
    assertEqual(await dashboardOf("Toff Peer"), wanted, `${me.login}: the requests of Toff Peer`);
    // the user's own card opens the user's own dashboard, which holds no request
    assertEqual(await dashboardOf(me.name), 0, `${me.login}: the user's own dashboard`);
});

// A90: Export needs the export group ---------------------------------------------------------------

/** The gear of the Overview's leave view holds ``entries`` (the server sets the group). */
const gearOfOverview = (entries) => async () => {
    await enterTimeOff();
    await openOverview();
    assertEqual(viewTitle(), "Days", "the Overview opens the leave view");
    assertEqual(await gearEntries(), entries, "the gear's entries");
};
fromHome("hhg_a90_without_group", gearOfOverview(["Import"]));
fromHome("hhg_a90_with_group", gearOfOverview(["Import", "Export"]));

// A63: the matrix of rows ---------------------------------------------------------------------------

scenario("hhg_a63_matrix", async () => {
    await until(() => pager() === "1-20 / 24", `the pager reads 1-20 / 24, it reads "${pager()}"`, 10000);
    assertEqual(pager(), "1-20 / 24", "every active employee has a row");
});

// A83: sample data of the report ----------------------------------------------------------------------

scenario("hhg_a83_sample_data", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    assert($(".o_tl_box_sample"), "the sample data show");
    assert($(".o_tl_sample"), "sample cells");
    const notice = $(".o_view_nocontent");
    console.info(`hhg-finding: the sample notice reads "${clean(notice?.textContent || "")}"`);
    assert(notice && clean(notice.textContent), "with its sample notice");
});

scenario("hhg_a83_one_request", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    assert(!$(".o_tl_box_sample") && !$(".o_tl_sample"), "no sample data once a request exists");
    assert(!$(".o_view_nocontent"), "and no notice");
    assert(rowNames().includes("Toff Role Emp"), `the real rows: ${rowNames()}`);
    assertEqual(pillTitles("Toff Role Emp"), ["1d"], "the real request");
});

// A84: an Approver in Management > Time Off -------------------------------------------------------------

fromList("hhg_a84_approver_management", async () => {
    await openManagementGantt();
    await removeFacet("Waiting For Me");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Anita Oliver", "Toff Role Approver"]),
        `two rows: ${JSON.stringify(rowNames())}`,
        10000
    );
    await expectLabel("Anita Oliver", "80h", "Anita Oliver's label");
    await expectLabel("Toff Role Approver", "168h", "the Approver's label");
    assertEqual(pillTitles("Anita Oliver"), ["4 days", "1d", "6 days"], "her pills read the duration alone");
    assertEqual(await gearEntries(), ["Import"], "the gear offers Import only");
    await openCardOf("Anita Oliver");
    assertEqual(cardParts(), { lines: 0, pencil: false, schedule: true }, "the card: the schedule button alone");
});

// A85: a Department search in the report view -------------------------------------------------------------

scenario("hhg_a85_department_search", async () => {
    assertEqual(viewTitle(), "Time Off", "the report view");
    await searchFor("Toff Dept A", "Department");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Anita Oliver", "Ronnie Hart"]),
        `only the employees with requests of the department: ${JSON.stringify(rowNames())}`,
        10000
    );
    await removeFacet("Toff Dept A");
    await menuItem(".o_filter_menu", "My Department");
    await until(
        () =>
            JSON.stringify(rowNames()) ===
            JSON.stringify(["Anita Oliver", "Ronnie Hart", "Toff Peer", "Toff Role Emp"]),
        `every employee of the user's department: ${JSON.stringify(rowNames())}`,
        10000
    );
    assertEqual(pillTitles("Toff Peer"), [], "one of them has no request");
});
