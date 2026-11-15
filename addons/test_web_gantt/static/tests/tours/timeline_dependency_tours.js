// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of slice 002c (dependencies, rescheduling and buffers) in a real browser.
 *
 * A gesture that has to be a real one is not dispatched from here: the tour asks the Python test
 * through `realMouse`, which publishes the list of mouse events on the window; the test sends them
 * with the Chrome DevTools protocol and marks the request as done (see `timeline_real_pointer`).
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
const centreOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
const todayIndex = () => Number($(".o_tl_col.o_tl_is_today").dataset.index);
const rowOf = (title) =>
    $$(".o_tl_row_header")
        .find((el) => el.getAttribute("title") === title)
        .closest(".o_tl_row");

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
/** Steps from the point `from` to `to` (a straight line in `count` steps). */
function stepsTo(from, to, count = 6) {
    const points = [];
    for (let step = 1; step <= count; step++) {
        const share = step / count;
        points.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
    }
    return points;
}

/** A click (press and release without a move). */
async function clickAt({ x, y }) {
    await realMouse([
        mouse("mouseMoved", x, y, { button: "none", buttons: 0 }),
        mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }),
        mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }),
    ]);
}

const lineOf = (name) =>
    $$(".o_tl_panel_line").find((line) => $(".o_tl_panel_name", line).textContent.trim() === name);
const panelTitle = () => $(".o_tl_panel_title")?.textContent.trim();

// ---------------------------------------------------------------------------------------------
// A2, A3: the line of the side panel (R1), on 002b3's H37
// ---------------------------------------------------------------------------------------------

// A click on the empty part right of the name (x 1500) opens the record's dialog "Open"; a press
// there moved onto Beta's row schedules "Unscheduled" as a press on its name does (the test checks
// the dates and restores them); A3: a name longer than the line is cut with an ellipsis (the test
// created that record and removes it)
tours.add("timeline_002c_a2_line_drag_and_open", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                // A3
                const long = $$(".o_tl_panel_name").find((el) =>
                    el.textContent.startsWith("A very long")
                );
                assert(long, "the record with the long name is listed");
                assert(long.scrollWidth > long.clientWidth, "the long name is cut");
                assert(getComputedStyle(long).textOverflow === "ellipsis", "with an ellipsis");
                assert(getComputedStyle(long).cursor === "pointer", "the pointer is the hand");

                // A2: a click on the empty part opens the dialog
                const line = lineOf("Unscheduled");
                const box = line.getBoundingClientRect();
                const name = $(".o_tl_panel_name", line).getBoundingClientRect();
                const empty = { x: 1500, y: box.top + box.height / 2 };
                assert(
                    empty.x > name.right && empty.x < box.right,
                    `x 1500 is the empty part (name ends ${name.right}, line ${box.right})`
                );
                assert(getComputedStyle(line).cursor === "grab", "the line is grabbed");
                await clickAt(empty);
                await until(() => $(".o_dialog .modal-title"), "the record dialog");
                assert($(".o_dialog .modal-title").textContent === "Open", "the dialog is Open");
                await until(
                    () => $(".o_dialog .o_field_widget[name='name'] input")?.value === "Unscheduled",
                    "the dialog shows Unscheduled"
                );
                $(".o_dialog .o_form_button_cancel").click();
                await until(() => !$(".o_dialog"), "the dialog closes");
                await gridSettled();

                // A2: a press on the empty part, moved onto Beta's row, drags the line
                const beta = rowOf("Beta");
                const from = { x: 1500, y: centreOf(lineOf("Unscheduled")).y };
                const rect = beta.getBoundingClientRect();
                const cell = $$(".o_tl_cell", beta)[todayIndex()].getBoundingClientRect();
                const to = { x: cell.left + cell.width * 0.75 - 20, y: rect.top + rect.height / 2 };
                await realMouse(holdEvents(from, stepsTo(from, to)));
                assert($(".o_tl_panel_ghost"), "a copy of the line follows the pointer");
                assert($(".o_tl_drop"), "the target highlight shows");
                await realMouse(releaseAt(to));
                assert(!$(".o_tl_panel_ghost") && !$(".o_tl_drop"), "ghost and highlight are gone");
                assert(!lineOf("Unscheduled"), "the record left the list");
                assert(panelTitle() === "Unscheduled: 4", `the title is ${panelTitle()}`);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A4, A5, A6: the action's own filter in the side panel's list (R2), on H51, H52 and H53
// ---------------------------------------------------------------------------------------------

const panelNames = () => $$(".o_tl_panel_name").map((el) => el.textContent.trim());
const pillTitles = () => $$(".o_tl_pill_title").map((el) => el.textContent.trim());

// H51: the action keeps the records starting after 1 November 2026; the list still shows the four
// records without dates; the grid does not show "Long task", which starts in October
tours.add("timeline_002c_a4_and_date_filter", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 4", `the title is ${panelTitle()}`);
                const names = panelNames();
                for (const name of ["Alpha", "Beta", "Gamma", "Unscheduled"]) {
                    assert(names.includes(name), `${name} is listed (${names})`);
                }
                assert(names.length === 4, `four lines (${names})`);
                const titles = pillTitles();
                assert(titles.includes("Build"), "a dated record the filter keeps is drawn");
                assert(!titles.includes("Long task"), "Long task (October start) is not drawn");
            },
        },
    ],
});

// H52: "starts after 1 November or is named Alpha": the list holds Alpha only
tours.add("timeline_002c_a5_or_date_filter", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 1", `the title is ${panelTitle()}`);
                assert(panelNames().join() === "Alpha", `the list is ${panelNames()}`);
                assert(!pillTitles().includes("Long task"), "Long task is not drawn");
            },
        },
    ],
});

// H53: the negation of "stop is not set": the four records without dates are listed; the grid
// shows the records whose stop is set
tours.add("timeline_002c_a6_negated_date_filter", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_panel_line",
            async run() {
                await gridSettled();
                assert(panelTitle() === "Unscheduled: 4", `the title is ${panelTitle()}`);
                assert(panelNames().length === 4, `four lines (${panelNames()})`);
                const titles = pillTitles();
                assert(titles.includes("Build"), "a record with a stop is drawn");
                assert(titles.includes("Long task"), "Long task (stop set) is drawn");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A8, A9: folded columns in multi-selection mode (R3), on H12 with the multi-creation option and
// two folded days (D+3 and D+4)
// ---------------------------------------------------------------------------------------------

const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const pickedCount = () => $$(".o_tl_cell_picked").length;
const foldedHeader = () => $(".o_tl_col.o_tl_folded");
const recordRows = () => $$(".o_tl_row[data-row-id]");

/** A click (press and release without a move) with the keys held. */
async function clickWith({ x, y }, keys = []) {
    const modifiers = keys.reduce((sum, name) => sum + MODIFIERS[name], 0);
    await realMouse([
        mouse("mouseMoved", x, y, { button: "none", buttons: 0, modifiers }),
        mouse("mousePressed", x, y, { buttons: 1, clickCount: 1, modifiers }),
        mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1, modifiers }),
    ]);
}

/** Bring the element to the middle of the grid, then wait for it to settle. */
async function showElement(element) {
    const grid = renderer().getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    renderer().scrollLeft += rect.left - grid.left - grid.width / 2;
    await gridSettled();
}

tours.add("timeline_002c_a8_folded_headers", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_col.o_tl_folded",
            async run() {
                const rows = recordRows().length;
                const foldable = () => $(".o_tl_col.o_tl_foldable");
                // a plain click on a folded header opens its run and selects nothing
                await showElement(foldedHeader());
                await clickWith(centreOf(foldedHeader()));
                assert(!foldedHeader(), "the run is open");
                assert(pickedCount() === 0, `nothing is selected, got ${pickedCount()}`);
                // an open column that can fold: Ctrl selects it and keeps it open, a plain click
                // folds the run and clears the selection
                await clickWith(centreOf(foldable()), ["ctrl"]);
                assert(!foldedHeader(), "Ctrl keeps the column open");
                assert(pickedCount() === rows * 2, `one column selected, got ${pickedCount()}`);
                await clickWith(centreOf(foldable()));
                assert(foldedHeader(), "a plain click folds the run");
                assert(pickedCount() === 0, "and clears the selection");
                // a folded header with Ctrl opens the run and selects it in every row
                await clickWith(centreOf(foldedHeader()), ["ctrl"]);
                assert(!foldedHeader(), "the run opens");
                assert(pickedCount() > 0 && pickedCount() % rows === 0, "the run is selected");
                await clickWith(centreOf(foldable()));
                assert(foldedHeader() && pickedCount() === 0, "folded again, selection cleared");
                // Shift from the day after the run to the day before: the run is left out
                const headers = $$(".o_tl_col");
                const at = headers.indexOf(foldedHeader());
                await clickWith(centreOf(headers[at + 1]));
                assert(pickedCount() === rows * 2, "the day after the run is selected");
                // Shift on the folded header adds nothing and never unfolds
                await clickWith(centreOf(foldedHeader()), ["shift"]);
                assert(foldedHeader() && pickedCount() === rows * 2, "Shift on a folded header");
                await clickWith(centreOf(headers[at - 1]), ["shift"]);
                assert(foldedHeader(), "Shift never unfolds");
                assert(pickedCount() === rows * 4, `two days selected, got ${pickedCount()}`);
                assert($$(".o_tl_folded_cell.o_tl_cell_picked").length === 0, "none of the run");
            },
        },
    ],
});

tours.add("timeline_002c_a9_folded_cells", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_col.o_tl_folded",
            async run() {
                const rows = recordRows().length;
                const cellOf = (row) => $(".o_tl_folded_cell", row);
                await showElement(foldedHeader());
                // a folded cell of a record row, without and with Ctrl: nothing, still folded
                const row = recordRows()[0];
                await clickWith(centreOf(cellOf(row)));
                assert(foldedHeader() && pickedCount() === 0, "a plain click does nothing");
                await clickWith(centreOf(cellOf(row)), ["ctrl"]);
                assert(foldedHeader() && pickedCount() === 0, "a Ctrl click does nothing");
                // a plain click on a folded cell forgets the anchor: Shift selects one column
                const headers = $$(".o_tl_col");
                const at = headers.indexOf(foldedHeader());
                await clickWith(centreOf(headers[at + 1]));
                await clickWith(centreOf(cellOf(row)));
                await clickWith(centreOf(headers[at - 1]), ["shift"]);
                assert(pickedCount() === rows * 2, `only that column, got ${pickedCount()}`);
                // the folded cell of the total row opens the run
                await clickWith(centreOf(cellOf($(".o_tl_total_row"))));
                assert(!foldedHeader(), "the total row's folded cell opens the run");
            },
        },
    ],
});
