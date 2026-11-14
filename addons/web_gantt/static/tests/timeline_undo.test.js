// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryAllTexts, queryOne, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";
import { columnPeriod } from "@web_gantt/timeline_editing";

import { HOST_ARCHS, setupTimelineFixtures, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
/** Every call the tests watch, in the order the server saw it. */
let log;
/** What `gantt_undo_drag_drop` answers; set per test. */
let undoAnswer;
/** Makes a write wait for the test, or null. */
let writeGate;
/** The server refuses writes / copies while set. */
let refuse;
/** Makes `gantt_undo_drag_drop` wait for the test, or null. */
let undoGate;

beforeEach(() => {
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
    undoAnswer = true;
    writeGate = null;
    refuse = false;
    undoGate = null;
    timelineMock.beforeReply = () => {
        log.push("reload");
    };
    onRpc("write", async ({ args, kwargs, model }) => {
        log.push({ call: "write", model, ids: args[0], values: args[1], context: kwargs.context });
        if (writeGate) {
            await writeGate();
        }
        if (refuse) {
            throw new Error("Access denied");
        }
    });
    onRpc("copy", (request) => {
        const { args, kwargs } = request;
        log.push({ call: "copy", ids: args[0], default: kwargs.default, context: kwargs.context });
        if (refuse) {
            throw new Error("Access denied");
        }
    });
    onRpc("gantt_undo_drag_drop", async ({ args, kwargs }) => {
        log.push({ call: "undo", ids: args[0], kind: kwargs.drag_kind, values: kwargs.values });
        if (undoGate) {
            await undoGate;
        }
        return undoAnswer;
    });
});

async function mountTimeline(params = {}) {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1,
        ...params,
    });
    // the first load is not part of what the tests look at
    log.length = 0;
}

const pill = (name) => MockServer.current.env.pill.find((record) => record.name === name);
const editor = () => controller.editor;
const calls = (name) => log.filter((entry) => entry.call === name);
/** The sequence of server calls as words. */
const sequence = () => log.map((entry) => (typeof entry === "string" ? entry : entry.call));
const notices = () => queryAll(".o_notification");
const noticeText = () => queryAllTexts(".o_notification .o_notification_content");
const settled = (promise) =>
    promise.then(
        () => null,
        (reason) => reason
    );

/** A promise with its resolver. */
function deferred() {
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    promise.resolve = resolve;
    return promise;
}

/** Hold the writes; the returned function lets the oldest held one answer. */
function holdWrites() {
    const gates = [];
    writeGate = () => {
        const gate = deferred();
        gates.push(gate);
        return gate;
    };
    return () => gates.shift().resolve();
}

const COPY_VALUES = { date_start: "2026-11-12 10:00:00", date_stop: "2026-11-12 14:00:00" };

const MOVE = () => ({
    kind: "move",
    resId: pill("Review").id,
    values: { date_start: "2026-11-12 10:00:00", date_stop: "2026-11-12 14:00:00" },
    undo: {
        values: { date_start: "2026-11-11 10:00:00", date_stop: "2026-11-11 14:00:00" },
    },
});

const checkIcon = () =>
    getComputedStyle(queryOne(".o_notification .o_notification_body"), "::before").content;

test("A6 D3: empty values send nothing, no notification, no reload", async () => {
    await mountTimeline();
    const before = timelineMock.calls.length;
    for (const kind of ["move", "resize", "copy"]) {
        const result = await editor().applyChange({ kind, resId: 6, values: {}, undo: {} });
        expect(result).toBe(false);
    }
    await animationFrame();
    expect(log).toEqual([]);
    expect(timelineMock.calls.length).toBe(before);
    expect(notices()).toHaveCount(0);
});

test("A38 an accepted move writes, reloads, then shows Dates changed with Undo", async () => {
    const release = holdWrites();
    await mountTimeline();
    const done = editor().applyChange(MOVE());
    await animationFrame();
    // A74: the answer is pending, nothing is shown
    expect(sequence()).toEqual(["write"]);
    expect(notices()).toHaveCount(0);
    release();
    expect(await done).toBe(true);
    await animationFrame();
    expect(sequence()).toEqual(["write", "reload"]);
    const [write] = calls("write");
    expect(write.model).toBe("pill");
    expect(write.ids).toEqual([MOVE().resId]);
    expect(write.values).toEqual(MOVE().values);
    expect(write.context).toBeOfType("object");
    expect(notices()).toHaveCount(1);
    expect(".o_notification").toHaveClass("o_tl_notification");
    expect(".o_notification .o_notification_bar").toHaveClass("bg-success");
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(queryAllTexts(".o_notification .o_notification_buttons button")).toEqual(["Undo"]);
    expect(".o_notification .o_notification_buttons button").toHaveText("Undo");
    expect(".o_notification .o_notification_buttons button i").toHaveAttribute(
        "data-icon",
        "undo"
    );
    expect(checkIcon()).toBe('"check"');
    expect(".o_notification .o_notification_close").toHaveCount(1);
});

test("A38 Undo calls the server undo with the earlier values and shows Change undone", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(sequence()).toEqual(["undo", "reload"]);
    const [undo] = calls("undo");
    expect(undo.kind).toBe("reschedule");
    expect(undo.ids).toEqual([MOVE().resId]);
    expect(undo.values).toEqual(MOVE().undo.values);
    expect(noticeText()).toEqual(["Change undone"]);
    expect(notices()).toHaveCount(1);
    expect(".o_notification .o_notification_bar").toHaveClass("bg-success");
    expect(".o_notification .o_notification_buttons").toHaveCount(0);
    expect(".o_notification").toHaveClass("o_tl_notification");
});

test("A41 Undo of a copy deletes the copy: kind copy on the new id", async () => {
    await mountTimeline();
    const resId = pill("Review").id;
    const result = await editor().applyChange({
        kind: "copy",
        resId,
        values: COPY_VALUES,
        undo: { values: { ignored: 1 } },
    });
    expect(result).toBe(true);
    await animationFrame();
    const [copy] = calls("copy");
    expect(copy.ids).toEqual([resId]);
    expect(copy.default).toEqual(COPY_VALUES);
    expect(sequence()).toEqual(["copy", "reload"]);
    expect(noticeText()).toEqual(["Record copied"]);
    const copies = MockServer.current.env.pill.filter(
        (record) => record.id !== resId && record.name.startsWith("Review")
    );
    expect(copies).toHaveLength(1);
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    const [undo] = calls("undo");
    expect(undo.kind).toBe("copy");
    expect(undo.ids).toEqual([copies[0].id]);
    expect(undo.values).toEqual({});
    expect(noticeText()).toEqual(["Copy removed"]);
    expect(".o_notification .o_notification_buttons").toHaveCount(0);
});

test("A43 an undo the server cannot do shows a danger notification with the check icon", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    undoAnswer = false;
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(sequence()).toEqual(["undo", "reload"]);
    expect(noticeText()).toEqual(["This change could not be undone"]);
    expect(".o_notification .o_notification_bar").toHaveClass("bg-danger");
    expect(".o_notification .o_notification_buttons").toHaveCount(0);
    expect(checkIcon()).toBe('"check"');
    // the copy
    await editor().applyChange({
        kind: "copy",
        resId: pill("Review").id,
        values: COPY_VALUES,
    });
    await animationFrame();
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(sequence()).toEqual(["undo", "reload"]);
    expect(noticeText()).toEqual(["This copy could not be removed"]);
    expect(".o_notification .o_notification_bar").toHaveClass("bg-danger");
    expect(".o_notification").toHaveClass("o_tl_notification");
    expect(checkIcon()).toBe('"check"');
});

test("A44 a second change closes the first notification; its Undo undoes only the second", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    const second = {
        kind: "resize",
        resId: pill("Build").id,
        values: { date_stop: "2026-11-14 15:00:00" },
        undo: { values: { date_start: "2026-11-11 06:00:00", date_stop: "2026-11-13 15:00:00" } },
    };
    await editor().applyChange(second);
    await animationFrame();
    expect(notices()).toHaveCount(1);
    expect(noticeText()).toEqual(["Dates changed"]);
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    const undos = calls("undo");
    expect(undos).toHaveLength(1);
    expect(undos[0].ids).toEqual([second.resId]);
    expect(undos[0].values).toEqual(second.undo.values);
    expect(notices()).toHaveCount(1);
    expect(noticeText()).toEqual(["Change undone"]);
});

test("A44 the result notification is closed by the next change and by closeNotification", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(noticeText()).toEqual(["Change undone"]);
    await editor().applyChange(MOVE());
    await animationFrame();
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(notices()).toHaveCount(1);
    editor().closeNotification();
    await animationFrame();
    expect(notices()).toHaveCount(0);
});

test("A56 two resizes before the first answer: write, reload, write, reload", async () => {
    const release = holdWrites();
    await mountTimeline();
    const resize = () => ({
        kind: "resize",
        resId: pill("Build").id,
        values: { date_stop: "2026-11-14 15:00:00" },
        undo: { values: {} },
    });
    const first = editor().applyChange(resize());
    const second = editor().applyChange(resize());
    await animationFrame();
    // the second waits for the first, whatever the time it takes
    expect(sequence()).toEqual(["write"]);
    release();
    await first;
    await animationFrame();
    expect(sequence()).toEqual(["write", "reload", "write"]);
    release();
    await second;
    await animationFrame();
    expect(sequence()).toEqual(["write", "reload", "write", "reload"]);
    expect(calls("write").map((write) => write.values.date_stop)).toEqual([
        "2026-11-14 15:00:00",
        "2026-11-14 15:00:00",
    ]);
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(notices()).toHaveCount(1);
});

test("A57 a refused move or resize: reload, error only, no success notification", async () => {
    await mountTimeline();
    refuse = true;
    for (const change of [MOVE(), { ...MOVE(), kind: "resize" }]) {
        log.length = 0;
        const error = await settled(editor().applyChange(change));
        await animationFrame();
        expect(error).not.toBe(null);
        expect(sequence()).toEqual(["write", "reload"]);
        expect(notices()).toHaveCount(0);
    }
});

test("A57 a refused copy reloads nothing and shows no notification", async () => {
    await mountTimeline();
    refuse = true;
    const error = await settled(
        editor().applyChange({ kind: "copy", resId: pill("Review").id, values: COPY_VALUES })
    );
    await animationFrame();
    expect(error).not.toBe(null);
    expect(sequence()).toEqual(["copy"]);
    expect(notices()).toHaveCount(0);
    // the queue goes on after a refusal
    refuse = false;
    expect(await editor().applyChange(MOVE())).toBe(true);
});

test("A57 a refused write does not stop the ones queued after it", async () => {
    await mountTimeline();
    const { model } = controller;
    const order = [];
    const failed = model.queueWrite(async () => {
        order.push("first");
        throw new Error("refused");
    });
    const next = model.queueWrite(async () => {
        order.push("second");
        return "ok";
    });
    expect((await settled(failed)).message).toBe("refused");
    expect(await next).toBe("ok");
    expect(order).toEqual(["first", "second"]);
});

test("A74 the notification appears only after the write resolves", async () => {
    const release = holdWrites();
    await mountTimeline();
    const done = editor().applyChange({
        kind: "resize",
        resId: pill("Build").id,
        values: { date_stop: "2026-11-12 15:00:00" },
        undo: { values: {} },
    });
    await animationFrame();
    await animationFrame();
    expect(notices()).toHaveCount(0);
    release();
    await done;
    await waitFor(".o_notification");
    expect(noticeText()).toEqual(["Dates changed"]);
});

test("R15 queueWrite runs one at a time and is awaited by whenWritesDone", async () => {
    await mountTimeline();
    const { model } = controller;
    const gate = deferred();
    const order = [];
    model.queueWrite(async () => {
        order.push("a:start");
        await gate;
        order.push("a:end");
    });
    const second = model.queueWrite(async () => {
        order.push("b");
        return 7;
    });
    let drained = false;
    model.whenWritesDone().then(() => (drained = true));
    await animationFrame();
    expect(order).toEqual(["a:start"]);
    expect(drained).toBe(false);
    gate.resolve();
    expect(await second).toBe(7);
    await animationFrame();
    expect(order).toEqual(["a:start", "a:end", "b"]);
    expect(drained).toBe(true);
});

test("planFor writes through the queue", async () => {
    await mountTimeline();
    const { model } = controller;
    const gate = deferred();
    model.queueWrite(() => gate);
    const { data } = model;
    const period = columnPeriod(
        data,
        data.columns.findIndex((column) => column.start.day === 14)
    );
    const done = editor().planFor({ period, row: null });
    await waitFor(".o_dialog .o_list_view .o_content");
    await animationFrame();
    await contains(
        ".o_dialog .o_data_row:contains(Unscheduled) .o_list_record_selector input"
    ).click();
    await waitFor(".o_dialog .o_select_button:not(:disabled)");
    await contains(".o_dialog .o_select_button").click();
    await animationFrame();
    // the earlier write has not returned: the plan write is not sent
    expect(calls("write")).toHaveLength(0);
    gate.resolve();
    await done;
    expect(calls("write")).toHaveLength(1);
    expect(calls("write")[0].ids).toEqual([pill("Unscheduled").id]);
});

test("Review Focus 3: the model disposed before the answer does not throw", async () => {
    const release = holdWrites();
    await mountTimeline();
    const done = editor().applyChange(MOVE());
    await animationFrame();
    controller.model.dispose();
    const before = timelineMock.calls.length;
    release();
    expect(await done).toBe(true);
    await animationFrame();
    // the write went through; no reload, no notification of a view that is gone
    expect(calls("write")).toHaveLength(1);
    expect(timelineMock.calls.length).toBe(before);
    expect(notices()).toHaveCount(0);
    // an undo after the view was left is not shown either
    expect(await editor().undoChange({ kind: "move", resId: 6, values: { a: 1 } })).toBe(true);
    expect(notices()).toHaveCount(0);
});

test("R-T10-1 leaving the view closes its change notification", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    expect(notices()).toHaveCount(1);
    // what the controller does when it unmounts
    controller.model.dispose();
    await animationFrame();
    expect(notices()).toHaveCount(0);
});

test("R-T10-2 an undo that fails with an error closes the notification of the change", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    onRpc("gantt_undo_drag_drop", () => {
        throw new Error("Access denied");
    });
    const source = editor()._current;
    const failure = await settled(
        editor().undoChange({ kind: "move", resId: 6, values: {}, source })
    );
    await animationFrame();
    expect(failure).not.toBe(null);
    expect(notices()).toHaveCount(0);
});

test("A44 R10 Undo does not close its notification: it stays with its bar until the answer, then the result replaces it", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    const gate = deferred();
    undoGate = gate;
    log.length = 0;
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    // pending: the notification of the change is still shown, with its Undo and its bar
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(".o_notification .o_notification_bar").toHaveCount(1);
    expect(".o_notification .o_notification_buttons button").toHaveCount(1);
    // a second click on the same Undo does nothing
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(calls("undo")).toHaveLength(1);
    gate.resolve();
    await animationFrame();
    await animationFrame();
    // the answer: the result stands in its place
    expect(notices()).toHaveCount(1);
    expect(noticeText()).toEqual(["Change undone"]);
    expect(".o_notification .o_notification_buttons").toHaveCount(0);
});

test("A44 R10 a change made while an Undo is pending: its notification is the one the result replaces", async () => {
    await mountTimeline();
    await editor().applyChange(MOVE());
    await animationFrame();
    const release = holdWrites();
    // a second change whose write is pending, then Undo of the first one: the undo waits behind it
    const second = editor().applyChange({
        kind: "resize",
        resId: pill("Build").id,
        values: { date_stop: "2026-11-14 15:00:00" },
        undo: { values: { date_stop: "2026-11-13 15:00:00" } },
    });
    await animationFrame();
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    // the clicked notification stays while both wait
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(".o_notification .o_notification_buttons button").toHaveCount(1);
    const gate = deferred();
    undoGate = gate;
    writeGate = null;
    release();
    await second;
    await animationFrame();
    await animationFrame();
    // the newer change's notification stands, the undo is pending
    expect(noticeText()).toEqual(["Dates changed"]);
    expect(calls("undo")).toHaveLength(1);
    gate.resolve();
    await animationFrame();
    await animationFrame();
    // the result replaced the newer notification: never beside a change notification
    expect(noticeText()).toEqual(["Change undone"]);
    expect(notices()).toHaveCount(1);
});
