// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of slice 002b3 (multi-selection, multi-creation and the side panel) in a real browser.
 *
 * A gesture that has to be a real one (real pointer events, so the browser's own text selection
 * and text drag take part) is not dispatched from here: the tour asks the Python test through
 * `realMouse`, which publishes the list of mouse events on the window; the test sends them with
 * the Chrome DevTools protocol (`Input.dispatchMouseEvent`) and marks the request as done.
 */

const tours = registry.category("web_tour.tours");

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

/** Poll until `condition` returns something truthy; fail with `message` after `timeout` ms. */
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

const renderer = () => $(".o_tl_renderer");

// Requests in flight, counted from the load of this file on.
let pending = 0;
{
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
        pending++;
        this.addEventListener("loadend", () => pending--, { once: true });
        return send.apply(this, args);
    };
}
const gridSignature = () =>
    [
        renderer()?.scrollLeft,
        renderer()?.scrollTop,
        $$(".o_tl_cell").length,
        $$(".o_tl_pill").length,
        $(".o_tl_col.o_tl_is_today")?.getBoundingClientRect().left,
    ].join("|");
/** Wait until no request is in flight and the grid (scroll, cells, pills) stayed put 10 frames. */
async function gridSettled() {
    let last = null;
    let still = 0;
    const limit = Date.now() + 10000;
    while (still < 10) {
        if (Date.now() > limit) {
            throw new Error(`the grid did not settle (pending ${pending}, ${gridSignature()})`);
        }
        await frame();
        const now = gridSignature();
        still = pending === 0 && now === last ? still + 1 : 0;
        last = now;
    }
}

const gridReady = {
    trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today",
    async run() {
        await gridSettled();
    },
};

// numbered from the time of the page, so that a tour that reloads the page never repeats a number
// the test already answered
let requests = Math.floor(Date.now() / 1000) * 1000;
/** Ask the test to send these mouse events for real, and wait until it did. */
async function realMouse(events) {
    const id = ++requests;
    window.__tl_mouse = { id, events };
    await until(() => window.__tl_mouse_done === id, "the real mouse events", 20000);
    await gridSettled();
}

const mouse = (type, x, y, extra = {}) => ({ type, x, y, button: "left", ...extra });

/**
 * One gesture inside a header: press at `x0`, move to `x1` in eight steps on the same line,
 * release (R1).
 */
async function gesture(y, x0, x1) {
    const events = [mouse("mouseMoved", x0, y, { button: "none", buttons: 0 })];
    events.push(mouse("mousePressed", x0, y, { buttons: 1, clickCount: 1 }));
    for (let step = 1; step <= 8; step++) {
        events.push(mouse("mouseMoved", x0 + ((x1 - x0) * step) / 8, y, { buttons: 1 }));
    }
    events.push(mouse("mouseReleased", x1, y, { buttons: 0, clickCount: 1 }));
    await realMouse(events);
}

const selectedText = () => window.getSelection().toString();
const headersOf = (title) =>
    $$(".o_tl_row_header").filter((el) => el.getAttribute("title") === title);
const headerOf = (title) => headersOf(title)[0];
const rowOf = (title) => headerOf(title).closest(".o_tl_row");
const isClosed = (title) => rowOf(title).classList.contains("o_tl_collapsed");
const middleY = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
};

/** Three gestures on the Alpha header from `x0` to `x1`: closed, open, closed; nothing selected. */
async function alphaThreeTimes(x0, x1) {
    for (const closed of [true, false, true]) {
        await gesture(middleY(headerOf("Alpha")), x0, x1);
        assert(selectedText() === "", `text is selected: "${selectedText()}"`);
        assert(isClosed("Alpha") === closed, `Alpha should be ${closed ? "closed" : "open"}`);
    }
}

// ---------------------------------------------------------------------------------------------
// A1, A2: no text can be selected in the view (R1)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b3_a1_group_header_gesture", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_header[title='Alpha']",
            async run() {
                assert(!isClosed("Alpha"), "Alpha starts open");
                await alphaThreeTimes(60, 200);
            },
        },
    ],
});

tours.add("timeline_002b3_a2_record_header", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_header[title='Host Contact 2']",
            async run() {
                const title = "Host Contact 2";
                const grid = renderer();
                // Beta / Host Contact 2 is the last of the rows of that name
                const header = headersOf(title).at(-1);
                grid.scrollLeft = 0;
                await gridSettled();
                // the gesture scrolls the grid as a click does (002a R39)
                await gesture(middleY(header), 60, 200);
                assert(selectedText() === "", `text is selected: "${selectedText()}"`);
                const moved = grid.scrollLeft;
                assert(moved > 0, "the grid scrolled to the first pill of the row");
                grid.scrollLeft = 0;
                await gridSettled();
                headersOf(title).at(-1).click();
                await gridSettled();
                assert(
                    Math.abs(grid.scrollLeft - moved) <= 1,
                    `a click scrolls to ${grid.scrollLeft}, the gesture to ${moved}`
                );
                // a triple click on a row header label selects nothing
                const label = $(".o_tl_row_label", headersOf(title).at(-1));
                const rect = label.getBoundingClientRect();
                const x = rect.left + Math.min(rect.width / 2, 40);
                const y = rect.top + rect.height / 2;
                const events = [mouse("mouseMoved", x, y, { button: "none", buttons: 0 })];
                for (const clickCount of [1, 2, 3]) {
                    events.push(mouse("mousePressed", x, y, { buttons: 1, clickCount }));
                    events.push(mouse("mouseReleased", x, y, { buttons: 0, clickCount }));
                }
                await realMouse(events);
                assert(selectedText() === "", `a triple click selected: "${selectedText()}"`);
            },
        },
    ],
});

tours.add("timeline_002b3_a2_group_header_gesture_phone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_header[title='Alpha']",
            async run() {
                assert(!isClosed("Alpha"), "Alpha starts open");
                await gesture(middleY(headerOf("Alpha")), 20, 110);
                assert(selectedText() === "", `text is selected: "${selectedText()}"`);
                assert(isClosed("Alpha"), "the gesture closed Alpha");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Selecting cells (R2 to R9, R15)
// ---------------------------------------------------------------------------------------------

const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const modifiersOf = (names) => names.reduce((sum, name) => sum + MODIFIERS[name], 0);
const recordRows = () => $$(".o_tl_row[data-row-id]:not(.o_tl_group_row)");
const allRows = () => $$(".o_tl_row[data-row-id]");
const pickedCount = () => $$(".o_tl_cell_picked").length;
const todayIndex = () => Number($(".o_tl_col.o_tl_is_today").dataset.index);
/** Centre of the cell of column `index` in `row`; `half` 0 or 1 is the sub-column. */
function cellPoint(row, index, half = 0) {
    const rect = $$(".o_tl_cell", row)[index].getBoundingClientRect();
    return { x: rect.left + (rect.width * (half + 0.5)) / 2, y: rect.bottom - 4 };
}
const centreOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/** A click (press and release without a move) with the keys held. */
async function clickAt({ x, y }, keys = []) {
    const modifiers = modifiersOf(keys);
    await realMouse([
        mouse("mouseMoved", x, y, { button: "none", buttons: 0, modifiers }),
        mouse("mousePressed", x, y, { buttons: 1, clickCount: 1, modifiers }),
        mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1, modifiers }),
    ]);
}

/** Events that press at `from`, then move in steps to every point of `path`, the button held. */
function holdEvents(from, path) {
    const events = [mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 })];
    events.push(mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }));
    for (const point of path) {
        events.push(mouse("mouseMoved", point.x, point.y, { buttons: 1 }));
    }
    return events;
}
const releaseAt = ({ x, y }) => [mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 })];

/** Send events for real without waiting for the grid to settle (a held edge keeps it moving). */
async function realMouseLive(events) {
    const id = ++requests;
    window.__tl_mouse = { id, events };
    await until(() => window.__tl_mouse_done === id, "the real mouse events", 20000);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

tours.add("timeline_002b3_a9_draw_over_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const rows = allRows();
                const first = recordRows()[0];
                const start = rows.indexOf(first);
                const last = rows[Math.min(start + 4, rows.length - 1)];
                const column = todayIndex();
                const from = cellPoint(first, column, 0);
                const to = cellPoint(last, column + 1, 0);
                await realMouse(holdEvents(from, [
                    { x: from.x + 20, y: from.y },
                    { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
                    to,
                ]));
                const rowsDrawn = rows.indexOf(last) - start + 1;
                assert(pickedCount() === rowsDrawn * 3, `${pickedCount()} cells while held, wanted ${rowsDrawn * 3}`);
                assert(!$(".o_tl_selection_badge"), "no badge while drawing");
                assert(!$(".o_tl_pill_lock"), "no lock icon while drawing");
                assert($(".o_timeline_view").classList.contains("o_tl_drawing"), "the drawing shape is on");
                assert(!$(".o_multi_selection_buttons"), "no buttons while the button is held");
                await realMouse(releaseAt(to));
                assert(pickedCount() === rowsDrawn * 3, "the highlight stays after the release");
                assert(!$(".o_dialog"), "no dialog opens");
            },
        },
    ],
});

tours.add("timeline_002b3_a12_escape_cancels", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const first = recordRows()[0];
                const column = todayIndex();
                const from = cellPoint(first, column, 0);
                const to = cellPoint(first, column + 2, 0);
                await realMouse(holdEvents(from, [{ x: from.x + 30, y: from.y }, to]));
                assert(pickedCount() > 0, "a drawing is held");
                document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
                await until(() => pickedCount() === 0, "Escape clears the drawing");
                await realMouse(releaseAt(to));
                assert(pickedCount() === 0, "nothing is selected after the release");
                assert(!$(".o_dialog"), "no dialog opens");
            },
        },
    ],
});

tours.add("timeline_002b3_a16_edge_scroll_both_axes", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const grid = renderer();
                assert(grid.scrollHeight > grid.clientHeight, "the grid is taller than its area");
                const box = grid.getBoundingClientRect();
                const row = recordRows()[0];
                const from = cellPoint(row, todayIndex(), 0);
                const right = box.left + grid.clientWidth;
                const bottom = box.top + grid.clientHeight;
                const left0 = grid.scrollLeft;
                const top0 = grid.scrollTop;
                // held 100 px from the right edge: the grid scrolls to the right
                const aside = { x: right - 100, y: (box.top + bottom) / 2 };
                await realMouseLive(holdEvents(from, [{ x: from.x + 30, y: from.y }, aside]));
                await pause(600);
                assert(grid.scrollLeft > left0 + 100, `it scrolled right: ${left0} to ${grid.scrollLeft}`);
                assert(Math.abs(grid.scrollTop - top0) < 2, "not vertically yet");
                // held 100 px above the bottom: it scrolls down
                const down = { x: from.x + 30, y: bottom - 100 };
                await realMouseLive([mouse("mouseMoved", down.x, down.y, { buttons: 1 })]);
                const left1 = grid.scrollLeft;
                await pause(600);
                assert(grid.scrollTop > top0 + 100, `it scrolled down: ${top0} to ${grid.scrollTop}`);
                assert(Math.abs(grid.scrollLeft - left1) < 2, "no sideways scroll away from the right edge");
                await realMouseLive(releaseAt(down));
            },
        },
    ],
});

tours.add("timeline_002b3_a17_column_headers", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_col[data-date]",
            async run() {
                const headers = $$(".o_tl_col[data-date]");
                const today = $(".o_tl_col.o_tl_is_today");
                const at = headers.indexOf(today);
                const rows = allRows().length;
                await clickAt(centreOf(today));
                assert(pickedCount() === rows * 2, `a column gives ${rows * 2} cells, got ${pickedCount()}`);
                await clickAt(centreOf(headers[at + 2]), ["shift"]);
                assert(pickedCount() === rows * 6, `Shift extends to three days, got ${pickedCount()}`);
                await clickAt(centreOf(headers[at - 2]), ["ctrl"]);
                assert(pickedCount() === rows * 8, `Ctrl adds a day, got ${pickedCount()}`);
                await clickAt(centreOf(headers[at - 2]), ["ctrl"]);
                assert(pickedCount() === rows * 6, "Ctrl again removes it");
                assert($(".o_tl_col_group") && getComputedStyle(headers[at]).cursor === "pointer", "the hand over a header");
            },
        },
    ],
});

tours.add("timeline_002b3_a18_row_headers", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_header[title]",
            async run() {
                // the last record row with a pill outside the middle of the grid
                const row = $$(".o_tl_pill")
                    .find((el) => el.textContent.trim() === "Test")
                    ?.closest(".o_tl_row");
                assert(row, "the row of the pill Test");
                const grid = renderer();
                grid.scrollLeft = 0;
                await gridSettled();
                const pill = $(".o_tl_pill", row);
                await clickAt(centreOf($(".o_tl_row_header", row)));
                const index = allRows().indexOf(row);
                assert(grid.scrollLeft > 0, "the grid scrolled to the first pill");
                const total = $$(".o_tl_cell", row).length;
                const picked = $$(".o_tl_cell_picked", allRows()[index]).length;
                assert(picked > 0 && picked === pickedCount(), `only that row is selected (${picked} of ${pickedCount()})`);
                assert(picked >= total, "the whole range of the row is selected");
                const rect = pill.getBoundingClientRect();
                const box = grid.getBoundingClientRect();
                assert(rect.right > box.left && rect.left < box.right, "the pill is in view");
            },
        },
    ],
});

tours.add("timeline_002b3_a5_phone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                // Beta / Undefined Contact: the row after the Beta group row
                const beta = allRows().find(
                    (element) => $(".o_tl_row_label", element)?.textContent === "Beta"
                );
                assert(beta, "the Beta group row");
                const row = beta.nextElementSibling;
                const grid = renderer();
                const today = todayIndex();
                await clickAt(cellPoint(row, today, 0));
                assert(pickedCount() === 0, "a cell click picks nothing on the phone");
                await until(() => $(".o_dialog .modal-title"), "the plan dialog");
                assert($(".o_dialog .modal-title").textContent === "Plan", "002b's plan dialog opens");
                // the search bar shows behind its toggle on the phone
                $(".o_dialog .o_control_panel .oi[data-icon='search']").click();
                await until(() => $(".o_dialog .o_searchview_facet"), "the search of the plan dialog");
                assert(
                    $(".o_dialog .o_searchview_facet").textContent.includes("Beta"),
                    "the plan dialog's search starts with Parent Beta"
                );
                $(".o_dialog .btn-close, .o_dialog .o_form_button_cancel")?.click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await clickAt(centreOf($(".o_tl_col.o_tl_is_today")));
                assert(pickedCount() === 0, "a header click picks nothing");
                grid.scrollLeft = 0;
                await gridSettled();
                const withPill = $$(".o_tl_pill")
                    .find((el) => el.textContent.trim() === "Test")
                    .closest(".o_tl_row");
                await clickAt(centreOf($(".o_tl_row_header", withPill)));
                assert(pickedCount() === 0, "a row header click picks nothing");
                assert(grid.scrollLeft > 0, "the row header click scrolled the grid");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// The selection buttons (R8, R13; A9, A23, A37, A63)
// ---------------------------------------------------------------------------------------------

const buttonsBox = () => $(".o_multi_selection_buttons");
const buttonTexts = () =>
    $$(".o_multi_selection_buttons > button")
        .map((button) => button.textContent.trim() || button.dataset.tooltip)
        .join(",");
const countShown = () => $(".o_multi_selection_buttons .o_selection_box b")?.textContent;

/** A point of the cell under the middle of the pill of the first record row holding one pill. */
function oneCellUnderOnePill() {
    for (const row of recordRows()) {
        const pills = $$(".o_tl_pill", row);
        if (pills.length !== 1) {
            continue;
        }
        const pill = pills[0].getBoundingClientRect();
        const box = renderer().getBoundingClientRect();
        if (pill.right <= box.left || pill.left >= box.right) {
            continue;
        }
        const middle = (Math.max(pill.left, box.left) + Math.min(pill.right, box.right)) / 2;
        const index = $$(".o_tl_cell", row).findIndex((cell) => {
            const rect = cell.getBoundingClientRect();
            return rect.left <= middle && middle < rect.right;
        });
        if (index >= 0) {
            // the half of the cell under the middle of the pill
            const cell = $$(".o_tl_cell", row)[index].getBoundingClientRect();
            return cellPoint(row, index, middle >= cell.left + cell.width / 2 ? 1 : 0);
        }
    }
    return null;
}

tours.add("timeline_002b3_a9_buttons_after_release", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                assert(!buttonsBox(), "no buttons before a selection");
                const point = oneCellUnderOnePill();
                assert(point, "a cell under the only pill of a row");
                await clickAt(point);
                await until(() => buttonsBox(), "the buttons");
                assert(pickedCount() === 2, `a click picks two cells, got ${pickedCount()}`);
                assert(countShown() === "1", `the count is ${countShown()}`);
                assert(buttonTexts() === "Add,Delete", `the buttons are ${buttonTexts()}`);
                assert(!$(".o_tl_multi_plan"), "no Plan with two cells");
                // the group of buttons is in the middle of the control bar, on the line of the
                // range buttons
                const bar = $(".o_tl_controls").getBoundingClientRect();
                const box = buttonsBox().getBoundingClientRect();
                assert(
                    Math.abs(box.left + box.width / 2 - (bar.left + bar.width / 2)) < 2,
                    "the buttons are in the middle of the control bar"
                );
                assert(
                    Math.abs(box.top + box.height / 2 - middleY($(".o_tl_today"))) < 2,
                    "the buttons are on the line of the range buttons"
                );
                // the cross clears
                $(".o_multi_selection_buttons .o_unselect_all").click();
                await until(() => pickedCount() === 0 && !buttonsBox(), "the cross clears");
            },
        },
    ],
});

tours.add("timeline_002b3_a23_plan_button", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const beta = allRows().find(
                    (element) => $(".o_tl_row_label", element)?.textContent === "Beta"
                );
                assert(beta, "the Beta group row");
                const row = beta.nextElementSibling;
                const from = cellPoint(row, todayIndex(), 0);
                const to = { x: from.x + 25, y: from.y };
                await realMouse([
                    ...holdEvents(from, [{ x: from.x + 12, y: from.y }, to]),
                    ...releaseAt(to),
                ]);
                await until(() => buttonsBox(), "the buttons");
                assert(pickedCount() === 1, `one cell is picked, got ${pickedCount()}`);
                assert(countShown() === "0", `the count is ${countShown()}`);
                assert(buttonTexts() === "Add,Plan", `the buttons are ${buttonTexts()}`);
                $(".o_tl_multi_plan").click();
                await until(() => $(".o_dialog .o_list_view .o_data_row"), "the plan dialog");
                assert($(".o_dialog .modal-title").textContent === "Plan", "the plan dialog");
                const facet = $(".o_dialog .o_searchview_facet");
                assert(facet && facet.textContent.includes("Beta"), "the search starts with Parent Beta");
                const names = $$(".o_dialog .o_data_row .o_data_cell[name='name']").map((cell) =>
                    cell.textContent.trim()
                );
                assert(names.includes("Unscheduled"), `the dialog lists ${names}`);
                document.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
                );
                await until(() => !$(".o_dialog"), "Escape closes the dialog");
                assert(pickedCount() === 1, "Escape keeps the selection");
                assert($(".o_tl_multi_plan"), "the buttons stay");
            },
        },
    ],
});

tours.add("timeline_002b3_a37_restricted", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                assert(!$(".o_tl_button_add"), "no New button");
                const point = oneCellUnderOnePill();
                assert(point, "a cell under the only pill of a row");
                await clickAt(point);
                await until(() => buttonsBox(), "the count box");
                assert(countShown() === "1", `the count is ${countShown()}`);
                assert(buttonTexts() === "", `the buttons are ${buttonTexts()}`);
                assert($(".o_multi_selection_buttons .o_unselect_all"), "the cross");
                assert(pickedCount() === 2, "the selection works without rights");
            },
        },
    ],
});

/**
 * One tour of A63 for each set of options: a click on a cell under a pill, then a drawing inside
 * one half day of the same cell; `many` and `one` are the buttons expected after each.
 */
function optionsTour(name, { many, one, noNew = false }) {
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_row[data-row-id]",
                async run() {
                    assert(
                        noNew === !$(".o_tl_button_add"),
                        `the New button is ${noNew ? "shown" : "absent"}, against the view's create option`
                    );
                    const point = oneCellUnderOnePill();
                    assert(point, "a cell under the only pill of a row");
                    await clickAt(point);
                    await until(() => buttonsBox(), "the buttons");
                    assert(countShown() === "1", `the count is ${countShown()}`);
                    assert(buttonTexts() === many, `a day shows "${buttonTexts()}", wanted "${many}"`);
                    $(".o_multi_selection_buttons .o_unselect_all").click();
                    await until(() => !buttonsBox(), "the cross clears");
                    const to = { x: point.x + 25, y: point.y };
                    await realMouse([
                        ...holdEvents(point, [{ x: point.x + 12, y: point.y }, to]),
                        ...releaseAt(to),
                    ]);
                    await until(() => buttonsBox(), "the buttons after a drawing");
                    assert(pickedCount() === 1, `one cell, got ${pickedCount()}`);
                    assert(buttonTexts() === one, `a cell shows "${buttonTexts()}", wanted "${one}"`);
                },
            },
        ],
    });
}

optionsTour("timeline_002b3_a63_create_delete_off", { many: "", one: "Plan", noNew: true });
optionsTour("timeline_002b3_a63_delete_off", { many: "Add", one: "Add,Plan" });
optionsTour("timeline_002b3_a63_explicit_yes", { many: "Add,Delete", one: "Add,Plan,Delete" });
optionsTour("timeline_002b3_a63_no_unlink_right", { many: "Add", one: "Add,Plan" });

// ---------------------------------------------------------------------------------------------
// The template form popover and the creation (R10 to R12; A28 to A36, A62 to A64)
// ---------------------------------------------------------------------------------------------

const popoverEl = () => $(".o_popover .o_multi_create_popover");
const addButton = () => $(".o_multi_selection_buttons [data-tooltip='Add']");
const formInput = (name) => $(`.o_field_widget[name='${name}'] input`, popoverEl());
const timeInput = (index) => $$(".o_time_picker_input", popoverEl())[index];
const pillsTitled = (title) => $$(".o_tl_pill").filter((el) => el.textContent.trim() === title);
const notificationShows = (text) =>
    $$(".o_notification").some((element) => element.textContent.includes(text));
const todayIso = () => $(".o_tl_col.o_tl_is_today").dataset.date;
/** The text of a time input without its spaces and case: the user's format shows "12:00pm". */
const timeText = (input) => input.value.replace(/\s/g, "").toLowerCase();
const closePopover = async () => {
    $(".popover-footer .btn-secondary", popoverEl()).click();
    await until(() => !popoverEl(), "Discard closes the popover");
};

/** The record row `sub` under the group row `group`. */
function subRow(group, sub) {
    const groupRow = allRows().find(
        (element) =>
            element.classList.contains("o_tl_group_row") &&
            $(".o_tl_row_label", element)?.textContent === group
    );
    for (
        let row = groupRow?.nextElementSibling;
        row && !row.classList.contains("o_tl_group_row");
        row = row.nextElementSibling
    ) {
        if ($(".o_tl_row_label", row)?.textContent === sub) {
            return row;
        }
    }
    return null;
}

/** Type into an input as a user does, then let the view settle. */
async function typeText(input, text) {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await frame();
    await frame();
}

/** Choose `text` in the autocomplete of a relation field of the popover. */
async function chooseRelation(name, text) {
    const input = formInput(name);
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const item = await until(
        () =>
            $$(".o-autocomplete--dropdown-item").find((element) =>
                element.textContent.includes(text)
            ),
        `the choice "${text}" of ${name}`
    );
    (item.querySelector("a") || item).click();
    await frame();
    await frame();
}

async function openPopover() {
    await until(addButton, "the Add button");
    addButton().click();
    await until(
        () => popoverEl() && $(".o_form_renderer .o_field_widget[name='name']", popoverEl()),
        "the popover with its form"
    );
}

async function submitPopover() {
    $(".popover-footer .btn-primary", popoverEl()).click();
    await until(() => !popoverEl(), "the popover closes");
    await gridSettled();
}

/** A drawing inside one half day of a row, with the keys held. */
async function drawHalf(row, index, half, keys = []) {
    const modifiers = modifiersOf(keys);
    const centre = cellPoint(row, index, half);
    const from = { x: centre.x - 15, y: centre.y };
    const to = { x: centre.x + 15, y: centre.y };
    await realMouse([
        mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0, modifiers }),
        mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1, modifiers }),
        mouse("mouseMoved", from.x + 10, from.y, { buttons: 1, modifiers }),
        mouse("mouseMoved", to.x, to.y, { buttons: 1, modifiers }),
        mouse("mouseReleased", to.x, to.y, { buttons: 0, clickCount: 1, modifiers }),
    ]);
}

const betaUndefined = () => subRow("Beta", "Undefined Contact");

tours.add("timeline_002b3_a29_create_one_record", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = betaUndefined();
                const index = todayIndex();
                await clickAt(cellPoint(row, index, 0));
                assert(pickedCount() === 2, `a click picks two cells, got ${pickedCount()}`);
                await openPopover();
                assert(
                    timeText(timeInput(0)) === "12:00pm" && timeText(timeInput(1)) === "1:00pm",
                    `the times are ${timeInput(0).value} and ${timeInput(1).value}`
                );
                await typeText(formInput("name"), "Sprint");
                await submitPopover();
                assert(pickedCount() === 0, "the selection is cleared");
                const pills = pillsTitled("Sprint");
                assert(pills.length === 1, `${pills.length} pills named Sprint, wanted one`);
                const pill = pills[0].getBoundingClientRect();
                const fresh = betaUndefined();
                const cell = $$(".o_tl_cell", fresh)[index].getBoundingClientRect();
                // the exact size is the probe's (M25): here the pill is a half day wide, drawn
                // over the second half of that day
                assert(
                    Math.abs(pill.left - (cell.left + cell.width / 2)) <= 3 &&
                        Math.abs(pill.width - cell.width / 2) <= 4 &&
                        pill.height >= 20 &&
                        pill.height <= 30,
                    `the pill is ${pill.left},${pill.width}x${pill.height} for a cell at ${cell.left}`
                );
                assert(
                    pill.top >= fresh.getBoundingClientRect().top - 1 &&
                        pill.bottom <= fresh.getBoundingClientRect().bottom + 1,
                    "the pill is in Beta / Undefined Contact"
                );
            },
        },
    ],
});

tours.add("timeline_002b3_a30_rows_win", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const first = betaUndefined();
                const last = subRow("Beta", "Host Contact 3");
                const index = todayIndex();
                const from = cellPoint(first, index, 0);
                const to = cellPoint(last, index, 0);
                await realMouse([
                    ...holdEvents(from, [{ x: from.x + 10, y: from.y }, { x: from.x + 12, y: to.y }, to]),
                    ...releaseAt(to),
                ]);
                assert(pickedCount() === 3, `three cells, got ${pickedCount()}`);
                assert(!$(".o_tl_multi_plan"), "no Plan with three cells");
                await openPopover();
                await typeText(formInput("name"), "Row test");
                await submitPopover();
                assert(pillsTitled("Row test").length === 3, "three new pills");
            },
        },
    ],
});

tours.add("timeline_002b3_a31_tags_row", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const labelOfRow = (row) => $(".o_tl_row_label", row).textContent;
                const tagRow = () => recordRows().find((row) => labelOfRow(row) === "Host Tag 1");
                const none = () => recordRows().find((row) => !/Host Tag/.test(labelOfRow(row)));
                assert(tagRow() && none(), "the row of Host Tag 1 and the undefined row");
                const index = todayIndex() + 3;
                // the form's Tags left empty, a cell of the Host Tag 1 row
                await clickAt(cellPoint(tagRow(), index, 0));
                await openPopover();
                await typeText(formInput("name"), "Tag empty");
                await submitPopover();
                // Host Tag 2 chosen in the form, the cells of the Host Tag 1 row and the undefined row
                await clickAt(cellPoint(tagRow(), index, 0));
                await clickAt(cellPoint(none(), index, 0), ["ctrl"]);
                assert(pickedCount() === 4, `four cells, got ${pickedCount()}`);
                await openPopover();
                await typeText(formInput("name"), "Tag two");
                await chooseRelation("x_tags", "Host Tag 2");
                await submitPopover();
            },
        },
    ],
});

tours.add("timeline_002b3_a32_date_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = recordRows()[0];
                const index = todayIndex() + 2;
                await clickAt(cellPoint(row, index, 0));
                await openPopover();
                assert(!timeInput(0), "no time fields on a date-only model");
                assert(formInput("name"), "the template form is shown");
                await typeText(formInput("name"), "Day test");
                await submitPopover();
                const pills = pillsTitled("Day test");
                assert(pills.length === 1, `${pills.length} pills named Day test, wanted one`);
                const pill = pills[0].getBoundingClientRect();
                const cell = $$(".o_tl_cell", recordRows()[0])[index].getBoundingClientRect();
                assert(
                    pill.left >= cell.left - 1 && pill.right <= cell.right + 1,
                    "the pill covers that day only"
                );
            },
        },
    ],
});

tours.add("timeline_002b3_a33_validation", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await clickAt(cellPoint(betaUndefined(), todayIndex(), 0));
                await openPopover();
                const add = () => $(".popover-footer .btn-primary", popoverEl()).click();
                add();
                await until(() => notificationShows("Missing required fields"), "the missing field message");
                assert(popoverEl(), "the popover stays after a missing field");
                await typeText(formInput("name"), "Checks");
                await typeText(timeInput(0), "15:00");
                add();
                await until(
                    () => notificationShows("Start time should be before end time"),
                    "the start after end warning"
                );
                assert(popoverEl(), "the popover stays after a start after the end");
                await typeText(timeInput(1), "nonsense");
                add();
                await until(() => notificationShows("Invalid time range"), "the invalid range warning");
                assert(popoverEl(), "the popover stays after an unreadable time");
                await closePopover();
            },
        },
    ],
});

tours.add("timeline_002b3_a34_kept_values", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            // the step reloads the page and runs again on the new one
            expectUnloadPage: true,
            async run() {
                const pickAndOpen = async () => {
                    await clickAt(cellPoint(betaUndefined(), todayIndex(), 0));
                    await openPopover();
                };
                const discard = closePopover;
                const keptValues = () =>
                    `${timeText(timeInput(0))}|${formInput("name").value}|${formInput("x_color").value}`;
                await pickAndOpen();
                await typeText(timeInput(0), "15:00");
                await typeText(formInput("name"), "Kept");
                await typeText(formInput("x_color"), "4");
                await discard();
                assert(pickedCount() === 2, "Discard keeps the selection");
                await openPopover();
                assert(keptValues() === "3:00pm|Kept|4", `after Discard: ${keptValues()}`);
                await discard();
                // another view of the action and back
                $(".o_switch_view.o_list").click();
                await until(() => $(".o_list_view"), "the list view");
                $(".o_switch_view.o_gantt").click();
                await until(() => $(".o_tl_renderer .o_tl_col.o_tl_is_today"), "the timeline again");
                await gridSettled();
                await pickAndOpen();
                assert(keptValues() === "3:00pm|Kept|4", `after the list view: ${keptValues()}`);
                await discard();
                window.location.reload();
            },
        },
        // a new page: the start time is kept by the browser, the form's values are not
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await clickAt(cellPoint(betaUndefined(), todayIndex(), 0));
                await openPopover();
                const kept = `${timeText(timeInput(0))}|${formInput("name").value}|${formInput("x_color").value}`;
                assert(kept === "3:00pm||0", `after the reload: ${kept}`);
                await closePopover();
            },
        },
    ],
});

tours.add("timeline_002b3_a35_new_with_selection", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = betaUndefined();
                const index = todayIndex();
                const from = cellPoint(row, index, 1);
                const to = cellPoint(row, index + 1, 0);
                await realMouse([
                    ...holdEvents(from, [{ x: from.x + 10, y: from.y }, to]),
                    ...releaseAt(to),
                ]);
                await clickAt(cellPoint(subRow("Beta", "Host Contact 3"), index + 3, 0), ["ctrl"]);
                // a drawing over two half days, a click on a day: four cells
                assert(pickedCount() === 4, `four cells, got ${pickedCount()}`);
                // the defaults of the dialog travel in the context of its first request
                const { bodies, stop } = recordRequestBodies();
                let context;
                try {
                    $(".o_tl_button_add").click();
                    await until(() => $(".o_dialog .o_form_view"), "the create dialog");
                    const body = await until(
                        () => bodies.find((b) => b.includes('"onchange"') && b.includes("default_date_start")),
                        "the first request of the dialog"
                    );
                    context = JSON.parse(body).params.kwargs.context;
                } finally {
                    stop();
                }
                const day = todayIso();
                const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
                    .toISOString()
                    .slice(0, 10);
                assert(
                    context.default_date_start === `${day} 12:00:00` &&
                        context.default_date_stop === `${next} 12:00:00`,
                    `the period is ${context.default_date_start} to ${context.default_date_stop}`
                );
                assert(
                    Number.isInteger(context.default_parent_id) && context.default_x_contact === false,
                    `the row is ${context.default_parent_id}, ${context.default_x_contact}`
                );
                assert(pickedCount() === 4, "the selection stays while the dialog is open");
                $(".o_dialog .o_form_button_cancel").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await gridSettled();
                assert(pickedCount() === 0, "the reload clears the selection");
            },
        },
    ],
});

tours.add("timeline_002b3_a62_halves_and_mixed", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = betaUndefined();
                const index = todayIndex();
                await drawHalf(row, index, 1);
                await drawHalf(row, index + 1, 0, ["ctrl"]);
                assert(pickedCount() === 2, `two half days, got ${pickedCount()}`);
                assert(!$(".o_tl_multi_plan"), "no Plan with two cells");
                await openPopover();
                await typeText(formInput("name"), "Halves");
                await submitPopover();
                assert(pillsTitled("Halves").length === 2, "two new pills");
            },
        },
    ],
});

tours.add("timeline_002b3_a62_mixed_model", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = recordRows()[0];
                const index = todayIndex();
                // the first half of the day alone: the stop is the end of that half
                await drawHalf(row, index, 0);
                assert(pickedCount() === 1 && $(".o_tl_multi_plan"), "one half-day cell shows Plan");
                await openPopover();
                assert(!timeInput(0), "no time fields on a mixed model");
                await typeText(formInput("name"), "Mixed one");
                await submitPopover();
                // both halves of the next day: the stop is the end of the second half
                await clickAt(cellPoint(recordRows()[0], index + 1, 0));
                await openPopover();
                await typeText(formInput("name"), "Mixed two");
                await submitPopover();
            },
        },
    ],
});

/** A64: the Contact chosen in the form, Color 5, and with dates typed in a form that shows them. */
function cellWinsTour(name, { withDates }) {
    tours.add(name, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_row[data-row-id]",
                async run() {
                    await clickAt(cellPoint(betaUndefined(), todayIndex(), 0));
                    await openPopover();
                    await typeText(formInput("name"), "Cell wins");
                    await chooseRelation("x_contact", "Host Contact 2");
                    await typeText(formInput("x_color"), "5");
                    if (withDates) {
                        await typeText(formInput("date_start"), "01/01/2031 08:00:00");
                        await typeText(formInput("date_stop"), "01/02/2031 08:00:00");
                    }
                    await submitPopover();
                    const pills = pillsTitled("Cell wins");
                    assert(pills.length === 1, `${pills.length} pills named Cell wins, wanted one`);
                    const row = betaUndefined();
                    assert(
                        pills[0].getBoundingClientRect().top >= row.getBoundingClientRect().top - 1 &&
                            pills[0].getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom + 1,
                        "the pill is in Beta / Undefined Contact"
                    );
                },
            },
        ],
    });
}
cellWinsTour("timeline_002b3_a64_cell_wins", { withDates: false });
cellWinsTour("timeline_002b3_a64_cell_wins_dates", { withDates: true });

const dialogText = () => $$(".o_dialog").map((element) => element.textContent).join("|");

// the restricted user: the Community error
tours.add("timeline_002b3_a63_server_refuses_create", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const point = oneCellUnderOnePill();
                assert(point, "a cell under the only pill of a row");
                await clickAt(point);
                await until(addButton, "the Add button");
                addButton().click();
                // the form of the popover cannot even get its defaults: the Community error
                await until(
                    () => /not allowed to create/.test(dialogText()),
                    "the Community access error"
                );
                assert(!popoverEl() || !$(".o_form_renderer", popoverEl()), "no form is shown");
            },
        },
    ],
});

// a refusal of the create call itself (a constraint): the Community error, nothing created
tours.add("timeline_002b3_a63_server_refuses_constraint", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await clickAt(cellPoint(betaUndefined(), todayIndex(), 0));
                await openPopover();
                await typeText(formInput("name"), "Refused");
                await submitPopover();
                await until(() => /Multi-creation refused/.test(dialogText()), "the Community error");
                assert(pickedCount() === 0, "the selection was cleared when Add was accepted");
                assert(pillsTitled("Refused").length === 0, "nothing was created");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Deleting a selection (R14; A38 to A41, A63)
// ---------------------------------------------------------------------------------------------

const deleteButton = () => $(".o_multi_selection_buttons [data-tooltip='Delete']");
const confirmation = () => $(".o_dialog .modal-body")?.textContent.trim();
const dialogButton = (label) =>
    $$(".o_dialog .modal-footer button").find((element) => element.textContent.trim() === label);

/** Click the one day of the "Sprint" record (the test created it), then Delete. */
async function pickSprintAndDelete() {
    const row = betaUndefined();
    assert(pillsTitled("Sprint").length === 1, "the Sprint pill is shown");
    await clickAt(cellPoint(row, todayIndex(), 0));
    await until(deleteButton, "the Delete button");
    assert(countShown() === "1", `the count is ${countShown()}`);
    deleteButton().click();
    await until(confirmation, "the confirmation");
    assert(
        confirmation() === "Are you sure you want to delete the selected record?",
        `the dialog asks "${confirmation()}"`
    );
    assert(dialogButton("Ok") && dialogButton("Discard"), "the dialog offers Ok and Discard");
}

tours.add("timeline_002b3_a38_a39_delete", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await pickSprintAndDelete();
                dialogButton("Ok").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await gridSettled();
                assert(pillsTitled("Sprint").length === 0, "the Sprint pill is gone");
                assert(pickedCount() === 0 && !buttonsBox(), "the selection is cleared");
            },
        },
    ],
});

tours.add("timeline_002b3_a40_discard", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await pickSprintAndDelete();
                dialogButton("Discard").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                assert(pillsTitled("Sprint").length === 1, "the Sprint pill stays");
                assert(pickedCount() === 2 && countShown() === "1", "the selection stays");
                assert(deleteButton(), "the buttons stay");
            },
        },
    ],
});

tours.add("timeline_002b3_a41_delete_cut_pills", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                const row = subRow("Gamma", "Host Contact 3");
                assert(row, "the row Gamma / Host Contact 3");
                const index = todayIndex();
                const from = cellPoint(row, index, 0);
                const to = cellPoint(row, index, 1);
                await realMouse([
                    mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
                    mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
                    mouse("mouseMoved", from.x + 20, from.y + 5, { buttons: 1 }),
                    mouse("mouseMoved", to.x, to.y, { buttons: 1 }),
                    mouse("mouseReleased", to.x, to.y, { buttons: 0, clickCount: 1 }),
                ]);
                await until(deleteButton, "the Delete button");
                assert(pickedCount() === 2, `two cells, got ${pickedCount()}`);
                assert(countShown() === "4", `the count is ${countShown()}`);
                deleteButton().click();
                await until(confirmation, "the confirmation");
                assert(
                    confirmation() === "Are you sure you want to delete the 4 selected records?",
                    `the dialog asks "${confirmation()}"`
                );
                dialogButton("Ok").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await gridSettled();
                for (const title of ["Long task", "Overlap A", "Overlap B", "Overlap C"]) {
                    assert(pillsTitled(title).length === 0, `${title} is gone`);
                }
            },
        },
    ],
});

// the server refuses the deletion: the Community error, nothing deleted, the selection stays
tours.add("timeline_002b3_a63_server_refuses_delete", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id]",
            async run() {
                await pickSprintAndDelete();
                dialogButton("Ok").click();
                await until(
                    () => /Deletion refused by the server/.test(dialogText()),
                    "the Community error"
                );
                assert(pillsTitled("Sprint").length === 1, "the Sprint pill stays");
                assert(pickedCount() === 2, "the selection stays after the refusal");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// The side panel: when it shows, and its remembered state (R17, R18; A43, A54)
// ---------------------------------------------------------------------------------------------

const panelShown = () => Boolean($(".o_tl_panel")) && Boolean($(".o_tl_panel_toggle"));
const panelButton = () => $(".o_tl_panel_toggle");
const boxLeft = () => $(".o_tl_box").getBoundingClientRect().left;

// a host that gives no panel: none of the panel, its strip, its button, its count text; the grid
// box reaches both edges of the screen
tours.add("timeline_002b3_a43_conditions", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row[data-row-id], .o_tl_sample_grid",
            async run() {
                await gridSettled();
                assert(!$(".o_tl_panel"), "no panel");
                assert(!$(".o_tl_panel_strip"), "no strip");
                assert(!panelButton(), "no panel button");
                assert(!$(".o_tl_panel_count"), "no count text");
                const box = $(".o_tl_box").getBoundingClientRect();
                assert(
                    Math.round(box.width) === window.innerWidth,
                    `the grid box is ${box.width} wide on a ${window.innerWidth} px screen`
                );
            },
        },
    ],
});

// H36 on a desktop screen: the panel and its button, open
tours.add("timeline_002b3_a43_shown", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel",
            async run() {
                await gridSettled();
                assert(panelShown(), "the panel and its button");
                assert(panelButton().classList.contains("active"), "the button is active");
                assert($(".o_tl_panel_strip"), "the strip");
                assert(Math.round(boxLeft()) === 16, `the box starts at ${boxLeft()}`);
                assert(!$(".o_tl_panel_count"), "no count text while open");
            },
        },
    ],
});

const panelKeys = () =>
    Object.keys(window.localStorage).filter((key) => key.startsWith("timelinePanelOpen-view-"));

// close, reload the page: still closed (the browser keeps it under the key of this view and
// action only); reopen, reload: open
tours.add("timeline_002b3_a54_open_close_remembered", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_toggle.active",
            expectUnloadPage: true,
            async run() {
                await gridSettled();
                panelButton().click();
                await until(() => !$(".o_tl_panel"), "the panel closes");
                assert(!$(".o_tl_panel_strip"), "the strip goes with it");
                assert(!panelButton().classList.contains("active"), "the button is not active");
                assert(Math.round(boxLeft()) === 16, "the box keeps its margin");
                const keys = panelKeys();
                assert(keys.length === 1, `one stored state, got ${keys}`);
                assert(/^timelinePanelOpen-view-\d+-action-\d+$/.test(keys[0]), keys[0]);
                assert(window.localStorage.getItem(keys[0]) === "false", "stored as closed");
                window.location.reload();
            },
        },
        {
            trigger: ".o_tl_panel_toggle:not(.active)",
            expectUnloadPage: true,
            async run() {
                await gridSettled();
                assert(!$(".o_tl_panel"), "the panel is still closed after the reload");
                panelButton().click();
                await until(() => $(".o_tl_panel"), "the panel opens");
                assert(panelButton().classList.contains("active"), "the button is active");
                window.location.reload();
            },
        },
        {
            trigger: ".o_tl_panel_toggle.active",
            async run() {
                await gridSettled();
                assert($(".o_tl_panel"), "open after the reload");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// The list of the records to schedule (R19; A25, A44 to A46, A53, A58)
// ---------------------------------------------------------------------------------------------

const panelNames = () => $$(".o_tl_panel_name").map((element) => element.textContent.trim());
const panelTitle = () => $(".o_tl_panel_title")?.textContent.trim();
const panelListed = (title, names) => async () => {
    await until(() => panelTitle() === title, `the title ${title}, got ${panelTitle()}`);
    await gridSettled();
    assert(
        JSON.stringify(panelNames()) === JSON.stringify(names),
        `the lines are ${JSON.stringify(panelNames())}`
    );
};

// H36 as the test built it: the three parents and the record without dates
tours.add("timeline_002b3_a44_list", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            run: panelListed("Unscheduled: 4", ["Alpha", "Beta", "Gamma", "Unscheduled"]),
        },
    ],
});

// the test gave Alpha a start and no stop: it is not listed
tours.add("timeline_002b3_a44_list_start_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            run: panelListed("Unscheduled: 3", ["Beta", "Gamma", "Unscheduled"]),
        },
    ],
});

// a default filter "start is set" (made by the test) does not touch the list, while the grid
// shows only records with a start
tours.add("timeline_002b3_a45_date_filter_ignored", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            run: async () => {
                await panelListed("Unscheduled: 4", ["Alpha", "Beta", "Gamma", "Unscheduled"])();
                assert(
                    $$(".o_searchview_facet").length === 1,
                    "the default filter is among the facets of the search"
                );
                assert(!$$(".o_tl_pill").some((el) => el.textContent.includes("Unscheduled")));
            },
        },
    ],
});

tours.add("timeline_002b3_a46_open_line", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const alpha = $$(".o_tl_panel_name").find((el) => el.textContent === "Alpha");
                alpha.click();
                await until(() => $(".o_dialog .modal-title"), "the record dialog");
                assert($(".o_dialog .modal-title").textContent === "Open", "the dialog is Open");
                await until(
                    () => $(".o_dialog .o_field_widget[name='name'] input")?.value === "Alpha",
                    "the dialog shows Alpha"
                );
                $(".o_dialog .o_form_button_cancel").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 4", "the list is read again");
                assert(panelNames().length === 4, "the four lines are back");
            },
        },
    ],
});

// the test made Queue 01 to Queue 22: 26 records, twenty lines first
tours.add("timeline_002b3_a53_load_more", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_more",
            async run() {
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 26", `the title is ${panelTitle()}`);
                assert($$(".o_tl_panel_line").length === 20, "twenty lines");
                assert($(".o_tl_panel_more").textContent.trim() === "Load more", "the text");
                $(".o_tl_panel_more").click();
                await until(() => $$(".o_tl_panel_line").length === 26, "twenty more");
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 26", "the title keeps the total");
                assert(!$(".o_tl_panel_more"), "no Load more once everything is listed");
            },
        },
    ],
});

// H40: a selection in the grid goes with Load more
tours.add("timeline_002b3_a25_load_more_clears", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_more",
            async run() {
                await gridSettled();
                await clickAt(cellPoint(recordRows()[0], todayIndex(), 0));
                await until(() => pickedCount() > 0, "a picked cell");
                $(".o_tl_panel_more").click();
                await until(() => $$(".o_tl_panel_line").length === 26, "twenty more");
                await gridSettled();
                assert(pickedCount() === 0, "the selection is cleared");
                assert(!$(".o_multi_selection_buttons"), "the selection buttons are gone");
            },
        },
    ],
});

// the handle is grey at rest and darker under the real pointer
tours.add("timeline_002b3_a58_hover", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const gamma = $$(".o_tl_panel_line").find(
                    (line) => $(".o_tl_panel_name", line).textContent === "Gamma"
                );
                const handle = $(".o_tl_panel_handle", gamma);
                const colour = () => getComputedStyle(handle).color;
                assert(colour() === "rgb(173, 181, 189)", `at rest ${colour()}`);
                const { x, y } = centreOf(handle);
                await realMouse([mouse("mouseMoved", x, y, { button: "none", buttons: 0 })]);
                assert(colour() === "rgb(102, 102, 102)", `under the pointer ${colour()}`);
                await realMouse([mouse("mouseMoved", x + 300, y, { button: "none", buttons: 0 })]);
                assert(colour() === "rgb(173, 181, 189)", `after leaving ${colour()}`);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Resizing the panel by its strip (R20; A55)
// ---------------------------------------------------------------------------------------------

const panelWidthNow = () => Math.round($(".o_tl_panel").getBoundingClientRect().width);

/** Press on the strip's middle, move `dx` px in eight steps on the same line, release. */
async function dragStrip(dx) {
    const rect = $(".o_tl_panel_strip").getBoundingClientRect();
    const x0 = rect.left + rect.width / 2;
    const y = rect.top + 200;
    const events = [mouse("mouseMoved", x0, y, { button: "none", buttons: 0 })];
    events.push(mouse("mousePressed", x0, y, { buttons: 1, clickCount: 1 }));
    for (let step = 1; step <= 8; step++) {
        events.push(mouse("mouseMoved", x0 + (dx * step) / 8, y, { buttons: 1 }));
    }
    events.push(mouse("mouseReleased", x0 + dx, y, { buttons: 0, clickCount: 1 }));
    await realMouse(events);
}

// drag the strip 300 px left: 562; far right: 150; far left: 800; closing and opening the panel
// keeps the width; opening the action anew from its menu gives 262 again
tours.add("timeline_002b3_a55_resize", {
    steps: () => [
        gridReady,
        {
            // the strip is invisible at rest (opacity 0): wait for the panel beside it
            trigger: ".o_tl_panel",
            async run() {
                await gridSettled();
                assert(panelWidthNow() === 262, `262 at first, got ${panelWidthNow()}`);
                await dragStrip(-300);
                assert(panelWidthNow() === 562, `562 after 300 px left, got ${panelWidthNow()}`);
                await dragStrip(1000);
                assert(panelWidthNow() === 150, `150 far right, got ${panelWidthNow()}`);
                await dragStrip(-1500);
                assert(panelWidthNow() === 800, `800 far left, got ${panelWidthNow()}`);
                // 800 back to 562: 238 px to the right
                await dragStrip(238);
                assert(panelWidthNow() === 562, `562 again, got ${panelWidthNow()}`);
                // the grid's box follows
                const box = $(".o_tl_box").getBoundingClientRect();
                assert(
                    Math.round(box.right + 18 + 562 + 16) === window.innerWidth,
                    `the box ends at ${box.right}`
                );
                // closing and opening keeps the width
                panelButton().click();
                await until(() => !$(".o_tl_panel"), "the panel closes");
                panelButton().click();
                await until(() => $(".o_tl_panel"), "the panel opens");
                assert(panelWidthNow() === 562, `562 after reopening, got ${panelWidthNow()}`);
            },
        },
        {
            // opening the action anew from its menu: the width is 262 again
            trigger: ".o_main_navbar",
            async run() {
                const label = "H37 Schedule by parent";
                const entries = () => $$(".o_main_navbar a, .o_main_navbar button, .dropdown-item");
                const item = () => entries().find((el) => el.textContent.trim() === label);
                if (!item()) {
                    const toggle = entries().find((el) =>
                        el.textContent.trim().startsWith("Gantt Host")
                    );
                    assert(toggle, "the Gantt Host menu");
                    toggle.click();
                    await until(item, `the menu item ${label}`);
                }
                item().click();
                await frame();
                await gridSettled();
                await until(() => $(".o_tl_panel"), "the panel of the new view");
                await until(() => panelWidthNow() === 262, `262 after opening anew, got ${panelWidthNow()}`);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// The row header and the first scroll with the panel (R18; A65)
// ---------------------------------------------------------------------------------------------

const headerWidthNow = () => Math.round($(".o_tl_row_header").getBoundingClientRect().width);
const headerLeftNow = () => Math.round($(".o_tl_row_header").getBoundingClientRect().left);
const todayLeftNow = () => $(".o_tl_col.o_tl_is_today").getBoundingClientRect().left;
// the focus day starts at half of (the content width - the row header - the open panel) from the
// cells' visible left edge (the box's left edge, 16 px margin and 1 px border, plus the row header)
const focusPlace = (panelWidth) =>
    $(".o_tl_title_cell").getBoundingClientRect().right +
    (window.innerWidth - headerWidthNow() - panelWidth) / 2;

/** The row header is a sixth of the view's width whatever the panel does. */
function headerIsASixth() {
    const sixth = Math.round(window.innerWidth / 6);
    assert(headerWidthNow() === sixth, `the row header is ${headerWidthNow()} wide, not ${sixth}`);
}

// open at the first display: row header 267, Today at the focus place; closing keeps both; opened
// again from a remembered closed state: the place is for no panel; opening and resizing keep both
tours.add("timeline_002b3_a65_row_header_and_first_scroll", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel",
            expectUnloadPage: true,
            async run() {
                await gridSettled();
                headerIsASixth();
                assert(panelWidthNow() === 262, "the panel is open at 262");
                const open = focusPlace(262);
                assert(near(todayLeftNow(), open, 1.5), `${todayLeftNow()} is not at ${open}`);
                const first = todayLeftNow();
                panelButton().click();
                await until(() => !$(".o_tl_panel"), "the panel closes");
                await gridSettled();
                headerIsASixth();
                assert(near(todayLeftNow(), first, 1), "closing moved the columns");
                window.location.reload();
            },
        },
        {
            trigger: ".o_tl_panel_toggle:not(.active)",
            async run() {
                await gridSettled();
                headerIsASixth();
                assert(!$(".o_tl_panel"), "closed as it was left");
                const closed = focusPlace(0);
                assert(near(todayLeftNow(), closed, 1.5), `${todayLeftNow()} is not at ${closed}`);
                const first = todayLeftNow();
                panelButton().click();
                await until(() => $(".o_tl_panel"), "the panel opens");
                await gridSettled();
                headerIsASixth();
                assert(near(todayLeftNow(), first, 1), "opening moved the columns");
                await dragStrip(-300);
                assert(panelWidthNow() === 562, `562 after 300 px left, got ${panelWidthNow()}`);
                await gridSettled();
                headerIsASixth();
                assert(headerLeftNow() === 17, `the row header starts at ${headerLeftNow()}`);
                assert(near(todayLeftNow(), first, 1), "the resize moved the columns");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Scheduling a record by dragging its line onto the grid (R21; A47 to A50, A57, A60, A61)
// ---------------------------------------------------------------------------------------------

/** Collects the text bodies of the requests sent from now on; `stop()` puts the sender back. */
function recordRequestBodies() {
    const proto = XMLHttpRequest.prototype;
    const original = proto.send;
    const bodies = [];
    proto.send = function (...args) {
        if (typeof args[0] === "string") {
            bodies.push(args[0]);
        }
        return original.apply(this, args);
    };
    return { bodies, stop: () => (proto.send = original) };
}
const lineOf = (name) =>
    $$(".o_tl_panel_line").find((line) => $(".o_tl_panel_name", line).textContent.trim() === name);
/** The line `name` pressed at its centre, then the pointer moved to each point of `path`. */
const lineHold = (name, path) => holdEvents(centreOf(lineOf(name)), path);
/** Steps from the point `from` to `to` (a straight line in `count` steps). */
function stepsTo(from, to, count = 6) {
    const points = [];
    for (let step = 1; step <= count; step++) {
        const share = step / count;
        points.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
    }
    return points;
}
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const escape = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
/** The point over today's column (`half` 0 or 1) in `row`, `shift` days from today. */
const todayPoint = (row, half = 1, shift = 0) => cellPoint(row, todayIndex() + shift, half);
const textOfBadges = () => $$(".o_tl_selection_badge").map((el) => el.textContent.trim());
const badgeTimeText = (date, hour) => {
    const [year, month, day] = date.split("-").map(Number);
    const moment = new Date(Date.UTC(year, month - 1, day));
    return `${moment.getUTCMonth() + 1}/${moment.getUTCDate()}/${moment.getUTCFullYear()}, ${hour}`;
};
const todayDate = () => $(".o_tl_col.o_tl_is_today").dataset.date;
const nextDate = (date, n = 1) => {
    const moment = new Date(`${date}T00:00:00Z`);
    moment.setUTCDate(moment.getUTCDate() + n);
    return moment.toISOString().slice(0, 10);
};

// H37: "Unscheduled" pressed at its centre and held over the Beta row, today's second half: the
// line follows the pointer, the list keeps its line, the highlight covers one day from 12:00, the
// badges read the two times; the release writes (the test reads it) and the view reloads
tours.add("timeline_002b3_a47_schedule", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const beta = rowOf("Beta");
                const before = lineOf("Unscheduled").getBoundingClientRect();
                const from = centreOf(lineOf("Unscheduled"));
                const to = todayPoint(beta, 1);
                to.x -= 20;
                to.y = beta.getBoundingClientRect().top + beta.getBoundingClientRect().height / 2;
                await realMouse(holdEvents(from, stepsTo(from, to)));
                // M41: the copy keeps the grabbed place, at the line's size
                const ghost = $(".o_tl_panel_ghost");
                assert(ghost, "a copy of the line follows the pointer");
                const rect = ghost.getBoundingClientRect();
                assert(near(rect.left, to.x - 131), `the copy's left ${rect.left}, wanted ${to.x - 131}`);
                assert(near(rect.top, to.y - 14.5), `the copy's top ${rect.top}, wanted ${to.y - 14.5}`);
                assert(rect.width === 262 && rect.height === 29, `the copy is ${rect.width}x${rect.height}`);
                assert(getComputedStyle(ghost).position === "fixed", "the copy is fixed");
                assert(
                    getComputedStyle($(".o_tl_panel_handle", ghost)).color === "rgb(102, 102, 102)",
                    "its handle is dark"
                );
                // M43: the line stays
                const after = lineOf("Unscheduled").getBoundingClientRect();
                assert(after.left === before.left && after.top === before.top, "the line stays");
                // M40: one day from 12:00 over the Beta row
                const drop = $(".o_tl_drop");
                assert(drop, "the target highlight");
                const cell = $$(".o_tl_cell", beta)[todayIndex()].getBoundingClientRect();
                const box = drop.getBoundingClientRect();
                assert(near(box.left, cell.left + cell.width / 2), `highlight left ${box.left}`);
                assert(near(box.width, cell.width), `highlight width ${box.width}`);
                assert(near(box.height, beta.getBoundingClientRect().height), "the row's height");
                // M44, M45
                const date = todayDate();
                const texts = textOfBadges();
                assert(
                    texts[0] === badgeTimeText(date, "12:00 PM") &&
                        texts[1] === badgeTimeText(nextDate(date), "12:00 PM"),
                    `the badges read ${JSON.stringify(texts)}`
                );
                // M46
                assert(
                    getComputedStyle($(".o_timeline_view")).cursor === "move",
                    "the move shape over the view"
                );
                await realMouse(releaseAt(to));
                assert(!$(".o_tl_panel_ghost") && !$(".o_tl_drop"), "ghost and highlight are gone");
                assert(panelTitle() === "Unscheduled: 3", `the title is ${panelTitle()}`);
                assert(!panelNames().includes("Unscheduled"), "the record left the list");
                assert(!$(".o_notification"), "no notification");
                const pill = $$(".o_tl_pill", rowOf("Beta")).find(
                    (el) => el.textContent.trim() === "Unscheduled"
                );
                assert(pill, "the pill stands in the Beta row");
            },
        },
    ],
});

/** Hold "Gamma" over `row` at today's column and release. */
async function scheduleGammaOn(row, half = 1, shift = 0) {
    const from = centreOf(lineOf("Gamma"));
    const to = todayPoint(row, half, shift);
    await realMouse(holdEvents(from, stepsTo(from, to)));
    assert($(".o_tl_drop"), "the highlight shows");
    await realMouse(releaseAt(to));
}

// H36 (no grouping): the first half of the day before today; H41: a Parent group row
tours.add("timeline_002b3_a48_ungrouped_and_group_row", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const group = $$(".o_tl_group_row").find(
                    (row) => $(".o_tl_row_header", row).getAttribute("title") === "Beta"
                );
                if (group) {
                    await scheduleGammaOn(group, 1, 0);
                } else {
                    await scheduleGammaOn(recordRows()[0], 0, -1);
                }
                assert(panelTitle() === "Unscheduled: 3", `the title is ${panelTitle()}`);
            },
        },
    ],
});

// H41: no row below the read-only Created by level takes the record; a Parent row does
tours.add("timeline_002b3_a49_readonly_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const leaf = recordRows()[0];
                assert(leaf, "a Created by row");
                const from = centreOf(lineOf("Unscheduled"));
                const over = todayPoint(leaf, 1);
                await realMouse(holdEvents(from, stepsTo(from, over)));
                assert($(".o_tl_panel_ghost"), "the copy follows");
                assert(!$(".o_tl_drop"), "no highlight over a Created by row");
                assert(!$(".o_tl_selection_badge"), "no badge over a Created by row");
                await realMouse(releaseAt(over));
                assert(panelTitle() === "Unscheduled: 4", "nothing was written");
                // a Parent row shows the highlight
                const group = $$(".o_tl_group_row").find(
                    (row) => $(".o_tl_row_header", row).getAttribute("title") === "Beta"
                );
                const onParent = todayPoint(group, 1);
                await realMouse(holdEvents(from, stepsTo(from, onParent)));
                assert($(".o_tl_drop"), "the highlight over a Parent row");
                await realMouse(releaseAt(onParent));
                assert(panelTitle() === "Unscheduled: 3", `the title is ${panelTitle()}`);
            },
        },
    ],
});

// Escape, the grid's right edge (no scrolling), a release over the control bar: nothing written
tours.add("timeline_002b3_a50_cancel", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const beta = rowOf("Beta");
                const from = centreOf(lineOf("Unscheduled"));
                const over = todayPoint(beta, 1);
                await realMouse(holdEvents(from, stepsTo(from, over)));
                assert($(".o_tl_drop"), "the highlight shows first");
                escape();
                await until(
                    () => !$(".o_tl_panel_ghost") && !$(".o_tl_drop"),
                    "Escape puts the line back"
                );
                await realMouse(releaseAt(over));
                assert(panelTitle() === "Unscheduled: 4", "Escape wrote nothing");
                assert(!$$(".o_tl_pill", beta).some((el) => el.textContent.trim() === "Unscheduled"), "no pill");
                // the right edge of the grid: no scrolling while held
                const grid = renderer().getBoundingClientRect();
                const edge = { x: grid.right - 10, y: beta.getBoundingClientRect().top + 10 };
                const left = renderer().scrollLeft;
                const top = renderer().scrollTop;
                await realMouseLive(holdEvents(from, stepsTo(from, edge)));
                await pause(700);
                assert(renderer().scrollLeft === left && renderer().scrollTop === top, "no edge scrolling");
                // released over the control bar
                const bar = centreOf($(".o_control_panel"));
                await realMouseLive([mouse("mouseMoved", bar.x, bar.y, { buttons: 1 })]);
                assert(!$(".o_tl_drop"), "no highlight over the control bar");
                await realMouse(releaseAt(bar));
                assert(!$(".o_tl_panel_ghost"), "the copy is gone");
                assert(panelTitle() === "Unscheduled: 4", "the release over the bar wrote nothing");
            },
        },
    ],
});

// H40: a cell selected, then a line pressed and moved: the selection is cleared at once
tours.add("timeline_002b3_a57_clears_selection", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                await clickAt(cellPoint(recordRows()[0], todayIndex(), 0));
                await until(() => pickedCount() > 0, "a picked cell");
                assert($(".o_multi_selection_buttons"), "the buttons show");
                const from = centreOf(lineOf("Unscheduled"));
                await realMouse(holdEvents(from, stepsTo(from, { x: from.x - 150, y: from.y + 60 })));
                assert($(".o_tl_panel_ghost"), "the copy follows");
                assert(pickedCount() === 0, "the highlight is cleared");
                assert(!$(".o_multi_selection_buttons"), "the buttons are gone");
                escape();
                await realMouse(releaseAt({ x: from.x - 150, y: from.y + 60 }));
            },
        },
    ],
});

// the date-only view the test made: the record without dates dropped on today
tours.add("timeline_002b3_a60_date_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const row = $(".o_tl_row[data-row-id]");
                const from = centreOf($(".o_tl_panel_line"));
                const to = todayPoint(row, 0);
                await realMouse(holdEvents(from, stepsTo(from, to)));
                const date = todayDate();
                const day = badgeTimeText(date, "").replace(/, $/, "");
                const texts = textOfBadges();
                assert(
                    texts[0] === day && texts[1] === day,
                    `both badges show the day: ${JSON.stringify(texts)}`
                );
                await realMouse(releaseAt(to));
                assert(panelTitle() === "All records are scheduled", `the title is ${panelTitle()}`);
            },
        },
    ],
});

// two drops in one go: the second is sent after the first write returned (the test delays it)
tours.add("timeline_002b3_a61_writes_in_order", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const beta = rowOf("Beta");
                const alpha = rowOf("Alpha");
                const a = centreOf(lineOf("Unscheduled"));
                const b = centreOf(lineOf("Gamma"));
                const onBeta = todayPoint(beta, 1);
                const onAlpha = todayPoint(alpha, 1, 1);
                await realMouseLive([
                    ...holdEvents(a, stepsTo(a, onBeta, 4)),
                    ...releaseAt(onBeta),
                    ...holdEvents(b, stepsTo(b, onAlpha, 4)),
                    ...releaseAt(onAlpha),
                ]);
                await gridSettled();
                await until(() => panelTitle() === "Unscheduled: 2", `the title is ${panelTitle()}`, 15000);
                assert(!panelNames().includes("Gamma"), "Gamma is scheduled too");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// The drop zone and the edge scrolling with the panel (R22, R23; A51, A52, A56)
// ---------------------------------------------------------------------------------------------

/** The pill titled `name` that stands in the grid (not the moved copy). */
const pillNamed = (name) =>
    $$(".o_tl_pill").find(
        (el) => el.textContent.trim() === name && !el.closest(".o_tl_pill_moved")
    );
const zoneEl = () => $(".o_tl_panel_dropzone");
const controlKey = (type) =>
    document.dispatchEvent(
        new KeyboardEvent(type, { key: "Control", ctrlKey: type === "keydown", bubbles: true, cancelable: true })
    );

// H37 with "Unscheduled" scheduled by the test: the pill pressed 40 px left of its centre and
// held over the panel: the list is replaced by the drop zone (M48), the pill keeps its look (M49),
// no highlight and no badge; the release unschedules it, no notification
tours.add("timeline_002b3_a51_drop_zone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const pill = await until(() => pillNamed("Unscheduled"), "the pill Unscheduled");
                const from = centreOf(pill);
                from.x -= 40;
                const panel = $(".o_tl_panel").getBoundingClientRect();
                const to = { x: panel.left + panel.width / 2, y: 420 };
                await realMouse(holdEvents(from, stepsTo(from, to)));
                const zone = zoneEl();
                assert(zone, "the drop zone replaces the list");
                assert(!$(".o_tl_panel_line") && !$(".o_tl_panel_title"), "the list is gone");
                assert(zone.textContent.trim() === "Drop here to remove the dates", "the zone's text");
                const box = zone.getBoundingClientRect();
                assert(near(box.top, panel.top + 16) && near(panel.bottom - box.bottom, 16), "16 px margins");
                assert(box.width === 262, `the zone is ${box.width} wide`);
                assert(!$(".o_tl_drop") && !$(".o_tl_selection_badge"), "no highlight or badge over the zone");
                const moved = $(".o_tl_pill_moved");
                assert(moved && getComputedStyle(moved).opacity === "0.8", "the moved pill keeps its look");
                await realMouse(releaseAt(to));
                await until(() => !zoneEl(), "the zone goes");
                await until(() => panelTitle() === "Unscheduled: 4", `the title is ${panelTitle()}`);
                assert(panelNames().includes("Unscheduled"), "the record is listed again");
                assert(!pillNamed("Unscheduled"), "the pill is gone");
                assert(!$(".o_notification"), "no notification");
            },
        },
    ],
});

// H36: "Review" moved, Ctrl pressed, released over the zone: the original loses its dates, no copy
tours.add("timeline_002b3_a52_copy_on_zone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const pill = await until(() => pillNamed("Review"), "the pill Review");
                const from = centreOf(pill);
                const panel = $(".o_tl_panel").getBoundingClientRect();
                const to = { x: panel.left + panel.width / 2, y: 420 };
                await realMouseLive(holdEvents(from, stepsTo(from, { x: from.x - 40, y: from.y + 10 }, 3)));
                controlKey("keydown");
                await realMouseLive(stepsTo(from, to).map((p) => mouse("mouseMoved", p.x, p.y, { buttons: 1 })));
                await until(zoneEl, "the drop zone");
                assert(!$(".o_tl_drop"), "no highlight over the zone");
                await realMouse(releaseAt(to));
                controlKey("keyup");
                await until(() => panelNames().includes("Review"), "Review is listed");
                assert(!pillNamed("Review"), "the pill is gone, no copy");
                assert(!$(".o_notification"), "no notification");
            },
        },
    ],
});

/** A point 10 px inside the edge of the grid where it can still scroll. */
function edgePoint(y) {
    const grid = renderer();
    const box = grid.getBoundingClientRect();
    const room = grid.scrollWidth - grid.clientWidth;
    assert(room > 0, "the grid is wider than its area");
    const right = grid.scrollLeft + 1 < room;
    const title = $(".o_tl_title_cell");
    const left = title ? title.getBoundingClientRect().right : box.left;
    return { x: right ? box.right - 10 : left + 10, y };
}

// H36 week: a pill move held near the edge does not scroll with the panel open and does with it
// closed; a resize held near the edge scrolls with the panel open
tours.add("timeline_002b3_a56_edge_scroll_with_panel", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                const hold = async (name, handle) => {
                    const pill = await until(() => pillNamed(name), `the pill ${name}`);
                    // the pill in the middle of the grid's area: an earlier hold may have scrolled
                    const area = renderer().getBoundingClientRect();
                    renderer().scrollLeft += centreOf(pill).x - (area.left + area.width / 2);
                    await gridSettled();
                    let from = centreOf(pill);
                    if (handle) {
                        await realMouseLive([mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 })]);
                        const grip = await until(() => $(".o_tl_handle[data-edge='stop']", pill), "the handle");
                        from = centreOf(grip);
                    }
                    const to = edgePoint(from.y);
                    const before = renderer().scrollLeft;
                    await realMouseLive(holdEvents(from, stepsTo(from, to)));
                    await pause(700);
                    const after = renderer().scrollLeft;
                    escape();
                    await realMouseLive(releaseAt(to));
                    await gridSettled();
                    return after - before;
                };
                assert((await hold("Build", false)) === 0, "a move does not scroll with the panel open");
                assert((await hold("Build", true)) !== 0, "a resize scrolls with the panel open");
                panelButton().click();
                await until(() => !$(".o_tl_panel"), "the panel closes");
                await gridSettled();
                assert((await hold("Build", false)) !== 0, "a move scrolls with the panel closed");
            },
        },
    ],
});
