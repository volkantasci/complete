// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { rpc } from "@web/core/network/rpc";
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

/** A number with Arabic-Indic digits. */
function indic(value) {
    return String(value).replace(/[0-9]/g, (digit) => String.fromCharCode(0x660 + Number(digit)));
}

/**
 * R19: the date part of a badge for the Arabic user: day, right-to-left mark, slash, month, mark,
 * slash, year, all in Arabic-Indic digits.
 */
function arabicDate(iso) {
    const { day, month, year } = DateTime.fromISO(iso);
    return `${indic(day)}\u200f/${indic(month)}\u200f/${indic(year)}`;
}

/**
 * R19: the text of a badge `hours` after 00:00 on `iso`: the date, an Arabic comma, a space, the
 * 12-hour time with a colon, a space and the morning marker (sad) or the evening marker (meem).
 * Monday 9 November 2026 at 00:00 reads
 * \u0669\u200f/\u0661\u0661\u200f/\u0662\u0660\u0662\u0666\u060c \u0661\u0662:\u0660\u0660 \u0635.
 */
function arabicDateTime(iso, hours = 0) {
    const moment = DateTime.fromISO(iso).plus({ hours });
    const marker = moment.hour < 12 ? "\u0635" : "\u0645";
    const clock = `${indic(moment.hour % 12 || 12)}:${indic(String(moment.minute).padStart(2, "0"))}`;
    return `${arabicDate(moment.toISODate())}\u060c ${clock} ${marker}`;
}

/** The ISO date of the column under a point of the grid. */
function dateAtPoint(x, y) {
    const cell = document.elementFromPoint(x, y).closest("[data-column]");
    return $(`.o_tl_col[data-index="${cell.dataset.column}"]`).dataset.date;
}

/** Date and half (0: first, on the right in this direction; 1: second) under a point of the grid. */
function halfAtPoint(x, y) {
    const box = document.elementFromPoint(x, y).closest("[data-column]").getBoundingClientRect();
    return { date: dateAtPoint(x, y), half: x > (box.left + box.right) / 2 ? 0 : 1 };
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
                // the day pressed (its first half) and the day where it is released (its second half)
                const first = dateAtPoint(from.x, y);
                const last = dateAtPoint(1030, y);
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
                // R19: day, mark, slash, month, mark, slash, year, Arabic comma, 12-hour time, sad
                const [startText, stopText] = badgesNow();
                const wantedStart = arabicDateTime(first);
                const wantedStop = arabicDateTime(last, 24);
                assert(startText === wantedStart, `start badge '${startText}', expected '${wantedStart}'`);
                assert(stopText === wantedStop, `stop badge '${stopText}', expected '${wantedStop}'`);
                firePointer(document, "pointerup", 1030, y);
                await until(() => $(".o_dialog .o_form_view"), "the Create dialog");
                $(".o_dialog .o_form_button_cancel").click();
                await until(() => !$(".o_dialog"), "the dialog to close");
            },
        },
    ],
});

tours.add("timeline_002b2_a61_rtl_selection_badges_phone", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today",
            async run() {
                await gridSettled();
                assert(getComputedStyle(renderer()).direction === "rtl", "the view is not right to left");
                // a finger held 800 ms at x 230 on the empty bottom part, along y 412 in four steps
                // with a pause of 120 ms after each, then held 700 ms
                const y = 412;
                // the half-day pressed (the selection starts at its start) and the half-day where
                // the finger ends (the selection stops at its end)
                const pressed = halfAtPoint(230, y);
                const ended = halfAtPoint(160, y);
                const target = document.elementFromPoint(230, y);
                pointer("pointerdown", 230, y, { target, pointerType: "touch" });
                await sleep(800);
                for (const x of [215, 195, 175, 160]) {
                    pointer("pointermove", x, y, { pointerType: "touch" });
                    await sleep(120);
                }
                await sleep(700);
                await until(() => $(".o_tl_selection"), "the highlight");
                const near = (a, b, what) =>
                    assert(Math.abs(a - b) <= 1, `${what}: ${a}, expected about ${b}`);
                const box = $(".o_tl_selection").getBoundingClientRect();
                const start = $(".o_tl_badge_start").getBoundingClientRect();
                const stop = $(".o_tl_badge_stop").getBoundingClientRect();
                // M54, M56 and M58
                near(box.left, 99, "highlight x");
                near(box.right, 291, "highlight right edge");
                near(start.right, 291, "start badge right edge");
                near(start.top, 425, "start badge y");
                near(stop.left, 99, "stop badge x");
                near(stop.top, 239, "stop badge y");
                near(start.height, 20, "start badge height");
                near(stop.height, 20, "stop badge height");
                const [startText, stopText] = badgesNow();
                const wantedStart = arabicDateTime(pressed.date, 12 * pressed.half);
                const wantedStop = arabicDateTime(ended.date, 12 * (ended.half + 1));
                assert(startText === wantedStart, `start badge '${startText}', expected '${wantedStart}'`);
                assert(stopText === wantedStop, `stop badge '${stopText}', expected '${wantedStop}'`);
                pointer("pointerup", 160, y, { pointerType: "touch" });
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

// A66 and A69: the record dialog of H1 and of H28 (R21, R24)
const buttonOf = (root, text) =>
    $$("button", root).find((button) => button.textContent.trim() === text);
const dialogTitled = (title) =>
    $$(".o_dialog").find((dialog) => $(".modal-title", dialog)?.textContent.trim() === title);
const pillNamed = (name) =>
    $$(".o_tl_pill").find((pill) => $(".o_tl_pill_title", pill).textContent.trim() === name);

function doubleClick(element) {
    const rect = element.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    const fire = (type) =>
        element.dispatchEvent(
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
    for (const detail of [1, 2]) {
        fire("pointerdown");
        fire("pointerup");
        element.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail })
        );
    }
    element.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 2 })
    );
}

/**
 * Log the requests the page sends; while `network.down` is true they fail the way a lost
 * connection does (the request's error event, which the Community turns into a connection-lost
 * error), without reaching the server.
 */
function watchNetwork() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    const network = { down: false, hold: false, holdUndo: false, held: [], log: [] };
    // send the requests held so far (later ones stay held while `hold` / `holdUndo` is on)
    network.release = () => network.held.splice(0).forEach((send) => send());
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__url = String(url);
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (payload) {
        const heldKind =
            (network.hold && /\/write$/.test(this.__url)) ||
            (network.holdUndo && /\/gantt_undo_drag_drop$/.test(this.__url));
        if (heldKind && !this.__late) {
            // a held server: the write (or the undo) waits until the tour releases it
            this.__late = true;
            network.held.push(() => XMLHttpRequest.prototype.send.call(this, payload));
            return;
        }
        network.log.push({ url: this.__url, body: typeof payload === "string" ? payload : "" });
        if (network.down) {
            setTimeout(() => {
                this.dispatchEvent(new ProgressEvent("error"));
                this.dispatchEvent(new ProgressEvent("loadend"));
            }, 0);
            return;
        }
        return send.call(this, payload);
    };
    network.stop = () => {
        XMLHttpRequest.prototype.open = open;
        XMLHttpRequest.prototype.send = send;
    };
    return network;
}

const unlinksOf = (network) => network.log.filter((entry) => entry.url.endsWith("/unlink"));
const writesOf = (network) => network.log.filter((entry) => /web_save|\/write/.test(entry.url));

tours.add("timeline_002b2_a66_delete_offline", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                doubleClick(await until(() => pillNamed("Build"), "Build"));
                const dialog = await until(() => dialogTitled("Open"), "the record dialog");
                const remove = await until(() => buttonOf(dialog, "Remove"), "Remove");
                const network = watchNetwork();
                try {
                    remove.click();
                    const confirm = await until(
                        () => $$(".o_dialog").find((item) => buttonOf(item, "Delete")),
                        "the confirmation"
                    );
                    network.down = true;
                    buttonOf(confirm, "Delete").click();
                    await until(() => $(".o_offline_systray"), "the offline indicator");
                    await until(() => $$(".o_dialog").length === 1, "the confirmation to close");
                    const open = dialogTitled("Open");
                    assert(open, "the record dialog is gone");
                    // (the Community keeps its own default footer button hidden and enabled)
                    const buttons = $$(".modal-footer button", open).filter(
                        (button) => button.getClientRects().length
                    );
                    assert(buttons.length, "the record dialog has no buttons");
                    for (const button of buttons) {
                        assert(
                            button.disabled,
                            `button "${button.textContent.trim()}" is enabled while offline`
                        );
                    }
                    // the plain deletion of the model, sent once and never queued
                    const unlinks = unlinksOf(network);
                    assert(unlinks.length === 1, `${unlinks.length} unlink calls`);
                    assert(
                        unlinks[0].url.includes("/web/dataset/call_kw/test.web.gantt.pill/unlink"),
                        `the deletion went to ${unlinks[0].url}`
                    );
                    assert(!writesOf(network).length, "a write was sent");
                    // the connection comes back
                    network.down = false;
                    const backOnline = new Event("online");
                    window.dispatchEvent(backOnline);
                    await until(() => !$(".o_offline_systray"), "the offline indicator to go");
                    await until(
                        () =>
                            $$(".modal-footer button", dialogTitled("Open"))
                                .filter((b) => b.getClientRects().length)
                                .every((b) => !b.disabled),
                        "the buttons to be enabled again"
                    );
                    assert(buttonOf(dialogTitled("Open"), "Remove"), "Remove is gone");
                    await sleep(2500);
                    assert(unlinksOf(network).length === 1, "a deletion was sent again");
                    buttonOf(dialogTitled("Open"), "Discard").click();
                    await until(() => !$(".o_dialog"), "the dialog to close");
                    await gridSettled();
                    assert(pillNamed("Build"), "Build is gone from the view");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a69_read_only_button", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const network = watchNetwork();
                try {
                    doubleClick(await until(() => pillNamed("Build"), "Build"));
                    const dialog = await until(() => dialogTitled("Open"), "the record dialog");
                    await until(() => $(".o_form_view .o_field_widget", dialog), "the form");
                    await gridSettled();
                    const visible = $$(".modal-footer button", dialog).filter(
                        (button) => button.getClientRects().length
                    );
                    const labels = visible.map((button) => button.textContent.trim());
                    assert(
                        visible.length === 1 && labels[0] === "Save",
                        `the visible buttons are: ${labels.join(", ")}`
                    );
                    assert(visible[0].classList.contains("btn-primary"), "Save is not primary");
                    network.log.length = 0;
                    visible[0].click();
                    await until(() => !$(".o_dialog"), "the dialog to close");
                    await gridSettled();
                    assert(!writesOf(network).length, "a write was sent");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Moving and copying a pill: A1, A3, A4, A17, A21, A22, A24, A38, A41, A43, A44, A45, A57
// ---------------------------------------------------------------------------------------------

const PILL_MODEL = "test.web.gantt.pill";
const addDays = (iso, days) => DateTime.fromISO(iso).plus({ days }).toISODate();
const usBadge = (iso, clock) => {
    const date = DateTime.fromISO(iso);
    return `${date.month}/${date.day}/${date.year}, ${clock}`;
};

async function recordNamed(name) {
    const rows = await rpc(`/web/dataset/call_kw/${PILL_MODEL}/search_read`, {
        model: PILL_MODEL,
        method: "search_read",
        args: [[["name", "=", name]], ["name", "date_start", "date_stop", "parent_id"]],
        kwargs: {},
    });
    return rows[0];
}

const countNamed = async (name) =>
    rpc(`/web/dataset/call_kw/${PILL_MODEL}/search_count`, {
        model: PILL_MODEL,
        method: "search_count",
        args: [[["name", "=", name]]],
        kwargs: {},
    });

function pointer(type, x, y, { target = document, pointerType = "mouse", ctrl = false } = {}) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType,
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            ctrlKey: ctrl,
            clientX: x,
            clientY: y,
        })
    );
}

function key(type, name) {
    document.dispatchEvent(
        new KeyboardEvent(type, {
            key: name,
            ctrlKey: type === "keydown" && name === "Control",
            bubbles: true,
            cancelable: true,
        })
    );
}

const centreOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
const partWidthOf = () => {
    const cell = $$(".o_tl_cell[data-column]")[0];
    return cell.getBoundingClientRect().width / 2;
};
const rowNamed = (name) =>
    $$(".o_tl_row:not(.o_tl_total_row)").find(
        (row) => $(".o_tl_row_label", row)?.textContent.trim() === name
    );
const middleOfRow = (name) => {
    const rect = rowNamed(name).getBoundingClientRect();
    return rect.top + rect.height / 2;
};
const noticeButton = (text) =>
    $$(".o_notification button").find((button) => button.textContent.trim() === text);
const noticeText = () => $(".o_notification .o_notification_content")?.textContent.trim();

/** Press the pill `name`, hold it when touch, and move it to (x, y) in `steps` moves. */
async function holdAndMove(
    name,
    { to, pointerType = "mouse", ctrl = false, steps = 6, hold = 0, stepPx = 0, finalHold = 0 }
) {
    const pill = await until(() => pillNamed(name), `the pill ${name}`);
    const from = centreOf(pill);
    pointer("pointerdown", from.x, from.y, { target: pill, pointerType, ctrl });
    if (hold) {
        await sleep(hold);
    }
    const end = { x: to.x ?? from.x, y: to.y ?? from.y };
    if (stepPx) {
        // steps of stepPx pixels along x (the last one takes what is left), each followed by a pause
        const sign = end.x >= from.x ? 1 : -1;
        const total = Math.abs(end.x - from.x);
        for (let travelled = 0; travelled < total - 1e-6; ) {
            travelled = Math.min(travelled + stepPx, total);
            pointer("pointermove", from.x + sign * travelled, from.y, { pointerType, ctrl });
            await (pointerType === "touch" ? sleep(120) : frame());
        }
    } else {
        for (let i = 1; i <= steps; i++) {
            const x = from.x + ((end.x - from.x) * i) / steps;
            const y = from.y + ((end.y - from.y) * i) / steps;
            pointer("pointermove", x, y, { pointerType, ctrl });
            await (pointerType === "touch" ? sleep(120) : frame());
        }
    }
    if (finalHold) {
        await sleep(finalHold);
    }
    await frame();
    return { from, end, pointerType, ctrl };
}

function release(gesture) {
    pointer("pointerup", gesture.end.x, gesture.end.y, {
        pointerType: gesture.pointerType,
        ctrl: gesture.ctrl,
    });
}

/** Move "Review" one day later and release; the notification of the accepted write follows. */
async function moveReviewOneDay() {
    const pill = await until(() => pillNamed("Review"), "Review");
    const from = centreOf(pill);
    const gesture = await holdAndMove("Review", { to: { x: from.x + 2 * partWidthOf() } });
    release(gesture);
    await until(() => noticeText(), "the notification");
    await gridSettled();
}

const reviewAt = (record, iso, start = "13:00:00", stop = "17:00:00") =>
    record.date_start === `${iso} ${start}` && record.date_stop === `${iso} ${stop}`;

tours.add("timeline_002b2_a1_move_one_day", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const tomorrow = addDays(today, 1);
                const pill = await until(() => pillNamed("Review"), "Review");
                const origin = pill.getBoundingClientRect();
                const gesture = await holdAndMove("Review", {
                    to: { x: centreOf(pill).x + 2 * partWidthOf() },
                });
                const moved = $(".o_tl_pill_moved");
                assert(moved, "no moved pill");
                assert(getComputedStyle(moved).opacity === "0.8", "the moved pill is not at 80 %");
                assert(
                    Math.abs(moved.getBoundingClientRect().left + 1 - origin.left - 2 * partWidthOf()) <= 1,
                    "the moved pill does not follow the pointer"
                );
                assert(
                    $(".o_tl_pill_faded") && getComputedStyle($(".o_tl_pill_faded")).opacity === "0.5",
                    "the pill left behind is not faded"
                );
                assert($(".o_tl_drop"), "no target highlight");
                const badges = $$(".o_tl_selection_badge").map((badge) => badge.textContent.trim());
                assert(
                    badges[0] === usBadge(tomorrow, "1:00 PM") && badges[1] === usBadge(tomorrow, "5:00 PM"),
                    `badges ${badges}`
                );
                assert(
                    $$(".o_tl_selection_badge").every((badge) => badge.classList.contains("text-success")),
                    "the badges are not in the success colour"
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                assert(!$(".o_tl_pill_moved") && !$(".o_tl_drop"), "the drawing stayed after the release");
                const record = await recordNamed("Review");
                assert(reviewAt(record, tomorrow), `Review is ${record.date_start} to ${record.date_stop}`);
                // restore by Undo
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                const back = await recordNamed("Review");
                assert(reviewAt(back, today), `Review is ${back.date_start} after Undo`);
            },
        },
    ],
});

tours.add("timeline_002b2_a3_pointer_and_popover", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const pill = await until(() => pillNamed("Review"), "Review");
                const point = centreOf(pill);
                pointer("pointerdown", point.x, point.y, { target: pill });
                pointer("pointerup", point.x, point.y, { target: pill });
                pill.dispatchEvent(
                    new MouseEvent("click", { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y })
                );
                await until(() => $(".o_tl_popover"), "the popover");
                const gesture = await holdAndMove("Review", { to: { x: point.x + 40 } });
                assert(!$(".o_tl_popover"), "the popover stayed open");
                const root = $(".o_timeline_view");
                assert(root.classList.contains("o_tl_drag_move"), "no move class on the view");
                assert(getComputedStyle(root).cursor === "move", "the pointer is not the move shape");
                assert(
                    getComputedStyle($(".o_control_panel")).pointerEvents === "none",
                    "the control panel takes the pointer"
                );
                // back over the pill itself and release: no write, no popover
                pointer("pointermove", point.x, point.y);
                release({ ...gesture, end: point });
                pill.dispatchEvent(
                    new MouseEvent("click", { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y })
                );
                await sleep(500);
                assert(!$(".o_tl_popover") && !$(".o_dialog"), "a popover or dialog opened after the release");
                assert(!root.classList.contains("o_tl_dragging"), "the view still holds the gesture");
                assert(!$(".o_notification"), "a notification appeared for a move that wrote nothing");
            },
        },
    ],
});

tours.add("timeline_002b2_a4_cancel_keys", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const pill = await until(() => pillNamed("Review"), "Review");
                const dx = 2 * partWidthOf();
                for (const name of ["Escape", "a", "ArrowLeft"]) {
                    const gesture = await holdAndMove("Review", { to: { x: centreOf(pill).x + dx } });
                    assert($(".o_tl_pill_moved"), "no moved pill");
                    key("keydown", name);
                    await until(() => !$(".o_tl_pill_moved"), `${name} to cancel`);
                    assert(!$(".o_tl_pill_moved") && !$(".o_tl_drop"), `${name} did not cancel`);
                    assert(!$(".o_tl_selection_badge"), `${name} left the badges`);
                    release(gesture);
                }
                // Shift, Alt and Meta change nothing and make no copy
                const gesture = await holdAndMove("Review", { to: { x: centreOf(pill).x + dx } });
                for (const name of ["Shift", "Alt", "Meta"]) {
                    key("keydown", name);
                    key("keyup", name);
                }
                assert($(".o_tl_pill_moved"), "a harmless key cancelled the move");
                assert(!$(".o_timeline_view").classList.contains("o_tl_drag_copy"), "Meta made a copy");
                // the pointer over a column header: no target, a release writes nothing
                const header = $(".o_tl_col.o_tl_is_today").getBoundingClientRect();
                pointer("pointermove", header.left + 20, header.top + header.height / 2);
                await until(() => !$(".o_tl_drop") && !$(".o_tl_selection_badge"), "no target over the header");
                release({ ...gesture, end: { x: header.left + 20, y: header.top + header.height / 2 } });
                await sleep(500);
                const record = await recordNamed("Review");
                assert(reviewAt(record, today), "Review was written");
                assert(!$(".o_notification"), "a notification appeared");
            },
        },
    ],
});

tours.add("timeline_002b2_a17_phone_move_touch", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const pill = await until(() => pillNamed("Review"), "Review");
                const from = centreOf(pill);
                // A17: a finger held 600 ms, four steps of 20 px and one of 16 px to the left (96 px)
                // with 120 ms after each, then held 700 ms more
                const gesture = await holdAndMove("Review", {
                    to: { x: from.x - 96 },
                    pointerType: "touch",
                    hold: 600,
                    stepPx: 20,
                    finalHold: 700,
                });
                assert($(".o_tl_pill_moved"), "the pill did not lift");
                const badges = $$(".o_tl_selection_badge");
                assert(
                    badges.map((badge) => badge.textContent.trim()).join("|") ===
                        `${usBadge(today, "1:00 AM")}|${usBadge(today, "5:00 AM")}`,
                    `badges ${badges.map((badge) => badge.textContent)}`
                );
                assert(
                    badges.every((badge) => badge.classList.contains("text-danger")),
                    "the badges are not in the danger colour"
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const record = await recordNamed("Review");
                assert(reviewAt(record, today, "01:00:00", "05:00:00"), `Review ${record.date_start}`);
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                // a quick swipe without the hold scrolls instead
                const again = await until(() => pillNamed("Review"), "Review");
                const point = centreOf(again);
                pointer("pointerdown", point.x, point.y, { target: again, pointerType: "touch" });
                await sleep(80);
                pointer("pointermove", point.x - 60, point.y, { pointerType: "touch" });
                await sleep(400);
                assert(!$(".o_tl_pill_moved"), "a quick swipe moved the pill");
                pointer("pointerup", point.x - 60, point.y, { pointerType: "touch" });
            },
        },
    ],
});

async function copyReviewTo(parentRow, days) {
    const pill = await until(() => pillNamed("Review"), "Review");
    const from = centreOf(pill);
    key("keydown", "Control");
    const gesture = await holdAndMove("Review", {
        to: { x: from.x + days * 2 * partWidthOf(), y: middleOfRow(parentRow) },
        ctrl: true,
    });
    return gesture;
}

tours.add("timeline_002b2_a21_copy_into_gamma", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const tomorrow = addDays(today, 1);
                const gesture = await copyReviewTo("Gamma", 1);
                assert($(".o_timeline_view").classList.contains("o_tl_drag_copy"), "no copy class");
                assert(getComputedStyle($(".o_timeline_view")).cursor === "copy", "not the copy shape");
                assert($(".o_tl_pill_faded"), "the original is not faded");
                release(gesture);
                key("keyup", "Control");
                await until(() => noticeText(), "the notification");
                await gridSettled();
                assert(noticeText().length > 0, "no notification text");
                const copy = await recordNamed("Review (copy)");
                assert(copy, "no copy");
                assert(reviewAt(copy, tomorrow), `the copy is ${copy.date_start} to ${copy.date_stop}`);
                assert(copy.parent_id && copy.parent_id[1] === "Gamma", "the copy is not under Gamma");
                assert(reviewAt(await recordNamed("Review"), today), "Review changed");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Copy removed", "the result of Undo");
                assert((await countNamed("Review (copy)")) === 0, "the copy stayed");
            },
        },
    ],
});

tours.add("timeline_002b2_a22_ctrl_during_move", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const tomorrow = addDays(today, 1);
                const pill = await until(() => pillNamed("Review"), "Review");
                const gesture = await holdAndMove("Review", {
                    to: { x: centreOf(pill).x + 2 * partWidthOf() },
                });
                const root = $(".o_timeline_view");
                assert(root.classList.contains("o_tl_drag_move"), "not the move shape");
                key("keydown", "Control");
                await frame();
                assert(getComputedStyle(root).cursor === "copy", "Ctrl did not give the copy shape");
                key("keyup", "Control");
                await frame();
                assert(getComputedStyle(root).cursor === "move", "Ctrl up did not give the move shape");
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const record = await recordNamed("Review");
                assert(reviewAt(record, tomorrow), "Review did not move");
                assert((await countNamed("Review (copy)")) === 0, "a copy was made");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                assert(reviewAt(await recordNamed("Review"), today), "Review is not back");
            },
        },
    ],
});

tours.add("timeline_002b2_a24_phone_size_copy", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const pill = await until(() => pillNamed("Plan"), "Plan");
                const renderer_ = renderer().getBoundingClientRect();
                const rect = pill.getBoundingClientRect();
                const x = Math.min(Math.max(rect.left + rect.width / 2, renderer_.left + 5), renderer_.right - 5);
                key("keydown", "Control");
                pointer("pointerdown", x, rect.top + rect.height / 2, { target: pill, ctrl: true });
                const y = middleOfRow("Beta");
                for (let i = 1; i <= 6; i++) {
                    pointer("pointermove", x, rect.top + rect.height / 2 + ((y - rect.top - rect.height / 2) * i) / 6, {
                        ctrl: true,
                    });
                    await frame();
                }
                assert($(".o_timeline_view").classList.contains("o_tl_drag_copy"), "no copy shape");
                assert($$(".o_tl_selection_badge").length === 2, "no badges");
                pointer("pointerup", x, y, { ctrl: true });
                key("keyup", "Control");
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const copy = await recordNamed("Plan (copy)");
                assert(copy && copy.parent_id && copy.parent_id[1] === "Beta", "no copy of Plan in Beta");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Copy removed", "the result of Undo");
            },
        },
    ],
});

// -- the notification and Undo (A38, A41, A43, A44, A45, A57) -----------------------------------

tours.add("timeline_002b2_a38_undo_move", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                await moveReviewOneDay();
                const notice = $(".o_notification").getBoundingClientRect();
                assert(noticeText().startsWith("Dates changed"), `message "${noticeText()}"`);
                assert(notice.right > window.innerWidth - 40 && notice.top < 120, "not at the top right");
                assert(Math.abs(notice.width - 288) <= 2, `width ${notice.width}`);
                assert(noticeButton("Undo"), "no Undo button");
                assert($(".o_notification .btn-close, .o_notification .o_notification_close"), "no close cross");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                assert(!noticeButton("Undo"), "the result has an Undo button");
                await gridSettled();
                assert(reviewAt(await recordNamed("Review"), today), "Review is not back");
            },
        },
    ],
});

tours.add("timeline_002b2_a41_undo_copy", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const gesture = await copyReviewTo("Gamma", 1);
                release(gesture);
                key("keyup", "Control");
                await until(() => noticeText(), "the notification");
                assert((await countNamed("Review (copy)")) === 1, "no copy");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Copy removed", "the result of Undo");
                assert((await countNamed("Review (copy)")) === 0, "the copy stayed");
            },
        },
    ],
});

tours.add("timeline_002b2_a43_undo_record_gone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                // a copy that is deleted meanwhile
                const gesture = await copyReviewTo("Gamma", 1);
                release(gesture);
                key("keyup", "Control");
                await until(() => noticeText(), "the notification");
                const copy = await recordNamed("Review (copy)");
                await rpc(`/web/dataset/call_kw/${PILL_MODEL}/unlink`, {
                    model: PILL_MODEL,
                    method: "unlink",
                    args: [[copy.id]],
                    kwargs: {},
                });
                noticeButton("Undo").click();
                await until(() => $(".o_notification_danger, .o_tl_notification_danger"), "the danger notice");
                assert(noticeText() !== undefined, "no text");
                assert($(".o_tl_notification_danger"), "not a danger notification");
                // a move whose record is deleted meanwhile
                await gridSettled();
                const review = await recordNamed("Review");
                await moveReviewOneDay();
                await rpc(`/web/dataset/call_kw/${PILL_MODEL}/unlink`, {
                    model: PILL_MODEL,
                    method: "unlink",
                    args: [[review.id]],
                    kwargs: {},
                });
                noticeButton("Undo").click();
                await until(() => $(".o_tl_notification_danger"), "the danger notice of the move");
                await gridSettled();
                assert(!pillNamed("Review"), "the deleted record is still drawn");
            },
        },
    ],
});

tours.add("timeline_002b2_a44_one_notification", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const tomorrow = addDays(today, 1);
                await moveReviewOneDay();
                assert($$(".o_notification").length === 1, "no first notification");
                // another pill: Plan one day later
                const plan = await until(() => pillNamed("Plan"), "Plan");
                const before = await recordNamed("Plan");
                const gesture = await holdAndMove("Plan", {
                    to: { x: centreOf(plan).x + 2 * partWidthOf() },
                });
                release(gesture);
                await until(
                    () => $$(".o_notification").length === 1 && !!noticeButton("Undo"),
                    "one notification with Undo"
                );
                await sleep(400);
                assert($$(".o_notification").length === 1, "two notifications stand");
                await gridSettled();
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                const plan2 = await recordNamed("Plan");
                assert(plan2.date_start === before.date_start, "Plan is not back");
                assert(reviewAt(await recordNamed("Review"), tomorrow), "the first move was undone too");
                // restore Review
                await gridSettled();
                await moveReviewBack(today);
            },
        },
    ],
});

const undosOf = (network) =>
    network.log.filter((entry) => entry.url.endsWith("/gantt_undo_drag_drop"));

tours.add("timeline_002b2_a44_undo_pending", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const network = watchNetwork();
                try {
                    // Undo on a slow server: the notification stays, with its bar, until the answer
                    await moveReviewOneDay();
                    network.holdUndo = true;
                    network.log.length = 0;
                    noticeButton("Undo").click();
                    await sleep(300);
                    assert(noticeText() === "Dates changed", `pending: ${noticeText()}`);
                    assert($(".o_notification .o_notification_progress"), "no bar while pending");
                    assert(noticeButton("Undo"), "the Undo button went while pending");
                    noticeButton("Undo").click();
                    await sleep(100);
                    network.holdUndo = false;
                    network.release();
                    await until(() => noticeText() === "Change undone", "the result of Undo");
                    assert($$(".o_notification").length === 1, "the result stands beside a notice");
                    assert(undosOf(network).length === 1, `${undosOf(network).length} undo calls`);
                    await gridSettled();
                    assert(reviewAt(await recordNamed("Review"), today), "Review is not back");
                    // a change made after the Undo click: its notification is the one replaced
                    await moveReviewOneDay();
                    const plan = await until(() => pillNamed("Plan"), "Plan");
                    const before = await recordNamed("Plan");
                    network.log.length = 0;
                    network.holdUndo = true;
                    noticeButton("Undo").click();
                    await until(() => network.held.length === 1, "the undo, sent at once");
                    assert(noticeText() === "Dates changed", `undo pending: ${noticeText()}`);
                    // another pill is moved while the undo is pending
                    const gesture = await holdAndMove("Plan", {
                        to: { x: centreOf(plan).x + 2 * partWidthOf() },
                    });
                    release(gesture);
                    await until(() => writesOf(network).length === 1, "the write of Plan");
                    await sleep(500);
                    assert(noticeText() === "Dates changed", `the new notice: ${noticeText()}`);
                    assert($$(".o_notification").length === 1, "two notices while pending");
                    assert(undosOf(network).length === 0, "the undo was answered");
                    network.holdUndo = false;
                    network.release();
                    await until(() => noticeText() === "Change undone", "the result replaces the notice");
                    assert($$(".o_notification").length === 1, "the result stands beside a notice");
                    await gridSettled();
                    assert(reviewAt(await recordNamed("Review"), today), "Review is not back (2)");
                    const after = await recordNamed("Plan");
                    assert(after.date_start !== before.date_start, "the move of Plan was not written");
                    await rpc(`/web/dataset/call_kw/${PILL_MODEL}/write`, {
                        model: PILL_MODEL,
                        method: "write",
                        args: [[before.id], { date_start: before.date_start, date_stop: before.date_stop }],
                        kwargs: {},
                    });
                } finally {
                    network.hold = false;
                    network.holdUndo = false;
                    network.release();
                    network.stop();
                }
            },
        },
    ],
});

async function moveReviewBack(today) {
    const record = await recordNamed("Review");
    await rpc(`/web/dataset/call_kw/${PILL_MODEL}/write`, {
        model: PILL_MODEL,
        method: "write",
        args: [[record.id], { date_start: `${today} 13:00:00`, date_stop: `${today} 17:00:00` }],
        kwargs: {},
    });
}

tours.add("timeline_002b2_a45_phone_undo", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const pill = await until(() => pillNamed("Review"), "Review");
                const gesture = await holdAndMove("Review", {
                    to: { x: centreOf(pill).x - partWidthOf() },
                    pointerType: "touch",
                    hold: 600,
                    steps: 5,
                });
                release(gesture);
                await until(() => noticeText(), "the notification");
                const notice = $(".o_notification").getBoundingClientRect();
                assert(notice.bottom > window.innerHeight / 2, "the notification is not at the bottom");
                assert(Math.abs(notice.left - 16) <= 2, `left ${notice.left}`);
                assert(Math.abs(window.innerWidth - notice.right - 16) <= 2, `right ${notice.right}`);
                const button = noticeButton("Undo");
                const rect = button.getBoundingClientRect();
                const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                pointer("pointerdown", point.x, point.y, { target: button, pointerType: "touch" });
                pointer("pointerup", point.x, point.y, { target: button, pointerType: "touch" });
                button.click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                await gridSettled();
                assert(reviewAt(await recordNamed("Review"), today), "Review is not back");
            },
        },
    ],
});

tours.add("timeline_002b2_a57_refused_move_and_copy", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const build = await recordNamed("Build");
                const pill = await until(() => pillNamed("Build"), "Build");
                const gesture = await holdAndMove("Build", {
                    to: { x: centreOf(pill).x + 2 * partWidthOf() },
                });
                release(gesture);
                await until(() => $(".o_error_dialog"), "the access error");
                assert(!$(".o_notification"), "a success notification appeared");
                await gridSettled();
                const after = await recordNamed("Build");
                assert(after.date_start === build.date_start, "Build moved");
                const place = pillNamed("Build").getBoundingClientRect();
                assert(Math.abs(place.left - pill.getBoundingClientRect().left) <= 1, "Build is not in place");
                $(".o_error_dialog .btn-close, .o_error_dialog .modal-header .btn-close, .o_error_dialog button")?.click();
                await until(() => !$(".o_error_dialog"), "the error to close");
                // a refused copy: only the error, no copy, no notification
                key("keydown", "Control");
                const copy = await holdAndMove("Build", {
                    to: { x: centreOf(pillNamed("Build")).x + 2 * partWidthOf() },
                    ctrl: true,
                });
                release(copy);
                key("keyup", "Control");
                await until(() => $(".o_error_dialog"), "the access error of the copy");
                assert(!$(".o_notification"), "a notification appeared for the copy");
                assert((await countNamed("Build (copy)")) === 0, "a copy exists");
            },
        },
    ],
});

// ----------------------------------------------------------------------------
// Moves to other rows, group rows and rows of a read-only grouping (Task 12)
// ----------------------------------------------------------------------------

async function valuesOf(name, names) {
    const rows = await rpc(`/web/dataset/call_kw/${PILL_MODEL}/search_read`, {
        model: PILL_MODEL,
        method: "search_read",
        args: [[["name", "=", name]], names],
        kwargs: {},
    });
    return rows[0];
}
const idOf = (value) => (Array.isArray(value) ? value[0] : value);
const labelOf = (row) => $(".o_tl_row_label", row)?.textContent.trim();
const TOP_GROUPS = ["Alpha", "Beta", "Gamma"];

/** The rows below the group row `name` and above the next group row of the first level. */
function rowsOfGroup(name) {
    const rows = $$(".o_tl_row:not(.o_tl_total_row)");
    const from = rows.findIndex((row) => row.classList.contains("o_tl_group_row") && labelOf(row) === name);
    assert(from >= 0, `no group row ${name}`);
    const rest = rows.slice(from + 1);
    const end = rest.findIndex(
        (row) => row.classList.contains("o_tl_group_row") && TOP_GROUPS.includes(labelOf(row))
    );
    return end < 0 ? rest : rest.slice(0, end);
}
const groupRowNamed = (name) =>
    $$(".o_tl_group_row").find((row) => labelOf(row) === name);
const middleOfElement = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
};

/** Move the held pointer of `gesture` over `row`, at the press column. */
async function hoverRow(gesture, row, dx = 0) {
    gesture.end = { x: gesture.from.x + dx, y: middleOfElement(row) };
    pointer("pointermove", gesture.end.x, gesture.end.y, {
        pointerType: gesture.pointerType,
        ctrl: gesture.ctrl,
    });
    await frame();
    await frame();
}
const highlights = () => $$(".o_tl_drop");
const badgeCount = () => $$(".o_tl_selection_badge").length;

function assertRefused(row, label) {
    assert(!highlights().length, `${label}: the refusing row is highlighted`);
    assert(badgeCount() === 0, `${label}: the refusing row shows badges`);
    assert(row, label);
}
function assertAccepted(row, height, label) {
    const [drop] = highlights();
    assert(drop && drop.closest(".o_tl_row") === row, `${label}: no highlight in the row`);
    assert(badgeCount() === 2, `${label}: no badges`);
    const rect = drop.getBoundingClientRect();
    assert(Math.abs(rect.height - height) <= 1.5, `${label}: the highlight is ${rect.height} px tall`);
}

async function releaseAndWait(gesture) {
    release(gesture);
    await until(() => noticeText(), "the notification");
    await gridSettled();
}

tours.add("timeline_002b2_a9_move_to_beta", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const before = await valuesOf("Review", ["parent_id", "x_contact"]);
                const gesture = await holdAndMove("Review", {
                    to: { y: middleOfElement(rowNamed("Beta")) },
                });
                const beta = rowNamed("Beta");
                assertAccepted(beta, beta.getBoundingClientRect().height, "Beta");
                assert(
                    $$(".o_tl_selection_badge.text-success, .o_tl_selection_badge.text-danger").length === 0,
                    "the badges are not black on the same days"
                );
                await releaseAndWait(gesture);
                const record = await recordNamed("Review");
                assert(record.parent_id && record.parent_id[1] === "Beta", "Parent is not Beta");
                assert(reviewAt(record, today), "the dates changed");
                const after = await valuesOf("Review", ["x_contact"]);
                assert(idOf(after.x_contact) === idOf(before.x_contact), "the Contact changed");
                assert(pillNamed("Review"), "the pill is gone");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                const back = await recordNamed("Review");
                assert(back.parent_id && back.parent_id[1] === "Alpha", "Undo did not give Alpha back");
            },
        },
    ],
});

tours.add("timeline_002b2_a40_undo_between_tag_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const tagsOf = async (name) => [...(await valuesOf(name, ["x_tags"])).x_tags].sort();
                const sameTags = (left, right) => left.join() === right.join();
                // Design from the first tag's row to the second tag's row, then Undo
                const design = await tagsOf("Design");
                assert(design.length === 1, `Design holds ${design.length} tags`);
                let gesture = await holdAndMove("Design", { to: { y: middleOfRow("Host Tag 2") } });
                release(gesture);
                await until(() => noticeText()?.startsWith("Dates changed"), "the notification");
                await gridSettled();
                const moved = await tagsOf("Design");
                assert(moved.length === 1 && !sameTags(moved, design), `Design holds ${moved}`);
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                await gridSettled();
                assert(sameTags(await tagsOf("Design"), design), "Undo did not give the first tag back");
                // Build (both tags) to the row without tags, then Undo: both tags again
                const build = await tagsOf("Build");
                assert(build.length === 2, `Build holds ${build.length} tags`);
                gesture = await holdAndMove("Build", { to: { y: middleOfRow("Undefined Tags") } });
                release(gesture);
                await until(() => noticeText()?.startsWith("Dates changed"), "the second notification");
                await gridSettled();
                assert((await tagsOf("Build")).length === 0, "Build still holds tags");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the second result of Undo");
                await gridSettled();
                assert(sameTags(await tagsOf("Build"), build), "Undo did not give both tags back");
            },
        },
    ],
});

async function closeGroupRow(name) {
    const row = groupRowNamed(name);
    $(".o_tl_row_header", row).click();
    await until(() => groupRowNamed(name).classList.contains("o_tl_collapsed"), `${name} to close`);
    await sleep(1100);
    await gridSettled();
}

for (const copy of [false, true]) {
    tours.add(`timeline_002b2_a11_closed_group_row_${copy ? "copy" : "move"}`, {
        steps: () => [
            gridReady,
            {
                trigger: ".o_tl_pill",
                async run() {
                    const today = todayIso();
                    const before = await valuesOf("Review", ["x_contact"]);
                    await closeGroupRow("Beta");
                    if (copy) {
                        key("keydown", "Control");
                    }
                    const gesture = await holdAndMove("Review", {
                        to: { y: middleOfElement(groupRowNamed("Beta")) },
                        ctrl: copy,
                    });
                    assertAccepted(groupRowNamed("Beta"), 40, "the closed Beta group row");
                    release(gesture);
                    if (copy) {
                        key("keyup", "Control");
                    }
                    await until(() => noticeText(), "the notification");
                    await gridSettled();
                    await until(
                        () => !groupRowNamed("Beta").classList.contains("o_tl_collapsed"),
                        "the group to open"
                    );
                    const record = await recordNamed(copy ? "Review (copy)" : "Review");
                    assert(record.parent_id && record.parent_id[1] === "Beta", "Parent is not Beta");
                    assert(reviewAt(record, today), "the dates changed");
                    const held = await valuesOf(copy ? "Review (copy)" : "Review", ["x_contact"]);
                    assert(idOf(held.x_contact) === idOf(before.x_contact), "the Contact changed");
                    noticeButton("Undo").click();
                    await until(() => noticeText(), "the result of Undo");
                },
            },
        ],
    });
}

tours.add("timeline_002b2_a50_readonly_creator_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const gesture = await holdAndMove("Review", { to: {} });
                // the creator row of Beta refuses: no highlight, no badge, a release does nothing
                const creatorOfBeta = rowsOfGroup("Beta")[0];
                await hoverRow(gesture, creatorOfBeta);
                assertRefused(creatorOfBeta, "the creator row of Beta");
                release(gesture);
                await sleep(600);
                await gridSettled();
                assert(!noticeText(), "a refused release gave a notification");
                assert(!$(".o_tl_pill_moved"), "the moved pill stayed");
                const record = await recordNamed("Review");
                assert(record.parent_id[1] === "Alpha" && reviewAt(record, today), "Review changed");
                // the Beta group row accepts: Parent only
                const second = await holdAndMove("Review", { to: {} });
                await hoverRow(second, groupRowNamed("Beta"));
                assertAccepted(groupRowNamed("Beta"), 40, "the Beta group row");
                await releaseAndWait(second);
                const moved = await recordNamed("Review");
                assert(moved.parent_id[1] === "Beta" && reviewAt(moved, today), "not under Beta");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a51_readonly_siblings", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const before = await valuesOf("Review", ["parent_id", "x_contact"]);
                const gesture = await holdAndMove("Review", { to: {} });
                const alpha = rowsOfGroup("Alpha");
                const refused = [
                    ["the Alpha creator row", alpha[0]],
                    ["a Contact row under Beta", rowsOfGroup("Beta")[1]],
                    ["a Contact row under Gamma", rowsOfGroup("Gamma")[1]],
                ];
                for (const [label, row] of refused) {
                    await hoverRow(gesture, row);
                    assertRefused(row, label);
                }
                // a sibling Contact row under the same Alpha / creator row accepts
                const sibling = alpha.find((row) => labelOf(row) === "Host Contact 1");
                await hoverRow(gesture, sibling);
                assertAccepted(sibling, sibling.getBoundingClientRect().height, "the sibling Contact row");
                await releaseAndWait(gesture);
                const moved = await valuesOf("Review", ["parent_id", "x_contact", "date_start"]);
                assert(moved.x_contact[1] === "Host Contact 1", "the Contact did not change");
                assert(idOf(moved.parent_id) === idOf(before.parent_id), "Parent changed");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                await gridSettled();
                // the Beta group row accepts too
                const second = await holdAndMove("Review", { to: {} });
                await hoverRow(second, groupRowNamed("Beta"));
                assertAccepted(groupRowNamed("Beta"), 40, "the Beta group row");
                await releaseAndWait(second);
                const last = await valuesOf("Review", ["parent_id", "x_contact"]);
                assert(last.parent_id[1] === "Beta", "not under Beta");
                assert(idOf(last.x_contact) === idOf(before.x_contact), "the Contact changed");
                assert(reviewAt(await recordNamed("Review"), today), "the dates changed");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a52_phone_readonly_rows", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const pill = await until(() => pillNamed("Plan"), "Plan");
                const bounds = renderer().getBoundingClientRect();
                const rect = pill.getBoundingClientRect();
                const x = Math.min(Math.max(rect.left + rect.width / 2, bounds.left + 5), bounds.right - 5);
                const y = rect.top + rect.height / 2;
                pointer("pointerdown", x, y, { target: pill });
                const gesture = { from: { x, y }, end: { x, y }, pointerType: "mouse", ctrl: false };
                for (let i = 1; i <= 4; i++) {
                    pointer("pointermove", x, y + 4 * i);
                    await frame();
                }
                const creator = rowsOfGroup("Alpha")[0];
                await hoverRow(gesture, creator);
                assertRefused(creator, "Alpha's creator row");
                await hoverRow(gesture, groupRowNamed("Alpha"));
                assertAccepted(groupRowNamed("Alpha"), 40, "the Alpha group row");
                await releaseAndWait(gesture);
                const record = await recordNamed("Plan");
                assert(record.parent_id && record.parent_id[1] === "Alpha", "Plan is not under Alpha");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a72_release_on_own_group_row", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const network = watchNetwork();
                try {
                    const gesture = await holdAndMove("Review", { to: {} });
                    await hoverRow(gesture, groupRowNamed("Alpha"));
                    assertAccepted(groupRowNamed("Alpha"), 40, "the Alpha group row");
                    network.log.length = 0;
                    release(gesture);
                    await sleep(700);
                    await gridSettled();
                    assert(!noticeText(), "a release that changes nothing gave a notification");
                    assert(!writesOf(network).length, "a write was sent");
                    assert(!$(".o_tl_pill_moved") && !$(".o_tl_drop"), "the drag drawing stayed");
                    const record = await recordNamed("Review");
                    assert(record.parent_id[1] === "Alpha" && reviewAt(record, today), "Review changed");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

// ----------------------------------------------------------------------------
// Resizing with the handles (Task 13)
// ----------------------------------------------------------------------------

const addHours = (record, field, hours) =>
    DateTime.fromSQL(record[field], { zone: "utc" })
        .plus({ hours })
        .reconfigure({ locale: "en", numberingSystem: "latn" })
        .toFormat("yyyy-MM-dd HH:mm:ss");

/** Rest the pointer on the pill `name` (its handles appear) and press the handle `edge` in its middle. */
async function pressHandle(name, edge, { pointerType = "mouse" } = {}) {
    const pill = await until(() => pillNamed(name), `the pill ${name}`);
    pill.dispatchEvent(new MouseEvent("mouseenter"));
    const handle = await until(() => $(`.o_tl_handle_${edge}`, pill), `the ${edge} handle`);
    const from = centreOf(handle);
    pointer("pointerdown", from.x, from.y, { target: handle, pointerType });
    return { from, end: from, pointerType, ctrl: false };
}

/** Move the held pointer to `x` on the line of the press, in `steps` moves. */
async function dragHandleTo(gesture, x, steps = 6, wait = frame) {
    const { from } = gesture;
    const start = gesture.end.x;
    for (let i = 1; i <= steps; i++) {
        pointer("pointermove", start + ((x - start) * i) / steps, from.y, {
            pointerType: gesture.pointerType,
        });
        await wait();
    }
    await frame();
    gesture.end = { x, y: from.y };
}

const badgesNow = () => $$(".o_tl_selection_badge").map((badge) => badge.textContent.trim());
const bodyRight = (name) => pillNamed(name).getBoundingClientRect().right;

/** The grid scrolled left a little: a day after Build's end then lies clear of the edge zone. */
async function scrollGridLeft(by = 300) {
    renderer().scrollLeft += by;
    await gridSettled();
}

tours.add("timeline_002b2_a25_handles_on_hover", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                assert(!$(".o_tl_handle"), "handles without a pointer");
                const pill = await until(() => pillNamed("Build"), "Build");
                pill.dispatchEvent(new MouseEvent("mouseenter"));
                await until(() => $$(".o_tl_handle", pill).length === 2, "two handles");
                const body = pill.getBoundingClientRect();
                for (const [edge, cursor] of [["start", "w-resize"], ["stop", "e-resize"]]) {
                    const handle = $(`.o_tl_handle_${edge}`, pill);
                    const rect = handle.getBoundingClientRect();
                    assert(rect.width === 8 && rect.height === 23, `size ${rect.width}x${rect.height}`);
                    assert(Math.abs(rect.top - body.top) <= 0.5, "the handle is not as high as the body");
                    assert(
                        Math.abs((edge === "start" ? rect.left - body.left : body.right - rect.right)) <= 0.5,
                        `the ${edge} handle is not at its end`
                    );
                    const style = getComputedStyle(handle);
                    assert(style.cursor === cursor, `cursor ${style.cursor}`);
                    assert(style.backgroundColor === "rgba(0, 0, 0, 0)", "the handle is not transparent");
                }
                pill.dispatchEvent(new MouseEvent("mouseleave"));
                await until(() => !$(".o_tl_handle"), "the handles to go");
            },
        },
        // on Month "Review" fills a 26 px sub-column (a 24 px pill): two 8 px handles
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_menu .o_tl_range_month", run: "click" },
        {
            trigger: ".o_tl_renderer[data-scale=month] .o_tl_pill",
            async run() {
                const pill = await until(() => pillNamed("Review"), "Review");
                const body = pill.getBoundingClientRect();
                // the 26 px sub-column less the 1 px inset on each side of a pill
                assert(Math.abs(body.width - 24) <= 0.5, `Review is ${body.width} px wide`);
                pill.dispatchEvent(new MouseEvent("mouseenter"));
                await until(() => $$(".o_tl_handle", pill).length === 2, "two handles");
                for (const handle of $$(".o_tl_handle", pill)) {
                    assert(handle.getBoundingClientRect().width === 8, "a handle is not 8 px wide");
                }
                const middle = centreOf(pill);
                assert(
                    !document.elementFromPoint(middle.x, middle.y).classList.contains("o_tl_handle"),
                    "the press in the middle lands on a handle"
                );
                // a press between the handles moves the pill; released where it was, nothing is written
                const gesture = await holdAndMove("Review", { to: { x: middle.x + 40 } });
                assert($(".o_timeline_view").classList.contains("o_tl_drag_move"), "the press did not move");
                assert(!$(".o_timeline_view").classList.contains("o_tl_drag_resize"), "the press resized");
                await dragHandleTo(gesture, middle.x);
                release(gesture);
                await gridSettled();
                assert(!$(".o_notification"), "a notification appeared");
                // leaving the pill and entering it again shows the handles again
                pill.dispatchEvent(new MouseEvent("mouseleave"));
                await until(() => !$(".o_tl_handle"), "the handles to go");
                pill.dispatchEvent(new MouseEvent("mouseenter"));
                await until(() => $$(".o_tl_handle", pill).length === 2, "the handles back");
            },
        },
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_menu .o_tl_range_week", run: "click" },
        { trigger: ".o_tl_renderer[data-scale=week]" },
    ],
});

tours.add("timeline_002b2_a27_shorten_at_end", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const build = await recordNamed("Build");
                const network = watchNetwork();
                try {
                    const gesture = await pressHandle("Build", "stop");
                    const end = bodyRight("Build") + 1;
                    // 5 px before the border one day earlier than the end
                    await dragHandleTo(gesture, end - 2 * partWidthOf() - 5);
                    // the pill held by a handle is its box, one pixel around the body
                    assert(Math.abs(bodyRight("Build") - (end - 2 * partWidthOf())) <= 1, "the pill does not follow");
                    assert(
                        badgesNow()[0] === usBadge(today, "9:00 AM") &&
                            badgesNow()[1] === `${usBadge(addDays(today, 1), "6:00 PM")} (-24 hours)`,
                        `badges ${badgesNow()}`
                    );
                    const classes = $$(".o_tl_selection_badge").map((badge) => badge.className);
                    assert(classes[1].includes("text-danger") && !classes[0].includes("text-"), "badge colours");
                    assert($(".o_timeline_view").classList.contains("o_tl_drag_east"), "no east resize shape");
                    network.log.length = 0;
                    release(gesture);
                    await until(() => noticeText(), "the notification");
                    await gridSettled();
                    const writes = writesOf(network);
                    assert(writes.length === 1, `${writes.length} writes`);
                    const params = JSON.parse(writes[0].body).params;
                    assert(
                        Object.keys(params.args[1]).join() === "date_stop",
                        `the write holds ${Object.keys(params.args[1])}`
                    );
                    const after = await recordNamed("Build");
                    assert(after.date_start === build.date_start, "the start changed");
                    assert(after.date_stop === addHours(build, "date_stop", -24), `stop ${after.date_stop}`);
                    noticeButton("Undo").click();
                    await until(() => noticeText() === "Change undone", "the result of Undo");
                    assert((await recordNamed("Build")).date_stop === build.date_stop, "Undo did not restore");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a28_lengthen_at_start", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const build = await recordNamed("Build");
                const gesture = await pressHandle("Build", "start");
                const start = pillNamed("Build").getBoundingClientRect().left - 1;
                await dragHandleTo(gesture, start - 2 * partWidthOf() + 4);
                assert(
                    badgesNow()[0] === `${usBadge(addDays(today, -1), "9:00 AM")} (+24 hours)`,
                    `badges ${badgesNow()}`
                );
                assert($$(".o_tl_selection_badge")[0].classList.contains("text-success"), "not success");
                assert($(".o_timeline_view").classList.contains("o_tl_drag_west"), "no west resize shape");
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const after = await recordNamed("Build");
                assert(after.date_start === addHours(build, "date_start", -24), `start ${after.date_start}`);
                assert(after.date_stop === build.date_stop, "the stop changed");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a42_undo_of_resize", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const build = await recordNamed("Build");
                const gesture = await pressHandle("Build", "start");
                const start = pillNamed("Build").getBoundingClientRect().left - 1;
                await dragHandleTo(gesture, start - 2 * partWidthOf() + 4);
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const changed = await recordNamed("Build");
                assert(changed.date_start !== build.date_start, "the resize wrote no start");
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
                await gridSettled();
                const back = await recordNamed("Build");
                assert(back.date_start === build.date_start, `the start is ${back.date_start}, not ${build.date_start}`);
                assert(back.date_stop === build.date_stop, `the stop is ${back.date_stop}, not ${build.date_stop}`);
            },
        },
    ],
});

tours.add("timeline_002b2_a31_invalid_warning", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const network = watchNetwork();
                try {
                    const gesture = await pressHandle("Review", "stop");
                    const rect = pillNamed("Review").getBoundingClientRect();
                    // one sub-column to the left: onto the middle border of the day
                    await dragHandleTo(gesture, rect.left - 1 + partWidthOf());
                    assert(
                        Math.abs(pillNamed("Review").getBoundingClientRect().width - partWidthOf()) <= 1,
                        "the pill does not show one sub-column"
                    );
                    assert(
                        badgesNow()[1] === `${usBadge(today, "2:00 AM")} (-12 hours)` &&
                            $$(".o_tl_selection_badge")[1].classList.contains("text-danger"),
                        `badges ${badgesNow()}`
                    );
                    network.log.length = 0;
                    release(gesture);
                    const warning = await until(() => $(".o_notification"), "the warning");
                    assert(warning.textContent.includes("The end cannot come before the start."), warning.textContent);
                    assert($(".o_notification_bar.bg-warning", warning), "not a warning");
                    assert(!noticeButton("Undo"), "a warning with Undo");
                    await sleep(500);
                    assert(!writesOf(network).length, "a write was sent");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a33_phone_mouse_invalid", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const yesterday = addDays(todayIso(), -1);
                const gesture = await pressHandle("Review", "stop");
                await dragHandleTo(gesture, gesture.from.x - 88, 1);
                assert(
                    badgesNow()[1] === `${usBadge(yesterday, "2:00 PM")} (-12 hours)`,
                    `badges ${badgesNow()}`
                );
                release(gesture);
                const warning = await until(() => $(".o_notification"), "the warning");
                assert(warning.textContent.includes("The end cannot come before the start."), "text");
                const box = warning.getBoundingClientRect();
                assert(box.bottom > window.innerHeight / 2, "the warning is not at the bottom");
            },
        },
    ],
});

tours.add("timeline_002b2_a34_phone_mouse_resize", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const overlap = await pressHandle("Overlap B", "start");
                const thursday = $(`.o_tl_col[data-date="${today}"]`).getBoundingClientRect().left;
                await dragHandleTo(overlap, thursday + 2, 1);
                assert(badgesNow()[0] === `${usBadge(today, "2:00 AM")} (-12 hours)`, `badges ${badgesNow()}`);
                // the pointer shapes of the resting pill's handles (M26, M28) are checked on desktop
                pointer("pointerup", overlap.end.x, overlap.end.y, {});
                await sleep(300);
                await gridSettled();
                const review = await pressHandle("Review", "start");
                const at = pillNamed("Review").getBoundingClientRect().left - 1;
                await dragHandleTo(review, at - partWidthOf() + 3, 1);
                assert(badgesNow()[0] === `${usBadge(today, "1:00 AM")} (+12 hours)`, `badges ${badgesNow()}`);
                key("keydown", "Escape");
                await until(() => !$(".o_tl_selection_badge"), "the badges to go after Escape");
                pointer("pointerup", review.end.x, review.end.y, {});
            },
        },
    ],
});

tours.add("timeline_002b2_a35_touch_moves_not_resizes", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = todayIso();
                const review = await recordNamed("Review");
                const gesture = await pressHandle("Review", "stop", { pointerType: "touch" });
                await sleep(600);
                // R-T15-4: the finger lies in the move zone of the edge; the first move jumps out of
                // it in one step, then the finger goes on slowly to one half day before the press
                const goal = gesture.from.x - partWidthOf();
                await dragHandleTo(gesture, gesture.from.x - 40, 1, () => sleep(120));
                await dragHandleTo(gesture, goal, 4, () => sleep(120));
                assert($(".o_tl_pill_moved"), "the pill was not moved");
                assert(
                    badgesNow()[0] === usBadge(today, "1:00 AM") && badgesNow()[1] === usBadge(today, "5:00 AM"),
                    `badges ${badgesNow()}`
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const after = await recordNamed("Review");
                assert(after.date_start === addHours(review, "date_start", -12), `start ${after.date_start}`);
                assert(after.date_stop === addHours(review, "date_stop", -12), `stop ${after.date_stop}`);
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a37_resize_without_drag_and_drop", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                await scrollGridLeft();
                const build = await recordNamed("Build");
                const gesture = await pressHandle("Build", "stop");
                await dragHandleTo(gesture, bodyRight("Build") + 1 + 2 * partWidthOf());
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const after = await recordNamed("Build");
                assert(after.date_stop === addHours(build, "date_stop", 24), `stop ${after.date_stop}`);
                noticeButton("Undo").click();
                await until(() => noticeText() === "Change undone", "the result of Undo");
            },
        },
    ],
});

tours.add("timeline_002b2_a56_writes_wait_for_each_other", {
    steps: () => {
        let network;
        let build;
        return [
            gridReady,
            {
                trigger: ".o_tl_pill",
                async run() {
                    await scrollGridLeft();
                    build = await recordNamed("Build");
                    network = watchNetwork();
                    // the server holds every write until this tour lets it go
                    network.hold = true;
                    const stored = bodyRight("Build");
                    for (let i = 0; i < 2; i++) {
                        const gesture = await pressHandle("Build", "stop");
                        await dragHandleTo(gesture, bodyRight("Build") + 1 + 2 * partWidthOf());
                        release(gesture);
                        // the pill is drawn from the stored record, so the second gesture starts there
                        await until(
                            () => Math.abs(bodyRight("Build") - stored) <= 1 && !$(".o_tl_pill_resizing"),
                            `the pill at its stored length (${i})`
                        );
                        if (i === 0) {
                            await until(() => network.held.length === 1, "the first write to be sent");
                        }
                    }
                    for (let i = 0; i < 10; i++) {
                        await frame();
                    }
                    // the second write waits for the first: only one is on its way
                    assert(network.held.length === 1, `${network.held.length} writes held`);
                    assert(!noticeText(), "a notification before the first answer");
                    // the click of the release is over: a record dialog opened meanwhile waits for the writes
                    await sleep(600);
                    doubleClick(pillNamed("Build"));
                    await sleep(300);
                    assert(!$(".o_dialog .o_form_view"), "the dialog opened before the writes returned");
                    network.release();
                    // the first answer comes, the view reloads, then the second write is sent
                    await until(() => network.held.length === 1, "the second write to be sent");
                    assert(!$(".o_dialog .o_form_view"), "the dialog opened before the second write returned");
                    network.release();
                },
            },
            {
                trigger: ".o_dialog .o_form_view",
                async run() {
                    try {
                        const wanted = addHours(build, "date_stop", 24);
                        const expected = DateTime.fromSQL(wanted, { zone: "utc" });
                        const field = await until(
                            () =>
                                $(
                                    '.o_dialog .o_field_widget[name="date_stop"] input, .o_dialog .o_field_widget[name="date_stop"] button[data-field]'
                                ),
                            "the stop field"
                        );
                        // the dialog shows the saved stop: both writes had returned
                        assert(
                            field.value.includes(expected.toFormat("MM/dd/yyyy")),
                            `the dialog shows ${field.value}, expected ${expected.toISODate()}`
                        );
                        assert(writesOf(network).length === 2, `${writesOf(network).length} writes`);
                        $(".o_dialog .o_form_button_cancel")?.click();
                        await until(() => !$(".o_dialog"), "the dialog to close");
                        await gridSettled();
                        const calls = network.log
                            .map((entry) => entry.url.split("/").pop())
                            .filter((name) => name === "write" || name === "get_gantt_data");
                        assert(
                            // closing the dialog may reload once more, after the two writes
                            calls.slice(0, 4).join() === "write,get_gantt_data,write,get_gantt_data",
                            `calls ${calls.join()}`
                        );
                        const sent = writesOf(network).map(
                            (entry) => JSON.parse(entry.body).params.args[1].date_stop
                        );
                        assert(sent[0] === wanted && sent[1] === wanted, `sent ${sent}`);
                        assert((await recordNamed("Build")).date_stop === wanted, "Build is not one day longer");
                    } finally {
                        network.stop();
                    }
                },
            },
        ];
    },
});

tours.add("timeline_002b2_a57_refused_resize", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                await scrollGridLeft();
                const build = await recordNamed("Build");
                const network = watchNetwork();
                network.hold = true;
                try {
                    const stored = bodyRight("Build");
                    const gesture = await pressHandle("Build", "stop");
                    await dragHandleTo(gesture, stored + 1 + 2 * partWidthOf());
                    release(gesture);
                    await until(() => network.held.length === 1, "the write to be sent");
                    await until(
                        () => Math.abs(bodyRight("Build") - stored) <= 1 && !$(".o_tl_pill_resizing"),
                        "the pill at its stored length"
                    );
                    assert(!$(".o_notification") && !$(".o_error_dialog"), "an answer while the write is held");
                    network.hold = false;
                    network.release();
                    await until(() => $(".o_error_dialog"), "the access error");
                    assert(!$(".o_notification"), "a success notification appeared");
                    await gridSettled();
                    assert((await recordNamed("Build")).date_stop === build.date_stop, "Build changed");
                    assert(Math.abs(bodyRight("Build") - stored) <= 1, "Build is not at its stored length");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a74_notification_after_the_answer", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const build = await recordNamed("Build");
                const network = watchNetwork();
                network.hold = true;
                try {
                    const stored = bodyRight("Build");
                    const gesture = await pressHandle("Build", "stop");
                    await dragHandleTo(gesture, stored + 1 - 2 * partWidthOf());
                    release(gesture);
                    await until(() => network.held.length === 1, "the write to be sent");
                    await until(
                        () => Math.abs(bodyRight("Build") - stored) <= 1 && !$(".o_tl_pill_resizing"),
                        "the pill at its stored length"
                    );
                    assert(!$(".o_notification"), "a notification while the answer is pending");
                    network.hold = false;
                    network.release();
                    await until(() => noticeText(), "the notification after the answer");
                    assert(noticeText().includes("Dates changed"), noticeText());
                    await gridSettled();
                    assert(bodyRight("Build") < stored - 1, "Build was not shortened");
                    noticeButton("Undo").click();
                    await until(() => noticeText() === "Change undone", "the result of Undo");
                    assert((await recordNamed("Build")).date_stop === build.date_stop, "Undo did not restore");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

// ----------------------------------------------------------------------------
// Locked pills (R11, S5)
// ----------------------------------------------------------------------------

/** What the user sees of the pill `name` held without moving: the lock and the raised copy. */
function assertLocked(name, { visibleIcon = true } = {}) {
    const raised = $(".o_tl_pill_moved");
    assert(raised, `${name} is not raised`);
    assert(getComputedStyle(raised).opacity === "0.8", `opacity ${getComputedStyle(raised).opacity}`);
    assert(getComputedStyle(raised).boxShadow !== "none", "no shadow");
    const icon = $(".o_tl_pill_lock", raised);
    assert(icon, "no lock icon");
    const iconRect = icon.getBoundingClientRect();
    const bodyRect = $(".o_tl_pill", raised).getBoundingClientRect();
    assert(Math.abs(iconRect.width - 14) <= 1 && Math.abs(iconRect.height - 14) <= 1, "icon size");
    assert(Math.abs(bodyRect.right - iconRect.right - 8) <= 1, "icon is not 8 px from the right edge");
    assert(getComputedStyle(icon).color === "rgb(0, 0, 0)", `icon colour ${getComputedStyle(icon).color}`);
    const gridRight = renderer().getBoundingClientRect().right;
    assert((iconRect.left < gridRight) === visibleIcon, "icon visibility");
    assert(getComputedStyle($(".o_timeline_view")).cursor === "not-allowed", "cursor");
    assert(!$(".o_tl_drop") && !$(".o_tl_selection_badge"), "a highlight or badge is drawn");
}

async function holdLocked(name, options = {}, pointerOptions = {}) {
    const pill = await until(() => pillNamed(name), name);
    const from = centreOf(pill);
    const gesture = await holdAndMove(name, {
        to: { x: from.x + 3 * partWidthOf(), y: from.y + 30 },
        ...pointerOptions,
    });
    assertLocked(name, options);
    return gesture;
}

async function releaseLocked(gesture, names) {
    release(gesture);
    await sleep(600);
    assert(!$(".o_tl_pill_lock") && !$(".o_tl_pill_moved"), "the lock stays after the release");
    assert(!$(".o_timeline_view").classList.contains("o_tl_dragging"), "the hold stays");
    assert(!$(".o_notification") && !$(".o_popover"), "something opened after the release");
    for (const [name, iso] of Object.entries(names)) {
        const record = await recordNamed(name);
        assert(record.date_start.startsWith(iso), `${name} changed: ${record.date_start}`);
    }
}

tours.add("timeline_002b2_a47_lock_on_cut_pill", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                await switchRange("day");
                const design = await recordNamed("Design");
                assert(!$(".o_tl_pill_lock"), "an icon at rest");
                const gesture = await holdLocked("Design");
                await releaseLocked(gesture, { Design: design.date_start.slice(0, 10) });
                assert((await recordNamed("Design")).date_stop === design.date_stop, "Design changed");
            },
        },
    ],
});

tours.add("timeline_002b2_a48_lock_drag_and_drop_off", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const review = await recordNamed("Review");
                const gesture = await holdLocked("Review");
                await releaseLocked(gesture, { Review: review.date_start.slice(0, 10) });
                assert((await recordNamed("Review")).date_start === review.date_start, "Review changed");
            },
        },
    ],
});

tours.add("timeline_002b2_a48_lock_finger", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const review = await recordNamed("Review");
                const pill = await until(() => pillNamed("Review"), "Review");
                const from = centreOf(pill);
                // a finger held 500 ms, then moved 32 px to the left in four steps
                const gesture = await holdAndMove("Review", {
                    to: { x: from.x - 32 },
                    pointerType: "touch",
                    hold: 500,
                    stepPx: 8,
                });
                assertLocked("Review");
                assert($(".o_tl_pill_moved .o_tl_pill").classList.contains("o_touch_bounce"), "no touch bounce");
                await releaseLocked(gesture, { Review: review.date_start.slice(0, 10) });
                assert((await recordNamed("Review")).date_start === review.date_start, "Review changed");
            },
        },
    ],
});

tours.add("timeline_002b2_a48_lock_read_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const pill = await until(() => pillNamed("Review"), "Review");
                pill.dispatchEvent(new MouseEvent("mouseenter"));
                await frame();
                assert(!$(".o_tl_handle"), "a handle on a read-only view");
                const review = await recordNamed("Review");
                const gesture = await holdLocked("Review");
                await releaseLocked(gesture, { Review: review.date_start.slice(0, 10) });
            },
        },
    ],
});

tours.add("timeline_002b2_a49_lock_on_long_pill", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const gesture = await holdLocked("Long task", { visibleIcon: false });
                const record = await recordNamed("Long task");
                await releaseLocked(gesture, { "Long task": record.date_start.slice(0, 10) });
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Edge scrolling while a pill is held (R14, A53 to A55). The amount scrolled depends on how long
// the pointer stays in a zone, so a gesture holds for a fixed time and the tour asserts generous
// ranges, never an exact value.
// ---------------------------------------------------------------------------------------------

/** The right edge of the scrolling area. */
const areaRightNow = () => renderer().getBoundingClientRect().left + renderer().clientLeft + renderer().clientWidth;

/** Press the first record pill `name` in its middle and move 20 px: the move has begun. */
async function beginMove(name, options = {}) {
    const gesture = await holdAndMove(name, { to: { x: centreOf(await until(() => pillNamed(name), name)).x + 20 }, ...options });
    await until(() => $(".o_tl_pill_moved"), "the moved pill");
    return gesture;
}

/** Move the held pointer to (x, y) in one move. */
async function pointerTo(gesture, x, y) {
    pointer("pointermove", x, y, { pointerType: gesture.pointerType });
    gesture.end = { x, y };
    await frame();
}

/** Escape cancels the gesture, then the release ends it; nothing is written. */
async function abandon(gesture) {
    key("keydown", "Escape");
    release(gesture);
    await until(() => !$(".o_tl_pill_moved") && !$(".o_tl_pill_resizing"), "the gesture to end");
}

tours.add("timeline_002b2_a53_move_edge_scroll", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const area = renderer();
                area.scrollLeft = 0;
                await gridSettled();
                const room = area.scrollWidth - area.clientWidth - area.scrollLeft;
                assert(room > 1200, `the grid has only ${room} px to scroll to the right`);
                const network = watchNetwork();
                try {
                    const gesture = await beginMove("Review");
                    const y = gesture.end.y;
                    // 40 px from the edge: no scroll
                    const calm = area.scrollLeft;
                    await pointerTo(gesture, areaRightNow() - 40, y);
                    await sleep(700);
                    assert(area.scrollLeft === calm, `the grid scrolled ${area.scrollLeft - calm} px 40 px from the edge`);
                    // 10 px from the edge: about 417 px per second
                    await pointerTo(gesture, areaRightNow() - 10, y);
                    const badges = badgesNow().join('|');
                    await sleep(1000);
                    const moved = area.scrollLeft - calm;
                    assert(moved > 250 && moved < 700, `the grid scrolled ${moved} px in a second, expected about 417`);
                    assert($(".o_tl_drop") && badgeCount() === 2, "the highlight or the badges are gone");
                    assert(badgesNow().join('|') !== badges, "the badges did not follow the scroll");
                    // 20 px from the edge: about 208 px per second, slower than at 10 px
                    await pointerTo(gesture, areaRightNow() - 20, y);
                    const before = area.scrollLeft;
                    await sleep(1000);
                    const slower = area.scrollLeft - before;
                    assert(slower > 100 && slower < 400, `the grid scrolled ${slower} px in a second, expected about 208`);
                    await abandon(gesture);
                    assert(writesOf(network).length === 0, "a cancelled move wrote");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a53_move_edge_scroll_stops_at_end", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const area = renderer();
                const gesture = await beginMove("Review");
                const max = area.scrollWidth - area.clientWidth;
                area.scrollLeft = max - 150;
                await frame();
                await pointerTo(gesture, areaRightNow() - 2, gesture.end.y);
                await until(() => area.scrollLeft >= max - 1, "the grid to reach its end");
                await sleep(500);
                assert(area.scrollLeft >= max - 1, "the grid went back");
                assert($(".o_tl_pill_moved"), "the moved pill vanished at the end");
                await abandon(gesture);
            },
        },
    ],
});

tours.add("timeline_002b2_a53_phone_vertical_edge_scroll", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                // on the phone the page scrolls the rows (the grid only scrolls sideways)
                const scrolls = (element) =>
                    ["auto", "scroll"].includes(getComputedStyle(element).overflowY) &&
                    element.scrollHeight > element.clientHeight + 100;
                let page = renderer();
                while (page && !scrolls(page)) {
                    page = page.parentElement;
                }
                assert(page, "the rows fit in the screen");
                page.scrollTop = 0;
                await gridSettled();
                const box = page.getBoundingClientRect();
                const bottom = Math.min(box.top + page.clientTop + page.clientHeight, window.innerHeight);
                // a pill drawn in the middle zone of the narrow screen (no scrolling there)
                const middle = visibleMiddle();
                const pill = $$(".o_tl_pill").find((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                        Math.abs(rect.left + rect.width / 2 - middle) < 100 &&
                        rect.top > box.top + 60 &&
                        rect.bottom < bottom - 60
                    );
                });
                assert(pill, "no pill in the middle of the screen");
                const from = centreOf(pill);
                pointer("pointerdown", from.x, from.y, { target: pill });
                const gesture = { from, end: { x: from.x, y: from.y }, pointerType: "mouse", ctrl: false };
                await pointerTo(gesture, from.x + 20, from.y);
                await until(() => $(".o_tl_pill_moved"), "the moved pill");
                // the move zones leave x 30 to 360: stay on the middle, go down to the bottom edge
                const before = page.scrollTop;
                await pointerTo(gesture, gesture.end.x, bottom - 10);
                await sleep(1000);
                const moved = page.scrollTop - before;
                assert(moved > 250 && moved < 700, `the page scrolled down ${moved} px in a second, expected about 417`);
                // the moved pill stays under the pointer while the rows pass under it
                const rect = $(".o_tl_pill_moved").getBoundingClientRect();
                assert(Math.abs(rect.top + rect.height / 2 - (bottom - 10)) < 40, "the moved pill did not follow the pointer");
                // held to the end of the rows
                await until(() => page.scrollTop >= page.scrollHeight - page.clientHeight - 1, "the end of the rows");
                assert($(".o_tl_pill_moved"), "the moved pill vanished with its row out of view");
                await abandon(gesture);
            },
        },
    ],
});

tours.add("timeline_002b2_a54_resize_edge_scroll", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const area = renderer();
                area.scrollLeft = 0;
                await gridSettled();
                const room = area.scrollWidth - area.clientWidth - area.scrollLeft;
                assert(room > 1500, `the grid has only ${room} px to scroll to the right`);
                const network = watchNetwork();
                try {
                    // Build's end handle, then 100 px from the right edge: about 833 px per second
                    const gesture = await pressHandle("Build", "stop");
                    await dragHandleTo(gesture, centreOf(await until(() => pillNamed("Build"), "Build")).x + 30);
                    await until(() => $(".o_tl_pill_resizing"), "the resizing pill");
                    const before = area.scrollLeft;
                    const badges = badgesNow().join("|");
                    const x = areaRightNow() - 100;
                    await dragHandleTo(gesture, x);
                    // no single sample decides: the badge must leave its first text, whenever
                    await until(() => badgesNow().join("|") !== badges, "the badge to follow the scroll");
                    await sleep(1000);
                    const moved = area.scrollLeft - before;
                    assert(moved > 600 && moved < 1300, `the grid scrolled ${moved} px in a second, expected about 833`);
                    // the end stays at the pointer, which now points to a later place of the grid
                    const end = $(".o_tl_pill_resizing").getBoundingClientRect().right;
                    assert(Math.abs(end - x) < 80, `the end is at ${end}, the pointer at ${x}`);
                    await abandon(gesture);
                    assert(writesOf(network).length === 0, "a cancelled resize wrote");
                } finally {
                    network.stop();
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a54_phone_resize_zone", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const area = renderer();
                const box = area.getBoundingClientRect();
                const build = await until(() => pillNamed("Build"), "Build");
                const rect = build.getBoundingClientRect();
                area.scrollLeft += rect.left + rect.width / 2 - (box.left + box.right) / 2;
                await gridSettled();
                const gesture = await pressHandle("Build", "stop");
                await dragHandleTo(gesture, gesture.from.x + 12, 3);
                // between x 150 and 240 of the screen nothing scrolls
                await dragHandleTo(gesture, 195);
                await sleep(300);
                const calm = area.scrollLeft;
                await sleep(600);
                assert(area.scrollLeft === calm, "the grid scrolled in the middle of the phone");
                // inside the outer 150 px it does
                await dragHandleTo(gesture, areaRightNow() - 100);
                await sleep(800);
                assert(area.scrollLeft - calm > 250, `the grid scrolled ${area.scrollLeft - calm} px`);
                await abandon(gesture);
            },
        },
    ],
});

tours.add("timeline_002b2_a55_row_header_edge", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const area = renderer();
                const gesture = await beginMove("Review");
                const start = area.scrollLeft;
                area.scrollLeft = start + 400;
                await frame();
                assert(area.scrollLeft > start + 300, "the grid did not scroll right");
                const title = $(".o_tl_title_cell").getBoundingClientRect();
                // on the right edge of the row header column, within the row of the pill
                await pointerTo(gesture, title.right - 2, gesture.end.y);
                await until(() => area.scrollLeft === 0, "the grid to scroll back to its start", 15000);
                assert($(".o_tl_pill_moved"), "the moved pill vanished");
                await abandon(gesture);
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Date-only fields (R17): A58, A59, A71 (left to right)
// ---------------------------------------------------------------------------------------------

const DATED_MODEL = "test.web.gantt.pill2";
const shortDate = (date) => `${date.month}/${date.day}/${date.year}`;

async function datedRecord(name) {
    const rows = await rpc(`/web/dataset/call_kw/${DATED_MODEL}/search_read`, {
        model: DATED_MODEL,
        method: "search_read",
        args: [[["name", "=", name]], ["name", "date_start", "date_stop"]],
        kwargs: {},
    });
    return rows[0];
}

/** The box of the cell of the date `iso` (a day, or a month on the year scale) in the first row. */
function cellOfDate(iso) {
    const index = Number($(`.o_tl_col[data-date="${iso}"]`).dataset.index);
    return $$(".o_tl_cell", $(".o_tl_row[data-row-id]"))[index].getBoundingClientRect();
}

/** Press the pill `name` at the abscissa `x` on its middle line. */
async function pressAtX(name, x, { ctrl = false } = {}) {
    const pill = await until(() => pillNamed(name), `the pill ${name}`);
    const y = centreOf(pill).y;
    if (ctrl) {
        key("keydown", "Control");
    }
    pointer("pointerdown", x, y, { target: pill, ctrl });
    return { from: { x, y }, end: { x, y }, pointerType: "mouse", ctrl };
}

/** Move the held pointer to `x` on its line, in `steps` moves. */
async function moveHeld(gesture, x, steps = 6) {
    const start = gesture.end.x;
    for (let i = 1; i <= steps; i++) {
        pointer("pointermove", start + ((x - start) * i) / steps, gesture.from.y, {
            ctrl: gesture.ctrl,
        });
        await frame();
    }
    await frame();
    gesture.end = { x, y: gesture.from.y };
}

async function undoDated(text = "Change undone") {
    noticeButton("Undo").click();
    await until(() => noticeText() === text, "the result of Undo");
    await gridSettled();
}

const datesOf = (record) => [record.date_start, record.date_stop];

tours.add("timeline_002b2_a58_date_only_full_precision", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const today = DateTime.fromISO(todayIso());
                const day = cellOfDate(todayIso()).width;
                // the move: one day to the left
                let gesture = await holdAndMove("Three days", {
                    to: { x: centreOf(pillNamed("Three days")).x - day },
                });
                assert(
                    badgesNow().join("|") ===
                        [shortDate(today.minus({ days: 2 })), shortDate(today)].join("|"),
                    `badges ${badgesNow()}`
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                let record = await datedRecord("Three days");
                assert(
                    datesOf(record).join() === [addDays(todayIso(), -2), todayIso()].join(),
                    `Three days is ${datesOf(record)}`
                );
                // the pill covers the written days (002a D9)
                const covers = pillNamed("Three days").getBoundingClientRect();
                assert(Math.abs(covers.left - cellOfDate(addDays(todayIso(), -2)).left - 1) <= 1, "left");
                assert(Math.abs(covers.width - (3 * day - 2)) <= 1, "width");
                await undoDated();
                // the resize: the end one day to the left
                gesture = await pressHandle("Three days", "stop");
                await dragHandleTo(gesture, gesture.from.x - day);
                assert(
                    badgesNow().join("|") ===
                        [shortDate(today.minus({ days: 1 })), `${shortDate(today)} (-1 days)`].join("|"),
                    `badges ${badgesNow()}`
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                record = await datedRecord("Three days");
                assert(
                    datesOf(record).join() === [addDays(todayIso(), -1), todayIso()].join(),
                    `Three days is ${datesOf(record)}`
                );
                await undoDated();
            },
        },
    ],
});

tours.add("timeline_002b2_a59_half_day_precision", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const iso = todayIso();
                const today = DateTime.fromISO(iso);
                const original = [addDays(iso, -1), addDays(iso, 1)];
                const shown = (start, stop) => [
                    shortDate(today.plus({ days: start })),
                    shortDate(today.plus({ days: stop })),
                ];
                const badgesAre = (start, stop, message) =>
                    assert(
                        badgesNow().join("|") === shown(start, stop).join("|"),
                        `${message}: ${badgesNow()}`
                    );
                const here = () => cellOfDate(iso);
                const next = () => cellOfDate(addDays(iso, 1));

                // 1. move later: nothing inside today, a whole day at midnight
                let gesture = await pressAtX("Three days", here().left + 13);
                await moveHeld(gesture, here().left + 45);
                badgesAre(-1, 1, "inside the day");
                await moveHeld(gesture, next().left + 2);
                badgesAre(0, 2, "past midnight");
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                let record = await datedRecord("Three days");
                assert(datesOf(record).join() === [iso, addDays(iso, 2)].join(), `1: ${datesOf(record)}`);
                await undoDated();

                // 2. back across the same midnight: no write; on to the left: a day earlier
                gesture = await pressAtX("Three days", here().left + 13);
                await moveHeld(gesture, next().left + 2);
                badgesAre(0, 2, "into the next day");
                await moveHeld(gesture, next().left - 2);
                badgesAre(-1, 1, "back");
                // close the notification of the Undo, so that any later one shows
                $(".o_notification .btn-close, .o_notification .o_notification_close")?.click();
                await until(() => !$(".o_notification"), "the Undo notification to close");
                release(gesture);
                await gridSettled();
                assert(!$(".o_notification"), "a notification after a release that changes nothing");
                assert(
                    datesOf(await datedRecord("Three days")).join() === original.join(),
                    "the record changed"
                );
                gesture = await pressAtX("Three days", here().left + 13);
                await moveHeld(gesture, here().left - 2);
                badgesAre(-2, 0, "the midnight before");
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                record = await datedRecord("Three days");
                assert(
                    datesOf(record).join() === [addDays(iso, -2), iso].join(),
                    `2: ${datesOf(record)}`
                );
                await undoDated();

                // 3. the stop: the middle of the day after the end, then back and left
                const end = () => cellOfDate(addDays(iso, 2)).left;
                gesture = await pressHandle("Three days", "stop");
                await dragHandleTo(gesture, end() + 10);
                badgesAre(-1, 1, "before the middle");
                await dragHandleTo(gesture, end() + 30);
                assert(
                    badgesNow()[1] === `${shortDate(today.plus({ days: 2 }))} (+1 days)`,
                    `past the middle: ${badgesNow()}`
                );
                await dragHandleTo(gesture, end() + 10);
                badgesAre(-1, 1, "back");
                await dragHandleTo(gesture, end() - 30);
                assert(
                    badgesNow()[1] === `${shortDate(today)} (-1 days)`,
                    `past the middle to the left: ${badgesNow()}`
                );
                await dragHandleTo(gesture, cellOfDate(addDays(iso, -6)).left);
                assert(
                    badgesNow()[1] === `${shortDate(today.minus({ days: 1 }))} (-2 days)`,
                    `never before the start day: ${badgesNow()}`
                );
                await dragHandleTo(gesture, end() - 30);
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                record = await datedRecord("Three days");
                assert(datesOf(record).join() === [original[0], iso].join(), `3: ${datesOf(record)}`);
                await undoDated();

                // 4. the start: the middle of the day before it
                const begin = () => cellOfDate(addDays(iso, -1)).left;
                gesture = await pressHandle("Three days", "start");
                await dragHandleTo(gesture, begin() - 20);
                badgesAre(-1, 1, "before the middle");
                await dragHandleTo(gesture, begin() - 30);
                assert(
                    badgesNow()[0] === `${shortDate(today.minus({ days: 2 }))} (+1 days)`,
                    `past the middle: ${badgesNow()}`
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                record = await datedRecord("Three days");
                assert(
                    datesOf(record).join() === [addDays(iso, -2), original[1]].join(),
                    `4: ${datesOf(record)}`
                );
                await undoDated();
            },
        },
    ],
});

tours.add("timeline_002b2_a59_year_scale", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const before = await datedRecord("Next month");
                const start = DateTime.fromISO(before.date_start);
                const stop = DateTime.fromISO(before.date_stop);
                const column = cellOfDate(start.startOf("month").toISODate()).width;
                // move: inside the month nothing, one month border later one month
                const gesture = await holdAndMove("Next month", {
                    to: { x: centreOf(pillNamed("Next month")).x + column / 4 },
                });
                assert(
                    badgesNow().join("|") === [shortDate(start), shortDate(stop)].join("|"),
                    `inside the month: ${badgesNow()}`
                );
                await moveHeld(gesture, gesture.end.x + column);
                assert(
                    badgesNow().join("|") ===
                        [shortDate(start.plus({ months: 1 })), shortDate(stop.plus({ months: 1 }))].join("|"),
                    `a month later: ${badgesNow()}`
                );
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                let record = await datedRecord("Next month");
                assert(
                    datesOf(record).join() ===
                        [start.plus({ months: 1 }).toISODate(), stop.plus({ months: 1 }).toISODate()].join(),
                    `moved: ${datesOf(record)}`
                );
                await undoDated();
                // resize: the end past the middle of the next month
                const resize = await pressHandle("Next month", "stop");
                const edge = bodyRight("Next month") + 1;
                await dragHandleTo(resize, edge + column * 0.3);
                assert(badgesNow()[1] === shortDate(stop), `before the middle: ${badgesNow()}`);
                await dragHandleTo(resize, edge + column * 0.7);
                assert(
                    badgesNow()[1] === `${shortDate(stop.plus({ months: 1 }))} (+1 months)`,
                    `past the middle: ${badgesNow()}`
                );
                release(resize);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                record = await datedRecord("Next month");
                assert(
                    datesOf(record).join() ===
                        [before.date_start, stop.plus({ months: 1 }).toISODate()].join(),
                    `resized: ${datesOf(record)}`
                );
                await undoDated();
            },
        },
    ],
});

tours.add("timeline_002b2_a71_date_only_copy", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const iso = todayIso();
                const today = DateTime.fromISO(iso);
                const gesture = await pressAtX("Three days", cellOfDate(iso).left + 13, { ctrl: true });
                await moveHeld(gesture, cellOfDate(addDays(iso, 1)).left + 2);
                assert($(".o_timeline_view").classList.contains("o_tl_drag_copy"), "no copy class");
                assert(
                    badgesNow().join("|") ===
                        [shortDate(today), shortDate(today.plus({ days: 2 }))].join("|"),
                    `badges ${badgesNow()}`
                );
                release(gesture);
                key("keyup", "Control");
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const copy = await datedRecord("Three days (copy)");
                assert(copy, "no copy");
                assert(datesOf(copy).join() === [iso, addDays(iso, 2)].join(), `copy ${datesOf(copy)}`);
                await undoDated("Copy removed");
                assert(!(await datedRecord("Three days (copy)")), "the copy stayed");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A62 and A71 (right-to-left part): moves and resizes in a right-to-left language (R6, R8, R19)
// ---------------------------------------------------------------------------------------------

/** The text with Arabic-Indic digits turned into ASCII digits, to read the numbers in it. */
const asciiDigits = (text) => text.replace(/[٠-٩]/g, (digit) => digit.charCodeAt(0) - 0x660);

/** Every badge shows its numbers in Arabic digits, from the user's locale, none in ASCII. */
function assertArabicDigits() {
    for (const text of badgesNow()) {
        assert(/[٠-٩]/.test(text) && !/[0-9]/.test(text), `badge '${text}' is not in Arabic digits`);
    }
}

/**
 * R19: a resize badge is the date in Arabic digits, then the difference in brackets: its number
 * and sign in Western digits, a space and the unit word in Arabic.
 */
function assertArabicDifference(text, difference, unitWord) {
    const [date, rest] = text.split(" (");
    assert(/[\u0660-\u0669]/.test(date) && !/[0-9]/.test(date), `date part '${date}' is not in Arabic digits`);
    assert(
        rest && rest.startsWith(`${difference} `) && rest.endsWith(")"),
        `badge '${text}' does not read '(${difference} ...)'`
    );
    const unit = rest.slice(difference.length + 1, -1);
    assert(unit === unitWord, `unit word '${unit}', expected '${unitWord}'`);
}

/** Click the Undo button of the notification (its label is in Arabic) and wait for it to close. */
async function undoInArabic() {
    const button = await until(() => $(".o_notification button"), "the Undo button");
    button.click();
    await until(() => !$(".o_notification button"), "the result of Undo");
    await gridSettled();
    // leave no notification behind: the next step waits for the one of its own write
    for (const close of $$(".o_notification .o_notification_close")) {
        close.click();
    }
    await until(() => !$(".o_notification"), "the notifications to close");
}

const nearTo = (a, b, what) => assert(Math.abs(a - b) <= 1, `${what}: ${a}, expected about ${b}`);

tours.add("timeline_002b2_a62_rtl_move_and_resize", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                assert(getComputedStyle(renderer()).direction === "rtl", "the view is not right to left");
                // Review one day later, to the left
                const pill = await until(() => pillNamed("Review"), "Review");
                let gesture = await holdAndMove("Review", {
                    to: { x: centreOf(pill).x - 2 * partWidthOf() },
                });
                const moved = $(".o_tl_pill_moved").getBoundingClientRect();
                const start = $(".o_tl_badge_start").getBoundingClientRect();
                const stop = $(".o_tl_badge_stop").getBoundingClientRect();
                nearTo(start.top, moved.bottom, "start badge below the pill");
                nearTo(start.right, moved.right, "start badge at the right end");
                nearTo(stop.bottom, moved.top, "stop badge above the pill");
                nearTo(stop.left, moved.left, "stop badge at the left end");
                nearTo(stop.height, 20, "badge height");
                assertArabicDigits();
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const record = await recordNamed("Review");
                assert(reviewAt(record, addDays(todayIso(), 1)), `Review is ${record.date_start}`);
                await undoInArabic();
                assert(reviewAt(await recordNamed("Review"), todayIso()), "Undo did not restore Review");

                // the handles of Build: start at the right end (east), stop at the left end (west)
                const build = await until(() => pillNamed("Build"), "Build");
                build.dispatchEvent(new MouseEvent("mouseenter"));
                await until(() => $$(".o_tl_handle", build).length === 2, "two handles");
                const body = build.getBoundingClientRect();
                const startHandle = $(".o_tl_handle_start", build);
                const stopHandle = $(".o_tl_handle_stop", build);
                nearTo(startHandle.getBoundingClientRect().right, body.right, "start handle at the right end");
                nearTo(stopHandle.getBoundingClientRect().left, body.left, "stop handle at the left end");
                assert(getComputedStyle(startHandle).cursor === "e-resize", "start cursor");
                assert(getComputedStyle(stopHandle).cursor === "w-resize", "stop cursor");
                build.dispatchEvent(new MouseEvent("mouseleave"));
                await until(() => !$(".o_tl_handle"), "the handles to go");

                // the left handle one day further left: the stop one day later
                const before = await recordNamed("Build");
                // the grid shifted right a little: a day after Build's end then lies clear of the edge zone
                await scrollGridLeft(-300);
                gesture = await pressHandle("Build", "stop");
                await dragHandleTo(gesture, gesture.from.x - 2 * partWidthOf());
                assert($(".o_timeline_view").classList.contains("o_tl_drag_west"), "no west resize shape");
                assert($$(".o_tl_selection_badge")[1].classList.contains("text-success"), "not success");
                // the date in Arabic digits; the difference "(+24" in Western digits, then an Arabic word
                // hours, from the module's Arabic translations (the translation reached the browser)
                assertArabicDifference(badgesNow()[1], "+24", "\u0633\u0627\u0639\u0627\u062a");
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const after = await recordNamed("Build");
                assert(after.date_start === before.date_start, "the start changed");
                assert(
                    after.date_stop === addHours(before, "date_stop", 24),
                    `stop ${after.date_stop} instead of ${addHours(before, "date_stop", 24)} (was ${before.date_stop})`
                );
                await undoInArabic();
                assert((await recordNamed("Build")).date_stop === before.date_stop, "Undo did not restore Build");
            },
        },
    ],
});

tours.add("timeline_002b2_a71_rtl_date_only_move", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                assert(getComputedStyle(renderer()).direction === "rtl", "the view is not right to left");
                const iso = todayIso();
                // press near the right end (the start) of "Three days" and move one day later (left)
                const gesture = await pressAtX("Three days", cellOfDate(iso).right - 13);
                await moveHeld(gesture, cellOfDate(addDays(iso, 1)).right - 2);
                const moved = $(".o_tl_pill_moved").getBoundingClientRect();
                const start = $(".o_tl_badge_start").getBoundingClientRect();
                const stop = $(".o_tl_badge_stop").getBoundingClientRect();
                nearTo(start.top, moved.bottom, "start badge below the pill");
                nearTo(start.right, moved.right, "start badge at the right end");
                nearTo(stop.bottom, moved.top, "stop badge above the pill");
                nearTo(stop.left, moved.left, "stop badge at the left end");
                assertArabicDigits();
                assert(badgesNow().every((text) => !text.includes(":")), "a badge shows a time");
                // the same two dates as in left-to-right, without time, in Arabic digits
                const [startText, stopText] = badgesNow();
                assert(startText === arabicDate(iso), `start badge '${startText}'`);
                assert(stopText === arabicDate(addDays(iso, 2)), `stop badge '${stopText}'`);
                release(gesture);
                await until(() => noticeText(), "the notification");
                await gridSettled();
                const record = await datedRecord("Three days");
                assert(
                    datesOf(record).join() === [iso, addDays(iso, 2)].join(),
                    `Three days is ${datesOf(record)}`
                );
                await undoInArabic();
                assert(
                    datesOf(await datedRecord("Three days")).join() ===
                        [addDays(iso, -1), addDays(iso, 1)].join(),
                    "Undo did not restore Three days"
                );
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A75: the grid headers in a right-to-left language (R25)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b2_a75_rtl_headers", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_col_group",
            async run() {
                assert(getComputedStyle(renderer()).direction === "rtl", "the view is not right to left");
                const weekday = new Intl.DateTimeFormat("ar-001", { weekday: "long" });
                const month = new Intl.DateTimeFormat("ar-001", { month: "short" });
                const days = $$(".o_tl_col");
                const weeks = $$(".o_tl_col_group_label").map((label) => label.textContent.trim());
                // no Western digit in any header
                for (const text of [...days.map((day) => day.textContent.trim()), ...weeks]) {
                    assert(!/[0-9]/.test(text), `header '${text}' holds a Western digit`);
                }
                // the day line: the weekday name and the day number in Arabic digits
                for (const day of days) {
                    const text = day.textContent.trim();
                    const date = DateTime.fromISO(day.dataset.date);
                    const wanted = `${weekday.format(date.toJSDate())} ${indic(date.day)}`;
                    assert(text === wanted, `day header '${text}', expected '${wanted}'`);
                }
                // weeks start on Saturday and each header names its week
                assert(days.length % 7 === 0 && weeks.length === days.length / 7, "weeks and days do not fit");
                weeks.forEach((text, index) => {
                    const saturday = DateTime.fromISO(days[index * 7].dataset.date);
                    assert(saturday.weekday === 6, `the week starts on ${saturday.toISODate()}`);
                    const friday = saturday.plus({ days: 6 });
                    const number = indic(saturday.plus({ days: 3 }).weekNumber);
                    // the year, when it is not the current one, follows the day numbers
                    const plain = text.replace(/ [\u0660-\u0669]{4}/g, "");
                    const wanted =
                        `Week ${number}, ${indic(saturday.day)} ${month.format(saturday.toJSDate())}` +
                        ` - ${indic(friday.day)} ${month.format(friday.toJSDate())}`;
                    assert(plain === wanted, `week header '${text}', expected '${wanted}'`);
                });
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A76: the chain of empty-value rows under the leading one (R26)
// ---------------------------------------------------------------------------------------------

/** The rows from the top: label, height and the titles of the pills they hold. */
const rowChain = () =>
    $$(".o_tl_row[data-row-id]:not(.o_tl_total_row)").map((row) => ({
        name: $(".o_tl_row_name", row)?.textContent.trim(),
        height: Math.round(row.getBoundingClientRect().height),
        pills: $$(".o_tl_pill", row).map((pill) => pill.textContent.trim()),
    }));

const holdsPlan = (row) => row.pills.some((text) => text.includes("Plan"));

tours.add("timeline_002b2_a76_chain_of_empty_rows_h30", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_name",
            async run() {
                const rows = rowChain();
                assert(rows[0].name === "Undefined Parent", `first row: ${rows[0].name}`);
                assert(rows[1].name === "Undefined Created by", `second row: ${rows[1].name}`);
                assert(rows[1].height === 41, `the empty row is ${rows[1].height} px`);
                assert(rows[1].pills.length === 0, "the empty creator row holds a pill");
                assert(!rows[2].name.startsWith("Undefined"), `third row: ${rows[2].name}`);
                assert(holdsPlan(rows[2]), "Plan is not in the creator's row");
                for (const parent of ["Alpha", "Beta", "Gamma"]) {
                    const at = rows.findIndex((row) => row.name === parent);
                    assert(at > 2, `no ${parent} row`);
                    assert(
                        rows[at + 1].name === rows[2].name &&
                            rows[at + 2]?.name !== "Undefined Created by",
                        `${parent} is not followed by the creator's row only`
                    );
                }
            },
        },
    ],
});

tours.add("timeline_002b2_a76_chain_of_empty_rows_h32", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row_name",
            async run() {
                const rows = rowChain();
                assert(rows[0].name === "Undefined Parent", `first row: ${rows[0].name}`);
                assert(
                    rows[1].name === "Undefined Created by" && rows[1].height === 40,
                    `second row: ${rows[1].name} ${rows[1].height}`
                );
                assert(
                    rows[2].name === "Undefined Contact" && rows[2].height === 41,
                    `third row: ${rows[2].name} ${rows[2].height}`
                );
                assert(rows[1].pills.length + rows[2].pills.length === 0, "an empty row holds a pill");
                assert(!rows[3].name.startsWith("Undefined"), `fourth row: ${rows[3].name}`);
                assert(
                    rows[4].name === "Undefined Contact" && holdsPlan(rows[4]),
                    `fifth row: ${rows[4].name}`
                );
            },
        },
    ],
});
