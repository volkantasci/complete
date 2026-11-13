// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryOne } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    getService,
    mountView,
    mountViewInDialog,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineModel } from "@web_gantt/timeline_model";

import {
    HOST_ARCHS,
    makeTimelineModel,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineModel.prototype, {
        setup() {
            super.setup(...arguments);
            lastModel = this;
        },
    });
});

let lastModel;
const getModel = () => lastModel;

async function mountTimeline({ arch = HOST_ARCHS.H1, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
}

const inputValue = (name) =>
    queryOne(`.o_dialog .o_field_widget[name='${name}'] button`).getAttribute("value");

async function clickNew() {
    await contains(".o_tl_button_add").click();
    await animationFrame();
}

test("002b A2: New shown/hidden", async () => {
    await mountTimeline();
    expect(".o_tl_button_add").toHaveCount(1);
});

test("002b A2: New hidden with create off, shown with edit off and delete off", async () => {
    await mountTimeline({ arch: timelineArch(`create="0"`) });
    expect(".o_tl_button_add").toHaveCount(0);
    // no empty wrapper either: the control panel hides its empty button area, so the title
    // stays at the left edge (screen S10)
    expect(".o_tl_buttons").toHaveCount(0);
    expect(".o_control_panel_main_buttons:visible").toHaveCount(0);
});

test("002b A2: New is shown when only edit or delete is off", async () => {
    await mountTimeline({ arch: timelineArch(`edit="0" delete="0"`) });
    expect(".o_tl_button_add").toHaveCount(1);
});

test("002b A2: New hidden inside a dialog", async () => {
    await mountViewInDialog({ type: "gantt", resModel: "pill", arch: HOST_ARCHS.H1 });
    await animationFrame();
    expect(".o_dialog .o_timeline_view").toHaveCount(1);
    expect(".o_tl_button_add").toHaveCount(0);
});

test("002b A5: New opens Create with the grid's week", async () => {
    await mountTimeline();
    await clickNew();
    expect(".o_dialog .modal-title").toHaveText("Create");
    expect(queryOne(".o_dialog .o_field_widget[name='date_start'] button")).toHaveText(
        "Nov 8, 12:00 AM"
    );
    expect(queryOne(".o_dialog .o_field_widget[name='date_stop'] button")).toHaveText(
        "Nov 15, 12:00 AM"
    );
    expect(inputValue("date_start")).toBe("11/08/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/15/2026 00:00:00");
    expect(".o_dialog .o_field_widget[name='parent_id'] input").toHaveValue("");
});

test("002b A6: New follows the visible middle date", async () => {
    await mountTimeline();
    const renderer = queryOne(".o_tl_renderer");
    renderer.scrollLeft = renderer.scrollWidth;
    await animationFrame();
    const middle = getModel().visibleMiddleDate();
    await clickNew();
    // the week that contains the middle date, Sunday first
    const start = middle.startOf("day").minus({ days: middle.weekday % 7 });
    expect(inputValue("date_start")).toBe(start.toFormat("MM/dd/yyyy 00:00:00"));
    expect(inputValue("date_stop")).toBe(start.plus({ days: 7 }).toFormat("MM/dd/yyyy 00:00:00"));
    expect(start.toISODate()).not.toBe("2026-11-08");
});

test("002b A7: New in the sample state opens the create dialog", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H8, domain: [["id", "=", 0]] });
    expect(queryAll("[class*=o_view_sample_data]")).toHaveLength(1);
    await clickNew();
    expect(".o_dialog .modal-title").toHaveText("Create");
});

test("002b A25: New runs the create action with the defaults", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" on_create="17"`) });
    const calls = [];
    patchWithCleanup(getService("action"), {
        doAction(action, options) {
            calls.push({ action, options });
        },
    });
    await clickNew();
    expect(".o_dialog").toHaveCount(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe(17);
    const context = calls[0].options.additionalContext;
    expect(context.date_start).toBe("2026-11-07 21:00:00");
    expect(context.default_date_start).toBe(context.date_start);
    expect(context.default_date_stop).toBe("2026-11-14 21:00:00");
    expect(Object.keys(context).some((key) => key.startsWith("search_default_"))).toBe(false);
});

test("002b A26: create dialog uses form_view_id", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" form_view_id="2"`) });
    await clickNew();
    expect(".o_dialog .o_field_widget[name='name']").toHaveCount(1);
    expect(".o_dialog .o_field_widget[name='x_progress']").toHaveCount(0);
});

test("002b R3: closing the dialog reloads once", async () => {
    await mountTimeline();
    await clickNew();
    const before = timelineMock.calls.length;
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
});

test("002b A21: New carries the action default only", async () => {
    await mountTimeline({
        context: { default_x_state: "doing", default_parent_id: 2 },
        arch: HOST_ARCHS.H1,
    });
    await clickNew();
    // no row value is set: the action's own default stays
    expect(".o_dialog .o_field_widget[name='parent_id'] input").toHaveValue("Beta");
    expect(".o_dialog .o_field_widget[name='x_state'] input").toHaveValue("In progress");
});

test("002b R10: tracked writes are awaited", async () => {
    const { model } = await makeTimelineModel();
    expect(model.trackWrite).toBeOfType("function");
    await model.whenWritesDone();
    const log = [];
    let release;
    const slow = new Promise((resolve) => (release = resolve));
    expect(model.trackWrite(slow)).toBe(slow);
    const failing = Promise.reject(new Error("refused"));
    model.trackWrite(failing).catch(() => {});
    model.whenWritesDone().then(() => log.push("done"));
    await animationFrame();
    expect(log).toEqual([]);
    release();
    await animationFrame();
    expect(log).toEqual(["done"]);
});
