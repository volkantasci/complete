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

// ---------------------------------------------------------------------------------------------
// Arrows (R4 to R10, R13): A11, A13 to A15, A17, A20 to A22, A24, A25, A75, A76
// ---------------------------------------------------------------------------------------------

const pillNamed = (name) =>
    $$(".o_tl_pill").find(
        (pill) =>
            !pill.closest(".o_tl_pill_moved") &&
            $(".o_tl_pill_title", pill)?.textContent.trim() === name
    );
const arrows = () => $$(".o_tl_arrow");
const litArrows = () => $$(".o_tl_arrow.o_tl_arrow_lit");
const buttons = (root = document) => $$(".o_tl_arrow_remove", root);
const idOf = (name) => pillNamed(name).dataset.pillId;
/** The layer of the arrow from the pill `source` to the pill `target` (the first row holding both). */
const arrowBetween = (source, target) =>
    arrows().find(
        (arrow) =>
            arrow.dataset.arrow.includes(`|${idOf(source)}>`) &&
            arrow.dataset.arrow.endsWith(`|${idOf(target)}`)
    );
const lineOfArrow = (arrow) => $(".o_tl_arrow_line", arrow);
const strokeOf = (arrow) => getComputedStyle(lineOfArrow(arrow)).stroke;
/** A point of the line of `arrow` (a fraction of its length), in the page's coordinates. */
function pointOnArrow(arrow, fraction) {
    const line = lineOfArrow(arrow);
    const at = line.getPointAtLength(line.getTotalLength() * fraction);
    const box = arrow.getBoundingClientRect();
    return { x: box.left + at.x, y: box.top + at.y };
}
const insidePill = ({ x, y }, pill) => {
    const rect = pill.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};
/** A point of the line that lies inside no pill (`only`: inside this pill and no other). */
function freePointOn(arrow, { inside = null } = {}) {
    for (let fraction = 0.02; fraction < 1; fraction += 0.01) {
        const point = pointOnArrow(arrow, fraction);
        const pills = $$(".o_tl_pill[data-pill-id]").filter((pill) => insidePill(point, pill));
        if (inside ? pills.length === 1 && pills[0] === inside : pills.length === 0) {
            return point;
        }
    }
    throw new Error("no point of the line");
}
const moveTo = ({ x, y }) =>
    realMouse([mouse("mouseMoved", x, y, { button: "none", buttons: 0 })]);
const pointerAway = () => moveTo({ x: 2, y: 2 });
/** The right part of a pill (the pointer of A21 rests at 65 % of Build's width). */
const rightPartOf = (name) => {
    const rect = pillNamed(name).getBoundingClientRect();
    return { x: rect.left + rect.width * 0.65, y: rect.top + rect.height / 2 };
};
const kindsOfArrows = () =>
    arrows()
        .map((arrow) => ["none", "warning", "error"].find((k) => arrow.classList.contains(`o_tl_arrow_${k}`)))
        .sort()
        .join();

// A11, A18: three arrows on H42, one in each colour at rest
tours.add("timeline_002c_a11_arrows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await pointerAway();
                assert(arrows().length === 3, `three arrows, got ${arrows().length}`);
                assert(arrowBetween("Design", "Build"), "Design to Build");
                assert(arrowBetween("Build", "Test"), "Build to Test");
                assert(arrowBetween("Review", "Overlap A"), "Review to Overlap A");
                assert(strokeOf(arrowBetween("Design", "Build")) === "rgba(143, 143, 143, 0.5)", "grey");
                assert(strokeOf(arrowBetween("Build", "Test")) === "rgba(236, 151, 31, 0.5)", "orange");
                assert(strokeOf(arrowBetween("Review", "Overlap A")) === "rgba(211, 65, 59, 0.5)", "red");
                assert(litArrows().length === 0, "none is lit at rest");
                assert(buttons().length === 0, "no button at rest");
            },
        },
    ],
});

// A11: no dependency field (H1): no arrow, no layer
tours.add("timeline_002c_a11_no_dependency_field", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                await gridSettled();
                assert(arrows().length === 0 && !$(".o_tl_arrows"), "H1 draws no arrow");
            },
        },
    ],
});

// A11: no arrow on a phone (390 x 844)
tours.add("timeline_002c_a11_phone", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_pill" },
        {
            trigger: ".o_tl_pill",
            async run() {
                await gridSettled();
                assert(arrows().length === 0, "no arrow on a phone");
            },
        },
    ],
});

// A13: the next range keeps no arrow whose end is not loaded
tours.add("timeline_002c_a13_next_range", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                $(".o_tl_next").click();
                await gridSettled();
                for (const arrow of arrows()) {
                    const [source, target] = arrow.dataset.arrow.split(">").map((end) => end.split("|").pop());
                    assert(
                        $(`.o_tl_pill[data-pill-id="${source}"]`) && $(`.o_tl_pill[data-pill-id="${target}"]`),
                        `the arrow ${arrow.dataset.arrow} has both its pills`
                    );
                }
                if (!pillNamed("Build")) {
                    assert(pillNamed("Test"), "Test is shown");
                    assert(arrows().every((a) => !a.dataset.arrow.includes(`|${idOf("Test")}`)), "none for Test");
                }
                $(".o_tl_previous").click();
                await gridSettled();
                assert(arrows().length === 3, `three arrows again, got ${arrows().length}`);
            },
        },
    ],
});

// A15: scrolled 600 px towards earlier dates, "Test" lies beyond the right edge: the arrow is still
// drawn, and scrolling back shows it entering "Test"
tours.add("timeline_002c_a15_arrow_out_of_view", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                const before = lineOfArrow(arrowBetween("Build", "Test")).getAttribute("d");
                const scroll = renderer().scrollLeft;
                renderer().scrollLeft = scroll - 600;
                await gridSettled();
                const box = renderer().getBoundingClientRect();
                assert(pillNamed("Test").getBoundingClientRect().left > box.right, "Test is out of view");
                const arrow = arrowBetween("Build", "Test");
                assert(arrow, "the arrow Build to Test is still drawn");
                assert(lineOfArrow(arrow).getAttribute("d") === before, "the same route");
                assert(arrow.getBoundingClientRect().width > 0, "the layer has its size");
                renderer().scrollLeft = scroll;
                await gridSettled();
                const end = pointOnArrow(arrow, 1);
                const test = pillNamed("Test").getBoundingClientRect();
                assert(Math.abs(end.x - test.left) <= 1.5, `it enters Test (${end.x} vs ${test.left})`);
            },
        },
    ],
});

// A17: for the right-to-left user each arrow leaves its source's left edge and enters its
// target's right edge
tours.add("timeline_002c_a17_rtl_arrows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await pointerAway();
                assert(arrows().length === 3, `three arrows, got ${arrows().length}`);
                for (const [source, target] of [
                    ["Design", "Build"],
                    ["Build", "Test"],
                    ["Review", "Overlap A"],
                ]) {
                    const arrow = arrowBetween(source, target);
                    const from = pointOnArrow(arrow, 0);
                    const to = pointOnArrow(arrow, 1);
                    const a = pillNamed(source).getBoundingClientRect();
                    const b = pillNamed(target).getBoundingClientRect();
                    assert(Math.abs(from.x - a.left) <= 1.5, `${source} leaves its left edge (${from.x} vs ${a.left})`);
                    assert(Math.abs(to.x - b.right) <= 1.5, `${target} is entered at its right edge (${to.x} vs ${b.right})`);
                }
            },
        },
    ],
});

// A20: a click on "Review" where the orange line passes behind it opens Review's popover
tours.add("timeline_002c_a20_arrows_under_pills", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await pointerAway();
                const review = pillNamed("Review");
                const arrow = arrowBetween("Build", "Test");
                const point = freePointOn(arrow, { inside: review });
                assert(
                    getComputedStyle(arrow).zIndex === "2" &&
                        getComputedStyle(pillNamed("Build")).zIndex === "10",
                    "the layer is under the pills"
                );
                assert(
                    document.elementFromPoint(point.x, point.y).closest(".o_tl_pill") === review,
                    "the pill is on top at that point"
                );
                await clickAt(point);
                await until(() => $(".o_tl_popover"), "Review's popover");
                assert(
                    $(".o_tl_popover").textContent.includes("Review"),
                    "the popover is Review's"
                );
            },
        },
    ],
});

// A21: the pointer on "Build" lights its two arrows with a button each
tours.add("timeline_002c_a21_pointer_over_a_pill", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await moveTo(rightPartOf("Build"));
                assert(litArrows().length === 2, `two lit arrows, got ${litArrows().length}`);
                assert(arrowBetween("Design", "Build").classList.contains("o_tl_arrow_lit"), "Design to Build");
                assert(arrowBetween("Build", "Test").classList.contains("o_tl_arrow_lit"), "Build to Test");
                assert(!arrowBetween("Review", "Overlap A").classList.contains("o_tl_arrow_lit"), "Review stays");
                assert(strokeOf(arrowBetween("Build", "Test")).startsWith("rgb"), "a colour");
                assert(
                    ["rgb(236, 151, 31)", "rgba(236, 151, 31, 1)"].includes(strokeOf(arrowBetween("Build", "Test"))),
                    "full opacity"
                );
                assert(getComputedStyle(arrowBetween("Build", "Test")).zIndex === "20", "over the pills");
                assert(buttons().length === 2, `two buttons, got ${buttons().length}`);
                // the buttons stand in the middle of the anchors: at Design's joint with Build, and
                // half way from Build's end to Test's start
                const build = pillNamed("Build").getBoundingClientRect();
                const test = pillNamed("Test").getBoundingClientRect();
                const middle = buttons(arrowBetween("Build", "Test"))[0].getBoundingClientRect();
                assert(
                    Math.abs(middle.left + middle.width / 2 - (build.right + test.left) / 2) <= 1,
                    "the button of Build to Test is in the middle"
                );
                await pointerAway();
                assert(litArrows().length === 0 && buttons().length === 0, "back to rest");
            },
        },
    ],
});

// A22: the pointer on the red line outside every pill lights that arrow only
tours.add("timeline_002c_a22_pointer_over_an_arrow", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                const arrow = arrowBetween("Review", "Overlap A");
                await moveTo(freePointOn(arrow));
                assert(litArrows().length === 1 && litArrows()[0] === arrow, "only that arrow is lit");
                assert(buttons().length === 1, "with its button");
                await pointerAway();
                assert(litArrows().length === 0, "back to rest");
            },
        },
    ],
});

// A24: the remove button writes once and the arrow goes (the test restores the link)
tours.add("timeline_002c_a24_remove_dependency", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await moveTo(rightPartOf("Build"));
                const button = buttons(arrowBetween("Build", "Test"))[0];
                assert(button, "the button of Build to Test");
                await clickAt(centreOf(button));
                await until(() => arrows().length === 2, "the arrow to go");
                await gridSettled();
                assert(!arrowBetween("Build", "Test"), "Build to Test is gone");
                assert(!$(".o_notification"), "no notification");
            },
        },
    ],
});

// A25: the restricted user on H42 (edit off): the arrows light, no button, no handle
tours.add("timeline_002c_a25_read_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await moveTo(rightPartOf("Build"));
                assert(litArrows().length === 2, `two lit arrows, got ${litArrows().length}`);
                assert(buttons().length === 0, "no remove button");
                assert($$(".o_tl_handle").length === 0, "no handle");
            },
        },
    ],
});

// A25: on H54 (edit set to yes) the restricted user gets the button; the write is refused with the
// access error, the dependency stays and the arrow is drawn again after the reload
tours.add("timeline_002c_a25_refused_removal", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await moveTo(rightPartOf("Build"));
                assert($$(".o_tl_handle").length === 2, "the handles show");
                const button = buttons(arrowBetween("Build", "Test"))[0];
                assert(button, "the button shows");
                await clickAt({ x: centreOf(button).x, y: centreOf(button).y });
                await until(() => $(".o_error_dialog"), "the access error");
                $(".o_error_dialog .btn-close, .o_error_dialog .modal-header .btn-close, .o_error_dialog button")?.click();
                await until(() => !$(".o_error_dialog"), "the error to close");
                await gridSettled();
                await pointerAway();
                assert(arrows().length === 3 && arrowBetween("Build", "Test"), "the arrow is drawn again");
            },
        },
    ],
});

// A75: from "Build" onto "Review" on the lit orange line: both stay lit
// A76: a click there opens no popover
tours.add("timeline_002c_a75_a76_lit_arrow_over_a_pill", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                await moveTo(rightPartOf("Build"));
                const arrow = arrowBetween("Build", "Test");
                const point = freePointOn(arrow, { inside: pillNamed("Review") });
                await moveTo(point);
                assert(arrow.classList.contains("o_tl_arrow_lit"), "the orange arrow stays lit");
                assert(
                    arrowBetween("Review", "Overlap A").classList.contains("o_tl_arrow_lit"),
                    "Review's own arrow is lit"
                );
                assert(buttons(arrowBetween("Review", "Overlap A")).length === 1, "with its button");
                assert(
                    document.elementFromPoint(point.x, point.y).closest(".o_tl_arrow") === arrow,
                    "the lit band is over the pill"
                );
                await clickAt(point);
                await new Promise((resolve) => setTimeout(resolve, 700));
                assert(!$(".o_tl_popover"), "no popover opened");
                assert(!$(".o_dialog"), "no dialog opened");
            },
        },
    ],
});

// A14: H43 (by tags) draws Design to two Builds and each Build to Test (four arrows), and the
// arrow Review to Overlap A inside the row of no tag
tours.add("timeline_002c_a14_records_in_several_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_arrow",
            async run() {
                await gridSettled();
                const names = (key) =>
                    key.split(">").map((end) => {
                        const id = end.split("|").pop();
                        const pill = $(`.o_tl_pill[data-pill-id="${id}"]`);
                        return `${$(".o_tl_pill_title", pill)?.textContent.trim()} in ${end.slice(0, end.lastIndexOf("|"))}`;
                    });
                // the four of A14, and Review to Overlap A (both in the row "Undefined Tags": R5 a)
                assert(
                    arrows().length === 5,
                    `five arrows, got ${arrows().length}: ${arrows().map((a) => names(a.dataset.arrow).join(" to ")).join("; ")}`
                );
                const ids = {};
                for (const name of ["Design", "Build", "Test"]) {
                    ids[name] = idOf(name);
                }
                const between = (source, target) =>
                    arrows().filter(
                        (a) =>
                            a.dataset.arrow.includes(`|${ids[source]}>`) &&
                            a.dataset.arrow.endsWith(`|${ids[target]}`)
                    ).length;
                assert(between("Design", "Build") === 2, "Design has two arrows to Build");
                assert(between("Build", "Test") === 2, "each Build has an arrow to Test");
            },
        },
    ],
});
