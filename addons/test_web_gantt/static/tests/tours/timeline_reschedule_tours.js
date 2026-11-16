// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    centreOf,
    chooseLine,
    clearChoices,
    gridSettled,
    mouse,
    openMethodMenu,
    pause,
    pillNamed,
    realMouse,
    renderer,
    sentBodies,
    stepsTo,
    until,
} from "@test_web_gantt/../tests/tours/timeline_dependency_tours";

/**
 * Tours of slice 002c's rescheduling (R15, R16, R21) on H46 and H47 (and H42), with the real
 * pointer. The Python test creates the prepared records (`_tl_build_reschedule_records`) before
 * a tour and drops them after it; it checks the stored dates. A day is 192 px on the week range
 * of a 1600 px window, a half day 96 px.
 */

const tours = registry.category("web_tour.tours");

const DAY = 192;
const HALF = 96;

const pillsReady = {
    // H46 and H47 open on June 2030: the grid has no "today" column
    trigger: ".o_tl_pill",
    async run() {
        await gridSettled();
    },
};

// positions are taken from a fixed column of the grid: a reload may scroll the grid (the phone does)
const anchor = () => ($(".o_tl_col[data-date='2030-06-10']") || $(".o_tl_col")).getBoundingClientRect().left;
const leftOf = (name) => pillNamed(name).getBoundingClientRect().left - anchor();
const rightOf = (name) => pillNamed(name).getBoundingClientRect().right - anchor();
const near = (a, b, what, tolerance = 1.5) =>
    assert(Math.abs(a - b) <= tolerance, `${what}: ${a} is not ${b}`);
const litArrows = () => $$(".o_tl_arrow.o_tl_arrow_lit");
const notices = () => $$(".o_notification");
const noticeTexts = () =>
    notices().map((notice) => $(".o_notification_content", notice).textContent.trim());
const undoButton = () => $$(".o_notification button").find((el) => el.textContent.trim() === "Undo");

/** The events of a gesture: press at `from`, `steps` moves to `to`, then the release. */
function gesture(from, to, { steps = 12, modifiers = 0 } = {}) {
    const at = (type, point, extra) =>
        mouse(type, point.x, point.y, { modifiers, ...extra });
    return {
        hold: [
            at("mouseMoved", from, { button: "none", buttons: 0 }),
            at("mousePressed", from, { buttons: 1, clickCount: 1 }),
            ...stepsTo(from, to, steps).map((point) => at("mouseMoved", point, { buttons: 1 })),
        ],
        release: [at("mouseReleased", to, { buttons: 0, clickCount: 1 })],
    };
}

/** A reload may scroll the grid (the phone does): keep the pill and its target in the window. */
async function bringIntoView(name, dx) {
    const grid = renderer().getBoundingClientRect();
    const rect = pillNamed(name).getBoundingClientRect();
    const low = Math.min(rect.left, rect.left + dx);
    const high = Math.max(rect.left, rect.left + dx) + 80;
    if (low < grid.left + 20 || high > grid.right - 20) {
        renderer().scrollLeft += low - grid.left - Math.min(200, grid.width / 3);
        await gridSettled();
    }
}

/** Press the pill `name` `grab` px inside its left end, move it by (`dx`, `dy`) and release. */
async function movePill(name, { dx, dy = 0, grab = 30, settle = true, ...options }) {
    await bringIntoView(name, dx);
    const rect = pillNamed(name).getBoundingClientRect();
    const from = { x: rect.left + grab, y: rect.top + rect.height / 2 };
    const to = { x: from.x + dx, y: from.y + dy };
    const { hold, release } = gesture(from, to, options);
    await realMouse(hold);
    await realMouse(release, { settle });
}

/** Rest the pointer on the pill, press its end handle and move it by `dx`. */
async function resizeEnd(name, dx) {
    const centre = centreOf(pillNamed(name));
    await realMouse([mouse("mouseMoved", centre.x, centre.y, { button: "none", buttons: 0 })]);
    const handle = await until(() => $(".o_tl_handle_stop", pillNamed(name)), "the end handle");
    const from = centreOf(handle);
    const { hold, release } = gesture(from, { x: from.x + dx, y: from.y });
    await realMouse(hold);
    await realMouse(release);
}

async function clickUndo() {
    const point = centreOf(undoButton());
    await realMouse([
        mouse("mouseMoved", point.x, point.y, { button: "none", buttons: 0 }),
        mouse("mousePressed", point.x, point.y, { buttons: 1, clickCount: 1 }),
        mouse("mouseReleased", point.x, point.y, { buttons: 0, clickCount: 1 }),
    ]);
    await until(() => !notices().length, "the notification to close");
    await gridSettled();
}

const lefts = (names) => Object.fromEntries(names.map((name) => [name, leftOf(name)]));
const CHAIN = ["Chain A", "Chain B", "Chain C"];

async function chooseMethod(text) {
    clearChoices();
    await openMethodMenu();
    await chooseLine(text);
    // the data is loaded again 500 ms after the choice, and the method applies from then on
    await pause(900);
    await gridSettled();
}

// A38: with "Manual Reschedule" a move is one plain write and 002b2's notification
tours.add("timeline_002c_a38_manual", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                await chooseMethod("Manual Reschedule");
                assert(
                    $(".o_tl_reschedule_button").textContent.trim() === "Manual Reschedule",
                    "the button names the method"
                );
                const before = lefts(CHAIN);
                await movePill("Chain A", { dx: DAY });
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Dates changed", `texts ${noticeTexts()}`);
                assert(undoButton(), "Undo is offered");
                near(leftOf("Chain A"), before["Chain A"] + DAY, "Chain A");
                near(leftOf("Chain B"), before["Chain B"], "Chain B");
                near(leftOf("Chain C"), before["Chain C"], "Chain C");
            },
        },
    ],
});

// A39: keep buffer; the chain follows and a sticky success notification with Undo stands
tours.add("timeline_002c_a39_keep_buffer", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                clearChoices();
                const before = lefts(CHAIN);
                await movePill("Chain A", { dx: DAY });
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                assert(notices().length === 1, "one notification");
                assert(undoButton(), "Undo is offered");
                assert(
                    $(".o_notification .o_notification_bar").classList.contains("bg-success"),
                    "the bar is the success one"
                );
                for (const name of CHAIN) {
                    near(leftOf(name), before[name] + DAY, name);
                }
                // sticky: still there after the time a notification lives
                await pause(5000);
                assert(notices().length === 1 && undoButton(), "the notification stays");
            },
        },
    ],
});

// A42: Undo gives the chain back its dates, closes the notification and reloads
tours.add("timeline_002c_a42_undo", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                clearChoices();
                const before = lefts(CHAIN);
                await movePill("Chain A", { dx: DAY });
                await until(() => undoButton(), "the notification with Undo");
                await clickUndo();
                for (const name of CHAIN) {
                    near(leftOf(name), before[name], `${name} after Undo`);
                }
                assert(!notices().length, "the notification closed");
            },
        },
    ],
});

// A41: use buffer; Chain B is in conflict and moves to start when Chain A stops, Chain C stays
tours.add("timeline_002c_a41_use_buffer", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                await chooseMethod("Auto-Reschedule (Use Buffer)");
                const before = lefts(CHAIN);
                await movePill("Chain A", { dx: DAY });
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                // B starts when A stops, 11 June 14:00: 8 h later, drawn on the half-day grid
                near(leftOf("Chain B"), before["Chain B"] + HALF, "Chain B", 3);
                near(leftOf("Chain C"), before["Chain C"], "Chain C");
            },
        },
    ],
});

// A43: the end handle of Chain C one day to the right: only the stop is sent
tours.add("timeline_002c_a43_resize_end", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                clearChoices();
                const before = { left: leftOf("Chain C"), right: rightOf("Chain C") };
                await resizeEnd("Chain C", DAY);
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                near(leftOf("Chain C"), before.left, "Chain C start");
                near(rightOf("Chain C"), before.right + DAY, "Chain C end");
            },
        },
    ],
});

// A44: on the phone, a drop that changes nothing still makes the call; then half a day later
/** A grab (px inside the left end) from which `dx` px stay in the same half-day sub-column. */
function grabWithin(name, dx) {
    const col = $(".o_tl_col").getBoundingClientRect();
    const part = col.width / 2;
    const rect = pillNamed(name).getBoundingClientRect();
    let x = rect.left + 30;
    let offset = (x - col.left) % part;
    offset = offset < 0 ? offset + part : offset;
    if (offset + dx > part - 6) {
        x += part - offset + 8;
    }
    return x - rect.left;
}
const phoneMoves = {
    trigger: ".o_tl_pill",
    async run() {
        await gridSettled();
        assert(!$(".o_tl_arrow") && !$(".o_tl_connect_handle"), "no arrow, no handle");
        assert(!$(".o_tl_reschedule_button"), "no method button");
        clearChoices();
        const before = leftOf("Chain C");
        // pressed where 60 px stay in the same sub-column, moved 60 px (the spec presses 35 px
        // inside; the tour's zone is UTC, not three hours ahead, so the grid lies elsewhere)
        const grab = grabWithin("Chain C", 60);
        await movePill("Chain C", { dx: 60, grab, steps: 6 });
        await until(() => notices().length, "the notification");
        assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
        assert(undoButton(), "Undo is offered");
        const box = $(".o_notification").getBoundingClientRect();
        assert(box.top > window.innerHeight / 2, "the notification stands at the bottom");
        near(leftOf("Chain C"), before, "Chain C does not move");
        await movePill("Chain C", { dx: HALF, grab, steps: 6 });
        await pause(500);
        near(leftOf("Chain C"), before + HALF, "Chain C 12 h later");
        assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
    },
};
tours.add("timeline_002c_a44_phone_no_change", { steps: () => [pillsReady, phoneMoves] });
tours.add("timeline_002c_a71_phone", { steps: () => [pillsReady, phoneMoves] });

// A45: a copy with Ctrl is 002b2's copy and notification, nothing is rescheduled
tours.add("timeline_002c_a45_copy", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                const before = lefts(CHAIN);
                await movePill("Chain A", { dx: DAY, modifiers: 2 });
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Record copied", `texts ${noticeTexts()}`);
                near(leftOf("Chain B"), before["Chain B"], "Chain B");
                near(leftOf("Chain C"), before["Chain C"], "Chain C");
            },
        },
    ],
});

// A46: "Design" (in the past for the server) moves alone
tours.add("timeline_002c_a46_past", {
    steps: () => [
        {
            trigger: ".o_tl_pill",
            async run() {
                await gridSettled();
                clearChoices();
                const before = lefts(["Design", "Build"]);
                await movePill("Design", { dx: DAY });
                await until(() => notices().length, "the notification");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                assert(undoButton(), "Undo is offered");
                near(leftOf("Design"), before["Design"] + DAY, "Design");
                near(leftOf("Build"), before["Build"], "Build");
            },
        },
    ],
});

// A47: a move inside a loop: nothing changes, a sticky warning with the message and no Undo
tours.add("timeline_002c_a47_cycle", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                const before = lefts(["Loop 1", "Loop 2"]);
                await movePill("Loop 1", { dx: HALF });
                await until(() => notices().length, "the notification");
                assert(
                    noticeTexts().join() === "These dependencies form a loop, so nothing was moved",
                    `texts ${noticeTexts()}`
                );
                assert(
                    $(".o_notification .o_notification_bar").classList.contains("bg-warning"),
                    "the bar is the warning one"
                );
                assert(!undoButton(), "no Undo");
                near(leftOf("Loop 1"), before["Loop 1"], "Loop 1");
                near(leftOf("Loop 2"), before["Loop 2"], "Loop 2");
                await pause(5000);
                assert(notices().length === 1, "the warning stays");
            },
        },
    ],
});

// A72: the two messages, the second replacing the first
tours.add("timeline_002c_a72_messages", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                await movePill("Chain A", { dx: DAY });
                await until(() => notices().length, "the first notification");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                await movePill("Loop 1", { dx: HALF });
                await until(
                    () => noticeTexts().join() !== "Records rescheduled",
                    "the second notification"
                );
                assert(
                    noticeTexts().join() === "These dependencies form a loop, so nothing was moved",
                    `texts ${noticeTexts()}`
                );
            },
        },
    ],
});

// A49: a date-only model, keep buffer, two days later: whole days
tours.add("timeline_002c_a49_date_only", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                const before = lefts(["Chain A", "Chain B"]);
                await movePill("Chain A", { dx: 2 * DAY });
                await until(() => notices().length, "the notification");
                assert(!$(".o_dialog"), "no error dialog");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                assert(undoButton(), "Undo is offered");
                near(leftOf("Chain A"), before["Chain A"] + 2 * DAY, "Chain A");
                near(leftOf("Chain B"), before["Chain B"] + 2 * DAY, "Chain B");
            },
        },
    ],
});

// A49: Undo puts both back
tours.add("timeline_002c_a49_date_only_undo", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                const before = lefts(["Chain A", "Chain B"]);
                await movePill("Chain A", { dx: 2 * DAY });
                await until(() => undoButton(), "the notification with Undo");
                await clickUndo();
                near(leftOf("Chain A"), before["Chain A"], "Chain A after Undo");
                near(leftOf("Chain B"), before["Chain B"], "Chain B after Undo");
            },
        },
    ],
});

// A85: date-only, use buffer: two days later moves Chain B, one day later does not
tours.add("timeline_002c_a85_date_only_use_buffer", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_reschedule_button",
            async run() {
                await chooseMethod("Auto-Reschedule (Use Buffer)");
                const before = lefts(["Chain A", "Chain B"]);
                await movePill("Chain A", { dx: 2 * DAY });
                await until(() => notices().length, "the notification");
                assert(!$(".o_dialog"), "no error dialog");
                near(leftOf("Chain A"), before["Chain A"] + 2 * DAY, "Chain A");
                near(leftOf("Chain B"), before["Chain B"] + DAY, "Chain B moved to 13 June");
                await clickUndo();
                near(leftOf("Chain B"), before["Chain B"], "Chain B after Undo");
                await movePill("Chain A", { dx: DAY });
                await until(() => notices().length, "the second notification");
                near(leftOf("Chain A"), before["Chain A"] + DAY, "Chain A one day later");
                near(leftOf("Chain B"), before["Chain B"], "Chain B stays");
            },
        },
    ],
});

// A86: date-only, a move backward: Chain B two days earlier, Chain A follows
tours.add("timeline_002c_a86_date_only_backward", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                const before = leftOf("Chain B");
                await movePill("Chain B", { dx: -2 * DAY });
                await until(() => notices().length, "the notification");
                assert(!$(".o_dialog"), "no error dialog");
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                assert(undoButton(), "Undo is offered");
                near(leftOf("Chain B"), before - 2 * DAY, "Chain B");
            },
        },
    ],
});

// A50: with the network slowed, a second move made before the first answer is sent only after it
const rpcLog = [];
let slowed = false;
function slowReschedulingCalls() {
    if (slowed) {
        return;
    }
    slowed = true;
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    const kindOf = (url) =>
        url?.includes("web_gantt_reschedule")
            ? "reschedule"
            : url?.includes("get_gantt_data")
            ? "load"
            : null;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__kind = kindOf(String(url));
        if (this.__kind) {
            // the end of the response, seen before the RPC layer sees its `load` event, so that
            // what the answer starts is logged after it
            this.addEventListener("readystatechange", () => {
                if (this.readyState === 4) {
                    rpcLog.push(`${this.__kind}:answered`);
                }
            });
        }
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (!this.__kind) {
            return send.apply(this, args);
        }
        rpcLog.push(`${this.__kind}:issued`);
        if (this.__kind === "reschedule") {
            setTimeout(() => send.apply(this, args), 2500);
            return undefined;
        }
        return send.apply(this, args);
    };
}
tours.add("timeline_002c_a50_waits_for_earlier_writes", {
    steps: () => [
        pillsReady,
        {
            trigger: ".o_tl_pill",
            async run() {
                clearChoices();
                slowReschedulingCalls();
                rpcLog.length = 0;
                await movePill("Chain A", { dx: DAY, settle: false });
                // before the answer: the second pill
                await movePill("Loop 2", { dx: HALF, settle: false });
                await until(
                    () => rpcLog.filter((entry) => entry === "reschedule:answered").length === 2,
                    "both answers",
                    30000
                );
                await until(() => rpcLog.at(-1) === "load:answered", "the last reload", 30000);
                await gridSettled();
                const issued = rpcLog.indexOf("reschedule:issued", rpcLog.indexOf("reschedule:issued") + 1);
                const first = rpcLog.indexOf("reschedule:answered");
                assert(issued > first, `the second call was issued before the first answer: ${rpcLog}`);
                assert(
                    rpcLog.slice(first, issued).includes("load:issued"),
                    `the view did not reload between: ${rpcLog}`
                );
                assert(rpcLog.lastIndexOf("load:issued") > rpcLog.lastIndexOf("reschedule:answered") - 1,
                    `no reload after the second: ${rpcLog}`);
            },
        },
    ],
});

// A88 (R27): the week group headers carry the year once, at the end, only in another year than the
// browser's; H46 (2030 under the 2026 clock) with its tooltip, then the month and day ranges
const headerTexts = () => $$(".o_tl_col_group").map((el) => el.textContent.trim());
async function chooseRangeItem(name) {
    $(".o_tl_range_button").click();
    const item = await until(() => $(`.o_tl_range_${name}`), `the ${name} item`);
    item.click();
    await gridSettled();
}
tours.add("timeline_002c_a88", {
    steps: () => [
        {
            trigger: ".o_tl_col_group",
            async run() {
                await gridSettled();
                const texts = headerTexts();
                assert(
                    texts.includes("Week 23, Jun 2 - Jun 8 2030") &&
                        texts.includes("Week 24, Jun 9 - Jun 15 2030"),
                    `week headers: ${texts}`
                );
                const group = $$(".o_tl_col_group").find(
                    (el) => el.textContent.trim() === "Week 24, Jun 9 - Jun 15 2030"
                );
                assert(
                    group.getAttribute("title") === "Week 24, Jun 9 - Jun 15 2030",
                    `tooltip ${group.getAttribute("title")}`
                );
                assert(getComputedStyle(group).paddingLeft === "8px", "8 px left padding");
                await chooseRangeItem("month");
                assert(headerTexts().includes("June 2030"), `month headers: ${headerTexts()}`);
                await chooseRangeItem("day");
                assert(
                    headerTexts().some((text) => /2030$/.test(text) && text.includes("June")),
                    `day headers: ${headerTexts()}`
                );
            },
        },
    ],
});

// A88: a week of the browser's own year (H42, 2026) carries no year
tours.add("timeline_002c_a88_no_year", {
    steps: () => [
        {
            trigger: ".o_tl_col_group",
            async run() {
                await gridSettled();
                assert(
                    headerTexts().includes("Week 46, Nov 8 - Nov 14"),
                    `week headers: ${headerTexts()}`
                );
            },
        },
    ],
});

// A77: "Test" (Beta) to the Alpha row one day later, then Undo puts it back. The week range with the
// package's points: press (1155, 326), release (1347, 305) in 12 steps. The page runs in the zone three
// hours ahead of UTC on the D0 clock, so the records stand where the package's pills stand.
tours.add("timeline_002c_a77_undo_after_row_change", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today",
            async run() {
                await gridSettled();
                const row = (title) =>
                    $$(".o_tl_row_header")
                        .find((el) => el.getAttribute("title") === title)
                        .closest(".o_tl_row");
                const inRow = (title) =>
                    $$(".o_tl_pill", row(title)).some(
                        (pill) => $(".o_tl_pill_title", pill)?.textContent.trim() === "Test"
                    );
                assert(inRow("Beta"), "Test is in Beta");
                // the record "Alpha", whose id the row values must carry
                const alpha = await fetch("/web/dataset/call_kw/test.web.gantt.pill/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "call",
                        params: {
                            model: "test.web.gantt.pill",
                            method: "search",
                            args: [[["name", "=", "Alpha"]]],
                            kwargs: { limit: 1 },
                        },
                    }),
                }).then((response) => response.json());
                assert(alpha.result?.length === 1, "Alpha is found");
                const test = pillNamed("Test").getBoundingClientRect();
                near(test.left, 1125, "the left end of Test", 1);
                near(test.top, 314, "the top of Test", 1);
                const before = leftOf("Test");
                const bodies = sentBodies.length;
                const { hold, release } = gesture({ x: 1155, y: 326 }, { x: 1347, y: 305 }, { steps: 12 });
                await realMouse(hold);
                await realMouse(release, { settle: false });
                await until(() => notices().length, "the notification");
                const call = sentBodies
                    .slice(bodies)
                    .map((body) => JSON.parse(body))
                    .find((body) => body.params?.method === "web_gantt_reschedule");
                assert(call, "the reschedule call");
                const [values, method] = call.params.args;
                assert(
                    values.date_start === "2026-11-14 05:00:00" &&
                        values.date_stop === "2026-11-17 09:00:00" &&
                        values.parent_id === alpha.result[0] &&
                        method === "maintainBuffer",
                    `the call carries ${JSON.stringify(call.params.args.slice(0, 2))}`
                );
                await gridSettled();
                assert(noticeTexts().join() === "Records rescheduled", `texts ${noticeTexts()}`);
                assert(inRow("Alpha"), "Test is in Alpha");
                near(leftOf("Test"), before + DAY, "Test", 2);
                // A90: the pointer stays still after the release: no arrow is lit
                assert(litArrows().length === 0, `nothing is lit, got ${litArrows().length}`);
                const moveTo = ({ x, y }) =>
                    realMouse([mouse("mouseMoved", x, y, { button: "none", buttons: 0 })]);
                // the pointer then moves to (1417, 285), on "Test" in its new place (Alpha row,
                // x 1317 to 1989, y 273 to 298): the arrow "Build" to "Test" is lit
                await moveTo({ x: 1417, y: 285 });
                const over = pillNamed("Test").getBoundingClientRect();
                assert(
                    over.left <= 1417 && over.right >= 1417 && over.top <= 285 && over.bottom >= 285,
                    "Test stands under (1417, 285)"
                );
                assert(litArrows().length > 0, "the arrow Build to Test is lit");
                await clickUndo();
                assert(inRow("Beta"), "Test is back in Beta");
                near(leftOf("Test"), before, "Test after Undo", 2);
            },
        },
    ],
});
