// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { rpcBus } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

/**
 * Tours of the `ui` scenarios of slice 002d2 in the attendance Gantt view of Attendances >
 * Management > Dashboard. The browser clock, the zone and the window are fixed by the test (see
 * `tests/test_hr_rows_tours.py`); the gestures send real pointer events through
 * `window.__tl_mouse` (see `test_web_gantt` `timeline_real_pointer`), and a request with a
 * `method` sends a DevTools command (a window resize without a reload).
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
    requests = Math.max(requests, Number(sessionStorage.getItem("hag_requests") || 0)) + 1;
    sessionStorage.setItem("hag_requests", String(requests));
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
async function realTap(el) {
    const { x, y } = centre(el);
    await send({
        touch: true,
        events: [
            { type: "touchStart", touchPoints: [{ x, y }] },
            { type: "touchEnd", touchPoints: [] },
        ],
    });
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
const barOf = (name) => $(".o_tl_progress:not(.o_hag_bar_space)", rowEl(name));
const fillOf = (name) => $(".o_tl_progress_fill", rowEl(name));
const isRed = (name) => $(".o_tl_row_label", rowEl(name)).classList.contains("text-danger");
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
    for (let index = 0; index < count; index++) {
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

/** The muted text colour of the theme, as the browser computes it. */
function mutedColour() {
    const probe = document.createElement("span");
    probe.className = "text-muted";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
}

/** The label of a row is in the muted colour: the success class, no warning or danger text. */
function assertMuted(name) {
    const label = labelEl(name);
    assert(label.classList.contains("o_hag_success"), `${name}'s label has the muted state class`);
    assert(
        !label.classList.contains("text-warning") && !label.classList.contains("text-danger"),
        `${name}'s label is neither warning nor danger`
    );
    assertEqual(getComputedStyle(label).color, mutedColour(), `${name}'s label colour is the muted one`);
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

function countDataCalls() {
    const counter = { count: 0 };
    rpcBus.addEventListener("RPC:REQUEST", (event) => {
        if (String(event.detail?.url || "").includes("get_gantt_data")) {
            counter.count++;
        }
    });
    return counter;
}

// geometry ---------------------------------------------------------------------------------------

const rectOf = (el) => el.getBoundingClientRect();

/** A pill's box: its body lies one pixel inside it (002a), and the package's values are the box. */
const PILL_INSET = 1;
const boxOf = (pill) => {
    const rect = pill.getBoundingClientRect();
    return {
        left: rect.left - PILL_INSET,
        right: rect.right + PILL_INSET,
        width: rect.width + 2 * PILL_INSET,
    };
};

/**
 * Where a pill lies in the grid, in columns: the pill's start and end read against the left edge
 * and the width of the column at `index` (a column of the scale).
 */
function span(pill, firstColumn) {
    const pillRect = rectOf(pill);
    const column = rectOf(firstColumn);
    return {
        left: pillRect.left,
        width: pillRect.width,
        offset: (pillRect.left - column.left) / column.width,
        size: pillRect.width / column.width,
    };
}

// the scenarios ------------------------------------------------------------------------------------

const GANTT_NAMES = [
    "Gantt Double",
    "Gantt Exact",
    "Gantt Flexible",
    "Gantt Free",
    "Gantt Hourly",
    "Gantt Lunch",
    "Gantt Open",
    "Gantt Over",
    "Gantt Quarter",
    "Gantt Tracked",
];

/** One step: waits for the view's rows, clears the remembered range, then runs `body`. */
const scenario = (name, body, { count } = {}) =>
    tours.add(name, {
        steps: () => [
            {
                trigger: ".o_tl_renderer .o_tl_row_header",
                timeout: 60000,
                async run() {
                    clearRemembered();
                    await ready(count);
                    await body();
                },
            },
        ],
    });

// A7: generated avatars
scenario("hag_a7_avatars", async () => {
    await searchFor("Gantt");
    assertEqual(rowNames(), GANTT_NAMES, "the rows of the search");
    const avatars = $$(".o_tl_row_header .o_hrg_avatar");
    assertEqual(avatars.length, 10, "an avatar per employee");
    const first = rectOf(avatars[0]);
    assertNear(first.width, 24, "the avatar's width");
    assertNear(first.height, 24, "the avatar's height");
    for (const avatar of avatars) {
        await until(() => avatar.complete && avatar.naturalWidth > 0, "the avatar image");
        const response = await fetch(avatar.src);
        const kind = response.headers.get("content-type") || "";
        assert(kind.includes("svg"), `the generated avatar is an SVG picture, got ${kind}`);
        const body = await response.text();
        assert(/>\s*G\s*</.test(body), "the generated avatar carries the letter G");
    }
});

// A8: avatars at every level
scenario("hag_a8_levels", async () => {
    await menuItem(".o_group_by_menu", "Department");
    await closeSearchMenu();
    await until(() => $$(".o_tl_group_row").length > 0, "the employee group rows");
    const groupRows = $$(".o_tl_group_row");
    // Audrey has no contract, and an attendance on the day so that she has a row: she is the
    // employee whose name would be red with the grouping by Employee alone
    assertEqual(
        groupRows.map(nameOf),
        ["HRA Abigail", "HRA Anita", "HRA Audrey", "HRA Jennie"],
        "R14 does not apply: only the employees with attendances in the period"
    );
    for (const group of groupRows) {
        assert($(".o_hrg_avatar", $(".o_tl_row_header", group)), `${nameOf(group)} has an avatar`);
        assert($(".o_tl_progress_label", group), `${nameOf(group)} has the label`);
    }
    // the department sub-rows, under each employee row
    for (const group of $$(".o_tl_group_row.o_tl_collapsed")) {
        await realClick($(".o_tl_row_header", group));
    }
    await until(() => $$(".o_tl_collapsed").length === 0, "the employee rows open");
    const outline = [];
    for (const row of rowEls()) {
        if (row.classList.contains("o_tl_group_row")) {
            outline.push([nameOf(row), []]);
        } else {
            outline.at(-1)[1].push(nameOf(row));
        }
    }
    assertEqual(
        outline,
        [
            ["HRA Abigail", ["HRA Sales"]],
            ["HRA Anita", ["HRA Sales"]],
            ["HRA Audrey", ["HRA Operations"]],
            ["HRA Jennie", ["HRA Operations"]],
        ],
        "the department sub-rows"
    );
    assert(!isRed("HRA Audrey"), "no name is red, not even Audrey's (no contract)");
    assertEqual($$(".o_tl_row_label.text-danger").length, 0, "no name is red");
});

// A9: rows of another field
scenario("hag_a9_department_rows", async () => {
    await removeFacet("Employee");
    await menuItem(".o_group_by_menu", "Department");
    await closeSearchMenu();
    await until(() => rowNames().includes("HRA Team"), "the department rows");
    assertEqual(facets(), ["Department"], "the facets hold only the Department grouping");
    assert($$(".o_hrg_avatar").length === 0, "no avatar");
    assert($$(".o_tl_progress_label").length === 0, "no label");
    assert($$(".o_tl_progress").length === 0, "no bar");
    assert($$(".o_tl_unavailable").length === 0, "no greyed cell");
});

// A10: the card
scenario("hag_a10_card", async () => {
    const avatar = () => $(".o_hrg_avatar", rowEl("HRA Anita"));
    await realClick(avatar());
    const card = await until(() => $(".o_avatar_card"), "the employee card");
    await settle();
    const text = clean(card.textContent);
    assert(text.includes("HRA Anita"), `her name in the card: ${text}`);
    assert(text.includes("Head of Gantt"), `her job title in the card: ${text}`);
    assert(text.includes("hra.anita@example.com"), `her email in the card: ${text}`);
    assert(text.includes("+32 2 123 45 67"), `her phone in the card: ${text}`);
    assert(text.includes("View Profile"), `the View Profile button in the card: ${text}`);
    assert($(".o_avatar_card img", card), "her photo");
    assert(rectOf(card).top >= rectOf(avatar()).bottom - 2, "the card opens under the avatar");
    // a second click on the avatar leaves it open
    await realClick(avatar());
    await settle();
    assert($(".o_avatar_card"), "a second click leaves the card open");
    // Escape closes it
    document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await until(() => !$(".o_avatar_card"), "Escape closes the card");
    // a click outside closes it
    await realClick(avatar());
    await until(() => $(".o_avatar_card"), "the card opens again");
    await settle();
    await realClick(null, { at: { x: 1000, y: 123 } });
    await until(() => !$(".o_avatar_card"), "a click outside closes the card");
});

// A11: the avatar's click stays in the avatar
scenario("hag_a11_scroll", async () => {
    await pickRange("quarter");
    const before = renderer().scrollLeft;
    assertNear(before, 1194, "the Quarter range opens scrolled to today", 2);
    const avatar = $(".o_hrg_avatar", rowEl("HRA Anita"));
    await realClick(avatar);
    await until(() => $(".o_avatar_card"), "the card");
    await settle();
    document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await until(() => !$(".o_avatar_card"), "Escape closes the card");
    await settle(1000);
    assertEqual(renderer().scrollLeft, before, "the avatar's click does not scroll the grid");
    // her name scrolls to her first pill
    await realClick($(".o_tl_row_label", rowEl("HRA Anita")));
    await until(() => renderer().scrollLeft !== before, "the grid scrolls to her first pill", 4000);
    // the scroll has come to rest (the same position over two polls) with her pill in view
    let last = null;
    const inView = () => {
        const position = renderer().scrollLeft;
        const rest = position === last;
        last = position;
        const pill = rectOf(pillsOf("HRA Anita")[0]);
        const view = rectOf(renderer());
        return rest && pill.left >= view.left && pill.right <= view.right + 1;
    };
    await until(inView, "her first pill in view once the scroll rests", 6000);
    const pill = rectOf(pillsOf("HRA Anita")[0]);
    const view = rectOf(renderer());
    assert(
        pill.left >= view.left && pill.right <= view.right + 1,
        `her first pill is in view: ${pill.left}-${pill.right} in ${view.left}-${view.right}`
    );
});

// A12: the card and the window's width
scenario("hag_a12_width", async () => {
    await resizeTo(768, false);
    await realClick($(".o_hrg_avatar", rowEl("HRA Anita")));
    await until(() => $(".o_avatar_card"), "at 768 px the card opens");
    document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await until(() => !$(".o_avatar_card"), "Escape closes the card");
    await resizeTo(767, true);
    const before = renderer().scrollLeft;
    await realClick($(".o_hrg_avatar", rowEl("HRA Anita")));
    // nothing opens: wait for the click to have been handled (the pointer's own events), then read
    await settle(1200);
    assert(!$(".o_avatar_card"), "at 767 px a click on an avatar opens no card");
    assert(!$(".o_popover"), "at 767 px nothing opens");
    assertEqual(renderer().scrollLeft, before, "at 767 px the grid does not scroll");
});

// A13: the phone's tap
scenario("hag_a13_tap", async () => {
    const before = renderer().scrollLeft;
    const names = rowNames();
    await realTap($(".o_hrg_avatar", rowEl("HRA Anita")));
    await settle(1200);
    assert(!$(".o_avatar_card"), "a tap opens no card");
    assert(!$(".o_popover"), "a tap opens no popover");
    assert(!$(".modal"), "a tap opens no dialog");
    assertEqual(renderer().scrollLeft, before, "a tap does not scroll the grid");
    assertEqual(rowNames(), names, "a tap changes no row");
    // the control: the same tap on the same place at desktop width opens the card (R25)
    await resizeTo(1024, false);
    await realTap($(".o_hrg_avatar", rowEl("HRA Anita")));
    await until(() => $(".o_avatar_card"), "a tap at desktop width opens the card");
});

// A14: the avatar's tooltip
scenario("hag_a14_tooltip", async () => {
    await realHover($(".o_hrg_avatar", rowEl("HRA Anita")));
    await until(() => $(".o-tooltip"), "the tooltip");
    await settle();
    assertEqual($$(".o-tooltip").length, 1, "one tooltip");
    assert(clean($(".o-tooltip").textContent).includes("HRA Anita"), "her name in the tooltip");
});

// A15: the range around today
scenario("hag_a15_around_today", async () => {
    await pickRange("month");
    const dates = dateColumns().map((el) => el.dataset.date);
    assert(dates.includes("2026-11-02") && dates.includes("2026-11-30"), `November: ${dates}`);
    assert(!dates.includes("2026-12-01"), "the Month range holds no December day");
    assertEqual(foldedHeaders().length, 4, "the four weekend pairs are folded");
    assertEqual(renderer().scrollLeft, 0, "the grid is not scrolled");
    // M59: the middle of the visible part of the grid lies on 16 November
    const view = rectOf(renderer());
    // the visible part of the grid: right of the row header column
    const middle = (rectOf($(".o_tl_title_cell")).right + view.right) / 2;
    const under = dateColumns().find((col) => {
        const rect = rectOf(col);
        return rect.left <= middle && middle < rect.right;
    });
    assertEqual(under?.dataset.date, "2026-11-16", `the middle of the visible part (x ${middle})`);
    await pickRange("week");
    const week = dateColumns().map((el) => el.dataset.date);
    assert(week.includes("2026-11-09") && week.includes("2026-11-13"), `8 to 14 November: ${week}`);
    assert(!week.includes("2026-11-16"), "not 15 to 21 November");
    assert(pillTitles("HRA Abigail").some((title) => title.startsWith("A")), "her pill is in the week");
});

// A16 and A54: the range when today is not shown
const farWeek = (rows) => async () => {
    await pickRange("month");
    await step(1);
    await pickRange("week");
    // wait for what the week of 13 to 19 December must show before reading the absences
    await until(
        () => dateColumns()[0]?.dataset.date === "2026-12-14" && dateColumns().length === 5,
        "the header of 13 to 19 December"
    );
    await until(() => rowNames().length === rows, `${rows} rows`);
    await until(() => labelOf("HRA Abigail") === "0h / 40h", "the hours of the week (0h / 40h)");
    const week = dateColumns().map((el) => el.dataset.date);
    assertEqual(
        [week[0], week.at(-1), week.length, foldedHeaders().length],
        ["2026-12-14", "2026-12-18", 5, 2],
        `13 to 19 December (Sunday and Saturday folded): ${week}`
    );
    assertEqual(allPillTitles(), [], "no pill");
    assert(!$(".o_hag_helper"), "no empty-view helper");
};
scenario("hag_a16_far_week", farWeek(7));
scenario("hag_a54_far_week_rows", farWeek(20));

// A17: today in the period but not in view
scenario("hag_a17_quarter_end", async () => {
    await pickRange("quarter");
    renderer().scrollLeft = renderer().scrollWidth;
    await until(
        () => renderer().scrollLeft + renderer().clientWidth >= renderer().scrollWidth - 2,
        "the grid scrolled to its end"
    );
    await pickRange("week");
    const week = dateColumns().map((el) => el.dataset.date);
    assert(week.includes("2026-11-08") || week.includes("2026-11-09"), `the week of 8 to 14 November: ${week}`);
    assert(week.includes("2026-11-14") || week.includes("2026-11-13"), `to the 14th: ${week}`);
    assert(!week.includes("2026-11-16"), "not the 15th to 21st");
    assert(pillTitles("HRA Abigail").length === 1, "her pill shows");
});

// A18: ranges that keep 002a's behaviour
scenario("hag_a18_day_and_custom", async () => {
    const first = dayLabel();
    await step(-1, 2);
    assertEqual(first, ["Wednesday, November 11, 2026"], "the first header");
    assertEqual(dayLabel(), ["Monday, November 9, 2026"], "two steps back: the header of Monday 9");
    await today();
    assertEqual(dayLabel(), first, "Today shows Wednesday 11 November again");
    // a custom range of 2 to 20 November
    $(".o_tl_range_button").click();
    await until(() => $(".o_tl_custom_start input"), "the custom range inputs");
    const set = async (selector, value) => {
        const input = $(selector);
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await settle(300);
    };
    await set(".o_tl_custom_start input", "11/02/2026");
    await set(".o_tl_custom_stop input", "11/20/2026");
    $(".o_tl_apply").click();
    await until(() => $(".o_tl_range_button .o_tl_range_start"), "the custom range applied");
    await until(() => dateColumns().some((col) => col.dataset.date === "2026-11-20"), "the custom days");
    const dates = dateColumns().map((el) => el.dataset.date);
    assert(dates.includes("2026-11-02") && dates.includes("2026-11-20"), `2 to 20 November: ${dates}`);
    assert(!dates.includes("2026-11-01") && !dates.includes("2026-11-21"), "no other day");
    assert($(".o_tl_range_button .o_tl_range_start"), "the range button shows the custom dates");
});

// A19: half-day shading
scenario("hag_a19_diagonals", async () => {
    await searchFor("Gantt");
    await pickRange("month");
    const cells = cellsOf("Gantt Hourly");
    const diagonal = cells.filter((cell) => gradientOf(cell).includes("325deg"));
    assertEqual(diagonal.length, 4, "four diagonal cells");
    const dates = diagonal.map((cell) => {
        const index = cells.indexOf(cell);
        return dateColumns().find((col) => Number(col.dataset.index) === Number(cell.dataset.column))
            ?.dataset.date || `cell ${index}`;
    });
    assertEqual(dates, ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"], "the Fridays");
    for (const cell of diagonal) {
        const background = gradientOf(cell);
        const grey = background.indexOf("var(--o-tl-unavailable-bg)");
        const clear = background.indexOf("transparent");
        assert(clear >= 0 && grey > clear, `the morning clear, the afternoon grey: ${background}`);
    }
    for (const cell of cells.filter((cell) => !diagonal.includes(cell))) {
        assert(!gradientOf(cell).includes("325deg"), "no other diagonal");
        assert(
            isGrey(cell) || cell.classList.contains("o_tl_folded_cell") || !gradientOf(cell).includes("gradient"),
            `a cell is wholly available or wholly grey: ${gradientOf(cell)}`
        );
    }
    assertNear(rectOf(diagonal[0]).left, 527, "Friday 6's cell starts at x 527", 2);
    assertNear(rectOf(diagonal[0]).width, 52, "its width", 1);
});

// A20: quarters keep 002a's shading
scenario("hag_a20_quarters", async () => {
    await searchFor("Gantt");
    await pickRange("week");
    await step(-1);
    const monday = colByDate("2026-11-02");
    assert(monday, "Monday 2 November is shown");
    const cell = cellsOf("Gantt Hourly").find(
        (candidate) => Number(candidate.dataset.column) === Number(monday.dataset.index)
    );
    const background = gradientOf(cell);
    assert(!background.includes("325deg"), `no diagonal: ${background}`);
    const grey = "var(--o-tl-unavailable-bg)";
    const parts = background.match(/(var\(--o-tl-unavailable-bg\)|transparent) [\d.]+% [\d.]+%/g) || [];
    assertEqual(
        parts.map((part) => part.split(" ")[0]),
        [grey, "transparent", "transparent", grey],
        `the four quarters: ${background}`
    );
});

// A21: lunch rounding by half days
scenario("hag_a21_lunch_month", async () => {
    await searchFor("Gantt");
    await pickRange("month");
    const day = (date) => colByDate(date);
    const pills = pillsOf("Gantt Lunch");
    assertEqual(pills.length, 5, "five pills");
    const at = (date) => {
        const column = rectOf(day(date));
        return pills.find((pill) => {
            const rect = boxOf(pill);
            return rect.left >= column.left - 1 && rect.left < column.right - 1;
        });
    };
    const half = (date) => rectOf(day(date)).width / 2;
    const expectations = [
        ["2026-11-02", 0, 1, 319, 26],
        ["2026-11-03", 1, 1, null, null],
        ["2026-11-04", 1, 1, 449, 26],
        ["2026-11-05", 0, 2, 475, 52],
        ["2026-11-06", 0, 1, 527, 26],
    ];
    for (const [date, from, size, x, width] of expectations) {
        const pill = at(date);
        assert(pill, `a pill on ${date}`);
        const column = rectOf(day(date));
        const rect = boxOf(pill);
        assertNear(rect.left, column.left + from * half(date), `${date}: left`);
        assertNear(rect.width, size * half(date), `${date}: width`);
        if (x !== null) {
            assertNear(rect.left, x, `${date}: x of the package`, 2);
            assertNear(rect.width, width, `${date}: width of the package`, 2);
        }
    }
});

// A22: no lunch rounding at quarter-day precision
scenario("hag_a22_lunch_week", async () => {
    await searchFor("Gantt");
    await pickRange("week");
    await step(-1);
    const column = (date) => rectOf(colByDate(date));
    const quarter = (date) => column(date).width / 4;
    const check = (name, date, from, parts, x) => {
        const row = pillsOf(name);
        const left = column(date).left;
        const pill = row.find((candidate) => {
            const rect = boxOf(candidate);
            return rect.left >= left - 1 && rect.left < left + column(date).width - 1;
        });
        assert(pill, `${name}: a pill on ${date}`);
        const rect = boxOf(pill);
        assertNear(rect.left, left + from * quarter(date), `${name} ${date}: left`);
        assertNear(rect.width, parts * quarter(date), `${name} ${date}: width`);
        assertNear(rect.width, 96, `${name} ${date}: 96 px`, 2);
        if (x) {
            assertNear(rect.left, x, `${name} ${date}: x of the package`, 2);
        }
    };
    check("Gantt Quarter", "2026-11-02", 0, 2, 459);
    check("Gantt Quarter", "2026-11-03", 2, 2, 747);
    check("Gantt Quarter", "2026-11-04", 1, 2, 891);
    check("Gantt Lunch", "2026-11-02", 1, 2, 507);
    check("Gantt Lunch", "2026-11-04", 1, 2, 891);
    check("Gantt Lunch", "2026-11-06", 1, 2, 1275);
    check("Gantt Lunch", "2026-11-05", 1, 2, 1083);
});

// A23: where lunch rounding does not act
scenario("hag_a23_no_rounding", async () => {
    await searchFor("Gantt");
    await step(-1, 9);
    const pill = pillsOf("Gantt Lunch")[0];
    assert(pill, "the pill of Monday 2 November");
    const nine = rectOf(colEl(9));
    const one = rectOf(colEl(13));
    const rect = boxOf(pill);
    assertNear(rect.left, nine.left, "the pill starts at 9:00");
    assertNear(rect.right, one.left, "the pill ends at 13:00");
});

scenario("hag_a23_jennie_two_days", async () => {
    await pickRange("month");
    const pill = pillsOf("HRA Jennie")[0];
    assert(pill, "Jennie's pill");
    assertEqual(clean($(".o_tl_pill_title", pill).textContent).startsWith("A"), true, "its title");
    const tenth = rectOf(colByDate("2026-11-10"));
    const eleventh = rectOf(colByDate("2026-11-11"));
    const rect = boxOf(pill);
    assertNear(rect.left, tenth.left + tenth.width / 2, "starts in the afternoon of the 10th");
    assertNear(rect.right, eleventh.left + eleventh.width / 2, "ends in the morning of the 11th");
});

// A26: paging over employees
scenario("hag_a26_pager", async () => {
    assertEqual(pager(), "1-20 / 22", "the first page");
    assertEqual(rowNames().length, 20, "twenty rows");
    $(".o_pager_next").click();
    await until(() => pager() === "21-22 / 22", "the second page");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["HRA Keith", "HRA Marc"]),
        `the last two rows (now ${JSON.stringify(rowNames())})`
    );
    await until(
        () => rowNames().every((name) => labelOf(name) && barOf(name)),
        "their labels and bars"
    );
});

// A27: searches that keep the empty rows
scenario("hag_a27_empty_rows", async () => {
    await searchFor("HRA Marc");
    assertEqual(rowNames(), ["HRA Marc"], "one row");
    assertEqual(pillsOf("HRA Marc").length, 0, "no attendance");
    assert(labelOf("HRA Marc"), "a label");
    assert(barOf("HRA Marc"), "a bar");
    await removeFacet("HRA Marc");
    await searchFor("HRA Team", "Department");
    assertEqual(rowNames(), ["HRA Abigail", "HRA Beth", "HRA Marc"], "the employees of the department");
    assertEqual(pillsOf("HRA Marc").length, 0, "Marc has no attendance");
    assertEqual(pillsOf("HRA Beth").length, 0, "Beth has no attendance");
    assert(labelOf("HRA Beth"), "Beth has a label");
});

// A28: searches that drop the empty rows
scenario("hag_a28_drop_rows", async () => {
    await menuItem(".o_filter_menu", "At Work");
    await closeSearchMenu();
    await until(() => rowNames().length === 1, "one row");
    assertEqual(rowNames(), ["Gantt Open"], "the open attendance's row");
    assertEqual(pager(), "1-1 / 1", "the pager counts those rows");
    await removeFacet("At Work");
    await until(() => rowNames().length > 1, "the rows again");
    await openSearchMenu();
    const date = await until(
        () => $$(".o_filter_menu .o_accordion_toggle").find((el) => clean(el.textContent) === "Date"),
        "the Date filter"
    );
    date.click();
    const option = await until(
        () => $$(".o_filter_menu .o_item_option").find((el) => clean(el.textContent) === "November"),
        "the option November"
    );
    const requested = gantt.requests;
    option.click();
    await until(() => gantt.requests > requested, "the data of the Date filter");
    await dataSettled();
    await closeSearchMenu();
    await until(() => facets().some((facet) => facet.includes("Date")), "the Date facet");
    await until(() => rowNames().length === 1, "one row with the Date filter");
    assertEqual(rowNames(), ["Gantt Open"], "the employee with an attendance on the day");
});

// A29: archived employees
scenario("hag_a29_archived", async () => {
    await menuItem(".o_filter_menu", "Archived Employees");
    await closeSearchMenu();
    await until(() => $(".o_hag_helper"), "the helper");
    await until(
        () => rowEls().length > 0 && rowNames().every((name) => name === ""),
        `the unnamed placeholder row (now ${JSON.stringify(rowNames())})`
    );
    const names = rowNames();
    assert(names.every((name) => name === ""), `no employee row: ${names}`);
    assert($$(".o_hrg_avatar").length === 0, "no avatar");
    assert($$(".o_tl_progress_label").length === 0, "no label");
    assert($$(".o_tl_unavailable").length === 0, "no grey cell");
});

// A30: one period per range
scenario("hag_a30_periods", async () => {
    assertEqual($$(".o_tl_col").length, 24, "Day: 24 columns");
    const label = () => dayLabel().join(" | ");
    const first = label();
    await step(1);
    assert(label() !== first, "Next shows the following day");
    await step(-1);
    assertEqual(label(), first, "Previous goes back");
    await pickRange("week");
    let dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1), dates.length], ["2026-11-09", "2026-11-13", 5], "Week (Sunday and Saturday folded)");
    await step(1);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1), dates.length], ["2026-11-16", "2026-11-20", 5], "next Week");
    await step(-2);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1), dates.length], ["2026-11-02", "2026-11-06", 5], "previous Week");
    await pickRange("month");
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-11-01", "2026-11-30"], "Month");
    await step(1);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-12-01", "2026-12-31"], "next Month");
    await step(-2);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-10-01", "2026-10-31"], "previous Month");
    await today();
    await pickRange("quarter");
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-10-01", "2026-12-31"], "Quarter (days, the month scale)");
    await step(1);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2027-01-01", "2027-03-31"], "next Quarter");
    await step(-2);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-07-01", "2026-09-30"], "previous Quarter");
    await today();
    await pickRange("year");
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1), dates.length], ["2026-01-01", "2026-12-01", 12], "Year");
    await step(1);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2027-01-01", "2027-12-01"], "next Year");
    await step(-2);
    dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2025-01-01", "2025-12-01"], "previous Year");
});

// A31: an open attendance drawn up to now (the test sets the clock; `now` is the Brussels hour)
const openPill = (endHour) => async () => {
    await searchFor("Gantt Open");
    const pill = pillsOf("Gantt Open")[0];
    assert(pill, "the open attendance's pill");
    assertEqual(clean($(".o_tl_pill_title", pill).textContent).startsWith("A"), true, "its title");
    const rect = boxOf(pill);
    const start = rectOf(colEl(8));
    assertNear(rect.left, start.left, "from 8:00");
    const end = rectOf(colEl(endHour));
    assertNear(
        rect.right,
        end.left + end.width / 4,
        `to ${endHour}:15 (the browser's now is ${new Date().toISOString()}, the column of ${endHour}h is ${end.left}-${end.right}, the pill is ${pill.getAttribute("style")} ${pill.textContent}, the columns ${$$(".o_tl_col").length})`
    );
};
scenario("hag_a31_open_at_eleven", openPill(11));
scenario("hag_a31_open_at_thirteen", openPill(13));

// A32: an open attendance and the future
scenario("hag_a32_open_future", async () => {
    await searchFor("Gantt Open");
    assertEqual(pillsOf("Gantt Open").length, 1, "today's pill");
    await step(1);
    assertEqual(rowNames(), ["Gantt Open"], "the row stays");
    assertEqual(pillsOf("Gantt Open").length, 0, "no pill on Thursday 12");
    await step(-1);
    await pickRange("week");
    const pill = pillsOf("Gantt Open")[0];
    assert(pill, "the pill in the week");
    const wednesday = rectOf(colByDate("2026-11-11"));
    const rect = boxOf(pill);
    assertNear(rect.left, wednesday.left + wednesday.width / 4, "from the quarter of 6:00 to 12:00", 2);
    assertNear(rect.width, wednesday.width / 4, "one quarter", 2);
});

// A37: the browser's time zone draws the grey (New York, 05:00 there)
scenario("hag_a37_browser_zone", async () => {
    const cells = cellsOf("Gantt Hourly");
    assertEqual(cells.length, 24, "24 hour cells");
    const grey = cells.map((cell, index) => (isGrey(cell) ? index : null)).filter((i) => i !== null);
    const expected = [0, 1, 6, ...Array.from({ length: 13 }, (_, index) => 11 + index)];
    assertEqual(grey, expected, "grey from 0 to 2, from 6 to 7 and from 11 to 24");
});

// A39 and A41: folds
const week8 = async () => {
    await pickRange("week");
    await until(() => foldedHeaders().length === 2, "two folded headers");
};

async function reFold() {
    await step(1);
    await step(-1);
    await until(() => foldedHeaders().length === 2, "the weekend folded again");
}

scenario("hag_a39_unfold", async () => {
    await week8();
    const sunday = foldedHeaders()[0];
    assertEqual(Number(sunday.dataset.index), 0, "Sunday 8 is the first column");
    assertNear(rectOf(sunday).left, 267, "the folded header's x", 2);
    assertNear(rectOf(sunday).width, 36, "its width", 1);
    assertNear(rectOf(colByDate("2026-11-09") || sunday).left, 303, "Monday 9 at x 303", 2);
    const check = async (what) => {
        await until(() => foldedHeaders().length === 1, `${what}: one folded header`);
        await until(() => {
            const shown = colByDate("2026-11-08");
            return shown && Math.abs(rectOf(shown).width - 216.2) <= 1.5;
        }, `${what}: Sunday 8 is 216.2 px wide`);
        const column = colByDate("2026-11-08");
        assertNear(rectOf(column).width, 216.2, `${what}: Sunday 8's width`, 1.5);
        assertNear(rectOf(column).left, 267, `${what}: Sunday 8's x`, 2);
        for (const name of rowNames()) {
            const cell = cellsOf(name).find(
                (candidate) => Number(candidate.dataset.column) === Number(column.dataset.index)
            );
            assert(cell && isGrey(cell), `${what}: ${name}'s Sunday cell is grey`);
        }
        assertEqual($$(".o_tl_cell_picked").length, 0, `${what}: nothing is selected`);
    };
    await realClick(foldedHeaders()[0]);
    await check("the folded header");
    await reFold();
    const foldedCell = $$(".o_tl_cell.o_tl_folded_cell", rowEl("HRA Anita"))[0];
    await realClick(foldedCell);
    await check("the folded cell");
    await reFold();
    await realClick(foldedHeaders()[0], { keys: ["ctrl"] });
    await check("the folded header with Ctrl");
});

scenario("hag_a41_shift", async () => {
    await week8();
    await realClick(foldedHeaders()[0], { keys: ["shift"] });
    await settle(1200);
    assertEqual(foldedHeaders().length, 2, "two folded headers");
    assertEqual($$(".o_tl_cell_picked").length, 0, "no selection");
    // the same place acts without Shift
    await realClick(foldedHeaders()[0]);
    await until(() => foldedHeaders().length === 1, "a plain click unfolds the day");
});

// A40: the tooltip of the bar and the label
scenario("hag_a40_progress_tooltip", async () => {
    await pickRange("week");
    const bar = barOf("HRA Anita");
    await realHover(bar);
    const tip = await until(() => $(".o-tooltip"), "the tooltip of the bar");
    await settle();
    assertEqual(clean(tip.textContent), "29h/40h (72%)", "the bar's tooltip");
    assert(rectOf(tip).top >= rectOf(bar).bottom - 2, "under the bar");
    await realMove(1000, 123);
    await until(() => !$(".o-tooltip"), "the tooltip goes away");
    await realHover(labelEl("HRA Anita"));
    const second = await until(() => $(".o-tooltip"), "the tooltip of the label");
    await settle();
    assertEqual(clean(second.textContent), "29h/40h (72%)", "the label's tooltip");
});

// A42: folds
scenario("hag_a42_folds_day", async () => {
    assertEqual(foldedHeaders().length, 0, "the Day range folds no column");
    await pickRange("month");
    const folded = foldedHeaders();
    assertEqual(folded.length, 4, "the Month range folds each weekend pair of November");
    for (const header of folded) {
        assertNear(rectOf(header).width, 36, "a folded column is 36 px wide", 1);
    }
});
scenario("hag_a42_folds_prepared", async () => {
    await searchFor("Gantt");
    await pickRange("week");
    await step(-1);
    assertEqual(foldedHeaders().length, 0, "the week of 1 to 7 November folds nothing");
});

// A48: the short labels on the phone
/** On the phone the search bar is opened by its search button in the control panel. */
async function openPhoneSearch() {
    if (!$(".o_searchview_input")) {
        const button = await until(
            () => $$(".o_control_panel button").find((el) => $("i[data-icon='search']", el)),
            "the search button"
        );
        button.click();
        await until(() => $(".o_searchview_input"), "the search bar");
    }
}

scenario("hag_a48_phone_labels", async () => {
    await openPhoneSearch();
    await searchFor("Gantt");
    await step(-1, 2);
    const expected = {
        "Gantt Double": ["+10h", "text-danger"],
        "Gantt Exact": ["8h", null],
        "Gantt Over": ["+2h", "text-warning"],
        "Gantt Tracked": ["0h", "text-warning"],
        "Gantt Flexible": ["0h", null],
        "Gantt Hourly": ["0h", null],
        "Gantt Lunch": ["0h", null],
        "Gantt Open": ["0h", null],
        "Gantt Quarter": ["0h", null],
    };
    await until(() => labelOf("Gantt Double") === "+10h", "the labels of Monday 9");
    for (const [name, [label, colour]] of Object.entries(expected)) {
        assertEqual(labelOf(name), label, `${name}'s label`);
        const classes = labelEl(name).classList;
        for (const candidate of ["text-danger", "text-warning"]) {
            assertEqual(classes.contains(candidate), candidate === colour, `${name}: ${candidate}`);
        }
        if (colour === null) {
            assertMuted(name);
        }
    }
});
scenario("hag_a48_phone_demo", async () => {
    assertEqual(labelOf("HRA Anita"), "+1h", "Anita's label");
    assert(labelEl("HRA Anita").classList.contains("text-warning"), "in the warning colour");
    assertNear(rectOf(fillOf("HRA Anita")).width, rectOf(barOf("HRA Anita")).width, "a full fill", 1);
});

// A49: the label follows the window's width
scenario("hag_a49_resize", async () => {
    const counter = countDataCalls();
    await resizeWindow(1400);
    await until(() => labelOf("HRA Abigail") === "3h 30m / 8h (4h 30m left)", "the long form at 1400", 1500);
    const heights = rowEls().map((el) => rectOf(el).height);
    const bar = rectOf(barOf("HRA Abigail")).width;
    const fill = fillOf("HRA Abigail").style.width;
    const calls = counter.count;
    await resizeWindow(1399);
    await until(() => labelOf("HRA Abigail") === "4h 30m left", "the short form at 1399 within 1 s", 1000);
    assertEqual(rowEls().map((el) => rectOf(el).height), heights, "the row heights");
    assertEqual(rectOf(barOf("HRA Abigail")).width, bar, "the bar");
    assertEqual(fillOf("HRA Abigail").style.width, fill, "the fill");
    await resizeWindow(1400);
    await until(
        () => labelOf("HRA Abigail") === "3h 30m / 8h (4h 30m left)",
        "the long form at 1400 again within 1 s",
        1000
    );
    assertEqual(counter.count, calls, "no data is loaded again");
});

// A50: fully flexible rows
scenario("hag_a50_flexible", async () => {
    await searchFor("Gantt");
    await step(-1, 2);
    assertEqual(labelOf("Gantt Free"), "0h", "the label alone");
    assertMuted("Gantt Free");
    assert(!fillOf("Gantt Free"), "no fill");
    assert(!barOf("Gantt Free"), "no bar");
    assertEqual($$(".o_tl_progress:not(.o_hag_bar_space)").length, 9, "nine bars for ten rows");
    assertEqual(
        $$(".o_tl_progress_label").filter((el) => el.dataset.tooltip).length,
        9,
        "nine labels with a tooltip"
    );
    assert(!labelEl("Gantt Free").dataset.tooltip, "no tooltip on its label");
    assertNear(rectOf($(".o_tl_row_header", rowEl("Gantt Free"))).height, 41, "its row header is 41 px", 1);
    for (const name of rowNames()) {
        assertNear(rectOf($(".o_tl_row_header", rowEl(name))).height, 41, `${name}'s header`, 1);
    }
});

// A51: names of employees without a contract
scenario("hag_a51_red_names", async () => {
    const red = rowNames().filter((name) => isRed(name));
    assertEqual(
        red,
        ["HRA Audrey", "HRA Beth", "HRA Doris", "HRA Eli", "HRA Ernest", "HRA Rachel", "HRA Tina"],
        "the red names"
    );
    assert(!isRed("HRA Keith"), "Keith's name is not red on the day");
    await pickRange("week");
    await step(1);
    assert(isRed("HRA Keith"), "Keith's name is red in the week of 15 to 21 November");
});

// A53: the empty-view helper
scenario("hag_a53_helper", async () => {
    await searchFor("HRA Beth");
    assertEqual(rowNames(), ["HRA Beth"], "one row");
    assertEqual(pillsOf("HRA Beth").length, 0, "no attendance");
    const helper = await until(() => $(".o_hag_helper"), "the helper");
    const text = clean(helper.textContent);
    assert(text.includes("Try the kiosk"), `the kiosk: ${text}`);
    assert($("img[src*='mock-tablet']", helper), "the kiosk picture");
    assert($("img[src*='attendance_dot']", helper), "the picture of the check-in button");
    assert(rectOf(rowEl("HRA Beth")).bottom <= rectOf(helper).top + 1, "the row stays above the helper");
    assert(rectOf(rowEl("HRA Beth")).height > 0, "the row is visible");
});

// A55: a team officer's rows
scenario("hag_a55_officer", async () => {
    assertEqual(pager(), "1-5 / 5", "five rows");
    assertEqual(
        rowNames(),
        ["HRA Abigail", "HRA Anita", "HRA Jennie", "HRA Keith", "HRA Marc"],
        "his team and himself"
    );
    for (const name of rowNames()) {
        assert(labelOf(name), `${name} has a label`);
        assert(barOf(name), `${name} has a bar`);
        assert(!isRed(name), `${name} has a contract`);
    }
    assertEqual(labelOf("HRA Abigail"), "3h 30m / 8h (4h 30m left)", "Abigail's hours");
    // the greyed cells are computed for them as for the administrator: Keith's contract ends
    // on Wednesday 11, so his Thursday 12 is grey in the week
    await pickRange("week");
    const column = colByDate("2026-11-12");
    const cell = cellsOf("HRA Keith").find(
        (candidate) => Number(candidate.dataset.column) === Number(column.dataset.index)
    );
    assert(cell && isGrey(cell), "Keith's Thursday 12 is grey");
});

// A56: a user with own attendances only
scenario("hag_a56_own_only", async () => {
    assertEqual(rowNames(), ["Gantt Exact"], "one row");
    assert(labelOf("Gantt Exact"), "a label");
    assert(barOf("Gantt Exact"), "a bar");
});

// A58: framework features off
scenario("hag_a58_features_off", async () => {
    await openSearchMenu();
    assert($(".o_filter_menu"), "Filters");
    assert($(".o_group_by_menu"), "Group By");
    assert($(".o_favorite_menu"), "Favorites");
    assert(!$(".o_comparison_menu"), "no comparison section");
    await closeSearchMenu();
    const first = $$(".o_tl_cell", rowEl("HRA Abigail")).at(18);
    const last = $$(".o_tl_cell", rowEl("HRA Jennie")).at(20);
    const from = centre(first);
    const to = centre(last);
    await realDrag(from, [
        { x: from.x + 10, y: from.y + 5 },
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        to,
    ]);
    await settle(1000);
    assertEqual($$(".o_tl_cell_picked").length, 0, "no cell is selected");
    assert(!$(".o_tl_multi_plan") && !$(".o_multi_selection_buttons"), "no multi-selection buttons");
    assert(!$(".o_tl_panel_frame") && !$(".o_tl_panel"), "no side panel");
    assert(!$(".o_tl_connect_handle") && !$(".o_tl_arrow"), "no connector and no arrow");
    assert(!$(".o_popover"), "no popover opens");
    // what a press and drag across cells does here is 002b's (the create dialog): close it
    if ($(".modal")) {
        await closeDialog();
    }
});

// A59: the inputs left to 002d3
/** A real click that is repeated until `condition` holds (a click lock may swallow the first). */
async function clickUntil(target, condition, what, options = {}) {
    const limit = Date.now() + 12000;
    for (;;) {
        await realClick(target(), options);
        try {
            return await until(condition, what, 1500);
        } catch (error) {
            if (Date.now() > limit) {
                throw error;
            }
        }
    }
}

const pressEscape = () =>
    document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

scenario("hag_a59_framework_inputs", async () => {
    // a click on a pill: 002a's popover
    await clickUntil(() => pillsOf("HRA Abigail")[0], () => $(".o_tl_popover_button"), "002a's popover");
    pressEscape();
    await until(() => !$(".o_tl_popover_button"), "Escape closes the popover");
    // a double click: 002b's record dialog
    const dialog = await clickUntil(
        () => pillsOf("HRA Abigail")[0],
        () => $(".modal .o_form_view"),
        "002b's record dialog",
        { count: 2 }
    );
    const shown = $$("input", dialog).map((el) => el.value).join("|") + clean(dialog.textContent);
    assert(shown.includes("HRA Abigail"), `the dialog shows her attendance: ${shown}`);
    await closeDialog();
    // a click on an empty cell: the framework's plan dialog, then its Create New with the
    // attendance form
    const cell = () => $$(".o_tl_cell", rowEl("HRA Jennie")).at(14);
    await clickUntil(cell, () => $(".modal"), "the dialog of an empty cell");
    const create = await until(
        () => $$(".modal .btn").find((el) => clean(el.textContent) === "Create New"),
        `the plan dialog offers Create New: ${texts(".modal .btn")}`
    );
    create.click();
    await until(() => $(".modal .o_form_view [name='check_in']"), "the create dialog");
    const names = $$(".modal .o_form_view [name]").map((el) => el.getAttribute("name"));
    assert(names.includes("employee_id") && names.includes("check_in"), `the attendance form: ${names}`);
    await closeDialog();
    // a press and drag across empty cells of a row: 002b's create dialog (R25)
    const dragFrom = centre($$(".o_tl_cell", rowEl("HRA Jennie")).at(16));
    const dragTo = centre($$(".o_tl_cell", rowEl("HRA Jennie")).at(19));
    const dragged = async () => {
        await realDrag(dragFrom, [
            { x: dragFrom.x + 15, y: dragFrom.y },
            { x: (dragFrom.x + dragTo.x) / 2, y: dragTo.y },
            dragTo,
        ]);
        return until(() => $(".modal .o_form_view [name='check_in']"), "the drag opens the create dialog", 4000);
    };
    for (let attempt = 0; ; attempt++) {
        try {
            await dragged();
            break;
        } catch (error) {
            if (attempt >= 3) {
                throw error;
            }
        }
    }
    const dragNames = $$(".modal .o_form_view [name]").map((el) => el.getAttribute("name"));
    assert(dragNames.includes("employee_id"), `the attendance form of the drag: ${dragNames}`);
    await closeDialog();
    // New: the create dialog
    await until(() => $(".o_tl_button_add"), "the New button");
    $(".o_tl_button_add").click();
    await until(() => $(".modal .o_form_view"), "New opens the create dialog");
    await closeDialog();
    // the pointer over an empty cell shows no button and no fill (002b R8)
    const empty = $$(".o_tl_cell", rowEl("HRA Beth")).at(10);
    const look = () => ({
        background: getComputedStyle(empty).backgroundColor + getComputedStyle(empty).backgroundImage,
        buttons: $$(".o_tl_grid button").length,
        inside: empty.children.length,
        frames: $$(".o_tl_selection, .o_tl_cell_picked").length,
    });
    const resting = look();
    await realHover(empty);
    await settle(800);
    assertEqual(look(), resting, "the pointer over an empty cell adds no button and no fill");
    // dragging a pill moves it
    const drag = pillsOf("HRA Abigail")[0];
    const column = rectOf(colEl(1)).width;
    const start = centre(drag);
    const before = rectOf(drag).left;
    await realDrag(start, [
        { x: start.x + 20, y: start.y },
        { x: start.x + column, y: start.y },
        { x: start.x + 2 * column, y: start.y },
    ]);
    await until(() => Math.abs(rectOf(pillsOf("HRA Abigail")[0]).left - before) > column, "the pill moves", 6000);
    // the move snaps to a quarter of an hour (a quarter of a column)
    assertNear(rectOf(pillsOf("HRA Abigail")[0]).left - before, 2 * column, "moved by two hours", column / 3);
});

// A61: the phone's controls
scenario("hag_a61_phone", async () => {
    assert($(".o_control_panel .o_pager"), "the pager is in the control panel");
    assert($(".o_pager_next"), "its buttons");
    assert(!$(".o_searchview_input"), "the search bar is closed at first");
    await openPhoneSearch();
    assert($(".o_searchview_facet"), "the facets show once the search bar is opened");
    const header = $(".o_tl_row_header");
    assertNear(rectOf(header).width, 130, "the row header column is 130 px wide", 1);
    assert($$(".o_tl_progress:not(.o_hag_bar_space)").length > 0, "the bars show");
    assert($$(".o_tl_progress_label").every((el) => !clean(el.textContent).includes("/")), "short labels");
    await realTap($(".o_hrg_avatar", rowEl("HRA Anita")));
    await settle(1000);
    assert(!$(".o_avatar_card") && !$(".o_popover"), "a tap on an avatar opens nothing");
    // the control: the same tap at desktop width opens the card
    await resizeTo(1024, false);
    await realTap($(".o_hrg_avatar", rowEl("HRA Anita")));
    await until(() => $(".o_avatar_card"), "a tap at desktop width opens the card");
});

// A62: the view part, Thursday 12 grey
scenario("hag_a62_holiday", async () => {
    await pickRange("week");
    const cells = cellsOf("HRA Abigail");
    const grey = (date) => {
        const column = colByDate(date);
        const cell = cells.find((candidate) => Number(candidate.dataset.column) === Number(column.dataset.index));
        return cell && isGrey(cell);
    };
    assert(grey("2026-11-12"), "Thursday 12 is grey");
    assert(!grey("2026-11-11"), "Wednesday 11 is not grey");
    assert(!grey("2026-11-13"), "Friday 13 is not grey");
});

// A64: an attendance across a month's end
scenario("hag_a64_night", async () => {
    await searchFor("Gantt Night");
    await pickRange("month");
    await expectLabel("Gantt Night", "4h / 168h (164h left)", "November");
    const track = rectOf(barOf("Gantt Night")).width;
    const fill = fillOf("Gantt Night");
    assertNear(parseFloat(fill.style.width), 2.4, "the fill in percent", 0.06);
    assertNear(rectOf(fill).width, 6, "6 px", 1);
    assertNear(track, 250, "a 250 px track", 3);
    await step(1);
    await expectLabel("Gantt Night", "4h / 184h (180h left)", "December");
    assertNear(parseFloat(fillOf("Gantt Night").style.width), 2.2, "the fill in percent", 0.06);
    assertNear(rectOf(fillOf("Gantt Night")).width, 5.4, "5.4 px", 1);
    await step(-1);
    await pickRange("week");
    await step(1, 3);
    const dates = dateColumns().map((el) => el.dataset.date);
    assertEqual([dates[0], dates.at(-1)], ["2026-11-30", "2026-12-04"], "the week of 29 November");
    await expectLabel("Gantt Night", "8h / 40h (32h left)", "the week");
});
