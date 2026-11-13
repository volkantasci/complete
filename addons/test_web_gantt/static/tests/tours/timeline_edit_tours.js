// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of the editing behaviours of the timeline view (slice 002b) in a real browser. Dates are
 * taken from the browser's today (the header of the column marked as today), so they hold on any
 * day; the Python wrappers check the database with the same day. Pointer gestures (drag, press,
 * tap) are PointerEvents dispatched on the cells with coordinates computed from their rectangles:
 * the view listens to pointerdown on a cell and to pointermove and pointerup on the document.
 */

const tours = registry.category("web_tour.tours");
const { DateTime } = luxon;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async () => {
    await frame();
    await frame();
};

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
const addDays = (iso, days) => DateTime.fromISO(iso).plus({ days }).toISODate();
const headerOf = (iso) => $(`.o_tl_col[data-date="${iso}"]`);
const pillRow = () =>
    $$(".o_tl_row").find(
        (row) =>
            !row.classList.contains("o_tl_total_row") && !row.classList.contains("o_tl_group_row")
    );
const rowNamed = (name) =>
    $$(".o_tl_row").find((row) => $(".o_tl_row_label", row)?.textContent.trim() === name);
const cellOf = (row, iso) => {
    const header = headerOf(iso);
    assert(header, `no column for ${iso}`);
    return $(`.o_tl_cell[data-column="${header.dataset.index}"]`, row);
};
const pillsNamed = (name) =>
    $$(".o_tl_pill").filter((pill) => $(".o_tl_pill_title", pill).textContent.trim() === name);
const pillNamed = (name) => pillsNamed(name)[0];
const pad = (n) => String(n).padStart(2, "0");

/** The middle of the visible part of the grid (what the sticky title cell leaves free). */
function visibleMiddle() {
    const box = renderer().getBoundingClientRect();
    const title = $(".o_tl_title_cell");
    const left = title ? Math.max(box.left, title.getBoundingClientRect().right) : box.left;
    return (left + box.left + renderer().clientWidth) / 2;
}

/** Scroll the grid so that the middle of the header of `iso` is in the middle of the view. */
async function centreOn(iso) {
    const box = headerOf(iso).getBoundingClientRect();
    renderer().scrollLeft += (box.left + box.right) / 2 - visibleMiddle();
    await settle();
}

// -- pointer gestures ---------------------------------------------------------------------------

function fire(target, type, x, y, pointerType = "mouse") {
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
            clientX: x,
            clientY: y,
        })
    );
}

/** A point inside `element`: fractions of its width and height (the bottom part by default). */
function pointIn(element, fx = 0.5, bottomGap = 4) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width * fx, y: rect.bottom - bottomGap };
}

/** A real click sequence on an element, optionally of a given pointer type. */
function click(element, point = null, pointerType = "mouse") {
    const { x, y } = point || pointIn(element, 0.5, element.getBoundingClientRect().height / 2);
    fire(element, "pointerdown", x, y, pointerType);
    fire(element, "pointerup", x, y, pointerType);
    element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })
    );
}

function doubleClick(element) {
    const rect = element.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    for (const detail of [1, 2]) {
        fire(element, "pointerdown", x, y);
        fire(element, "pointerup", x, y);
        element.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail })
        );
    }
    element.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 2 })
    );
}

/** Press on `cell` at the fraction `fx` of its width (bottom part). Returns the point. */
function press(cell, fx, pointerType = "mouse") {
    const point = pointIn(cell, fx);
    fire(cell, "pointerdown", point.x, point.y, pointerType);
    return point;
}

/** Move the pointer to a viewport point in `steps` moves, a frame apart. */
async function moveTo(from, to, pointerType = "mouse", steps = 6) {
    for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        fire(document, "pointermove", x, y, pointerType);
        await frame();
    }
    await settle();
    return to;
}

function release(point, pointerType = "mouse") {
    fire(document, "pointerup", point.x, point.y, pointerType);
}

function escape() {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
}

// -- dialogs and forms --------------------------------------------------------------------------

const dialogTitled = (title) =>
    $$(".o_dialog").find((dialog) => $(".modal-title", dialog)?.textContent.trim() === title);
// errors the page raises while a tour waits are part of the message of a timeout
const pageErrors = [];
window.addEventListener("error", (ev) => pageErrors.push(String(ev.message)));
window.addEventListener("unhandledrejection", (ev) =>
    pageErrors.push(String(ev.reason?.message || ev.reason))
);
const openDialog = (title) =>
    until(
        () => dialogTitled(title),
        `the "${title}" dialog (open: ${$$(".o_dialog .modal-title").map(
            (t) => t.textContent
        )}; page errors: ${pageErrors.join(" | ")})`
    );
const dialogGone = (title) => until(() => !dialogTitled(title), `the "${title}" dialog to close`);
const noDialogs = () => until(() => !$(".o_dialog"), "every dialog to close");
const buttonOf = (root, text) =>
    $$("button", root).find((button) => button.textContent.trim() === text);
/** A date field of the form is a button holding the text in its value; the others are inputs. */
const fieldInput = (dialog, name) =>
    $(`.o_field_widget[name="${name}"] input, .o_field_widget[name="${name}"] button[data-field]`, dialog);
/** The input of a field once the form of the dialog has rendered it. */
const fieldBox = (dialog, name) => $(`.o_field_widget[name="${name}"]`, dialog);
const fieldOf = (dialog, name) =>
    until(
        () => fieldInput(dialog, name),
        `the field ${name} in ${$(`[name="${name}"]`, dialog)?.outerHTML.slice(0, 1500)}`
    );

async function typeInto(input, text) {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
}

/** en_US text of a datetime field, as the dialog shows it ("11/13/2026 12:00:00 PM"). */
const usDateTime = (iso, hour = 0, minute = 0) =>
    `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)} ${pad(hour % 12 || 12)}:${pad(minute)}:00 ${hour < 12 ? "AM" : "PM"}`;
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
/** en_US text of a badge: "11/8/2026, 12:00 PM". */
const badgeUs = (iso, time) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}, ${time}`;

// -- requests -----------------------------------------------------------------------------------

/**
 * Log every request the page sends from now on (`{url, body}`), and optionally hold those for
 * which `hold(url)` is true until `window.__tlGate.release()` is called. `onResponse` is called
 * with the URL when a held request's response arrives, before the rpc layer (which listens to the
 * later load event) and so before anything that depends on the response can react to it.
 */
function spyRequests({ hold = null, onResponse = null, onSend = null } = {}) {
    const log = [];
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    window.__tlGate = { release };
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__tlUrl = String(url);
        if (hold && hold(this.__tlUrl) && onResponse) {
            // readystatechange comes before the load event the rpc layer listens to
            this.addEventListener("readystatechange", () => {
                if (this.readyState === 4) {
                    onResponse(this.__tlUrl);
                }
            });
        }
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
        const url = this.__tlUrl || "";
        const entry = { url, body: typeof body === "string" ? body : "" };
        log.push(entry);
        if (onSend) {
            onSend(url);
        }
        if (hold && hold(url)) {
            gate.then(() => send.call(this, body));
            return;
        }
        return send.call(this, body);
    };
    return log;
}
const callsOf = (log, method) => log.filter((entry) => entry.url.includes(`/${method}`));
const dataCalls = (log) => callsOf(log, "get_gantt_data").length;

// The grid is drawn as soon as the first data has come; the view settles (scroll to today, the
// layout of the rows) a moment later, and a click in between would hit a replaced element.
const gridReady = {
    trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today",
    async run() {
        await sleep(500);
    },
};

// ---------------------------------------------------------------------------------------------
// A8: drawing a selection, the create dialog, Discard clears the highlight
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a8_selection_dialog", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const log = spyRequests();
                const day = todayIso();
                const row = pillRow();
                const first = cellOf(row, day);
                const last = cellOf(row, addDays(day, 2));
                const from = press(first, 0.75);
                await moveTo(from, pointIn(last, 0.25));
                const selection = await until(() => $(".o_tl_selection"), "the highlight");
                const box = selection.getBoundingClientRect();
                const startX = first.getBoundingClientRect();
                const stopX = last.getBoundingClientRect();
                assert(
                    Math.abs(box.left - (startX.left + startX.width / 2)) <= 2,
                    `the highlight starts at ${box.left}, expected the middle of the first day`
                );
                assert(
                    Math.abs(box.right - (stopX.left + stopX.width / 2)) <= 2,
                    `the highlight ends at ${box.right}, expected the middle of the last day`
                );
                const rowBox = row.getBoundingClientRect();
                assert(
                    Math.abs(box.height - rowBox.height) <= 2,
                    `the highlight is ${box.height} high, the row ${rowBox.height}`
                );
                const start = $(".o_tl_selection_badge.o_tl_badge_start").textContent.trim();
                const stop = $(".o_tl_selection_badge.o_tl_badge_stop").textContent.trim();
                assert(start === badgeUs(day, "12:00 PM"), `start badge "${start}"`);
                assert(
                    stop === badgeUs(addDays(day, 2), "12:00 PM"),
                    `stop badge "${stop}"`
                );
                release(pointIn(last, 0.25));
                const dialog = await openDialog("Create");
                assert(
                    (await fieldOf(dialog, "date_start")).value.startsWith(usDateTime(day, 12)),
                    `start ${(await fieldOf(dialog, "date_start")).value}`
                );
                assert(
                    (await fieldOf(dialog, "date_stop")).value.startsWith(usDateTime(addDays(day, 2), 12)),
                    `stop ${(await fieldOf(dialog, "date_stop")).value}`
                );
                assert($(".o_tl_selection"), "the highlight did not stay while the dialog is open");
                const before = dataCalls(log);
                $(".o_form_button_cancel", dialog).click();
                await noDialogs();
                await until(() => !$(".o_tl_selection"), "the highlight to disappear");
                await until(() => dataCalls(log) === before + 1, "the view to reload");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A12: edge scrolling while selecting
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a12_edge_scroll", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = todayIso();
                const row = pillRow();
                const box = renderer().getBoundingClientRect();
                const cell = cellOf(row, day);
                const from = press(cell, 0.5);
                const y = from.y;
                // leave the zones first: a selection is drawn in the middle of the grid
                await moveTo(from, { x: (box.left + box.right) / 2, y });
                await until(() => $(".o_tl_selection"), "the highlight");
                const widthOf = () => $(".o_tl_selection").getBoundingClientRect().width;
                const scroll0 = renderer().scrollLeft;
                const width0 = widthOf();
                // 100 px from the right edge: the grid scrolls to the right, the selection grows
                const right = { x: box.right - 100, y };
                await moveTo({ x: (box.left + box.right) / 2, y }, right);
                await until(
                    () => renderer().scrollLeft > scroll0 + 100,
                    `the grid scrolling right (${renderer().scrollLeft} from ${scroll0})`
                );
                await until(() => widthOf() > width0 + 100, "the selection growing");
                const peak = renderer().scrollLeft;
                // near the left edge: it scrolls back
                const left = { x: box.left + 60, y };
                await moveTo(right, left);
                await until(
                    () => renderer().scrollLeft < peak - 100,
                    `the grid scrolling back (${renderer().scrollLeft} from ${peak})`
                );
                escape();
                await until(() => !$(".o_tl_selection"), "the highlight to disappear");
                release(left);
                await sleep(300);
                assert(!$(".o_dialog"), "a dialog opened after the selection was cancelled");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A15 + A28: a click plans the whole column, in the Beta row; Select writes dates and the row
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a15_a28_plan_beta_row", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const log = spyRequests();
                const day = todayIso();
                const beta = await until(() => rowNamed("Beta"), "the Beta row");
                click(cellOf(beta, day), pointIn(cellOf(beta, day), 0.5));
                const dialog = await openDialog("Plan");
                // the row is the facet "Parent: Beta": only Unscheduled is listed
                await until(() => $(".o_data_row", dialog), "the list of the plan dialog");
                const names = $$(".o_data_row .o_data_cell[name=name]", dialog).map((cell) =>
                    cell.textContent.trim()
                );
                assert(
                    JSON.stringify(names) === '["Unscheduled"]',
                    `the plan dialog lists ${JSON.stringify(names)}`
                );
                const facet = $(".o_searchview_facet", dialog)?.textContent.replace(/\s+/g, " ");
                assert(facet && facet.includes("Beta"), `facet "${facet}"`);
                assert(
                    $(".o_select_button", dialog).disabled,
                    "Select is enabled before a record is checked"
                );
                $(".o_data_row .o-checkbox input", dialog).click();
                await until(() => !$(".o_select_button", dialog).disabled, "Select to be enabled");
                $(".o_select_button", dialog).click();
                await noDialogs();
                const writes = callsOf(log, "write");
                assert(writes.length === 1, `${writes.length} writes were sent`);
                const body = JSON.parse(writes[0].body);
                const values = body.params.args[1];
                assert(
                    values.date_start && values.date_stop && values.parent_id,
                    `the write holds ${JSON.stringify(values)}`
                );
                assert(
                    body.params.kwargs.context && "lang" in body.params.kwargs.context,
                    "the write carries no context"
                );
                await until(
                    () => $$(".o_tl_pill_title", rowNamed("Beta")).some(
                        (title) => title.textContent.trim() === "Unscheduled"
                    ),
                    "the pill of Unscheduled in the Beta row"
                );
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A29b: a click on the name of a record plans it at once
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a29b_plan_by_row_click", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = addDays(todayIso(), 3);
                const row = pillRow();
                click(cellOf(row, day));
                const dialog = await openDialog("Plan");
                await until(() => $(".o_data_row", dialog), "the list of the plan dialog");
                const names = $$(".o_data_row .o_data_cell[name=name]", dialog)
                    .map((cell) => cell.textContent.trim())
                    .sort();
                assert(
                    JSON.stringify(names) === '["Alpha","Beta","Gamma","Unscheduled"]',
                    `the plan dialog lists ${JSON.stringify(names)}`
                );
                const cell = $$(".o_data_row .o_data_cell[name=name]", dialog).find(
                    (item) => item.textContent.trim() === "Unscheduled"
                );
                cell.click();
                await dialogGone("Plan");
                await until(() => pillNamed("Unscheduled"), "the pill of Unscheduled");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A31: Create New in the plan dialog (Discard keeps the plan dialog, Save closes both)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a31_create_new_in_plan", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const log = spyRequests();
                const day = addDays(todayIso(), 3);
                click(cellOf(pillRow(), day));
                const plan = await openDialog("Plan");
                assert($(".o_create_button", plan), "the plan dialog has no Create New");
                // Discard: only the create dialog closes
                $(".o_create_button", plan).click();
                let create = await openDialog("Create");
                assert(
                    (await fieldOf(create, "date_start")).value.startsWith(usDateTime(day, 0)),
                    `start ${(await fieldOf(create, "date_start")).value}`
                );
                assert(
                    (await fieldOf(create, "date_stop")).value.startsWith(usDateTime(addDays(day, 1), 0)),
                    `stop ${(await fieldOf(create, "date_stop")).value}`
                );
                $(".o_form_button_cancel", create).click();
                await dialogGone("Create");
                assert(dialogTitled("Plan"), "the plan dialog closed with the create dialog");
                // Save: both close
                $(".o_create_button", dialogTitled("Plan")).click();
                create = await openDialog("Create");
                await typeInto(await fieldOf(create, "name"), "Zeta planned");
                $(".o_form_button_save", create).click();
                await noDialogs();
                const writes = callsOf(log, "write");
                assert(writes.length === 1, `${writes.length} writes followed the save`);
                await until(() => pillNamed("Zeta planned"), "the new pill");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A34 + A35 + A37: open by double click and by the popover, rename, reload
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a34_a35_a37_open_rename", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const log = spyRequests();
                // A34: a double click opens the record, no popover
                doubleClick(await until(() => pillNamed("Build"), "Build"));
                let dialog = await openDialog("Open");
                assert(
                    (await fieldOf(dialog, "name")).value === "Build",
                    "the record dialog does not show Build"
                );
                await sleep(500);
                assert(!$(".o_tl_popover"), "a popover opened with the double click");
                $(".o_form_button_cancel", dialog).click();
                await noDialogs();
                // A35: the popover button
                click(pillNamed("Build"));
                const button = await until(() => $(".o_tl_popover_button"), "the popover button");
                assert(button.textContent.trim() === "Edit", `button "${button.textContent}"`);
                button.click();
                await until(() => !$(".o_tl_popover"), "the popover to close");
                dialog = await openDialog("Open");
                const name = await fieldOf(dialog, "name");
                assert(name.value === "Build", `name ${name.value}`);
                assert($(".o_form_button_save", dialog), "no Save");
                assert($(".o_form_button_cancel", dialog), "no Discard");
                assert(buttonOf(dialog, "Remove"), "no Remove");
                // A37: rename, save, the pill follows
                await typeInto(name, "Build 2");
                $(".o_form_button_save", dialog).click();
                await noDialogs();
                await until(() => pillNamed("Build 2"), "the pill to read Build 2");
                // opened again and closed with the cross: one reload, nothing else changes
                doubleClick(pillNamed("Build 2"));
                dialog = await openDialog("Open");
                await fieldOf(dialog, "name");
                await sleep(300);
                const before = dataCalls(log);
                $(".btn-close", dialog).click();
                await noDialogs();
                await until(() => dataCalls(log) === before + 1, "one data call");
                await sleep(300);
                assert(dataCalls(log) === before + 1, "more than one data call");
                assert(pillNamed("Build 2"), "the pill changed");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A38: the record dialog waits for the view's write
//
// The write of the plan dialog is held in the page: the patched XMLHttpRequest keeps the request
// of `write` on the model until the tour releases it. While it is held, the pill "Build" is
// double clicked. Nothing may open and no other request may leave; once the write is released,
// the log must show the response of the write before the first request of the record dialog.
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a38_dialog_waits_for_write", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const events = [];
                let watching = false;
                spyRequests({
                    hold: (url) => url.includes("/test.web.gantt.pill/write"),
                    onResponse: () => events.push("write-response"),
                    onSend: (url) => {
                        if (url.includes("/test.web.gantt.pill/write")) {
                            events.push("write-held");
                        } else if (watching) {
                            events.push(`request:${url}`);
                        }
                    },
                });
                const day = addDays(todayIso(), 3);
                click(cellOf(pillRow(), day));
                const plan = await openDialog("Plan");
                await until(() => $(".o_data_row", plan), "the plan list");
                $$(".o_data_row .o_data_cell[name=name]", plan)
                    .find((cell) => cell.textContent.trim() === "Unscheduled")
                    .click();
                await until(() => events.includes("write-held"), "the write to be sent");
                watching = true;
                doubleClick(pillNamed("Build"));
                await sleep(800);
                assert(!dialogTitled("Open"), "the record dialog opened while the write is held");
                assert(
                    !events.some((event) => event.startsWith("request:")),
                    `requests left while the write is held: ${events}`
                );
                window.__tlGate.release();
                await openDialog("Open");
                const at = events.indexOf("write-response");
                const form = events.findIndex((event) => event.startsWith("request:"));
                assert(at >= 0, `the write has no response in the log: ${events}`);
                assert(form > at, `the dialog's request came before the write response: ${events}`);
                $(".btn-close", dialogTitled("Open")).click();
                await noDialogs();
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A42: confirming a deletion; A43: keeping the record
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a42_delete", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                doubleClick(await until(() => pillNamed("Temp"), "the pill Temp"));
                const dialog = await openDialog("Open");
                await fieldOf(dialog, "name");
                buttonOf(dialog, "Remove").click();
                const confirm = await until(
                    () => $$(".o_dialog").find((item) => buttonOf(item, "Delete")),
                    "the confirmation"
                );
                buttonOf(confirm, "Delete").click();
                await noDialogs();
                await until(() => !pillNamed("Temp"), "Temp to disappear from the view");
            },
        },
    ],
});

tours.add("timeline_002b_a43_keep", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                doubleClick(await until(() => pillNamed("Build"), "Build"));
                const dialog = await openDialog("Open");
                await fieldOf(dialog, "name");
                buttonOf(dialog, "Remove").click();
                const confirm = await until(
                    () => $$(".o_dialog").find((item) => buttonOf(item, "No, keep it")),
                    "the confirmation"
                );
                buttonOf(confirm, "No, keep it").click();
                await until(() => $$(".o_dialog").length === 1, "the confirmation to close");
                assert(dialogTitled("Open"), "the record dialog closed");
                assert(pillNamed("Build"), "Build disappeared");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A44: the restricted user
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a44_restricted_user", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                assert(!$(".o_tl_button_add"), "the New button is shown");
                const day = todayIso();
                const row = pillRow();
                const cell = cellOf(row, addDays(day, 3));
                click(cell);
                await sleep(500);
                assert(!$(".o_dialog"), "a click on a cell opened a dialog");
                const from = press(cell, 0.3);
                await moveTo(from, pointIn(cell, 0.9));
                await sleep(200);
                assert(!$(".o_tl_selection"), "a selection was drawn");
                release(pointIn(cell, 0.9));
                await sleep(300);
                assert(!$(".o_dialog"), "a dialog opened after the move");
                click(await until(() => pillNamed("Build"), "Build"));
                const button = await until(() => $(".o_tl_popover_button"), "the popover button");
                assert(button.textContent.trim() === "View", `button "${button.textContent}"`);
                button.click();
                const dialog = await openDialog("Open");
                const name = await until(() => fieldBox(dialog, "name"), "the form");
                assert(!fieldInput(dialog, "name"), "the name is editable");
                assert(!$(".o_form_button_save", dialog), "Save is shown");
                assert(!buttonOf(dialog, "Remove"), "Remove is shown");
            },
        },
    ],
});

// A1b: an explicit yes for a user without the right: the server refuses
tours.add("timeline_002b_a1b_explicit_yes_refused", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                doubleClick(await until(() => pillNamed("Build"), "Build"));
                const dialog = await openDialog("Open");
                await until(() => fieldBox(dialog, "name"), "the form");
                assert(
                    buttonOf(dialog, "Remove"),
                    `no Remove; buttons: ${$$("button", dialog).map((b) => b.textContent.trim())}`
                );
                buttonOf(dialog, "Remove").click();
                const confirm = await until(
                    () => $$(".o_dialog").find((item) => buttonOf(item, "Delete")),
                    "the confirmation"
                );
                buttonOf(confirm, "Delete").click();
                const error = await until(() => $(".o_error_dialog"), "the error dialog");
                assert(
                    /not allowed|Access Error|delete/i.test(error.textContent),
                    `error text: ${error.textContent.slice(0, 200)}`
                );
                // close everything: the view reloads and still shows the record
                for (let i = 0; i < 6 && $(".o_dialog"); i++) {
                    const top = $$(".o_dialog").at(-1);
                    ($(".btn-close", top) || $("button", top)).click();
                    await sleep(300);
                }
                await noDialogs();
                await until(() => pillNamed("Build"), "Build to be shown");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// Phone: A45, A46, A47 (touch), A48 (no touch)
// ---------------------------------------------------------------------------------------------

const tap = (element, point = null) => click(element, point, "touch");

tours.add("timeline_002b_a45_phone_tap_plans", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = addDays(todayIso(), 1);
                tap(cellOf(pillRow(), day));
                const dialog = await openDialog("Plan");
                assert(
                    $(".modal-dialog.modal-fullscreen", dialog) || dialog.querySelector(".modal.o_modal_full"),
                    "the plan dialog is not full screen"
                );
                const cards = await until(() => $$(".o_kanban_record", dialog).length, "the cards");
                assert(cards > 0, "no cards");
                const card = $$(".o_kanban_record", dialog).find((item) =>
                    item.textContent.includes("Unscheduled")
                );
                assert(card, "no card Unscheduled");
                card.click();
                await dialogGone("Plan");
                await until(() => pillNamed("Unscheduled"), "the pill of Unscheduled");
            },
        },
    ],
});

tours.add("timeline_002b_a45b_phone_tap_creates", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = addDays(todayIso(), 1);
                tap(cellOf(pillRow(), day));
                const dialog = await openDialog("Create");
                assert(
                    $(".modal-dialog.modal-fullscreen", dialog) || dialog.querySelector(".modal.o_modal_full"),
                    "the create dialog is not full screen"
                );
            },
        },
    ],
});

tours.add("timeline_002b_a46_phone_long_press", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = todayIso();
                const row = pillRow();
                const cell = cellOf(row, day);
                // a finger that moves at once scrolls the grid: nothing is selected
                let from = press(cell, 0.3, "touch");
                const hurried = { x: from.x + 30, y: from.y };
                await moveTo(from, hurried, "touch", 3);
                await sleep(500);
                assert(!$(".o_tl_selection"), "a selection was drawn without a long press");
                release(hurried, "touch");
                await sleep(300);
                assert(!$(".o_dialog"), "a dialog opened after a quick move");
                // held for 300 ms, then moved one day to the right
                const next = cellOf(row, addDays(day, 1));
                from = press(cell, 0.3, "touch");
                await sleep(450);
                await moveTo(from, pointIn(next, 0.3), "touch", 4);
                await until(() => $(".o_tl_selection"), "the highlight");
                assert($(".o_tl_selection_badge.o_tl_badge_start"), "no start badge");
                assert($(".o_tl_selection_badge.o_tl_badge_stop"), "no stop badge");
                release(pointIn(next, 0.3), "touch");
                await openDialog("Create");
            },
        },
    ],
});

tours.add("timeline_002b_a47_phone_popover_dialog", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const height = window.innerHeight;
                tap(await until(() => pillNamed("Build"), "Build"));
                const button = await until(() => $(".o_tl_popover_button"), "the popover button");
                assert($(".o_tl_popover_sheet"), "the popover is not a sheet");
                const buttonBox = button.getBoundingClientRect();
                assert(
                    buttonBox.bottom > height - 120,
                    `Edit ends at ${buttonBox.bottom} of ${height}`
                );
                button.click();
                const dialog = await openDialog("Open");
                assert(
                    $(".modal-dialog.modal-fullscreen", dialog) || dialog.querySelector(".modal.o_modal_full"),
                    "the record dialog is not full screen"
                );
                await until(() => fieldBox(dialog, "name"), "the form");
                const stack = ["Save", "Discard", "Remove"].map((text) => {
                    const item = buttonOf(dialog, text);
                    assert(item, `no ${text} button`);
                    return item.getBoundingClientRect();
                });
                for (let i = 1; i < stack.length; i++) {
                    assert(
                        stack[i].top >= stack[i - 1].bottom - 1 &&
                            Math.abs(stack[i].left - stack[0].left) <= 2,
                        `the buttons are not stacked: ${JSON.stringify(stack)}`
                    );
                }
                buttonOf(dialog, "Remove").click();
                const confirm = await until(
                    () => $$(".o_dialog").find((item) => buttonOf(item, "Delete")),
                    "the confirmation"
                );
                const box = $(".modal-content", confirm).getBoundingClientRect();
                // The spec puts the box at the bottom of the phone screen (S6 phone). That is the
                // look of the theme's dialogs, which this database does not have (the stock dialog
                // is centred, see the report): here only that the box is whole on screen and has
                // both buttons is checked; the position belongs to the visual probes (A55).
                assert(
                    box.top >= 0 && box.bottom <= height,
                    `the confirmation is cut: ${box.top} to ${box.bottom} of ${height}`
                );
                assert(buttonOf(confirm, "No, keep it"), "the confirmation has no keep button");
            },
        },
    ],
});

tours.add("timeline_002b_a48_phone_mouse_drag", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const cell = cellOf(pillRow(), todayIso());
                const from = press(cell, 0.2, "mouse");
                const to = { x: from.x + 40, y: from.y };
                await moveTo(from, to, "mouse", 4);
                await until(() => $(".o_tl_selection"), "the highlight without a long press");
                assert($(".o_tl_selection_badge.o_tl_badge_start"), "no start badge");
                escape();
                release(to);
                await until(() => !$(".o_tl_selection"), "the highlight to disappear");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A5b: New on the week range with weeks starting on Monday (English UK)
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a5b_new_week_monday", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_button_add",
            async run() {
                const today = DateTime.fromISO(todayIso());
                const monday = today.minus({ days: today.weekday - 1 });
                const gb = (date, hour = 0) =>
                    `${pad(date.day)}/${pad(date.month)}/${date.year} ${pad(hour)}:00`;
                for (const offset of [3, 6]) {
                    // Thursday, then Sunday of that week, in the middle of the view
                    await centreOn(monday.plus({ days: offset }).toISODate());
                    $(".o_tl_button_add").click();
                    const dialog = await openDialog("Create");
                    const start = (await fieldOf(dialog, "date_start")).value;
                    const stop = (await fieldOf(dialog, "date_stop")).value;
                    assert(start.startsWith(gb(monday)), `start ${start}, expected ${gb(monday)}`);
                    assert(
                        stop.startsWith(gb(monday.plus({ days: 7 }))),
                        `stop ${stop}, expected ${gb(monday.plus({ days: 7 }))}`
                    );
                    $(".o_form_button_cancel", dialog).click();
                    await noDialogs();
                }
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A27: saving a new record
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a27_create_zeta", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = addDays(todayIso(), 3);
                click(cellOf(pillRow(), day));
                const dialog = await openDialog("Create");
                await typeInto(await fieldOf(dialog, "name"), "Zeta");
                $(".o_form_button_save", dialog).click();
                await noDialogs();
                const pill = await until(() => pillNamed("Zeta"), "Zeta in the view");
                const column = headerOf(day).getBoundingClientRect();
                const box = pill.getBoundingClientRect();
                assert(
                    box.left >= column.left - 1 && box.right <= column.right + 1,
                    "Zeta is not on its day"
                );
            },
        },
    ],
});

tours.add("timeline_002b_a27_create_hidden_by_search", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_searchview_input",
            async run() {
                const input = $(".o_searchview_input");
                await typeInto(input, "Design");
                input.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
                );
                await until(() => $(".o_searchview_facet"), "the search facet");
                await until(() => !pillNamed("Build") && pillNamed("Design"), "the search to apply");
                const day = addDays(todayIso(), 3);
                click(cellOf(pillRow(), day));
                const plan = await openDialog("Plan");
                await until(() => $(".o_create_button", plan), "Create New");
                $(".o_create_button", plan).click();
                const create = await openDialog("Create");
                await typeInto(await fieldOf(create, "name"), "Zeta 2");
                $(".o_form_button_save", create).click();
                await noDialogs();
                await sleep(500);
                assert(!pillNamed("Zeta 2"), "Zeta 2 is shown although the search hides it");
                assert(pillNamed("Design"), "the search was lost");
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A39: editable popover fields
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a39_popover_switch", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                const log = spyRequests();
                const build = await until(() => pillNamed("Build"), "Build");
                const stripes = (pill) => getComputedStyle(pill).backgroundImage;
                const before = stripes(build);
                click(build);
                const toggle = await until(
                    () => $('.o_tl_popover .o_field_widget[name="x_done"] input'),
                    "the Done switch"
                );
                assert(!toggle.checked, "Done is already on");
                toggle.click();
                await until(
                    () => log.some((entry) => /write|web_save/.test(entry.url)),
                    `the value to be saved (${log.map((entry) => entry.url.split("/").pop())})`
                );
                await sleep(300);
                assert(stripes(pillNamed("Build")) === before, "the pill changed before the popover closed");
                const reloads = dataCalls(log);
                // a click outside closes the popover; the view reloads
                const away = $(".o_control_panel") || document.body;
                fire(away, "pointerdown", 5, 5);
                fire(away, "pointerup", 5, 5);
                away.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
                await until(() => !$(".o_tl_popover"), "the popover to close");
                await until(() => dataCalls(log) === reloads + 1, "the view to reload");
                await until(
                    () => stripes(pillNamed("Build")) !== before,
                    "Build to show the info stripes"
                );
            },
        },
    ],
});

// ---------------------------------------------------------------------------------------------
// A49c: planning on a date-only model
// ---------------------------------------------------------------------------------------------

tours.add("timeline_002b_a49c_plan_date_only", {
    steps: () => [
        gridReady,
        {
            trigger: ".o_tl_row",
            async run() {
                const day = todayIso();
                const neighbour = headerOf(addDays(day, 1)) ? addDays(day, 1) : addDays(day, -1);
                const row = pillRow();
                click(cellOf(row, day));
                const plan = await openDialog("Plan");
                await until(() => $(".o_data_row", plan), "the list");
                const names = $$(".o_data_row .o_data_cell[name=name]", plan).map((cell) =>
                    cell.textContent.trim()
                );
                assert(JSON.stringify(names) === '["Undated"]', `listed ${JSON.stringify(names)}`);
                $(".o_data_row .o-checkbox input", plan).click();
                await until(() => !$(".o_select_button", plan).disabled, "Select to be enabled");
                $(".o_select_button", plan).click();
                await noDialogs();
                const pill = await until(() => pillNamed("Undated"), "the pill of Undated");
                const column = headerOf(day).getBoundingClientRect();
                const box = pill.getBoundingClientRect();
                assert(
                    box.left >= column.left - 1 && box.right <= column.right + 1,
                    `the pill ${box.left}-${box.right} is not within the day ${column.left}-${column.right}`
                );
                // Create New on the neighbouring day: the same date twice
                // a click on a cell locks the next ones for a second
                await sleep(1200);
                click(cellOf(pillRow(), neighbour));
                const second = await openDialog("Plan");
                await until(() => $(".o_create_button", second), "Create New");
                $(".o_create_button", second).click();
                const create = await openDialog("Create");
                const start = (await fieldOf(create, "date_start")).value;
                const stop = (await fieldOf(create, "date_stop")).value;
                assert(
                    start === usDate(neighbour) && stop === usDate(neighbour),
                    `proposed ${start} to ${stop}, expected ${usDate(neighbour)} twice`
                );
            },
        },
    ],
});
