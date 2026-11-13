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
