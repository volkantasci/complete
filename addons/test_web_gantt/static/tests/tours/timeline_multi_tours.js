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
