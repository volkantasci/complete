// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { rpc } from "@web/core/network/rpc";
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
            trigger: ".o_content .o_list_renderer tbody tr.o_data_row",
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
        // a click that lands while the view still reloads is lost: click again
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (!$(".o_tl_popover") && !$(".o_dialog")) {
            pillOf(name).click();
        }
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

// --- the record dialog (A41 to A50, A56) ------------------------------------------------------------

const topDialog = () => $$(".o_dialog").at(-1);
const dialogOf = (title) => $$(".o_dialog").find((el) => $(".modal-title", el)?.textContent.trim() === title);
/** The visible footer buttons of the dialog on top: text, tooltip and geometry. */
function footerButtons(dialog = topDialog()) {
    return $$(".modal-footer button", dialog)
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => {
            const { left, right } = el.getBoundingClientRect();
            return {
                text: el.textContent.trim(),
                tooltip: el.dataset.tooltip || "",
                icon: !!$(".oi[data-icon='delete']", el),
                primary: el.classList.contains("btn-primary"),
                left,
                right,
            };
        });
}
const footerNames = (dialog) => footerButtons(dialog).map((b) => b.text || (b.icon ? "[bin]" : ""));
const noDialog = { trigger: "body:not(:has(.o_dialog))" };

/** The popover of a pill, its Edit (View) button, and the dialog it opens. */
const editPill = (name, title = "Open") => [
    clickPill(name),
    { trigger: ".o_tl_popover .o_tl_popover_button", run: "click" },
    { trigger: `.o_dialog .modal-title:contains("${title}")` },
    { trigger: ".o_dialog .modal-footer button" },
];
const nameInput = ".o_dialog .o_field_widget[name='name'] input";
const typeName = (value) => ({ trigger: nameInput, run: `edit ${value}` });
const pillsAre = (names) => ({
    trigger: ".o_tl_renderer",
    async run() {
        await until(() => JSON.stringify([...pillNames()].sort()) === JSON.stringify([...names].sort()),
            `the pills ${names}, got ${pillNames()}`);
    },
});
const click = (trigger) => ({ trigger, run: "click" });
/** The Delete confirmation is the dialog on top. */
const confirmation = ".o_dialog:has(.modal-title:contains('Delete Track'))";

async function trackId(name) {
    const [row] = await rpc("/web/dataset/call_kw/event.track/search_read", {
        model: "event.track",
        method: "search_read",
        args: [[["name", "=", name]]],
        kwargs: { fields: ["id"], limit: 1 },
    });
    return row && row.id;
}
async function dropTrack(name) {
    const id = await trackId(name);
    assert(id, `the track ${name} exists`);
    await rpc("/web/dataset/call_kw/event.track/unlink", {
        model: "event.track",
        method: "unlink",
        args: [[id]],
        kwargs: {},
    });
}

tours.add("track_a41_admin_footer", {
    steps: () =>
        withEvent([
            ...editPill("Wood Joinery"),
            {
                trigger: ".o_dialog .modal-footer .o_form_button_save",
                run() {
                    assertEqual(footerNames(), ["Save", "Discard", "Unschedule", "[bin]"], "the footer");
                    const [save, discard, unschedule, bin] = footerButtons();
                    assertEqual(bin.tooltip, "Delete", "the bin's tooltip");
                    assert(save.primary && !discard.primary && !unschedule.primary, "the ranks");
                    assertEqual(
                        [discard.left - save.right, unschedule.left - discard.right, bin.left - unschedule.right],
                        [8, 8, 8],
                        "the gaps"
                    );
                    const content = $(".modal-content", topDialog()).getBoundingClientRect();
                    assert(save.left - content.left < 30, "left-aligned");
                    assert(bin.right < content.left + content.width / 2, "the bin is not pushed right");
                    // 002b's own Remove button does not show
                    assert(!$(".o_form_button_remove", topDialog()), "no second Delete");
                },
            },
            { trigger: ".o_dialog .modal-footer .o_form_button_cancel", run: "press alt+q" },
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"]),
            ...editPill("Wood Joinery"),
            { trigger: ".o_dialog .modal-footer .o_form_button_cancel", run: "press alt+x" },
            noDialog,
            ...editPill("Wood Joinery"),
            { trigger: ".o_dialog .modal-footer .o_form_button_cancel", run: "press alt+d" },
            {
                trigger: `${confirmation} .modal-footer`,
                run() {
                    assertEqual(footerNames(dialogOf("Delete Track")), ["Delete", "Discard"], "the confirmation");
                },
            },
            { trigger: `${confirmation} .modal-footer button`, run: "press Escape" },
            { trigger: "body:not(:has(.modal-title:contains('Delete Track')))" },
            { trigger: ".o_dialog .modal-title:contains('Open')" },
        ]),
});

const FIELDS = [
    "name", "website_image", "kanban_state", "date", "location_id", "duration",
    "wishlisted_by_default", "user_id", "event_id", "tag_ids", "color",
];

tours.add("track_a42_dialog_form", {
    steps: () =>
        withEvent([
            ...editPill("Opening Keynote"),
            {
                trigger: ".o_dialog .o_field_widget[name='name']",
                run() {
                    const dialog = topDialog();
                    assert(!$(".o_statusbar_status, .o_field_statusbar", dialog), "no stage bar");
                    assert(!$(".oe_stat_button", dialog), "no statistics button, wishlisted or not");
                    assert(!$("[name='is_published']", dialog), "no publish button");
                    assert(!$(".o-mail-Chatter", dialog), "no chatter");
                    for (const name of FIELDS) {
                        assert($(`.o_field_widget[name='${name}']`, dialog), `the field ${name}`);
                    }
                    assertEqual(
                        texts(".o_notebook_headers .nav-link", dialog),
                        ["Speaker", "Description", "Interactivity"],
                        "the pages"
                    );
                },
            },
            { trigger: ".o_dialog .o_form_button_cancel", run: "click" },
            noDialog,
            // the same track in the Kanban view of the same action: the stage bar and the button
            click(".o_switch_view.o_kanban"),
            click(".o_kanban_record:contains('Opening Keynote')"),
            {
                trigger: ".o_form_view .o_statusbar_status",
                run() {
                    assert(
                        texts(".o_form_view .oe_stat_button").some((text) => text.includes("Wishlisted By")),
                        "the Community button"
                    );
                },
            },
        ]),
});

tours.add("track_a43_save_and_discard", {
    steps: () =>
        withEvent([
            ...editPill("Wood Joinery"),
            typeName("Wood Joinery 2"),
            click(".o_dialog .o_form_button_save"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery 2"]),
            ...editPill("Wood Joinery 2"),
            typeName("Dropped Name"),
            click(".o_dialog .o_form_button_cancel"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery 2"]),
        ]),
});

tours.add("track_a44_unschedule", {
    steps: () =>
        withEvent([
            ...editPill("Panel Talk"),
            { trigger: ".o_dialog .o_field_widget[name='duration'] input", run: "edit 5:00" },
            click(".o_dialog .o_track_unschedule"),
            noDialog,
            {
                trigger: ".o_tl_renderer",
                async run() {
                    await until(() => !pillNames().includes("Panel Talk"), "the pill is gone");
                    assert(!$(".o_notification"), "no notification");
                    assert(!$(".modal"), "no confirmation");
                },
            },
            click(".o_switch_view.o_list"),
            { trigger: ".o_list_view .o_data_row:contains('Panel Talk')" },
        ]),
});

const openConfirmation = (name) => [
    ...editPill(name),
    click(".o_dialog .o_track_delete"),
    { trigger: `${confirmation} .modal-footer button` },
];

tours.add("track_a46_delete_confirmed", {
    steps: () =>
        withEvent([
            ...openConfirmation("Panel Talk"),
            {
                trigger: `${confirmation} .modal-footer button`,
                run() {
                    const box = dialogOf("Delete Track");
                    const [del, discard] = footerButtons(box);
                    assertEqual([del.text, discard.text], ["Delete", "Discard"], "the buttons");
                    assert(del.primary && !discard.primary, "Delete is the primary button");
                    assert($(".modal-body", box).textContent.trim().length > 0, "a question");
                },
            },
            click(`${confirmation} .modal-footer .btn-primary`),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Wood Joinery"]),
        ]),
});

tours.add("track_a47_delete_discarded", {
    steps: () => {
        const stays = [
            { trigger: "body:not(:has(.modal-title:contains('Delete Track')))" },
            {
                trigger: ".o_dialog .modal-title:contains('Open')",
                run() {
                    assertEqual(footerNames(), ["Save", "Discard", "Unschedule", "[bin]"], "the dialog");
                    assertEqual($(nameInput).value, "Panel Talk 7", "the unsaved change is still there");
                },
            },
        ];
        return withEvent([
            ...editPill("Panel Talk"),
            typeName("Panel Talk 7"),
            click(".o_dialog .o_track_delete"),
            click(`${confirmation} .modal-footer .btn-secondary`),
            ...stays,
            click(".o_dialog .o_track_delete"),
            click(`${confirmation} .btn-close`),
            ...stays,
            click(".o_dialog .o_track_delete"),
            { trigger: `${confirmation} .modal-footer button`, run: "press Escape" },
            ...stays,
            click(".o_dialog .o_form_button_cancel"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"]),
        ]);
    },
});

const newDialog = [
    click(".o_tl_button_add"),
    { trigger: ".o_dialog .modal-title:contains('Create')" },
    { trigger: ".o_dialog .modal-footer button" },
];

tours.add("track_a48_new_dialog", {
    steps: () =>
        withEvent([
            ...newDialog,
            {
                trigger: ".o_dialog .o_form_button_save",
                run() {
                    assertEqual(footerNames(), ["Save", "Discard"], "a new track's footer");
                },
            },
            typeName("Fresh Track"),
            click(".o_dialog .o_form_button_save"),
            noDialog,
            ...editPill("Fresh Track"),
            {
                trigger: ".o_dialog .o_track_delete",
                run() {
                    assertEqual(footerNames(), ["Save", "Discard", "Unschedule", "[bin]"], "after Save");
                },
            },
            click(".o_dialog .o_form_button_cancel"),
        ]),
});

tours.add("track_a48_new_dialog_organizer", {
    steps: () =>
        withEvent([
            ...newDialog,
            {
                trigger: ".o_dialog .o_form_button_save",
                run() {
                    assertEqual(footerNames(), ["Save", "Discard"], "the organizer's new track");
                },
            },
            typeName("Organizer Track"),
            click(".o_dialog .o_form_button_save"),
            noDialog,
            { trigger: ".o_tl_renderer" },
        ]),
});

tours.add("track_a49_events_user", {
    steps: () => {
        const footer = {
            trigger: ".o_dialog .o_form_button_save",
            run() {
                assertEqual(footerNames(), ["Save", "Discard", "Unschedule"], "the organizer's footer");
            },
        };
        const untouched = pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"]);
        return withEvent([
            ...editPill("Panel Talk"),
            footer,
            typeName("Panel Talk 1"),
            click(".o_dialog .o_form_button_cancel"),
            noDialog,
            untouched,
            ...editPill("Panel Talk"),
            typeName("Panel Talk 1"),
            click(".o_dialog .modal-header .btn-close"),
            noDialog,
            untouched,
            ...editPill("Panel Talk"),
            typeName("Panel Talk 1"),
            { trigger: nameInput, run: "press Escape" },
            noDialog,
            untouched,
            ...editPill("Panel Talk"),
            typeName("Panel Talk 2"),
            click(".o_dialog .o_form_button_save"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk 2", "Wood Joinery"]),
            ...editPill("Panel Talk 2"),
            click(".o_dialog .o_track_unschedule"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Wood Joinery"]),
        ]);
    },
});

/** Press 30 px inside the left end of the pill, move 192 px right in 12 steps, release. */
async function dragPillOneDay(name) {
    const box = pillOf(name).getBoundingClientRect();
    const from = { x: box.left + 30, y: box.top + box.height / 2 };
    const moves = [];
    for (let step = 1; step <= 12; step++) {
        moves.push(mouse("mouseMoved", from.x + 16 * step, from.y, { buttons: 1 }));
    }
    await realMouse([
        mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
        mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
        ...moves,
        mouse("mouseReleased", from.x + 192, from.y, { buttons: 0, clickCount: 1 }),
    ]);
    return box.left;
}

tours.add("track_a49_events_user_drag", {
    steps: () =>
        withEvent([
            {
                trigger: ".o_tl_pill",
                async run() {
                    await until(() => pillOf("Panel Talk"), "the pill");
                    const before = await dragPillOneDay("Panel Talk");
                    await until(
                        () => pillOf("Panel Talk").getBoundingClientRect().left > before + 150,
                        "the pill moved one day"
                    );
                },
            },
        ]),
});

tours.add("track_a50_registration_desk", {
    steps: () =>
        withEvent([
            {
                trigger: ".o_tl_pill",
                async run() {
                    await until(() => pillOf("Panel Talk"), "the pill");
                    assert(!$(".o_tl_button_add"), "no New button");
                    const before = pillOf("Panel Talk").getBoundingClientRect().left;
                    await dragPillOneDay("Panel Talk");
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    assertEqual(pillOf("Panel Talk").getBoundingClientRect().left, before, "the pill stays");
                    assert(!$(".modal"), "no dialog after the attempt");
                },
            },
            clickPill("Panel Talk"),
            {
                trigger: ".o_tl_popover .o_tl_popover_button",
                run() {
                    assertEqual(texts(".o_tl_popover .o_tl_popover_button")[0], "View", "the button");
                },
            },
            click(".o_tl_popover .o_tl_popover_button"),
            { trigger: ".o_dialog .modal-title:contains('Open')" },
            {
                trigger: ".o_dialog .modal-footer .o_form_button_cancel",
                run() {
                    assertEqual(footerNames(), ["Discard"], "Discard alone");
                    assert(!$("input", $(".o_field_widget[name='name']", topDialog())), "read only");
                },
            },
        ]),
});

const missingError = ".o_error_dialog, .modal:has(.modal-title:contains('Missing'))";

tours.add("track_a56_refused_move", {
    steps: () =>
        withEvent([
            {
                trigger: ".o_tl_pill",
                async run() {
                    await until(() => pillOf("Panel Talk"), "the pill");
                    await dropTrack("Panel Talk");
                    await dragPillOneDay("Panel Talk");
                },
            },
            { trigger: missingError },
            { trigger: ".o_dialog .modal-header .btn-close, .o_dialog .modal-footer .btn", run: "click" },
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Wood Joinery"]),
        ]),
});

tours.add("track_a56_refused_delete", {
    steps: () =>
        withEvent([
            ...openConfirmation("Panel Talk"),
            {
                trigger: `${confirmation} .modal-footer .btn-primary`,
                // the test set a rule that makes the server refuse this deletion (deleting a
                // track that is already gone is a silent no-op in Community)
                run: "click",
            },
            { trigger: ".o_error_dialog" },
            { trigger: ".o_error_dialog .modal-header .btn-close, .o_error_dialog .modal-footer .btn", run: "click" },
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"]),
        ]),
});

tours.add("track_a56_refused_unschedule", {
    steps: () =>
        withEvent([
            ...editPill("Panel Talk"),
            {
                trigger: ".o_dialog .o_track_unschedule",
                async run() {
                    await dropTrack("Panel Talk");
                    $(".o_dialog .o_track_unschedule").click();
                },
            },
            { trigger: missingError },
            { trigger: ".o_dialog .modal-header .btn-close, .o_dialog .modal-footer .btn", run: "click" },
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Wood Joinery"]),
        ]),
});

tours.add("track_dialog_invalid_form", {
    steps: () => {
        const stillThere = {
            trigger: ".o_dialog .o_field_invalid",
            run() {
                assertEqual(texts(".o_dialog .modal-title").at(-1), "Open", "the dialog stays");
                assertEqual(footerNames(), ["Save", "Discard", "Unschedule", "[bin]"], "the footer");
            },
        };
        return withEvent([
            ...editPill("Wood Joinery"),
            { trigger: nameInput, run: "clear" },
            click(".o_dialog .o_track_unschedule"),
            stillThere,
            click(".o_dialog .o_track_delete"),
            click(`${confirmation} .modal-footer .btn-primary`),
            { trigger: "body:not(:has(.modal-title:contains('Delete Track')))" },
            stillThere,
            click(".o_dialog .o_form_button_cancel"),
            noDialog,
            pillsAre(["Closing Words", "Opening Keynote", "Panel Talk", "Wood Joinery"]),
        ]);
    },
});

// --- A53: the phone (R16) ----------------------------------------------------------------------

tours.add("track_a53_phone", {
    steps: () => [
        { trigger: ".o_kanban_view .o_kanban_record", run: clearRemembered },
        { trigger: ".o_kanban_record:contains('Gantt Summit')", run: "click" },
        { trigger: ".o_form_view .o_button_more", run: "click" },
        { trigger: ".o-form-buttonbox-small .oe_stat_button:contains('Tracks')", run: "click" },
        { trigger: ".o_cp_switch_buttons .dropdown-toggle", run: "click" },
        { trigger: ".o_bottom_sheet_body button:contains('Gantt')", run: "click" },
        { trigger: ".o_timeline_view .o_tl_renderer" },
        gridReady(),
        {
            trigger: ".o_tl_renderer .o_tl_row",
            async run() {
                await until(() => pillNames().length === 4, "the four pills");
                assertEqual(rowNames(), ["Undefined Location", "Theatre", "Lauzelle"], "the rows");
                const dates = $$(".o_tl_col").map((el) => el.dataset.date);
                assert(dates.includes("2030-06-10"), `10 June loaded in ${dates}`);
                const box = pillOf("Opening Keynote").getBoundingClientRect();
                assertEqual([box.x, box.y], [261, 301], "the place of Opening Keynote");
            },
        },
        clickPill("Opening Keynote"),
        {
            trigger: ".o_popover .o_tl_popover_sheet",
            async run() {
                await until(() => $(".o_track_popover_lines"), "the lines");
                const lines = texts(".o_track_popover_lines > div");
                assert(lines[0].startsWith("Start —"), `the first line: ${lines}`);
                assert(lines[1].startsWith("Proposed By —"), `the second line: ${lines}`);
                const sheet = $(".o_popover").getBoundingClientRect();
                assertEqual(
                    [sheet.bottom, sheet.width > 380],
                    [window.innerHeight, true],
                    "a sheet to the bottom, the full width"
                );
                assert(sheet.top >= 143 && sheet.top <= 147, `the sheet starts at y ${sheet.top}`);
            },
        },
        { trigger: ".o_tl_popover .o_tl_popover_button:contains('Edit')", run: "click" },
        { trigger: ".o_dialog .modal-title:contains('Open')" },
        {
            trigger: ".o_dialog .modal-footer .o_form_button_save",
            async run() {
                // the form slides in from the side
                await until(() => footerButtons()[0]?.left < 30, "the form in place");
                assert($(".o_dialog .modal.o_modal_full"), "the form fills the screen");
                assertEqual(footerNames(), ["Save", "Discard", "Unschedule", "[bin]"], "the footer");
                const [save, discard, unschedule] = footerButtons();
                assert(save.primary && !discard.primary && !unschedule.primary, "the ranks");
                // the Community's phone footer lays its buttons out one under the other
                const width = window.innerWidth;
                assert(
                    footerButtons().every((b) => b.left >= 0 && b.right <= width),
                    `the buttons lie inside the screen: ${JSON.stringify(footerButtons())}`
                );
            },
        },
    ],
});
