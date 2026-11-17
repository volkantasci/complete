// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of the tracks Gantt view (slice 002d): the event's Tracks button, the menu, the popover
 * and the first day. The browser clock and zone are fixed by the test (see
 * `tests/test_track_tours.py`); the gesture of A37 sends real pointer events through
 * `window.__tl_mouse` (see `test_web_gantt` `timeline_real_pointer`).
 */

const tours = registry.category("web_tour.tours");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const texts = (selector, root = document) =>
    $$(selector, root).map((el) => el.textContent.replace(/\s+/g, " ").trim());

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, what) {
    assert(
        JSON.stringify(actual) === JSON.stringify(expected),
        `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
}

async function until(condition, message, timeout = 8000) {
    const limit = Date.now() + timeout;
    for (;;) {
        const value = condition();
        if (value) {
            return value;
        }
        if (Date.now() > limit) {
            throw new Error(`Timed out waiting for: ${message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
}

/** Ask the test to send these mouse events for real, and wait until it did. */
let requests = Math.floor(Date.now() / 1000) * 1000;
async function realMouse(events) {
    requests = Math.max(requests, Number(sessionStorage.getItem("track_mouse_requests") || 0)) + 1;
    sessionStorage.setItem("track_mouse_requests", String(requests));
    const id = requests;
    window.__tl_mouse = { id, events };
    await until(() => window.__tl_mouse_done === id, "the real mouse events", 20000);
}

const mouse = (type, x, y, extra = {}) => ({ type, x, y, button: "left", ...extra });

/** The view is drawn: its rows and its pills are there (a pill-less view needs `rows` only). */
const gridReady = (what = ".o_tl_pill") => ({
    trigger: `.o_tl_renderer ${what}`,
});

const rowNames = () => texts(".o_tl_row_header .o_tl_row_label");
const pillNames = () => texts(".o_tl_pill .o_tl_pill_title");
const rangeName = () => texts(".o_tl_range_button")[0];
const groupTitles = () => $$(".o_tl_col_group").map((el) => el.getAttribute("title"));

/** Events list, the event's form, its Tracks button (reading `count`). */
const openTracksOf = (name, count) => [
    { trigger: ".o_switch_view.o_list", run: "click" },
    { trigger: `.o_data_row:contains("${name}") td[name="name"]`, run: "click" },
    {
        trigger: `.o_form_view .oe_stat_button:contains("Tracks")${
            count === undefined ? "" : `:contains("${count}")`
        }`,
        run: "click",
    },
];

const inGantt = [
    { trigger: ".o_switch_view.o_gantt", run: "click" },
    { trigger: ".o_timeline_view .o_tl_renderer" },
];

const focusDays = () => $$(".o_tl_col_group").map((el) => el.getAttribute("title"));

function clearRemembered() {
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("rangeOf-viewId-")) {
            localStorage.removeItem(key);
        }
    }
}

// --- A30: the Tracks button, Week range, the remembered range ---------------------------------

tours.add("track_a30_tracks_button_week", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        ...openTracksOf("Gantt Summit", 5),
        { trigger: ".o_switch_view.o_kanban" },
        { trigger: ".o_switch_view.o_list" },
        { trigger: ".o_switch_view.o_gantt" },
        {
            trigger: ".o_kanban_record",
            run() {
                assertEqual($$(".o_kanban_record").length, 5, "the tracks in Kanban");
            },
        },
        { trigger: ".o_switch_view.o_list", run: "click" },
        {
            trigger: ".o_list_view .o_data_row",
            run() {
                assertEqual($$(".o_data_row").length, 5, "the tracks in the list");
            },
        },
        ...inGantt,
        gridReady(),
        {
            trigger: ".o_tl_range_button:contains('Week')",
            async run() {
                await until(() => pillNames().length === 4, "the four pills");
                assertEqual(
                    [...pillNames()].sort(),
                    ["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"],
                    "the pills"
                );
                assert(!pillNames().includes("Open Workshop"), "no pill for the unscheduled track");
                assertEqual(rowNames(), ["Undefined Location", "Theatre", "Lauzelle"], "the rows");
                const labels = texts(".o_tl_col_group_label");
                assert(labels.includes("Week 23, Jun 2 - Jun 8"), `week 23 in ${labels}`);
                assert(labels.includes("Week 24, Jun 9 - Jun 15"), `week 24 in ${labels}`);
                const facets = texts(".o_searchview_facet");
                assert(
                    facets.some((text) => text.includes("Location")),
                    `the Location facet in ${facets}`
                );
                assert(
                    facets.some((text) => text.includes("Event") && text.includes("Gantt Summit")),
                    `the Event facet in ${facets}`
                );
                const dates = $$(".o_tl_col").map((el) => el.dataset.date);
                assert(dates.includes("2030-06-02"), `2 June loaded in ${dates}`);
                assert(dates.includes("2030-06-16"), `16 June loaded in ${dates}`);
            },
        },
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_month", run: "click" },
        { trigger: ".o_tl_range_button:contains('Month')" },
        { trigger: ".o_breadcrumb .breadcrumb-item:contains('Gantt Summit')", run: "click" },
        { trigger: ".o_form_view .oe_stat_button:contains('Tracks')", run: "click" },
        ...inGantt,
        {
            trigger: ".o_tl_range_button:contains('Month')",
            async run() {
                await until(() => pillNames().length > 0, "the pills");
                const dates = $$(".o_tl_col").map((el) => el.dataset.date);
                assert(dates.includes("2030-06-10"), `10 June loaded in ${dates}`);
                assertEqual(rangeName(), "Month", "the remembered range");
            },
        },
    ],
});

// --- A29, A52: the menu ------------------------------------------------------------------------

tours.add("track_a29_menu_year", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        {
            trigger: '.o_menu_sections [data-menu-xmlid="website_event_track.menu_event_track"]',
            run: "click",
        },
        {
            trigger: ".o_kanban_view .o_searchview_facet:contains('Location')",
        },
        { trigger: ".o_switch_view.o_gantt", run: "click" },
        { trigger: ".o_tl_range_button:contains('Year')" },
        gridReady(),
        {
            trigger: ".o_tl_pill",
            async run() {
                await until(() => pillNames().includes("Panel Talk"), "the June pills");
                const labels = texts(".o_tl_col_group_label");
                assert(labels.includes("2029"), `2029 in ${labels}`);
                assert(labels.includes("2030"), `2030 in ${labels}`);
                assert($(".o_tl_col.o_tl_is_today").textContent.includes("Jun"), "June is today");
                const rows = rowNames();
                const wanted = ["Undefined Location", "Theatre", "Lauzelle"];
                assertEqual(
                    rows.filter((name) => wanted.includes(name)),
                    wanted,
                    "the rows"
                );
                assertEqual(rows[0], "Undefined Location", "the first row");
            },
        },
    ],
});

tours.add("track_a52_without_debug", {
    steps: () => [
        { trigger: ".o_switch_view.o_list" },
        {
            trigger: ".o_menu_sections .dropdown-toggle, .o_menu_sections .o_nav_entry",
            run() {
                const entries = texts(".o_menu_sections > *");
                assert(entries.length > 0, "the menu is drawn");
                assert(
                    !$('[data-menu-xmlid="website_event_track.menu_event_track"]'),
                    "no Tracks entry without developer mode"
                );
                assert(
                    !entries.some((text) => text === "Tracks"),
                    `no Tracks entry in ${entries}`
                );
            },
        },
    ],
});

tours.add("track_a52_with_debug", {
    steps: () => [
        { trigger: ".o_switch_view.o_list" },
        {
            trigger: '.o_menu_sections [data-menu-xmlid="website_event_track.menu_event_track"]',
            run: "click",
        },
        { trigger: ".o_kanban_view .o_searchview_facet:contains('Location')" },
        { trigger: ".o_switch_view.o_gantt" },
    ],
});

// --- A34: the first day in the browser's zone --------------------------------------------------

const firstDay = (name, day) => [
    { trigger: ".o_switch_view.o_list", run: clearRemembered },
    ...openTracksOf(name),
    ...inGantt,
    {
        trigger: ".o_tl_range_button:contains('Day')",
        async run() {
            await until(() => $$(".o_tl_col_group").length >= 3, "three days loaded");
            const titles = groupTitles();
            assertEqual(titles.length, 3, "the three loaded days");
            assert(
                titles[1].includes(day),
                `the middle day should hold ${day}; days: ${JSON.stringify(titles)}`
            );
        },
    },
];

tours.add("track_a34_tz_east", { steps: () => firstDay("TZ east", "July 2") });
tours.add("track_a34_tz_west_midday", { steps: () => firstDay("TZ west midday", "July 1") });
tours.add("track_a34_tz_west_late", { steps: () => firstDay("TZ west late", "July 1") });

// --- A36: no button context ---------------------------------------------------------------------

tours.add("track_a36_without_button_context", {
    steps: () => [
        { trigger: ".o_switch_view.o_gantt" },
        { trigger: ".o_tl_renderer" },
        {
            trigger: ".o_tl_range_button .o_tl_range_start",
            run() {
                assertEqual(texts(".o_tl_range_start")[0], "06/01/2030", "the first day");
                assertEqual(texts(".o_tl_range_stop")[0], "08/31/2030", "the last day");
            },
        },
    ],
});

// --- A37: rows and pills ------------------------------------------------------------------------

const pillOf = (name) => $$(".o_tl_pill").find((el) => el.textContent.trim() === name);
const SELECTORS_NONE = [
    ".o_tl_total_row",
    ".o_tl_pill_progress",
    ".o_tl_thumbnail",
    ".o_tl_reschedule",
    ".o_tl_panel_toggle",
    ".o_tl_side_panel",
    ".o_tl_panel_tools",
];

tours.add("track_a37_rows_and_pills", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        ...openTracksOf("Gantt Summit", 5),
        ...inGantt,
        gridReady(),
        {
            trigger: ".o_tl_pill",
            async run() {
                await until(() => pillNames().length === 4, "the four pills");
                assertEqual(rowNames(), ["Undefined Location", "Theatre", "Lauzelle"], "the rows");
                const color = (name) => getComputedStyle(pillOf(name)).backgroundColor;
                assertEqual(color("Wood Joinery"), "rgb(234, 182, 133)", "colour 2");
                assertEqual(color("Panel Talk"), "rgb(154, 191, 235)", "colour 4");
                for (const title of $$(".o_tl_pill .o_tl_pill_title")) {
                    assertEqual(getComputedStyle(title).color, "rgb(0, 0, 0)", "the text colour");
                }
                for (const selector of SELECTORS_NONE) {
                    assert(!$(selector), `${selector} is not drawn`);
                }
            },
        },
        {
            trigger: ".o_tl_row_header[title='Theatre']",
            async run() {
                // a press on an empty cell of a row, moved across cells: no multi-cell selection
                const row = $(".o_tl_row_header[title='Theatre']").closest(".o_tl_row");
                const cells = $$(".o_tl_cell", row);
                const cell = (index) => cells[index].getBoundingClientRect();
                const free = cells.findIndex((_, index) => {
                    const rect = cell(index);
                    return !$$(".o_tl_pill", row).some((pill) => {
                        const box = pill.getBoundingClientRect();
                        return box.left < rect.right + 80 && box.right > rect.left - 10;
                    });
                });
                assert(free >= 0, "an empty place in the row");
                const from = {
                    x: cell(free).left + cell(free).width / 2,
                    y: cell(free).top + cell(free).height / 2,
                };
                const to = { x: from.x + 90, y: from.y };
                await realMouse([
                    mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
                    mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
                    mouse("mouseMoved", from.x + 30, from.y, { buttons: 1 }),
                    mouse("mouseMoved", to.x, to.y, { buttons: 1 }),
                ]);
                assert(!$(".o_tl_cell_picked"), "no multi-cell selection while dragging");
                assert(!$(".o_tl_selection_buttons, .o_tl_multi"), "no multi-selection mode");
                await realMouse([mouse("mouseReleased", to.x, to.y, { buttons: 0, clickCount: 1 })]);
                assert(!$(".o_tl_cell_picked"), "no multi-cell selection after the release");
            },
        },
        {
            // whatever the release opened (a dialog of the 002b cell behaviour) is closed
            trigger: ".o_tl_renderer",
            async run() {
                await new Promise((resolve) => setTimeout(resolve, 500));
                const dialog = $(".modal .btn-close, .modal .o_form_button_cancel");
                if (dialog) {
                    dialog.click();
                }
            },
        },
    ],
});

/** A track of colour 0 (grey in dark) is drawn: the test sets the scheme. */
tours.add("track_a37_grey_in_dark", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        ...openTracksOf("Gantt Summit", 6),
        ...inGantt,
        gridReady(),
        {
            trigger: ".o_tl_pill",
            async run() {
                await until(() => pillOf("Grey Track"), "the colour 0 pill");
                const shown = getComputedStyle(pillOf("Grey Track")).backgroundColor;
                const [red, green, blue] = shown.match(/\d+/g).map(Number);
                // the theme's grey of the dark scheme: a nearly neutral colour
                assert(
                    Math.max(red, green, blue) - Math.min(red, green, blue) <= 24 &&
                        Math.min(red, green, blue) > 0,
                    `the colour 0 pill is grey in dark, got ${shown}`
                );
            },
        },
    ],
});

// --- A38, A39: the popover ----------------------------------------------------------------------

const withEvent = (steps) => [
    { trigger: ".o_switch_view.o_list", run: clearRemembered },
    ...openTracksOf("Gantt Summit", 5),
    ...inGantt,
    gridReady(),
    ...steps,
];

const clickPill = (name) => ({
    trigger: ".o_tl_pill",
    async run() {
        await until(() => pillOf(name), `the pill ${name}`);
        pillOf(name).click();
    },
});

tours.add("track_a38_popover_with_speaker", {
    steps: () =>
        withEvent([
            clickPill("Wood Joinery"),
            {
                trigger: ".o_tl_popover .o_popover_body",
                run() {
                    assertEqual(texts(".o_tl_popover .o_popover_header")[0], "Wood Joinery", "header");
                    const lines = texts(".o_tl_popover .o_popover_body > div > div, .o_tl_popover .o_popover_body > div");
                    const body = texts(".o_tl_popover .o_popover_body")[0];
                    assert(body.includes("Start — Jun 10, 12:00 PM"), `the start line in "${body}"`);
                    assert(
                        body.includes("Proposed By — Ben Carver"),
                        `the speaker line in "${body}" (${lines})`
                    );
                    for (const label of $$(".o_tl_popover .o_popover_body strong")) {
                        assertEqual(getComputedStyle(label).fontWeight, "700", "the label weight");
                    }
                    assertEqual($$(".o_tl_popover .o_popover_body strong").length, 2, "two labels");
                    assertEqual(texts(".o_tl_popover .o_tl_popover_button")[0], "Edit", "the button");
                },
            },
        ]),
});

tours.add("track_a39_popover_without_speaker", {
    steps: () =>
        withEvent([
            clickPill("Panel Talk"),
            {
                trigger: ".o_tl_popover .o_popover_body",
                run() {
                    const body = texts(".o_tl_popover .o_popover_body")[0];
                    assertEqual(body, "Start — Jun 11, 11:00 AM", "the only line");
                    assertEqual($$(".o_tl_popover .o_popover_body strong").length, 1, "one label");
                },
            },
        ]),
});

// --- A54, A55: demo events or their stand-ins ----------------------------------------------------

tours.add("track_a54_event_without_tracks", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        ...openTracksOf("Conference for Architects"),
        ...inGantt,
        {
            trigger: ".o_tl_range_button:contains('Day')",
            async run() {
                await until(() => $$(".o_tl_col_group").length >= 3, "three days loaded");
                assertEqual(groupTitles().length, 3, "three days loaded");
                assertEqual(rowNames(), ["Undefined Location"], "one row");
                assertEqual($$(".o_tl_pill").length, 0, "no pill");
                assert(!$(".o_view_nocontent, .o_nocontent_help"), "no help text");
            },
        },
    ],
});

tours.add("track_a55_demo_event", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        ...openTracksOf("OpenWood Collection Online Reveal"),
        ...inGantt,
        {
            trigger: ".o_tl_range_button:contains('Week')",
            async run() {
                await until(() => pillNames().length > 0, "the pills");
                assertEqual(rowNames()[0], "Undefined Location", "the first row");
                assert(rowNames().length > 1, "rows by location");
            },
        },
        {
            trigger: ".o_tl_pill",
            async run() {
                await until(() => pillOf("Easy Way To Build a Wooden House"), "the track pill");
                pillOf("Easy Way To Build a Wooden House").click();
            },
        },
        {
            trigger: ".o_tl_popover .o_popover_body",
            run() {
                const body = texts(".o_tl_popover .o_popover_body")[0];
                assert(body.includes("Start —"), `the start line in "${body}"`);
                assert(/Proposed By — \S/.test(body), `the speaker in "${body}"`);
            },
        },
    ],
});

// --- the dirty form: the view opens on the saved first day ----------------------------------------

tours.add("track_focus_dirty_form", {
    steps: () => [
        { trigger: ".o_switch_view.o_list", run: clearRemembered },
        { trigger: ".o_switch_view.o_list", run: "click" },
        { trigger: '.o_data_row:contains("Dirty Form Event") td[name="name"]', run: "click" },
        { trigger: ".o_form_view .oe_stat_button:contains('Tracks')" },
        { trigger: ".o_form_view button.o_daterange_start", run: "click" },
        { trigger: ".o_form_view input[data-field='date_begin']", run: "edit 06/09/2030 23:00:00" },
        { trigger: ".o_form_view input[data-field='date_begin']", run: "press Enter" },
        // the button saves the form first; the view opens on the saved start's day
        { trigger: ".o_form_view .oe_stat_button:contains('Tracks')", run: "click" },
        ...inGantt,
        {
            trigger: ".o_tl_range_button:contains('Day')",
            async run() {
                await until(() => $$(".o_tl_col_group").length >= 3, "three days loaded");
                const titles = groupTitles();
                assert(
                    titles[1].includes("June 9"),
                    `the middle day should hold June 9; days: ${JSON.stringify(titles)}`
                );
            },
        },
    ],
});
