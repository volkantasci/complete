// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, queryAll, queryAllTexts, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    makeMockServer,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

const DEPENDENCIES = `string="Pills" default_range="week" color="x_color"
    dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"`;
const METHOD_KEY = "rescheduleMethod-viewId-5";

let controller;
/** Every call the tests watch, in the order the server saw it. */
let log;
/** What `web_gantt_reschedule` answers; set per test. */
let answer;
/** Makes the rescheduling and write calls wait for the test, or null. */
let gate;
/** The server refuses the rescheduling while set. */
let refuse;

const CHAIN = [
    { id: 101, name: "Chain A", start: "2030-06-10 06:00:00", stop: "2030-06-10 14:00:00" },
    { id: 102, name: "Chain B", start: "2030-06-11 06:00:00", stop: "2030-06-11 14:00:00" },
    { id: 103, name: "Chain C", start: "2030-06-12 06:00:00", stop: "2030-06-13 14:00:00" },
];
const SUCCESS = () => ({
    type: "success",
    message: "Records rescheduled",
    old_vals_per_pill_id: {
        101: { date_start: CHAIN[0].start, date_stop: CHAIN[0].stop },
        102: { date_start: CHAIN[1].start, date_stop: CHAIN[1].stop },
    },
});

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineController.prototype, {
        setup() {
            super.setup(...arguments);
            controller = this;
        },
    });
    log = [];
    answer = SUCCESS();
    gate = null;
    refuse = false;
    timelineMock.beforeReply = () => {
        log.push({ call: "reload" });
    };
    onRpc("web_gantt_reschedule", async ({ args, kwargs, model }) => {
        log.push({ call: "reschedule", model, args, kwargs });
        if (gate) {
            await gate();
        }
        if (refuse) {
            throw new Error("Access denied");
        }
        return answer;
    });
    onRpc("action_rollback_scheduling", ({ args, kwargs }) => {
        log.push({ call: "rollback", args, kwargs });
        return true;
    });
    onRpc("write", async ({ args }) => {
        log.push({ call: "write", ids: args[0], values: args[1] });
        if (gate) {
            await gate();
        }
    });
    onRpc("copy", ({ args, kwargs }) => {
        log.push({ call: "copy", ids: args[0], default: kwargs.default });
    });
    await resize({ width: 1600, height: 900 });
});

async function mountTimeline({ model = "pill", method, groupBy, viewId = 5, arch } = {}) {
    await makeMockServer();
    if (method) {
        browser.localStorage.setItem(`rescheduleMethod-viewId-${viewId}`, method);
    }
    const pills = MockServer.current.env.pill;
    for (const { id, name, start, stop } of CHAIN) {
        pills.push({ id, name, date_start: start, date_stop: stop, active: true });
    }
    await mountView({
        type: "gantt",
        resModel: model,
        arch: arch || timelineArch(DEPENDENCIES),
        groupBy,
        viewId,
    });
    await animationFrame();
    await animationFrame();
    log.length = 0;
}

const editor = () => controller.editor;
const calls = (name) => log.filter((entry) => entry.call === name);
const sequence = () => log.map((entry) => entry.call);
const notices = () => queryAll(".o_notification");
const noticeText = () => queryAllTexts(".o_notification .o_notification_content");
const move = (resId = 101, values) => ({
    kind: "move",
    resId,
    values: values || { date_start: "2030-06-11 06:00:00", date_stop: "2030-06-11 14:00:00" },
    undo: { values: { date_start: "2030-06-10 06:00:00", date_stop: "2030-06-10 14:00:00" } },
});

function deferred() {
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    promise.resolve = resolve;
    return promise;
}

/** Hold the calls; the returned function lets the oldest held one answer. */
function holdCalls() {
    const gates = [];
    gate = () => {
        const held = deferred();
        gates.push(held);
        return held;
    };
    return () => gates.shift().resolve();
}

/** Drag the pill `name` of the first model by `dx` px, the press at its middle. */
async function dragPill(selector, dx) {
    const element = queryOne(selector);
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const to = { x: start.x + dx, y: start.y };
    await helpers.moveTo(document.elementFromPoint(to.x, to.y), { position: to });
    await animationFrame();
    await helpers.drop();
    await advanceTime(100);
    await animationFrame();
}

test("002c A38: the manual method writes as before, with 002b2's notification", async () => {
    await mountTimeline({ method: "manual" });
    await editor().applyChange(move());
    await animationFrame();
    expect(sequence()).toEqual(["write", "reload"]);
    expect(calls("write")[0].values).toEqual(move().values);
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(queryAllTexts(".o_notification .o_notification_buttons button")).toEqual(["Undo"]);
});

test("002c A38: a view without the dependency fields writes whatever the method", async () => {
    await mountTimeline({ arch: timelineArch(`string="Pills" default_range="week"`) });
    await editor().applyChange(move());
    await animationFrame();
    expect(sequence()).toEqual(["write", "reload"]);
    expect(noticeText()).toEqual(["Dates changed"]);
});

test("002c A39: keep buffer, a move calls the rescheduling method once", async () => {
    await mountTimeline();
    expect(controller.rescheduleMethod).toBe("maintainBuffer");
    const done = editor().applyChange(move());
    await animationFrame();
    expect(await done).toBe(true);
    await animationFrame();
    // the call, then the reload, then the notification
    expect(sequence()).toEqual(["reschedule", "reload"]);
    const [call] = calls("reschedule");
    expect(call.model).toBe("pill");
    expect(call.args).toEqual([
        { date_start: "2030-06-11 06:00:00", date_stop: "2030-06-11 14:00:00" },
        "maintainBuffer",
        [101],
        "dependency_field",
        "dependency_inverted_field",
        "date_start",
        "date_stop",
    ]);
    // no context of the view (its search, its grouping): the user's own only
    expect(Object.keys(call.kwargs.context).sort()).toEqual(["allowed_company_ids", "lang", "tz", "uid"]);
    expect(noticeText()).toEqual(["Records rescheduled"]);
    expect(notices()).toHaveCount(1);
    expect(".o_notification .o_notification_bar").toHaveClass("bg-success");
    expect(queryAllTexts(".o_notification .o_notification_buttons button")).toEqual(["Undo"]);
    // sticky: it stays after the time a Community notification lives
    await advanceTime(20000);
    expect(notices()).toHaveCount(1);
});

test("002c A39: a real move of a pill is one call and shows no 002b2 notification", async () => {
    await mountTimeline();
    const part = queryRect(queryOne(".o_tl_col.o_tl_is_today")).width / 2;
    await dragPill(`.o_tl_pill[data-pill-id="6"]:not(.o_tl_pill_moved)`, 2 * part);
    expect(sequence()).toEqual(["reschedule", "reload"]);
    expect(calls("reschedule")[0].args.slice(0, 3)).toEqual([
        { date_start: "2026-11-13 10:00:00", date_stop: "2026-11-13 14:00:00" },
        "maintainBuffer",
        [6],
    ]);
    expect(noticeText()).toEqual(["Records rescheduled"]);
});

test("002c A41: use buffer sends its own method name", async () => {
    await mountTimeline({ method: "consumeBuffer" });
    await editor().applyChange(move());
    await animationFrame();
    expect(calls("reschedule")[0].args[1]).toBe("consumeBuffer");
    expect(noticeText()).toEqual(["Records rescheduled"]);
});

test("002c A42: Undo calls the rollback with the old values, closes and reloads", async () => {
    await mountTimeline();
    await editor().applyChange(move());
    await animationFrame();
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(sequence()).toEqual(["rollback", "reload"]);
    const [rollback] = calls("rollback");
    expect(rollback.args).toEqual([[101, 102], SUCCESS().old_vals_per_pill_id]);
    expect(notices()).toHaveCount(0);
});

test("002c A43: a resize of the end carries only the stop", async () => {
    await mountTimeline();
    await editor().applyChange({
        kind: "resize",
        resId: 103,
        values: { date_stop: "2030-06-14 14:00:00" },
        undo: { values: {} },
    });
    await animationFrame();
    const [call] = calls("reschedule");
    expect(call.args[0]).toEqual({ date_stop: "2030-06-14 14:00:00" });
    expect(call.args[2]).toEqual([103]);
    expect(noticeText()).toEqual(["Records rescheduled"]);
});

test("002c A44: a drop that changes nothing calls with no value and shows the notification", async () => {
    await mountTimeline();
    // a move of 12 px stays in the same sub-column
    await dragPill(`.o_tl_pill[data-pill-id="6"]:not(.o_tl_pill_moved)`, 12);
    expect(sequence()).toEqual(["reschedule", "reload"]);
    expect(calls("reschedule")[0].args[0]).toEqual({});
    expect(noticeText()).toEqual(["Records rescheduled"]);
    expect(queryAllTexts(".o_notification .o_notification_buttons button")).toEqual(["Undo"]);
});

test("002c A45: a copy is not rescheduled", async () => {
    await mountTimeline();
    await editor().applyChange({ kind: "copy", resId: 101, values: move().values });
    await animationFrame();
    expect(sequence()).toEqual(["copy", "reload"]);
    expect(noticeText()).toEqual(["Record copied"]);
});

test("002c A47: a warning is sticky, has the message, no Undo and moves nothing", async () => {
    await mountTimeline();
    answer = {
        type: "warning",
        message: "These dependencies form a loop, so nothing was moved",
        old_vals_per_pill_id: {},
    };
    expect(await editor().applyChange(move())).toBe(false);
    await animationFrame();
    expect(sequence()).toEqual(["reschedule", "reload"]);
    expect(noticeText()).toEqual(["These dependencies form a loop, so nothing was moved"]);
    expect(".o_notification .o_notification_bar").toHaveClass("bg-warning");
    expect(".o_notification").toHaveClass("o_tl_notification_warning");
    expect(".o_notification .o_notification_buttons button").toHaveCount(0);
    await advanceTime(20000);
    expect(notices()).toHaveCount(1);
});

test("002c A47: a new answer replaces the notification of the view", async () => {
    await mountTimeline();
    await editor().applyChange(move());
    await animationFrame();
    answer = { type: "warning", message: "Could not move Chain B", old_vals_per_pill_id: {} };
    await editor().applyChange(move(102));
    await animationFrame();
    expect(notices()).toHaveCount(1);
    expect(noticeText()).toEqual(["Could not move Chain B"]);
});

test("002c A49: a date-only model sends whole days", async () => {
    await mountTimeline({ model: "pill2", viewId: 6 });
    // "Day one" lies on 12 November; one day later is 13 November
    const part = queryRect(queryOne(".o_tl_col.o_tl_is_today")).width / 2;
    await dragPill(`.o_tl_pill[data-pill-id="1"]:not(.o_tl_pill_moved)`, 2 * part);
    expect(sequence()).toEqual(["reschedule", "reload"]);
    const [call] = calls("reschedule");
    expect(call.model).toBe("pill2");
    expect(call.args[0]).toEqual({ date_start: "2026-11-13", date_stop: "2026-11-13" });
});

test("002c A50: the call waits for earlier writes and later writes wait for it", async () => {
    await mountTimeline();
    const release = holdCalls();
    const first = editor().applyChange({
        kind: "move",
        resId: 103,
        values: { date_start: "2030-06-12 08:00:00" },
        undo: { values: {} },
    });
    const second = editor().scheduleRecord({ resId: 102, values: { name: "x" } });
    const third = editor().applyChange(move(101));
    const step = async () => {
        await advanceTime(50);
        await animationFrame();
    };
    await step();
    // the first call is held, nothing else was sent
    expect(sequence()).toEqual(["reschedule"]);
    release();
    await step();
    expect(sequence()).toEqual(["reschedule", "reload", "write"]);
    release();
    await step();
    expect(sequence()).toEqual(["reschedule", "reload", "write", "reload", "reschedule"]);
    release();
    await Promise.all([first, second, third]);
    await animationFrame();
    expect(sequence()).toEqual([
        "reschedule",
        "reload",
        "write",
        "reload",
        "reschedule",
        "reload",
    ]);
});

test("002c A50: the view reloads after a refused call and the error goes on", async () => {
    await mountTimeline();
    refuse = true;
    let error;
    await editor()
        .applyChange(move())
        .catch((reason) => (error = reason));
    await animationFrame();
    expect(Boolean(error)).toBe(true);
    expect(sequence()).toEqual(["reschedule", "reload"]);
    expect(notices()).toHaveCount(0);
});

test("002c A71: the phone reschedules with the stored method, or keep buffer", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountTimeline();
    expect(".o_tl_reschedule_button").toHaveCount(0);
    expect(".o_tl_arrow").toHaveCount(0);
    expect(controller.rescheduleMethod).toBe("maintainBuffer");
    await editor().applyChange(move(103, {}));
    await animationFrame();
    const [call] = calls("reschedule");
    expect(call.args.slice(0, 3)).toEqual([{}, "maintainBuffer", [103]]);
    expect(noticeText()).toEqual(["Records rescheduled"]);
});

test("002c A71: the phone keeps the method stored for the view", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountTimeline({ method: "consumeBuffer" });
    await editor().applyChange(move(103, {}));
    await animationFrame();
    expect(calls("reschedule")[0].args[1]).toBe("consumeBuffer");
});

test("002c A77: a move to another row sends the row values and Undo gives them back", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    answer = {
        type: "success",
        message: "Records rescheduled",
        old_vals_per_pill_id: {
            101: { date_start: CHAIN[0].start, date_stop: CHAIN[0].stop, parent_id: 2 },
        },
    };
    await editor().applyChange(
        move(101, {
            date_start: "2030-06-11 06:00:00",
            date_stop: "2030-06-11 14:00:00",
            parent_id: 1,
        })
    );
    await animationFrame();
    expect(calls("reschedule")[0].args[0]).toEqual({
        date_start: "2030-06-11 06:00:00",
        date_stop: "2030-06-11 14:00:00",
        parent_id: 1,
    });
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(calls("rollback")[0].args).toEqual([[101], answer.old_vals_per_pill_id]);
    expect(notices()).toHaveCount(0);
});
