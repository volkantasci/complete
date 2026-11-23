// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { download } from "@web/core/network/download";
import { rpc, rpcBus } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

/**
 * Tours of the `ui` scenarios of slice 002e in the time-off Gantt views (the leave view: Time
 * Off > Overview as an Officer or an administrator, and Management > Time Off). The browser
 * clock, the zone and the window are fixed by the test (see `tests/test_tours.py`); the gestures
 * send real pointer events through `window.__tl_mouse` (see `test_web_gantt`
 * `timeline_real_pointer`).
 */

const tours = registry.category("web_tour.tours");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clean = (text) => text.replace(/\s+/g, " ").trim();
const texts = (selector, root = document) => $$(selector, root).map((el) => clean(el.textContent));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function assertNear(actual, expected, what, tolerance = 1.5) {
    assert(
        Math.abs(actual - expected) <= tolerance,
        `${what}: expected ${expected} (+-${tolerance}), got ${actual}`
    );
}

async function until(condition, message, timeout = 10000) {
    const limit = Date.now() + timeout;
    for (;;) {
        const value = condition();
        if (value) {
            return value;
        }
        if (Date.now() > limit) {
            throw new Error(`Timed out waiting for: ${message}`);
        }
        await sleep(30);
    }
}

/** Readings are taken a moment after the last step (the package's 1.5 s, cut short). */
const settle = (ms = 700) => sleep(ms);

// --- real input ---------------------------------------------------------------------------------

let requests = Math.floor(Date.now() / 1000) * 1000;
async function send(request) {
    requests = Math.max(requests, Number(sessionStorage.getItem("hhg_requests") || 0)) + 1;
    sessionStorage.setItem("hhg_requests", String(requests));
    const id = requests;
    window.__tl_mouse = { id, ...request };
    await until(() => window.__tl_mouse_done === id, "the real events", 20000);
}

const mouse = (type, x, y, extra = {}) => ({ type, x, y, button: "left", ...extra });
const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const modifiersOf = (keys = []) => keys.reduce((sum, key) => sum + MODIFIERS[key], 0);

const centre = (el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/** The pointer rests on a point (no button). */
async function realMove(x, y) {
    await send({ events: [mouse("mouseMoved", x, y, { button: "none", buttons: 0 })] });
}

async function realHover(el) {
    const { x, y } = centre(el);
    await realMove(x, y);
}

/** The pointer leaves the grid for a place of the control bar, and no tooltip is left open. */
async function pointerAway() {
    await realMove(1000, 123);
    await until(() => !$(".o-tooltip"), "no tooltip is open once the pointer is away");
}

/**
 * A popover of the view that is not a tooltip (a tooltip is a popover too: the avatar's and the
 * bar's): the framework's record popover, the card of an avatar and the like.
 */
const popoverOfView = () => $(".o_popover:not(:has(.o-tooltip))");

/** A real click (press and release) at the centre of an element, or at a point. */
async function realClick(target, { keys = [], at = null, count = 1 } = {}) {
    const { x, y } = at || centre(target);
    const modifiers = modifiersOf(keys);
    const events = [mouse("mouseMoved", x, y, { button: "none", buttons: 0, modifiers })];
    for (let click = 1; click <= count; click++) {
        events.push(
            mouse("mousePressed", x, y, { buttons: 1, clickCount: click, modifiers }),
            mouse("mouseReleased", x, y, { buttons: 0, clickCount: click, modifiers })
        );
    }
    await send({ events });
}

/** A real finger tap at the centre of an element. */
async function realTap(el, { count = 1 } = {}) {
    const { x, y } = centre(el);
    const events = [];
    for (let tap = 0; tap < count; tap++) {
        events.push({ type: "touchStart", touchPoints: [{ x, y }] }, { type: "touchEnd", touchPoints: [] });
    }
    await send({ touch: true, events });
}

/** A real press, a drag through the points and a release. */
async function realDrag(from, points) {
    const last = points.at(-1);
    await send({
        events: [
            mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
            mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
            ...points.map((point) => mouse("mouseMoved", point.x, point.y, { buttons: 1 })),
            mouse("mouseReleased", last.x, last.y, { buttons: 0, clickCount: 1 }),
        ],
    });
}

/**
 * Resizes the window and waits for it to be that wide and for the view to have taken the phone
 * layout (or left it) before the next input.
 */
async function resizeTo(width, phone) {
    await resizeWindow(width);
    await until(() => window.innerWidth === width, `a window ${width} px wide`);
    await until(
        () => Boolean($(".o_timeline_view.o_tl_phone")) === phone,
        `the ${phone ? "phone" : "desktop"} layout at ${width} px`
    );
    await sleep(100);
}

/** The window's size, through the DevTools protocol, without a reload. */
async function resizeWindow(width, height = 900) {
    await send({
        method: "Emulation.setDeviceMetricsOverride",
        events: [{ width, height, deviceScaleFactor: 1, mobile: false }],
    });
}

// --- reading the view ---------------------------------------------------------------------------

const renderer = () => $(".o_tl_renderer");
const rowEls = () => $$(".o_tl_row:not(.o_tl_total_row)");
const nameOf = (rowEl) => {
    const label = $(".o_tl_row_label", rowEl);
    return label ? clean(label.textContent) : "";
};
const rowNames = () => rowEls().map(nameOf);
const rowEl = (name) => rowEls().find((el) => nameOf(el) === name);
const pillsOf = (name) => $$(".o_tl_pill", rowEl(name));
const pillTitles = (name) => pillsOf(name).map((pill) => clean($(".o_tl_pill_title", pill).textContent));
const allPillTitles = () => texts(".o_tl_pill .o_tl_pill_title");
const labelEl = (name) => $(".o_tl_progress_label", rowEl(name));
const labelOf = (name) => clean(labelEl(name)?.textContent || "");
const rangeName = () => texts(".o_tl_range_button")[0];
const pager = () => {
    const value = $(".o_pager_value");
    const limit = $(".o_pager_limit");
    return value && limit ? `${clean(value.textContent)} / ${clean(limit.textContent)}` : "";
};
const facets = () => texts(".o_searchview_facet");
const dateColumns = () => $$(".o_tl_col").filter((el) => el.dataset.date);
const colEl = (index) => $(`.o_tl_col[data-index="${index}"]`);
const colByDate = (date) => $(`.o_tl_col[data-date="${date}"]`);
const foldedHeaders = () => $$(".o_tl_col.o_tl_folded");
const cellsOf = (name) => $$(".o_tl_cell", rowEl(name));
const isGrey = (cell) => cell.classList.contains("o_tl_unavailable");
const gradientOf = (cell) => cell.style.backgroundImage || "";
const dayLabel = () => texts(".o_tl_col_group_label");

/** The grid is drawn with its rows (and the data is in). */
const loaded = (count) => () =>
    $(".o_tl_renderer .o_tl_row_header") && (count === undefined || rowNames().length === count);

async function ready(count) {
    await until(loaded(count), `the grid with ${count ?? "some"} rows`);
    await settle(300);
}

function clearRemembered() {
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("rangeOf-viewId-")) {
            localStorage.removeItem(key);
        }
    }
}

async function pickRange(kind) {
    const label = kind[0].toUpperCase() + kind.slice(1);
    const before = periodSignature();
    $(".o_tl_range_button").click();
    const item = await until(() => $(`.o_tl_range_menu .o_tl_range_${kind}`), `the ${kind} item`);
    item.click();
    await until(() => rangeName() === label, `the range ${label}`);
    // the new period's data: the columns, the group labels or the rows are not the old ones
    await until(() => periodSignature() !== before && $(".o_tl_row_header"), `the data of the ${label} range`, 8000);
}

const periodSignature = () =>
    JSON.stringify([
        dateColumns().map((el) => el.dataset.date),
        $$(".o_tl_col").length,
        texts(".o_tl_col_group_label"),
        rowNames(),
    ]);

/** Previous or Next, and the wait for the period to be drawn. */
async function step(direction, times = 1) {
    const count = Math.max(Math.abs(direction), times);
    for (let done = 0; done < count; done++) {
        const before = periodSignature();
        $(direction > 0 ? ".o_tl_next" : ".o_tl_previous").click();
        await until(() => periodSignature() !== before, "the following period", 8000);
        await settle(400);
    }
}

async function today() {
    const before = periodSignature();
    $(".o_tl_today").click();
    await until(() => periodSignature() !== before, "the period of today", 8000);
    await settle(300);
}

/** Waits for a row's label to read `text` (its data is in), then reads on. */
async function expectLabel(name, text, what) {
    await until(() => labelOf(name) === text, `${what}: the label of ${name} reads "${text}"`);
}

// the search bar ------------------------------------------------------------------------------------

async function searchFor(text, field = "Employee") {
    const input = await until(() => $(".o_searchview_input"), "the search input");
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const wanted = `Search ${field} for: ${text}`;
    const item = await until(
        () =>
            $$(".o_searchview_autocomplete .o-dropdown-item").find((el) =>
                clean(el.textContent).includes(wanted)
            ),
        `the entry "${wanted}"`
    );
    const requested = gantt.requests;
    item.click();
    await until(
        () => facets().some((facet) => facet.includes(text)),
        `the facet of "${text}"`
    );
    // the view has read its data for the search and drawn it
    await until(() => gantt.requests > requested, `the data of the search "${text}"`);
    await dataSettled();
}

async function removeFacet(text) {
    const facet = $$(".o_searchview_facet").find((el) => clean(el.textContent).includes(text));
    assert(facet, `the facet "${text}" is there in ${facets()}`);
    // the grouping of the action is a facet of the search; once it is removed, the view's own
    // default grouping shows as a facet of the same name (the framework's), and a second
    // removal takes that one away
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = $$(".o_searchview_facet").find((el) => clean(el.textContent).includes(text));
        if (!current) {
            break;
        }
        const requested = gantt.requests;
        await realClick($(".o_facet_remove", current));
        // the view reads its data again (a facet replaced by the default grouping may not)
        try {
            await until(() => gantt.requests > requested || !current.isConnected, "the search taken", 2500);
        } catch {
            // the same facet stays: the next attempt removes it
        }
        await dataSettled();
    }
    await until(
        () => !facets().some((candidate) => candidate.includes(text)),
        `the facet "${text}" is gone, facets are ${JSON.stringify(facets())}`
    );
    await dataSettled();
}

/** Closes the open dialog by its own button (Discard, Cancel, Close) or its header's cross. */
async function closeDialog() {
    await until(() => $(".modal"), "a dialog to close");
    for (let guard = 0; guard < 6 && $(".modal"); guard++) {
        const modal = $$(".modal").at(-1);
        const button = $$(".modal-footer .btn", modal).find((el) =>
            ["Discard", "Cancel", "Close", "Ok"].includes(clean(el.textContent))
        );
        const target = button || $(".btn-close", modal);
        assert(target, `a way to close the dialog: ${texts(".modal .btn")}`);
        target.click();
        await settle(500);
    }
    assert(!$(".modal"), `the dialogs close (${texts(".modal .btn")})`);
}

async function openSearchMenu() {
    if (!$(".o_search_bar_menu")) {
        $(".o_searchview_dropdown_toggler").click();
        await until(() => $(".o_search_bar_menu"), "the search menu");
    }
}

async function closeSearchMenu() {
    if ($(".o_search_bar_menu")) {
        $(".o_searchview_dropdown_toggler").click();
        await until(() => !$(".o_search_bar_menu"), "the search menu closed");
    }
}

async function menuItem(section, text) {
    await openSearchMenu();
    const item = await until(
        () => $$(`${section} .o_menu_item`).find((el) => clean(el.textContent) === text),
        `${text} in ${section}`
    );
    const requested = gantt.requests;
    item.click();
    await until(() => gantt.requests > requested, `the data after "${text}"`);
    await dataSettled();
}

// requests ---------------------------------------------------------------------------------------

/** The view's data calls, counted when they leave and when their answer comes. */
const gantt = { requests: 0, responses: 0 };
const isDataCall = (event) => event.detail?.data?.params?.method === "get_gantt_data";
rpcBus.addEventListener("RPC:REQUEST", (event) => {
    if (isDataCall(event)) {
        gantt.requests++;
    }
});
rpcBus.addEventListener("RPC:RESPONSE", (event) => {
    if (isDataCall(event)) {
        gantt.responses++;
    }
});

/** No data call is on its way, and the answers have been drawn. */
async function dataSettled() {
    await until(() => gantt.responses >= gantt.requests, "the data calls answered", 10000);
    await sleep(150);
}

/** Every call of the page, by model and method: a "nothing happens" tour proves no write left. */
const calls = [];
const lastCalls = {};
rpcBus.addEventListener("RPC:REQUEST", (event) => {
    const params = event.detail?.data?.params;
    if (params?.method) {
        calls.push(`${params.model}.${params.method}`);
        if (params.method === "web_read" || params.method === "create_version") {
            lastCalls[params.method] = JSON.stringify([params.args, params.kwargs?.context?.version_id]);
        }
    }
});
const WRITES = /\.(create|write|unlink|web_save|web_create|copy|create_version|action_\w+)$/;
const writesSince = (mark) => calls.slice(mark).filter((call) => WRITES.test(call));

const rectOf = (el) => el.getBoundingClientRect();
const breadcrumb = () =>
    [
        ...new Set(
            $$(".o_breadcrumb .breadcrumb-item, .o_breadcrumb .active").map((el) => clean(el.textContent))
        ),
    ].join(" / ");

// the leave view -------------------------------------------------------------------------------------

const DEMO_NAMES = [
    "Anita Oliver",
    "Marc Demo",
    "Mitchell Admin",
    "Paul Williams",
    "Ronnie Hart",
    "Sharlene Rhodes",
];

/** The grid is drawn and its data are in; the remembered range of an earlier tour is forgotten. */
async function leaveReady() {
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the grid", 60000);
    clearRemembered();
    await dataSettled();
    await settle(300);
}

const scenario = (name, body) =>
    tours.add(name, {
        steps: () => [
            {
                trigger: ".o_tl_renderer .o_tl_row_header",
                timeout: 60000,
                async run() {
                    await leaveReady();
                    await body();
                },
            },
        ],
    });

const colOfDate = (date) => colByDate(date);
const cellOfDate = (name, date) => {
    const column = colByDate(date);
    assert(column, `a column for ${date}`);
    return cellsOf(name).find((cell) => Number(cell.dataset.column) === Number(column.dataset.index));
};
const pillByTitle = (name, title) =>
    pillsOf(name).find((pill) => clean($(".o_tl_pill_title", pill).textContent) === title);

/** The element at the point lies in `el`: no layer covers it. */
function assertUncovered(el, point, what) {
    const top = document.elementFromPoint(point.x, point.y);
    assert(top && el.contains(top), `${what}: the point (${point.x}, ${point.y}) lies on it, not on ${top?.className}`);
}

/** Brings a grid element to the middle of the visible part, then returns. */
async function bringIntoView(el) {
    el.scrollIntoView({ block: "nearest", inline: "center" });
    await settle(300);
}

/** Nothing is open, picked, drawn or written (the "nothing happens" scenarios). */
function assertNothing(what, mark) {
    assert(!popoverOfView(), `${what}: no popover`);
    for (const selector of [
        ".modal",
        ".o_tl_popover",
        ".o_tl_cell_picked",
        ".o_tl_selection",
        ".o_tl_selection_layer",
        ".o_tl_selection_badge",
        ".o_tl_handle",
        ".o_tl_pill_moved",
        ".o_tl_pill_faded",
        ".o_tl_connect_handle",
        ".o_tl_panel",
        ".o_tl_grid button",
    ]) {
        assert(!$(selector), `${what}: nothing matches ${selector}`);
    }
    assert(
        !$$(".o_control_panel button").some((el) => /plan|selection/i.test(el.className)),
        `${what}: no selection buttons`
    );
    assertEqual(writesSince(mark), [], `${what}: no write left`);
}

const noteMark = () => calls.length;

/** The rows as the view shows them: names and their pill titles. */
function snapshot() {
    return JSON.stringify([
        rowNames(),
        rowEls().map((el) => $$(".o_tl_pill", el).map((pill) => clean(pill.textContent))),
        $$(".o_tl_pill").map((pill) => {
            const rect = rectOf(pill);
            return [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width)];
        }),
    ]);
}

/** A press, moves with the button down, and (when `release`) the release. */
async function pressAndMove(from, points, release = true) {
    const last = points.at(-1);
    await send({
        events: [
            mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
            mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
            ...points.map((point) => mouse("mouseMoved", point.x, point.y, { buttons: 1 })),
            ...(release ? [mouse("mouseReleased", last.x, last.y, { buttons: 0, clickCount: 1 })] : []),
        ],
    });
}

async function release(at) {
    await send({ events: [mouse("mouseReleased", at.x, at.y, { buttons: 0, clickCount: 1 })] });
}

/** Real keys through the DevTools protocol. */
const KEYS = {
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
};
async function pressKey(name) {
    const key = KEYS[name];
    await send({
        method: "Input.dispatchKeyEvent",
        events: [
            { type: "rawKeyDown", ...key },
            { type: "keyUp", ...key },
        ],
    });
}

/** The menu items of the gear. */
async function openGear() {
    const toggle = await until(() => $(".o_cp_action_menus .dropdown-toggle"), "the gear");
    await realClick(toggle);
    await until(() => $(".o-dropdown--menu .dropdown-item"), "the gear's menu");
    return $$(".o-dropdown--menu .dropdown-item").map((el) => clean(el.textContent));
}

const gearItem = (text) =>
    $$(".o-dropdown--menu .dropdown-item").find((el) => clean(el.textContent) === text);

const pad = (value) => String(value).padStart(2, "0");
const isoOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The days shown, as the columns' dates (a folded run has the date of its first day). */
const shownDates = () => dateColumns().map((el) => el.dataset.date);

// A5: the management action
tours.add("hhg_a05_management_action", {
    steps: () => [
        {
            trigger: ".o_list_view",
            timeout: 60000,
            async run() {
                await settle(800);
                assertEqual(facets(), ["Waiting For Me"], "the list opens with its facet");
                const listFacets = facets();
                const types = $$(".o_cp_switch_buttons .o_switch_view").map((el) =>
                    [...el.classList].find((name) => /^o_(list|kanban|calendar|activity|gantt)$/.test(name))
                );
                assertEqual(
                    types,
                    ["o_list", "o_kanban", "o_calendar", "o_activity", "o_gantt"],
                    "the view switcher, in order"
                );
                await realClick($(".o_cp_switch_buttons .o_switch_view.o_gantt"));
                await until(() => $(".o_tl_renderer .o_tl_row"), "the leave view", 20000);
                await dataSettled();
                await settle(500);
                // grouped by Employee, with the list's own filter facets
                const ganttFacets = facets();
                assert(ganttFacets.includes("Employee"), `grouped by Employee: ${JSON.stringify(ganttFacets)}`);
                assertEqual(
                    ganttFacets.filter((facet) => facet !== "Employee"),
                    listFacets,
                    "the Gantt view has the same filter facets as the list"
                );
                // with the facet no employee has a request waiting: one empty row
                assertEqual(rowEls().length, 1, `one empty row, facets ${JSON.stringify(facets())}`);
                assertEqual(rowNames(), [""], "the row has no name");
                assertEqual($$(".o_tl_pill").length, 0, "and no pill");
            },
        },
    ],
});

// A8: the address of the Overview, and a reload
tours.add("hhg_a08_reload", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                await leaveReady();
                assertEqual(
                    window.location.pathname,
                    "/odoo/time-off-approval",
                    "the address names the management action"
                );
                assertEqual(facets(), ["Employee"], "the Employee grouping shows alone");
                sessionStorage.setItem("hhg_a08_address", window.location.pathname + window.location.search);
                window.location.reload();
            },
        },
        {
            trigger: ".o_tl_renderer .o_tl_row",
            timeout: 60000,
            async run() {
                await dataSettled();
                await settle(800);
                assertEqual(
                    window.location.pathname + window.location.search,
                    sessionStorage.getItem("hhg_a08_address"),
                    "the address is the same after the reload"
                );
                assertEqual(breadcrumb(), "All Time Off", "the title of the reduced view");
                assertEqual(facets(), ["Employee"], "the Employee facet alone, no Waiting For Me");
                assertEqual($$(".o_cp_switch_buttons .o_switch_view").length, 0, "no view switcher");
                assertEqual($$(".o_list_view, .o_kanban_view, .o_calendar_view").length, 0, "Gantt alone");
                await until(() => rowEls().length === 20, `20 rows, there are ${rowEls().length}`, 10000);
                // the domain came back too: Anita Oliver's Refused request of 9 November has no pill
                assertEqual(
                    pillTitles("Anita Oliver").length,
                    3,
                    `no pill for the Refused request: ${JSON.stringify(pillTitles("Anita Oliver"))}`
                );
            },
        },
    ],
});

// A17: the summary lines of the card, by the time left
const amount = (value, unit) => {
    const text = String(Number(Number(value).toFixed(2)));
    const word = unit === "hours" ? "hour" : "day";
    return `${text} ${Math.abs(value) === 1 ? word : word + "s"}`;
};

async function openCardOf(name) {
    await realClick($(".o_hrg_avatar", rowEl(name)));
    const band = await until(() => $(".o_avatar_card .o_hhg_card_band"), `${name}'s card`);
    // the card's own data (photo, contact lines) arrive after it opens and move its content
    await settle(1200);
    return band;
}

/** A real click on a button of the card, once nothing lies over its centre (links shift in). */
async function clickCardButton(selector) {
    const button = await until(() => $(selector), `the card's ${selector}`);
    assertUncovered(button, centre(button), `the card's ${selector}`);
    await realClick(button);
}

scenario("hhg_a17_summary_lines", async () => {
    await openCardOf("Mitchell Admin");
    const lines = $$(".o_hhg_card_line").map((el) => clean(el.textContent));
    const [employee] = await rpc("/web/dataset/call_kw/hr.employee.public/search_read", {
        model: "hr.employee.public",
        method: "search_read",
        args: [[["name", "=", "Mitchell Admin"]], ["avatar_leave_summary"]],
        kwargs: {},
    });
    const entries = employee.avatar_leave_summary;
    const expected = entries.map(
        (entry) =>
            `${entry.name}: ${amount(entry.taken, entry.unit)}` +
            (entry.requires_allocation ? ` /${amount(entry.left, entry.unit)}` : "")
    );
    assertEqual(lines, expected, "one line per type, as the server orders them");
    const lefts = entries.map((entry) => entry.left);
    assertEqual(lefts, [...lefts].sort((a, b) => a - b), "the time left, smallest first");
    const names = entries.map((entry) => entry.name);
    assert(names.includes("Compensatory Time Off"), `the type he has allocated: ${names}`);
    // the Community's demo spells this type "Guaranted ..." (no "e"): either spelling is the type
    const SICK = /^Guarante\w*d monthly wage illness/;
    assert(names.some((name) => SICK.test(name)), `the type he has taken: ${names}`);
    const sick = $$(".o_hhg_card_line").find((el) => SICK.test(clean(el.textContent)));
    assert(!$(".o_hhg_card_left", sick), "a type that needs no allocation has no slash");
    assert(/: 3 days$/.test(clean(sick.textContent)), `the time taken, in days: ${sick.textContent}`);
    const compensatory = $$(".o_hhg_card_line").find((el) => clean(el.textContent).startsWith("Compensatory"));
    assert($(".o_hhg_card_left", compensatory), "an allocated type shows what is left after a slash");
});

// A18: the schedule button opens the dashboard on the scale of the range
scenario("hhg_a18_schedule_button", async () => {
    const wanted = [
        ["month", "Month"],
        ["week", "Week"],
        ["quarter", "Year"],
    ];
    for (const [kind, scale] of wanted) {
        if (rangeName().toLowerCase() !== kind) {
            await pickRange(kind);
        }
        if (kind === "week") {
            await pointerAway();
        }
        await openCardOf("Anita Oliver");
        assertEqual(clean($(".o_hhg_card_schedule").textContent), "40 h / Week", "the schedule button");
        await clickCardButton(".o_hhg_card_schedule");
        await until(() => $(".o_calendar_container .o_calendar_header h5"), `the dashboard of ${kind}`, 20000);
        await settle(800);
        // the header names the scale: a week shows its number, a year only the year
        const header = $(".o_calendar_container .o_calendar_header h5");
        const shown = $(".o_current_week", header)
            ? "Week"
            : /^\s*\d{4}\s*$/.test(header.textContent)
              ? "Year"
              : /^\s*[A-Za-z]+ \d{4}\s*$/.test(header.textContent)
                ? "Month"
                : header.textContent;
        assertEqual(shown, scale, `the ${kind} range opens the ${scale} scale`);
        assert(
            breadcrumb().includes("Time Off Dashboard"),
            `the dashboard of Anita Oliver: ${breadcrumb()}`
        );
        // her requests are listed: November holds three of them, the week of 8 to 14 none
        const events = $$(".o_calendar_container .fc-event").length;
        assert(
            kind === "week" ? events === 0 : events > 0,
            `${events} requests listed on the ${scale} scale`
        );
        await realClick($(".o_breadcrumb .breadcrumb-item:not(.active)"));
        await until(() => $(".o_tl_renderer .o_tl_row_header"), "the leave view again", 20000);
        await dataSettled();
        await settle(500);
    }
});

// A88: the band's amounts with a waiting request
scenario("hhg_a88_band_amounts", async () => {
    await searchFor("Toff");
    await until(() => rowEl("Toff Peer"), "Toff Peer's row", 10000);
    await openCardOf("Toff Peer");
    const lines = $$(".o_hhg_card_line").map((el) => clean(el.textContent));
    assertEqual(
        lines.filter((line) => line.startsWith("Legal leave employee")),
        ["Legal leave employee: 2 days /8 days"],
        "the waiting request is not counted"
    );
});

// A19: the pencil, a date, a new version
async function countVersions(name) {
    return rpc("/web/dataset/call_kw/hr.version/search_count", {
        model: "hr.version",
        method: "search_count",
        args: [[["employee_id.name", "=", name]]],
        kwargs: {},
    });
}

scenario("hhg_a19_new_version", async () => {
    const before = await countVersions("Anita Oliver");
    await openCardOf("Anita Oliver");
    await clickCardButton(".o_hhg_card_version");
    await until(() => $(".o_datetime_picker"), "the date picker under the pencil");
    // closed without a date: nothing is created
    await pressKey("Escape");
    await until(() => !$(".o_datetime_picker"), "the picker closes");
    await settle(800);
    assertEqual(await countVersions("Anita Oliver"), before, "no version after a close without a date");
    assert(!$(".o_form_view"), "no form opened");
    if (!$(".o_hhg_card_version")) {
        await openCardOf("Anita Oliver");
    }
    await clickCardButton(".o_hhg_card_version");
    await until(() => $(".o_datetime_picker"), "the date picker again");
    await realClick($(".o_datetime_picker .o_next"));
    await settle(400);
    const first = $$(".o_datetime_picker .o_date_item_cell").find(
        (el) => !el.classList.contains("o_out_of_range") && clean(el.textContent) === "1"
    );
    assert(first, "the 1st of the next month");
    assert(
        /Dec/.test(clean($(".o_datetime_picker .o_datetime_picker_header").textContent)),
        `December shows: ${$(".o_datetime_picker .o_datetime_picker_header").textContent}`
    );
    await realClick(first);
    await until(() => $(".o_form_view") || $(".modal"), "the employee form", 20000);
    assert(
        !$(".modal"),
        `the form opens with no error: ${texts(".modal")}; the last calls ${JSON.stringify(lastCalls)}`
    );
    assertEqual(breadcrumb().split(" / ").at(-1), "Anita Oliver", `the form of Anita Oliver: ${breadcrumb()}`);
    assertEqual(await countVersions("Anita Oliver"), before + 1, "one version more");
});

// A22: Import and Export
scenario("hhg_a22_import_export", async () => {
    // a search, so that the export proves it carries the current search
    await searchFor("Marc");
    assertEqual(await openGear(), ["Import", "Export"], "the gear holds Import then Export");
    // Export: a download of the requests, without a dialog
    const downloads = [];
    const original = download._download;
    download._download = (options) => {
        const done = original(options);
        downloads.push({ options, done });
        return done;
    };
    try {
        await realClick(gearItem("Export"));
        await until(() => downloads.length === 1, "the download request", 20000);
        assertEqual(downloads[0].options.url, "/web/export/xlsx", "the export address");
        const payload = JSON.parse(downloads[0].options.data.data);
        assertEqual(payload.model, "hr.leave", "the requests are exported");
        const domain = JSON.stringify(payload.domain);
        assert(domain.includes("Marc"), `the export carries the search: ${domain}`);
        assert(domain.includes("employee_id.company_id"), `and the action's domain: ${domain}`);
        assertEqual(
            payload.fields.map((field) => field.name),
            ["id", "employee_id", "work_entry_type_id/id", "request_date_from", "request_date_to"],
            "five fields"
        );
        assertEqual(payload.groupby, [], "ungrouped");
        assertEqual(
            payload.fields.map((field) => field.label),
            [
                "External ID (update only)",
                "Employee",
                "Time Type/External ID",
                "Request Start Date",
                "Request End Date",
            ],
            "the five titles of the header line"
        );
        assertEqual(payload.import_compat, false, "the mode that titles the columns");
        await downloads[0].done;
        await settle(800);
        assert(!$(".modal"), "no dialog");
    } finally {
        download._download = original;
    }
    assert($(".o_tl_renderer"), "the view is still there");
    // Import: the import screen, one step under the view
    await openGear();
    await realClick(gearItem("Import"));
    await until(() => $(".o_import_action"), "the import screen", 20000);
    assertEqual(breadcrumb(), "All Time Off / Import", "the breadcrumb of the import screen");
});

// A24: nothing lies over an empty view
scenario("hhg_a24_empty_view", async () => {
    await searchFor("zzz");
    await until(() => rowEls().length === 1 && nameOf(rowEls()[0]) === "", "one unnamed row", 8000);
    assert($(".o_tl_total_row"), "the total row shows");
    const nothingOver = (what) => {
        assert(!$(".o_view_nocontent, .o_nocontent_help"), `${what}: no helper`);
        assert(!$(".o_view_sample_data, .o_tl_sample, .o_tl_box_sample"), `${what}: no sample layer`);
        assert(!$(".modal") && !popoverOfView(), `${what}: no dialog, no popover`);
        assert(!$(".o_tl_cell_picked, .o_tl_selection, .o_tl_selection_layer, .o_tl_handle"), `${what}: no layer`);
    };
    nothingOver("the empty view");
    const mark = noteMark();
    for (let run = 0; run < 2; run++) {
        const cell = $$(".o_tl_cell", rowEls()[0])[8];
        await realClick(cell);
        await settle(500);
        nothingOver("a click on a cell of the empty row");
        await realClick($(".o_tl_row_header", rowEls()[0]));
        await settle(500);
        nothingOver("a click on the row header");
        await realClick($(".o_tl_col:not(.o_tl_folded)"));
        await settle(500);
        nothingOver("a click on a header");
        const box = rectOf($(".o_tl_renderer"));
        const lastRow = rectOf($(".o_tl_total_row"));
        const y = Math.min(lastRow.bottom + 20, box.bottom - 4);
        await realClick(null, { at: { x: box.left + 600, y } });
        await settle(500);
        nothingOver("a click below the rows");
    }
    assertEqual(writesSince(mark), [], "no write");
    // the range buttons and the search still act
    await pickRange("week");
    assertEqual(rangeName(), "Week", "the range buttons act");
    await removeFacet("zzz");
    await until(() => rowNames().length > 1, "the search acts: rows are back", 8000);
});

// A29: an employee search keeps employees without leave
scenario("hhg_a29_employee_search", async () => {
    await searchFor("Marc");
    await until(() => rowNames().length === 1, "one row for Marc");
    assertEqual(rowNames(), ["Marc Demo"], "one row, Marc Demo");
    assertEqual(pillTitles("Marc Demo"), ["1d", "STO 2 days"], "with his leaves");
    await removeFacet("Marc");
    await searchFor("Jennie");
    await until(() => rowNames().length === 1 && rowNames()[0] === "Jennie Fletcher", "Jennie's row");
    assertEqual(pillTitles("Jennie Fletcher"), [], "without any pill");
    await expectLabel("Jennie Fletcher", "168h", "Jennie's label");
});

// A43 and A72: the label alone, and the tooltips
const hasTooltip = (el) => Boolean(el.closest("[data-tooltip]"));

scenario("hhg_a43_label_alone", async () => {
    await expectLabel("Anita Oliver", "80h", "Anita Oliver's label");
    assertEqual($$(".o_tl_progress").length, 0, "no row header holds a bar");
    const label = labelEl("Anita Oliver");
    assert(!hasTooltip(label), "the label carries no tooltip text");
    assert(!label.hasAttribute("title"), "the label has no title");
    await realHover(label);
    await settle(2000);
    assert(!$(".o-tooltip"), "no tooltip shows after 2 s on the label");
    // (the row header's native title, 002a, is the browser's own tooltip: no tour can see it)
    await pointerAway();
});

scenario("hhg_a72_avatar_tooltip", async () => {
    const avatar = $(".o_hrg_avatar", rowEl("Anita Oliver"));
    await realHover(avatar);
    const tip = await until(() => $(".o-tooltip"), "the avatar's tooltip", 6000);
    await settle(2000);
    assert(clean(tip.textContent).includes("Anita Oliver"), `the tooltip names her: ${tip.textContent}`);
    await pointerAway();
    const name = $(".o_tl_row_label", rowEl("Anita Oliver"));
    assert(!hasTooltip(name), "the name carries no framework tooltip text");
    assert(!name.hasAttribute("title"), "the name has no title of its own");
    await realHover(name);
    await settle(2000);
    assert(!$(".o-tooltip"), "no framework tooltip shows on the name");
    await pointerAway();
});

// A48: one period per range
const datesWithin = (first, last, what) => {
    const dates = shownDates();
    assert(dates.length > 0, `${what}: columns show`);
    assert(
        dates.every((date) => date >= first && date <= last),
        `${what}: every column lies in ${first} to ${last}, got ${dates[0]} to ${dates.at(-1)}`
    );
    return dates;
};

scenario("hhg_a48_one_period", async () => {
    assertEqual(rangeName(), "Month", "the Month range");
    datesWithin("2026-11-01", "2026-11-30", "November");
    await step(1);
    const december = datesWithin("2026-12-01", "2026-12-31", "December alone");
    assertEqual([december[0], december.at(-1)], ["2026-12-01", "2026-12-31"], "December from end to end");
    await step(-1);
    await pickRange("week");
    datesWithin("2026-11-08", "2026-11-14", "the week of 8 November");
    await step(-1);
    const previous = datesWithin("2026-11-01", "2026-11-07", "the week before");
    assert(previous.includes("2026-11-02") && previous.includes("2026-11-06"), `1 to 7 November: ${previous}`);
    await pickRange("quarter");
    await step(1);
    const quarter = datesWithin("2027-01-01", "2027-03-31", "January to March 2027");
    assertEqual([quarter[0], quarter.at(-1)], ["2027-01-01", "2027-03-31"], "the next quarter from end to end");
});

// A49: a range chosen around today
scenario("hhg_a49_range_around_today", async () => {
    const box = renderer();
    box.scrollLeft = box.scrollWidth;
    await settle(500);
    await pickRange("week");
    const week = datesWithin("2026-11-08", "2026-11-14", "the week around today");
    assert(week.includes("2026-11-11"), "it holds today");
    await pickRange("month");
    await step(1);
    datesWithin("2026-12-01", "2026-12-31", "December");
    // the middle of the visible part of the grid
    const area = rectOf(renderer());
    const header = rectOf($(".o_tl_row_header"));
    const middle = (header.right + area.right) / 2;
    const under = dateColumns().find((el) => {
        const rect = rectOf(el);
        return rect.left <= middle && rect.right >= middle;
    });
    assert(under, "a column under the middle of the visible part");
    const centre = under.dataset.date;
    await pickRange("week");
    const december = datesWithin("2026-12-01", "2026-12-31", "a week of December");
    assert(december.includes(centre), `the week holds the middle ${centre}: ${december}`);
});

// A50: Today and Custom
async function applyCustom(start, stop) {
    $(".o_tl_range_button").click();
    await until(() => $(".o_tl_custom_start input"), "the custom range's inputs");
    for (const [selector, value] of [
        [".o_tl_custom_start input", start],
        [".o_tl_custom_stop input", stop],
    ]) {
        const input = $(selector);
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const before = periodSignature();
    $(".o_tl_apply").click();
    await until(() => periodSignature() !== before, "the custom range", 8000);
    await settle(400);
}

scenario("hhg_a50_today_and_custom", async () => {
    await pickRange("week");
    await step(1);
    datesWithin("2026-11-15", "2026-11-21", "the week of 15 November");
    await today();
    datesWithin("2026-11-08", "2026-11-14", "Today gives the week with today");
    await applyCustom("11/01/2026", "11/10/2026");
    const custom = datesWithin("2026-11-01", "2026-11-10", "the custom range");
    assertEqual(custom.at(-1), "2026-11-10", "it ends on 10 November");
    await today();
    assertEqual(clean($(".o_tl_range_start").textContent), "11/07/2026", "ten days around today: from");
    assertEqual(clean($(".o_tl_range_stop").textContent), "11/16/2026", "ten days around today: to");
    const dates = datesWithin("2026-11-07", "2026-11-16", "ten days around today");
    assert(dates.includes("2026-11-11"), "today is in it");
});

// A51: folding
scenario("hhg_a51_folding", async () => {
    assertEqual(rangeName(), "Month", "the Month range");
    // a folded run is one header, with the index of its first day (7, 14 and 21 November)
    const folded = () => foldedHeaders().map((el) => el.dataset.index);
    assertEqual(folded(), ["6", "13", "20"], "7-8, 14-15 and 21-22 November fold");
    assertEqual(
        dateColumns().filter((el) => ["2026-11-07", "2026-11-08", "2026-11-14"].includes(el.dataset.date)).length,
        0,
        "the days of a folded run have no header of their own"
    );
    for (const day of ["2026-11-28", "2026-11-29"]) {
        assert(colByDate(day) && !colByDate(day).classList.contains("o_tl_folded"), `${day} does not fold`);
    }
    await realClick(foldedHeaders()[0]);
    await until(() => foldedHeaders().length === 2, "7 and 8 November open");
    for (const day of ["2026-11-07", "2026-11-08"]) {
        assert(colByDate(day) && !colByDate(day).classList.contains("o_tl_folded"), `${day} is open`);
    }
});

// A52: the total row
scenario("hhg_a52_total_row", async () => {
    await pickRange("week");
    await step(1);
    datesWithin("2026-11-15", "2026-11-21", "the week of 15 November");
    // a bar spans the days that share its leaves (002a cuts at every start and end): each day
    // with leaves lies under one bar, whose number counts the leaves of that day
    const bars = $$(".o_tl_total_bar");
    const byDay = {};
    for (const column of dateColumns()) {
        const box = rectOf(column);
        const middle = box.left + box.width / 2;
        const under = bars.filter((bar) => {
            const rect = rectOf(bar);
            return rect.left <= middle && rect.right >= middle;
        });
        assert(under.length <= 1, `one bar at most over ${column.dataset.date}`);
        if (under.length) {
            byDay[column.dataset.date] = [clean($(".o_tl_total_count", under[0]).textContent)];
        }
    }
    // The leaves of the week of 15 November (demo-like records): Mitchell Admin 16-18 (STO), Anita
    // Oliver 18 (PTO), Ronnie Hart 18-20 (PTO). Per day: 16 -> 1, 17 -> 1, 18 -> 3, 19 -> 1,
    // 20 -> 1; Sunday 15 and Saturday 21 have none.
    assertEqual(
        byDay,
        {
            "2026-11-16": ["1"],
            "2026-11-17": ["1"],
            "2026-11-18": ["3"],
            "2026-11-19": ["1"],
            "2026-11-20": ["1"],
        },
        "one bar on each day with leaves, counting the rows' leaves"
    );
});

// A53: no New button (the leave half)
scenario("hhg_a53_no_new_button", async () => {
    assert(!$(".o_tl_button_add"), "no New button of the view");
    assert(
        !$$(".o_control_panel button").some((el) => clean(el.textContent) === "New"),
        `no button named New: ${texts(".o_control_panel button")}`
    );
});

// A54: no Date grouping
scenario("hhg_a54_date_grouping", async () => {
    await openSearchMenu();
    const groupings = $$(".o_group_by_menu .o_menu_item")
        .filter((el) => !el.querySelector("select") && !el.closest(".o_add_custom_group_menu"))
        .map((el) => clean(el.textContent));
    assertEqual(groupings, ["Employee", "Type", "Status"], "the groupings offered, without Date");
    const select = $(".o_group_by_menu select");
    assert(select, "the custom grouping");
    const option = [...select.options].find((el) => clean(el.textContent) === "Start Date");
    assert(option, `the start date among the custom groupings: ${[...select.options].map((el) => el.text)}`);
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(2000);
    await dataSettled();
    // the custom grouping replaces the Employee grouping (one grouping facet); the view drops a
    // grouping on its own date (002a R19), so no grouping is left: one line of pills, no rows
    // named by a period
    const state = `facets ${JSON.stringify(facets())}, rows ${JSON.stringify(rowNames())}`;
    assert(facets().includes("Start Date: Month"), `the custom grouping is the facet: ${state}`);
    assert(!facets().includes("Employee"), `it replaced the Employee grouping: ${state}`);
    assertEqual($$(".o_tl_row_header").length, 0, `the date grouping is dropped, no row header: ${state}`);
    assert($$(".o_tl_pill").length > 0, `the pills show: ${state}`);
    assert(
        allPillTitles().some((title) => title.includes("Anita Oliver")),
        `the pills read their long text: ${JSON.stringify(allPillTitles())}`
    );
});

// A55: the grouping removed
scenario("hhg_a55_grouping_removed", async () => {
    await removeFacet("Employee");
    await until(() => $$(".o_tl_row_header").length === 0, "no row headers", 8000);
    const titles = allPillTitles();
    assert(titles.length > 0, "the pills show");
    for (const title of titles) {
        assert(
            DEMO_NAMES.some((name) => title.includes(name)),
            `each pill reads the Community's long text with the employee's name: "${title}"`
        );
    }
    // Anita Oliver's 2 to 5 November: her name, the type and the dates
    const anita = titles.find((title) => title.includes("Anita Oliver") && /11\/0?2\/(20)?26/.test(title));
    assert(anita, `a pill of Anita Oliver's 2 to 5 November reads her long text: ${JSON.stringify(titles)}`);
    // the Community's text names the type by its display code
    assert(anita.includes(" on PTO"), `with the type: "${anita}"`);
    assert(/11\/0?5\/(20)?26/.test(anita), `and the end date: "${anita}"`);
});

// A64 to A69, A73: the inputs of a pill and of the empty cells (002e2 R20: the click on a pill opens
// the popover, the double click the dialog; the empty cells' inputs wait for 002e3)
// The titles of Anita Oliver's pills these tours look for: the leave view reads the type code, the
// report view of an Employee the duration alone (the report tours of 13b run the same bodies).
const titles = { four: "PTO 4 days", six: "PTO 6 days" };
const ANITA_FOUR = () => pillByTitle("Anita Oliver", titles.four);

const clickOnAPill = async () => {
    const mark = noteMark();
    const before = snapshot();
    for (let run = 0; run < 2; run++) {
        const pill = ANITA_FOUR();
        await bringIntoView(pill);
        assertUncovered(pill, centre(pill), "the pill's centre");
        await realClick(pill);
        await until(() => $(".o_hhg_pop"), `click ${run + 1}: the leave popover opens`);
        await settle(600);
        assert(!$(".modal"), `click ${run + 1}: no dialog`);
        assert(!$(".o_tl_handle"), `click ${run + 1}: no handle`);
        assertEqual(writesSince(mark), [], `click ${run + 1}: no write`);
        assertEqual(snapshot(), before, `click ${run + 1}: the view is unchanged`);
        await pressKey("Escape");
        await until(() => !$(".o_hhg_pop"), `click ${run + 1}: Escape closes the popover`);
    }
};

const doubleClickOnAPill = async () => {
    const mark = noteMark();
    const before = snapshot();
    for (let run = 0; run < 2; run++) {
        const pill = ANITA_FOUR();
        await bringIntoView(pill);
        await realClick(pill, { count: 2 });
        await until(() => $(".modal"), `double click ${run + 1}: the record dialog opens`);
        await settle(1200);
        assertEqual($$(".modal").length, 1, `double click ${run + 1}: one dialog`);
        assert(!$(".o_hhg_pop"), `double click ${run + 1}: no popover`);
        assert(!$(".o_tl_handle"), `double click ${run + 1}: no handle`);
        assertEqual(writesSince(mark), [], `double click ${run + 1}: no write`);
        await closeDialog();
        assertEqual(snapshot(), before, `double click ${run + 1}: the view is unchanged`);
    }
};

const CELL_12 = "2026-11-12";
const CELL_13 = "2026-11-13";
const insideLeft = (cell) => {
    const rect = rectOf(cell);
    return { x: rect.left + 10, y: rect.top + rect.height / 2 };
};

const pointerOverAPill = async () => {
    const mark = noteMark();
    const pill = pillByTitle("Anita Oliver", titles.six);
    await bringIntoView(pill);
    const count = () => $$("*", $(".o_tl_grid")).length;
    const before = count();
    for (let run = 0; run < 2; run++) {
        await pointerAway();
        await realHover(pill);
        await settle(1500);
        assertNothing(`rest ${run + 1}`, mark);
        assertEqual(count(), before, `rest ${run + 1}: no element appears in the grid`);
    }
    // R18, D4: the pointer is the hand over the pill (its ends show no resize arrow until the
    // handles come) and keeps its default shape over an empty cell
    const cell = cellOfDate("Jennie Fletcher", CELL_12);
    await bringIntoView(cell);
    await bringIntoView(pill);
    const rect = rectOf(pill);
    const middle = rect.top + rect.height / 2;
    for (const [where, point, element] of [
        ["the pill's centre", centre(pill), pill],
        ["4 px inside the pill's left end", { x: rect.left + 4, y: middle }, pill],
        ["4 px inside the pill's right end", { x: rect.right - 4, y: middle }, pill],
        ["an empty cell", insideLeft(cell), cell],
    ]) {
        assertUncovered(element, point, where);
        const shape = getComputedStyle(document.elementFromPoint(point.x, point.y)).cursor;
        const wanted = element === pill ? ["pointer"] : ["default", "auto"];
        assert(wanted.includes(shape), `the pointer over ${where} reads "${shape}"`);
    }
    await pointerAway();
};

const dragOnAPill = async () => {
    const mark = noteMark();
    const before = snapshot();
    for (const [where, offset] of [["centre", null], ["right end", 4]]) {
        for (let run = 0; run < 2; run++) {
            const pill = ANITA_FOUR();
            await bringIntoView(pill);
            const rect = rectOf(pill);
            const start =
                offset === null
                    ? centre(pill)
                    : { x: rect.right - offset, y: rect.top + rect.height / 2 };
            assertUncovered(pill, start, `the ${where}`);
            const points = [20, 40, 60, 80, 100, 120].map((dx) => ({ x: start.x + dx, y: start.y }));
            await pressAndMove(start, points, false);
            await settle(500);
            assertNothing(`${where} ${run + 1}, button down`, mark);
            assertEqual(snapshot(), before, `${where} ${run + 1}: the pill stays during the drag`);
            await release(points.at(-1));
            await settle(1200);
            assertNothing(`${where} ${run + 1}, released`, mark);
            assertEqual(snapshot(), before, `${where} ${run + 1}: the pill stays in place`);
        }
    }
};

const clickOnAnEmptyCell = async () => {
    const mark = noteMark();
    const before = snapshot();
    for (let run = 0; run < 2; run++) {
        const cell = cellOfDate("Jennie Fletcher", CELL_12);
        const point = insideLeft(cell);
        assertUncovered(cell, point, "the cell's left edge");
        await realClick(null, { at: point });
        await settle(1200);
        assertNothing(`click ${run + 1}`, mark);
        await realClick(null, { at: point, count: 2 });
        await settle(1200);
        assertNothing(`double click ${run + 1}`, mark);
        assertEqual(snapshot(), before, `run ${run + 1}: the view is unchanged`);
    }
};

const dragAcrossEmptyCells = async () => {
    const mark = noteMark();
    const before = snapshot();
    for (let run = 0; run < 2; run++) {
        const from = insideLeft(cellOfDate("Jennie Fletcher", CELL_12));
        const to = insideLeft(cellOfDate("Jennie Fletcher", CELL_13));
        const middle = { x: (from.x + to.x) / 2, y: from.y };
        await pressAndMove(from, [{ x: from.x + 15, y: from.y }, middle, to], false);
        await settle(500);
        assertNothing(`drag ${run + 1}, button down`, mark);
        await release(to);
        await settle(1200);
        assertNothing(`drag ${run + 1}, released`, mark);
        await realClick(colByDate(CELL_12));
        await settle(800);
        assertNothing(`header click ${run + 1}`, mark);
        await realClick(cellOfDate("Jennie Fletcher", CELL_13), { keys: ["ctrl"] });
        await settle(800);
        assertNothing(`ctrl-click ${run + 1}`, mark);
        assertEqual(snapshot(), before, `run ${run + 1}: the view is unchanged`);
    }
};

scenario("hhg_a64_click_on_a_pill", clickOnAPill);
scenario("hhg_a65_double_click_on_a_pill", doubleClickOnAPill);
scenario("hhg_a66_pointer_over_a_pill", pointerOverAPill);
scenario("hhg_a67_drag_on_a_pill", dragOnAPill);
scenario("hhg_a68_click_on_an_empty_cell", clickOnAnEmptyCell);
scenario("hhg_a69_drag_across_empty_cells", dragAcrossEmptyCells);

// The same inputs in the report view, as an Employee reads it (A64 to A69): the pills read the
// duration alone
const reportScenario = (name, body) =>
    scenario(name, async () => {
        titles.four = "4 days";
        titles.six = "6 days";
        await body();
    });
reportScenario("hhg_a64_report_click_on_a_pill", clickOnAPill);
reportScenario("hhg_a65_report_double_click_on_a_pill", doubleClickOnAPill);
reportScenario("hhg_a66_report_pointer_over_a_pill", pointerOverAPill);
reportScenario("hhg_a67_report_drag_on_a_pill", dragOnAPill);
reportScenario("hhg_a68_report_click_on_an_empty_cell", clickOnAnEmptyCell);
reportScenario("hhg_a69_report_drag_across_empty_cells", dragAcrossEmptyCells);

// A70: a tap on a pill on the phone opens 002a's sheet (R21)
scenario("hhg_a70_tap_on_a_pill", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    const mark = noteMark();
    for (let run = 0; run < 2; run++) {
        const pill = pillByTitle("Anita Oliver", "PTO 6 days");
        await bringIntoView(pill);
        const before = snapshot();
        const point = centre(pill);
        assertUncovered(pill, point, "the pill's centre");
        await realTap(pill);
        await until(() => $(".o_hhg_pop.o_tl_popover_sheet"), `tap ${run + 1}: the sheet opens`);
        await settle(600);
        assertEqual(writesSince(mark), [], `tap ${run + 1}: no write`);
        assertEqual(snapshot(), before, `tap ${run + 1}: the view is unchanged`);
        await realClick($(".o_hhg_pop_close"));
        await until(() => !$(".o_hhg_pop"), `tap ${run + 1}: the close icon closes the sheet`);
    }
});

// A71: the row header
scenario("hhg_a71_row_header", async () => {
    await pickRange("quarter");
    await until(() => rowEl("Sharlene Rhodes"), "Sharlene Rhodes's row");
    await settle(500);
    const box = renderer();
    const mark = noteMark();
    // her leave of 26 to 31 October
    const first = pillByTitle("Sharlene Rhodes", "PTO 5 days");
    assert(first, `her PTO 5 days pill: ${JSON.stringify(pillTitles("Sharlene Rhodes"))}`);
    const start = box.scrollLeft;
    assert(start > 0, "the Quarter range opens scrolled to today");
    await realClick($(".o_tl_row_label", rowEl("Sharlene Rhodes")));
    await until(
        () => {
            const header = rectOf($(".o_tl_row_header"));
            const rect = rectOf(first);
            return rect.left >= header.right - 2 && rect.right <= rectOf(box).right + 2;
        },
        "the grid scrolls to her first pill",
        6000
    );
    assert(box.scrollLeft < start, `the grid scrolled back to the pill: ${start} -> ${box.scrollLeft}`);
    assert(!$(".o_avatar_card"), "no card opens by the name");
    // the avatar opens the card and the grid does not scroll
    const rest = box.scrollLeft;
    await realClick($(".o_hrg_avatar", rowEl("Sharlene Rhodes")));
    await until(() => $(".o_avatar_card"), "the card opens by the avatar");
    await settle(800);
    assertNear(box.scrollLeft, rest, "the grid does not scroll with the avatar", 1);
    assertEqual(writesSince(mark), [], "no write");
});

// A73: keys with no dialog
scenario("hhg_a73_keys", async () => {
    const mark = noteMark();
    const before = snapshot();
    for (let run = 0; run < 2; run++) {
        for (const name of ["Escape", "Enter", "Delete"]) {
            await pressKey(name);
            await settle(700);
            assertNothing(`${name} ${run + 1}`, mark);
            assertEqual(snapshot(), before, `${name} ${run + 1}: the view is unchanged`);
        }
        // with a pill clicked first: its popover opens, Escape closes it, the other keys do nothing
        const pill = ANITA_FOUR();
        await realClick(pill);
        await until(() => $(".o_hhg_pop"), "the popover of the click");
        await pressKey("Escape");
        await until(() => !$(".o_hhg_pop"), "Escape closes the popover");
        for (const name of ["Escape", "Enter", "Delete"]) {
            await pressKey(name);
            await settle(700);
            assertNothing(`${name} after a click ${run + 1}`, mark);
            assertEqual(snapshot(), before, `${name} after a click ${run + 1}: unchanged`);
        }
    }
});

// A92: the control bar of the leave view (R6, R23 point 1, D3; M77 to M80, M84 to M93) -----------------

/** A box reads the values (x, y, width, height) within half a pixel, `null` leaves one out. */
function assertBox(el, wanted, what) {
    assert(el, `${what}: the element is there`);
    const rect = rectOf(el);
    const [x, y, width, height] = wanted;
    for (const [name, want, got] of [
        ["x", x, rect.left],
        ["y", y, rect.top],
        ["width", width, rect.width],
        ["height", height, rect.height],
    ]) {
        if (want !== null) {
            assertNear(got, want, `${what}: ${name}`, 0.5);
        }
    }
}

// On the desktop Complete lies 3 px lower than the table (the search field, "Out of scope").
scenario("hhg_a92_bar_on_the_desktop", async () => {
    assert(!$(".o_timeline_view.o_tl_phone"), "the desktop layout");
    assertBox($(".o_tl_controls"), [0, 107, 1600, 58], "the control bar (M77)");
    assertBox($(".o_tl_step_buttons"), [16, 111.5, 71.031, 33], "previous and next (M78)");
    assertBox($(".o_tl_today"), [174.953, 111.5, 59.359, 33], "Today (M79)");
    assertBox($(".o_tl_range_button"), [91.031, 111.5, 79.922, 33], "the range button (M14)");
    assertBox($(".o_tl_col_group"), [null, 166, null, 25], "the period line (M80)");
    const bar = rectOf($(".o_tl_controls"));
    assertNear(rectOf($(".o_tl_col_group")).top - bar.bottom, 1, "the grid lies 1 px below the bar", 0.5);
    // the bar's height does not follow its content: the same 58 px with a search that finds nothing
    await searchFor("zzz");
    await settle(600);
    assertBox($(".o_tl_controls"), [0, 107, 1600, 58], "the control bar with nothing found");
});

/** A computed colour text as [r, g, b, a]. */
const channelsOf = (text) => {
    const [r, g, b, a = 1] = text.match(/[\d.]+/g).map(Number);
    return [r, g, b, a];
};

/**
 * The colour a user sees on a line of `el`: the line's colour at its own opacity over what lies
 * under it (the element's background, then its ancestors', until one is opaque).
 */
function drawnLine(el) {
    const style = getComputedStyle(el);
    const [r, g, b, a] = channelsOf(style.borderTopColor);
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
        const [lr, lg, lb, la] = channelsOf(getComputedStyle(node).backgroundColor);
        if (la > 0) {
            layers.push([lr, lg, lb, la]);
            if (la === 1) {
                break;
            }
        }
    }
    let under = [255, 255, 255];
    for (const [lr, lg, lb, la] of layers.reverse()) {
        under = [lr, lg, lb].map((value, index) => value * la + under[index] * (1 - la));
    }
    const alpha = a * Number(style.opacity);
    return [r, g, b].map((value, index) => Math.round(value * alpha + under[index] * (1 - alpha)));
}

// The separator as a user sees it (F2, M91, M94): a faint grey, not the text colour.
const separatorLooksFaint = () => {
    const scheme = getComputedStyle(document.documentElement).getPropertyValue("--o-cws-scheme").trim();
    const [wanted, name] = scheme === "dark" ? [[82, 82, 85], "dark"] : [[194, 195, 197], "light"];
    const style = getComputedStyle($(".o_tl_separator"));
    assertEqual(style.opacity, "0.25", "the separator is drawn at a quarter opacity");
    assertEqual(style.borderTopStyle, "solid", "a solid line");
    assertEqual(
        getComputedStyle($(".o_tl_controls")).backgroundColor,
        "rgba(0, 0, 0, 0)",
        "over a transparent bar (M94)"
    );
    const drawn = drawnLine($(".o_tl_separator"));
    drawn.forEach((value, index) =>
        assertNear(value, wanted[index], `the line as drawn in ${name}: channel ${index} of ${drawn}`, 3)
    );
};

// On the phone the bar grows to its two lines, as the report view's does (decision D3).
scenario("hhg_a92_bar_on_the_phone", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    assertBox($(".o_tl_controls"), [0, 103, 390, 101], "the control bar (M84, M86)");
    assertBox($(".o_tl_step_buttons"), [16, 109.328, 71.031, 33], "previous and next (M89)");
    assertBox($(".o_tl_range_button"), [91.031, 109.328, 79.922, 33], "the range button (M90)");
    assertBox($(".o_tl_separator"), [0, 147, 390, 1], "the separator (M91)");
    assertBox($(".o_tl_today"), [16, 152.656, 59.359, 33], "Today (M92)");
    assertBox($(".o_tl_gear"), [337.984, 152.656, 36.016, 33], "the bar's gear (M93)");
    assertBox($(".o_tl_col_group"), [null, 205, null, 25], "the period line (M85)");
    separatorLooksFaint();
});

// A93: where the phone's grid opens (R23 point 2; M82, M83, M15, M16) -------------------------------

scenario("hhg_a93_phone_opening_positions", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    assertEqual(rangeName(), "Month", "the range");
    assertNear(renderer().scrollLeft, 322, "the grid is scrolled 322 px (M82)", 1);
    assertNear(rectOf(colByDate("2026-11-11")).left, 260, "today's column's left edge (M15)", 0.5);
    await pickRange("week");
    await settle(600);
    assertNear(renderer().scrollLeft, 312, "the Week range: 312 px (M83)", 1);
    assertNear(rectOf(colByDate("2026-11-11")).left, 238, "Wednesday 11's left edge", 0.5);
    await step(1);
    await settle(600);
    assertNear(renderer().scrollLeft, 312, "Next keeps the scroll (M83)", 1);
    assertNear(rectOf(colByDate("2026-11-18")).left, 238, "Wednesday 18's left edge", 0.5);
    // The table's y 297 is that of the probe's world, which has other rows above Anita Oliver's (the
    // probe checks it); here the pill lies 1 px under its 41 px row, as in the table
    const pill = pillByTitle("Anita Oliver", "PTO 1d");
    assertBox(pill, [239, null, 190, 23], "Anita Oliver's pill (M16)");
    const row = rectOf($(".o_tl_row_header", rowEl("Anita Oliver")));
    assertNear(rectOf(pill).top - row.top, 1, "the pill lies 1 px under its row's top (M16)", 0.5);
    assertNear(row.height, 41, "the row is 41 px tall", 0.5);
});

// A94: nothing covers the grid on the phone (R23 point 1, D3) -------------------------------------------

scenario("hhg_a94_nothing_covers_the_grid", async () => {
    assert($(".o_timeline_view.o_tl_phone"), "the phone layout");
    assertEqual(rangeName(), "Month", "the range");
    const period = rectOf($(".o_tl_col_group"));
    const bar = rectOf($(".o_tl_controls"));
    assert(bar.bottom <= period.top + 0.01, `the bar's bottom ${bar.bottom} is above the period line's top ${period.top}`);
    for (const selector of [".o_tl_today", ".o_tl_gear"]) {
        const box = rectOf($(selector));
        assert(box.bottom <= period.top, `${selector} ends at ${box.bottom}, above the period line ${period.top}`);
    }
    // the second line lies under the separator, which lies under the first line
    assert(rectOf($(".o_tl_separator")).top >= rectOf($(".o_tl_range_button")).bottom, "the separator lies under the first line");
    assert(rectOf($(".o_tl_today")).top >= rectOf($(".o_tl_separator")).bottom, "the second line lies under the separator");
    // the element at a point 2 px under the period line's top, in the middle of the screen
    const found = document.elementFromPoint(200, period.top + 2);
    assert(
        found && found.closest(".o_tl_col_group"),
        `the period line is at (200, ${period.top + 2}), not ${found?.tagName}.${found?.className}`
    );
    assert(!found.closest(".o_tl_controls"), "no control of the bar is there");
});

// A87: one-day pills whatever the search holds
const ONE_DAY = /^(PTO|STO|CTO) 1d$/;

tours.add("hhg_a87_officer", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            async run() {
                await leaveReady();
                assertEqual(rangeName(), "Month", "the Month range");
                // Status is a group of options in the filter menu: open it, then choose Approved
                await openSearchMenu();
                const status = await until(
                    () => $$(".o_filter_menu .o_accordion_toggle").find((el) => clean(el.textContent) === "Status"),
                    "Status in the filter menu"
                );
                status.click();
                const approved = await until(
                    () => $$(".o_filter_menu .o_item_option").find((el) => clean(el.textContent) === "Approved"),
                    `Approved under Status: ${texts(".o_filter_menu .o_item_option")}`
                );
                const requested = gantt.requests;
                approved.click();
                await until(() => gantt.requests > requested, "the data after Approved");
                await dataSettled();
                await until(
                    () => DEMO_NAMES.every((name) => rowNames().includes(name)),
                    `the rows of the Approved requests: ${rowNames()}`
                );
                const titles = allPillTitles();
                assertEqual(
                    titles.filter((title) => title === "1d").length,
                    6,
                    `six one-day pills read 1d: ${titles}`
                );
                assert(!titles.some((title) => ONE_DAY.test(title)), `none reads PTO 1d or STO 1d: ${titles}`);
                for (const title of ["PTO 4 days", "STO 2 days", "CTO 3 days"]) {
                    assert(titles.includes(title), `${title} reads in full: ${titles}`);
                }
                await pickRange("week");
                await step(1);
                await until(() => pillByTitle("Anita Oliver", "PTO 1d"), "Anita Oliver's 18 November on the week scale");
                assertEqual(pillTitles("Anita Oliver"), ["PTO 1d"], "with the filter, the week reads the code");
            },
        },
    ],
});

tours.add("hhg_a87_management", {
    steps: () => [
        {
            trigger: ".o_list_view",
            timeout: 60000,
            async run() {
                await settle(500);
                await realClick($(".o_cp_switch_buttons .o_switch_view.o_gantt"));
                await until(() => $(".o_tl_renderer .o_tl_row_header"), "the leave view", 20000);
                await dataSettled();
                await settle(500);
                assertEqual(rangeName(), "Month", "the Month range");
                assert(facets().includes("Waiting For Me"), `the default filters: ${facets()}`);
                await until(() => rowNames().includes("Toff States"), `Toff States has a row: ${rowNames()}`);
                const titles = pillTitles("Toff States");
                assert(titles.includes("1d"), `the waiting one-day request reads 1d: ${titles}`);
                assert(!titles.some((title) => ONE_DAY.test(title)), `no code with it: ${titles}`);
            },
        },
    ],
});

// What the tours of the report view and of the roles (`time_off_report_tours.js`) use of this file.
export {
    $,
    $$,
    assert,
    assertEqual,
    assertUncovered,
    breadcrumb,
    bringIntoView,
    cellOfDate,
    cellsOf,
    centre,
    clean,
    clickCardButton,
    closeDialog,
    colByDate,
    dataSettled,
    dateColumns,
    datesWithin,
    expectLabel,
    facets,
    foldedHeaders,
    gantt,
    gradientOf,
    isGrey,
    labelEl,
    labelOf,
    leaveReady,
    menuItem,
    noteMark,
    openCardOf,
    pager,
    pickRange,
    pillByTitle,
    pillsOf,
    pillTitles,
    pointerAway,
    popoverOfView,
    allPillTitles,
    pressKey,
    realClick,
    realHover,
    realTap,
    rangeName,
    rectOf,
    removeFacet,
    rowEl,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    sleep,
    snapshot,
    step,
    texts,
    until,
    writesSince,
};

