// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, dblclick, queryAll, queryAllTexts, waitFor } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
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

import { setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
let rpcs;

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
    rpcs = [];
    onRpc("*", ({ method, model }) => {
        rpcs.push({ method, model });
    });
});

const BUILD = 5;
const DEPLOY = 8;
const POPOVER = ".o_tl_popover";
const BASE = `default_range="week" color="x_color"`;
const pillOf = (id) => `.o_tl_pill[data-pill-id="${id}"]`;
const calls = (method) => rpcs.filter((rpc) => rpc.method === method && rpc.model === "pill");

async function mountTimeline(extra = "", children = "") {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(`${BASE} ${extra}`, children),
    });
}

async function openPopover(id) {
    await click(pillOf(id));
    await advanceTime(250);
    await animationFrame();
}

async function openDialog(id) {
    if (!queryAll(POPOVER).length) {
        await openPopover(id);
    }
    await contains(`${POPOVER} .o_tl_popover_button`).click();
    await animationFrame();
    await waitFor(".o_dialog .o_form_view");
}

const title = () => queryAllTexts(".o_dialog .modal-title");
const footer = () => queryAllTexts(".o_dialog .modal-footer button");

const SWITCH_POPOVER = `<popover><field name="x_done"/><templates><t t-name="popover-body"><field name="x_done" widget="boolean_toggle"/></t></templates></popover>`;

test("002b A34: double click opens Open, no popover", async () => {
    await mountTimeline();
    await dblclick(pillOf(BUILD));
    await advanceTime(300);
    await animationFrame();
    await waitFor(".o_dialog .o_form_view");
    expect(POPOVER).toHaveCount(0);
    expect(".o_dialog").toHaveCount(1);
    expect(title()).toEqual(["Open"]);
    expect(".o_dialog .o_field_widget[name='name'] input").toHaveValue("Build");
});

test("002b A35: Edit opens editable dialog with Save, Discard, Remove", async () => {
    await mountTimeline();
    await openPopover(BUILD);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveText("Edit");
    await openDialog(BUILD);
    expect(POPOVER).toHaveCount(0);
    expect(title()).toEqual(["Open"]);
    expect(".o_dialog .o_field_widget[name='name'] input").toHaveCount(1);
    expect(".o_dialog .o_form_button_save").toHaveCount(1);
    expect(".o_dialog .o_form_button_cancel").toHaveCount(1);
    expect(".o_dialog .o_form_button_remove").toHaveCount(1);
});

test("002b A36: View opens read-only without Remove", async () => {
    await mountTimeline(`edit="0"`);
    await openPopover(BUILD);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveText("View");
    await openDialog(BUILD);
    expect(".o_dialog .o_form_readonly").toHaveCount(1);
    expect(".o_dialog .o_field_widget[name='name'] input").toHaveCount(0);
    expect(".o_dialog .o_form_button_save").toHaveCount(0);
    expect(".o_dialog .o_form_button_remove").toHaveCount(0);
    // Community's read-only buttons: the closing button (hidden by the stylesheet while "New" is
    // there) and the form's own New
    expect(".o_dialog .modal-footer .o-default-button").toHaveCount(1);
    expect(".o_dialog .modal-footer .o_form_button_create").toHaveCount(1);
    await contains(".o_dialog .btn-close").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
});

test("002b A37: save renames the pill; cross reloads once", async () => {
    await mountTimeline();
    await openDialog(BUILD);
    await contains(".o_dialog .o_field_widget[name='name'] input").edit("Built");
    const before = timelineMock.calls.length;
    await contains(".o_dialog .o_form_button_save").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
    expect(`${pillOf(BUILD)}`).toHaveText(/Built/);
    // the close cross reloads once as well
    await openDialog(BUILD);
    const again = timelineMock.calls.length;
    await contains(".o_dialog .btn-close").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(timelineMock.calls.length - again).toBe(1);
});

test("002b A38: dialog waits for the plan write", async () => {
    await mountTimeline();
    let release;
    controller.model.trackWrite(new Promise((resolve) => (release = resolve)));
    await dblclick(pillOf(BUILD));
    await advanceTime(300);
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(calls("web_read")).toHaveLength(0);
    release();
    await waitFor(".o_dialog .o_form_view");
    expect(calls("web_read")).toHaveLength(1);
});

test("002b A39: switch saves at once, reload on close", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(BASE, SWITCH_POPOVER),
    });
    await openPopover(DEPLOY);
    expect(POPOVER).toHaveCount(1);
    const before = timelineMock.calls.length;
    await contains(`${POPOVER} .o_field_widget[name='x_done'] input`).click();
    await animationFrame();
    expect(MockServer.current.env.pill.find((r) => r.id === DEPLOY).x_done).toBe(false);
    // no reload while the popover is open
    expect(POPOVER).toHaveCount(1);
    expect(timelineMock.calls.length - before).toBe(0);
    await contains(`${POPOVER} .o_card_popover_close`).click();
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
});

test("002b A39b: popover button closes and reloads", async () => {
    const button = `<button type="object" name="action_done" class="o_custom_btn">Done</button>`;
    onRpc("pill", "action_done", () => true);
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(
            BASE,
            `<popover><field name="x_done"/><templates><t t-name="popover-footer">${button}</t></templates></popover>`
        ),
    });
    await openPopover(BUILD);
    const before = timelineMock.calls.length;
    await contains(`${POPOVER} .o_custom_btn`).click();
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
});

test("002b A40: switch read-only with edit off", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(`${BASE} edit="0"`, SWITCH_POPOVER),
    });
    await openPopover(DEPLOY);
    expect(`${POPOVER} .o_field_widget[name='x_done'] input`).toHaveProperty("disabled", true);
});

test("002b A41: Remove only on existing records with delete", async () => {
    await mountTimeline(`delete="0"`);
    await openDialog(BUILD);
    expect(".o_dialog .o_form_button_remove").toHaveCount(0);
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
})

test("002b A41: a new record has no Remove", async () => {
    await mountTimeline();
    await contains(".o_tl_button_add").click();
    await animationFrame();
    await waitFor(".o_dialog .o_form_view");
    expect(".o_dialog .o_form_button_remove").toHaveCount(0);
});

test("002b A42: Delete removes and closes both", async () => {
    await mountTimeline();
    await openDialog(BUILD);
    await contains(".o_dialog .o_form_button_remove").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(2);
    expect(".o_dialog .modal-footer .btn-danger").toHaveText("Delete");
    expect('.o_dialog .modal-footer button:contains("No, keep it")').toHaveCount(1);
    const before = timelineMock.calls.length;
    await contains(".o_dialog .modal-footer .btn-danger").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(calls("unlink")).toHaveLength(1);
    expect(pillOf(BUILD)).toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
});

test("002b A43: No, keep it keeps the record dialog", async () => {
    await mountTimeline();
    await openDialog(BUILD);
    await contains(".o_dialog .o_form_button_remove").click();
    await animationFrame();
    await contains('.o_dialog .modal-footer button:contains("No, keep it")').click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(1);
    expect(title()).toEqual(["Open"]);
    expect(calls("unlink")).toHaveLength(0);
});

test("002b A1b: refused unlink shows the error and reloads", async () => {
    expect.errors(1);
    onRpc("pill", "unlink", () => {
        throw new Error("Access denied");
    });
    await mountTimeline();
    await openDialog(BUILD);
    await contains(".o_dialog .o_form_button_remove").click();
    await animationFrame();
    await contains(".o_dialog .modal-footer .btn-danger").click();
    await animationFrame();
    await animationFrame();
    expect.verifyErrors(["Access denied"]);
    // the error dialog is shown over the record dialog, which stays open
    expect(".o_error_dialog").toHaveCount(1);
    expect(title()).toInclude("Open");
    expect(pillOf(BUILD)).toHaveCount(1);
    const before = timelineMock.calls.length;
    await contains(".o_error_dialog .btn-close").click();
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
});

test("002b A26: record dialog uses form_view_id", async () => {
    await mountTimeline(`form_view_id="2"`);
    await openDialog(BUILD);
    expect(".o_dialog .o_field_widget[name='name']").toHaveCount(1);
    expect(".o_dialog .o_field_widget[name='x_progress']").toHaveCount(0);
});
