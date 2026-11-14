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

let requests = 0;
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
                const row = recordRows()[0];
                const grid = renderer();
                const today = todayIndex();
                await clickAt(cellPoint(row, today, 0));
                assert(pickedCount() === 0, "a cell click picks nothing on the phone");
                await until(() => $(".o_dialog .modal-title"), "the plan dialog");
                assert($(".o_dialog .modal-title").textContent === "Plan", "002b's plan dialog opens");
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
