// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of slice 002b2 (drag and resize, and the notes on 002a and 002b) in a real browser. Dates
 * are taken from the browser's today (the header of the column marked as today), so they hold on
 * any day; the Python wrappers check the database with the same day.
 */

const tours = registry.category("web_tour.tours");
const { DateTime } = luxon;

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
const todayIso = () => $(".o_tl_col.o_tl_is_today").dataset.date;

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

// The grid is drawn as soon as the first data has come; the view settles a moment later.
const gridReady = {
    trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today",
    async run() {
        await gridSettled();
    },
};

/** The x of the middle of the visible part of the grid (what the sticky title cell leaves free). */
function visibleMiddle() {
    const box = renderer().getBoundingClientRect();
    const title = $(".o_tl_title_cell");
    const left = title ? Math.max(box.left, title.getBoundingClientRect().right) : box.left;
    return (left + box.left + renderer().clientWidth) / 2;
}

/**
 * The date in the middle of the visible part, read from what is on screen: the column under the
 * middle point and the share of that column to the left of it. A column holds a day in the week
 * and month ranges, an hour in the day range and a month in the year range.
 */
function middleOfScreen() {
    // a pixel of slack, as the view reads it, keeps the rounding of the scroll offset out
    const x = visibleMiddle() + 1;
    const header = $$(".o_tl_col[data-date]").find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left <= x && x < rect.right;
    });
    assert(header, "no column under the middle of the grid");
    const rect = header.getBoundingClientRect();
    return { iso: header.dataset.date, share: (x - rect.left) / rect.width, header };
}

async function switchRange(kind) {
    $(".o_tl_range_button").click();
    const item = await until(() => $(`.o_tl_range_${kind}`), `the ${kind} range item`);
    item.click();
    await gridSettled();
}

async function openNew() {
    $(".o_tl_button_add").click();
    await until(() => $(".o_dialog .o_form_view"), "the Create dialog");
    const dialog = $(".o_dialog");
    const read = async (name) =>
        (
            await until(
                () =>
                    $(
                        `.o_field_widget[name="${name}"] input, .o_field_widget[name="${name}"] button[data-field]`,
                        dialog
                    ),
                `the field ${name}`
            )
        ).value;
    return { dialog, start: await read("date_start"), stop: await read("date_stop") };
}

async function closeNew(dialog) {
    $(".o_form_button_cancel", dialog).click();
    await until(() => !$(".o_dialog"), "the dialog to close");
    await gridSettled();
}

const usDate = (date) => date.toFormat("MM/dd/yyyy");

// ---------------------------------------------------------------------------------------------
// A63: the focus date after a coarser range (R18)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b2_a63_focus_after_range_change", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_button_add",
            async run() {
                const today = DateTime.fromISO(todayIso());
                const sameDay = (iso, what) =>
                    assert(iso === today.toISODate(), `${what}: ${iso}, expected ${today.toISODate()}`);
                for (const kind of ["day", "month", "year", "week"]) {
                    await switchRange(kind);
                    const { iso, share } = middleOfScreen();
                    if (kind === "year") {
                        // inside the column of the current month, at the share of today in it
                        assert(
                            iso === today.startOf("month").toISODate(),
                            `year: the middle is in ${iso}, expected ${today.startOf("month").toISODate()}`
                        );
                        const expected = (today.day - 1) / today.daysInMonth;
                        assert(
                            Math.abs(share - expected) <= 1.5 / today.daysInMonth,
                            `year: the middle is ${share} into the month, expected about ${expected}`
                        );
                        assert(share > 0 || today.day === 1, "year: the middle is at the month start");
                    } else if (kind === "day") {
                        sameDay(iso, "day");
                        // the hour column of 12 AM: the first column of that day, at the middle
                        const all = $$(".o_tl_col[data-date]");
                        const previous = all[all.indexOf(middleOfScreen().header) - 1];
                        assert(
                            previous && previous.dataset.date !== iso,
                            "day: the middle is not at the 12 AM column"
                        );
                    } else {
                        sameDay(iso, kind);
                    }
                }
                // back on the week range: New proposes the week of today (weeks start on Sunday)
                const sunday = today.minus({ days: today.weekday % 7 });
                const { dialog, start, stop } = await openNew();
                assert(start.startsWith(usDate(sunday)), `start ${start}, expected ${usDate(sunday)}`);
                assert(
                    stop.startsWith(usDate(sunday.plus({ days: 7 }))),
                    `stop ${stop}, expected ${usDate(sunday.plus({ days: 7 }))}`
                );
                await closeNew(dialog);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A64: a scroll moves the focus date (R18)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b2_a64_scroll_moves_focus", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_button_add",
            async run() {
                await switchRange("year");
                const before = middleOfScreen();
                const width = before.header.getBoundingClientRect().width;
                renderer().scrollLeft += 200;
                await frame();
                await frame();
                // the date in the middle moved on by what 200 px stand for on the year range
                const after = middleOfScreen();
                // a month column has one width whatever its days: count in columns
                const place = (found) => {
                    const first = DateTime.fromISO(found.iso);
                    return first.year * 12 + first.month - 1 + found.share;
                };
                const moved = place(after) - place(before);
                const expected = 200 / width;
                assert(
                    Math.abs(moved - expected) < 0.05,
                    `the middle moved by ${moved} columns, expected about ${expected}`
                );
                const read = DateTime.fromISO(after.iso)
                    .plus({ days: after.share * DateTime.fromISO(after.iso).daysInMonth })
                    .startOf("day");
                await switchRange("week");
                const now = middleOfScreen();
                assert(
                    now.iso === read.toISODate(),
                    `week: the middle is ${now.iso}, expected ${read.toISODate()}`
                );
                const sunday = read.minus({ days: read.weekday % 7 });
                const { dialog, start, stop } = await openNew();
                assert(start.startsWith(usDate(sunday)), `start ${start}, expected ${usDate(sunday)}`);
                assert(
                    stop.startsWith(usDate(sunday.plus({ days: 7 }))),
                    `stop ${stop}, expected ${usDate(sunday.plus({ days: 7 }))}`
                );
                await closeNew(dialog);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A60: the badges of a right-to-left selection (R19)
// ---------------------------------------------------------------------------------------------

function firePointer(target, type, x, y) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y,
        })
    );
}

tours.add("timeline_002b2_a60_rtl_selection_badges", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_button_add",
            async run() {
                assert(getComputedStyle(renderer()).direction === "rtl", "the view is not right to left");
                // pressed at x 1330 on the bottom part of the first row, moved to x 1030
                const row = $(".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)");
                const y = row.getBoundingClientRect().bottom - 12;
                const from = { x: 1330, y };
                firePointer(document.elementFromPoint(from.x, from.y), "pointerdown", from.x, from.y);
                for (let i = 1; i <= 6; i++) {
                    firePointer(document, "pointermove", from.x - (300 * i) / 6, y);
                    await frame();
                }
                await until(() => $(".o_tl_selection"), "the highlight");
                await frame();
                const near = (a, b, what) =>
                    assert(Math.abs(a - b) <= 1, `${what}: ${a}, expected about ${b}`);
                const box = $(".o_tl_selection").getBoundingClientRect();
                const start = $(".o_tl_badge_start").getBoundingClientRect();
                const stop = $(".o_tl_badge_stop").getBoundingClientRect();
                // M53: the highlight
                near(box.left, 992, "highlight x");
                near(box.width, 384, "highlight width");
                near(box.top, 207, "highlight y");
                near(box.height, 166, "highlight height");
                // M55: the start badge below the right end
                near(start.right, 1376, "start badge right edge");
                near(start.top, 373, "start badge y");
                // M57: the stop badge 20 px above the left end
                near(stop.left, 992, "stop badge x");
                near(stop.top, 187, "stop badge y");
                assert(start.top > box.bottom - 1 && stop.bottom < box.top + 1, "the badges did not swap");
                firePointer(document, "pointerup", 1030, y);
                await until(() => $(".o_dialog .o_form_view"), "the Create dialog");
                $(".o_dialog .o_form_button_cancel").click();
                await until(() => !$(".o_dialog"), "the dialog to close");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A65: the speed of the edge scroll of a selection (R20)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b2_a65_selection_edge_speed", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_button_add",
            async run() {
                const area = renderer();
                // the whole grid lies to the right: a second at 833 px needs room to scroll
                area.scrollLeft = 0;
                await frame();
                const box = area.getBoundingClientRect();
                const right = box.left + area.clientWidth;
                const room = area.scrollWidth - area.clientWidth - area.scrollLeft;
                assert(room > 1200, `the grid has only ${room} px to scroll to the right`);
                const row = $(".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)");
                const y = row.getBoundingClientRect().bottom - 12;
                const x0 = visibleMiddle();
                firePointer(document.elementFromPoint(x0, y), "pointerdown", x0, y);
                // a first move far from both edges starts the selection
                firePointer(document, "pointermove", x0 + 40, y);
                await until(() => $(".o_tl_selection"), "the highlight");
                const before = area.scrollLeft;
                // 100 px from the right edge: about 833 px per second
                firePointer(document, "pointermove", right - 100, y);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const moved = area.scrollLeft - before;
                assert(moved > 700 && moved < 1000, `the grid scrolled ${moved} px in a second, expected about 833`);
                // the highlight grew with the scroll
                assert(
                    $(".o_tl_selection").getBoundingClientRect().width > 600,
                    "the highlight did not follow the scroll"
                );
                // Escape cancels the selection, then the release ends the gesture
                document.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
                );
                firePointer(document, "pointerup", right - 100, y);
                await until(() => !$(".o_tl_selection"), "the highlight to go");
            },
        },
    ],
});

// A68: which clicks start the click lock (R23)
const rowOf = (name) =>
    $$(".o_tl_row").find((row) => $(".o_tl_row_label", row)?.textContent === name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cellOf = (name) => {
    const cells = $$(".o_tl_cell[data-column]", rowOf(name));
    return cells[Math.min(cells.length - 1, 3)];
};

tours.add("timeline_002b2_a68_click_lock", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_group_row",
            async run() {
                assert(rowOf("Gamma"), "no Gamma group row");
                $(".o_tl_cell", rowOf("Gamma")).click();
                await until(() => rowOf("Gamma").classList.contains("o_tl_collapsed"), "Gamma to close");
                await sleep(300);
                const target = cellOf("Undefined Contact");
                target.click();
                await until(
                    () => $(".o_dialog .modal-body"),
                    "the plan dialog 0.3 s after a group row click"
                );
                $(".o_dialog .btn-close").click();
                await until(() => !$(".o_dialog"), "the dialog to close");
            },
        },
    ],
});
