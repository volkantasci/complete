// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAllTexts, queryOne, waitFor } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    editSearch,
    getService,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
    validateSearch,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";
import { columnPeriod } from "@web_gantt/timeline_editing";

import {
    HOST_ARCHS,
    makeTimelineModel,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

let controller;
let writes;

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
    writes = [];
    onRpc("write", ({ args, kwargs, model }) => {
        writes.push({ model, ids: args[0], values: args[1], context: kwargs.context });
    });
});

const PLAN_ARCH = timelineArch(`default_range="week" color="x_color"`);

async function mountTimeline({ arch = PLAN_ARCH, resModel = "pill", ...rest } = {}) {
    await mountView({ type: "gantt", resModel, arch, ...rest });
}

/** Period of the day column of the `day` of November (week scale, one column per day). */
function dayPeriod(day) {
    const { data } = controller.model;
    return columnPeriod(
        data,
        data.columns.findIndex((column) => column.start.day === day)
    );
}

const rowNamed = (name) => controller.model.data.rows.find((row) => row.name === name);

/** Click Select once the checked records have enabled it. */
async function clickSelect() {
    await waitFor(".o_dialog .o_select_button:not(:disabled)");
    await contains(".o_dialog .o_select_button").click();
}

/** Open the plan dialog and let it render. */
async function openPlan(day = 14, rowName = null, period = null) {
    const row = rowName ? rowNamed(rowName) : null;
    const done = controller.editor.planFor({ period: period || dayPeriod(day), row });
    await waitFor(".o_dialog .o_list_view .o_content");
    await animationFrame();
    return { done };
}

const listed = () => queryAllTexts(".o_dialog .o_data_row .o_data_cell[name='name']");
const pill = (name) => MockServer.current.env.pill.find((record) => record.name === name);
const planWrites = () => writes.filter((write) => write.model === "pill");

test("002b A15: plan dialog lists records without dates", async () => {
    await mountTimeline();
    await openPlan();
    expect(".o_dialog .modal-title").toHaveText("Plan");
    expect(listed()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    expect(".o_dialog .o_searchview_facet").toHaveCount(0);
    expect(".o_dialog .o_select_button").toHaveCount(1);
    expect(".o_dialog .o_select_button").toHaveProperty("disabled", true);
    expect(".o_dialog .o_create_button").toHaveCount(1);
});

test("002b A28: Select writes start, stop and parent once", async () => {
    await mountTimeline({ groupBy: ["parent_id"], context: { lang: "en_US", marker: 7 } });
    const { done } = await openPlan(12, "Beta");
    // the row value is the facet "Parent: Beta": only Unscheduled remains
    expect(listed()).toEqual(["Unscheduled"]);
    await contains(".o_dialog .o_data_row .o_list_record_selector input").click();
    const before = timelineMock.calls.length;
    await clickSelect();
    await done;
    expect(planWrites()).toHaveLength(1);
    const [write] = planWrites();
    expect(write.ids).toEqual([17]);
    // the record is not shown in the view: every value is written
    expect(write.values).toEqual({
        date_start: "2026-11-11 21:00:00",
        date_stop: "2026-11-12 21:00:00",
        parent_id: 2,
    });
    expect(write.context.marker).toBe(7);
    // R9.4: the write carries the context of the action and the search, nothing the view added
    expect(Object.keys(write.context).filter((key) => !(key in controller.model.context))).toEqual(
        []
    );
    for (const key of Object.keys(write.context)) {
        expect(key.startsWith("default_") || key.startsWith("search_default_")).toBe(false);
    }
    for (const field of ["date_start", "date_stop", "parent_id"]) {
        expect(field in write.context).toBe(false);
    }
    expect(".o_dialog").toHaveCount(0);
    expect(timelineMock.calls.length - before).toBe(1);
    expect(pill("Unscheduled").date_start).toBe("2026-11-11 21:00:00");
});

test("002b A28: the parent is written when the record does not hold it", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const { done } = await openPlan(12, "Alpha");
    await contains(".o_dialog .o_searchview_facet .o_facet_remove").click();
    await animationFrame();
    await contains(".o_dialog .o_data_row:contains(Unscheduled) .o_list_record_selector input").click();
    await clickSelect();
    await done;
    expect(planWrites()).toHaveLength(1);
    expect(planWrites()[0].values.parent_id).toBe(1);
    expect(planWrites()[0].values.date_start).toBe("2026-11-11 21:00:00");
});

test("002b A29: two records, one write", async () => {
    await mountTimeline();
    const { done } = await openPlan(13);
    await contains(".o_dialog .o_data_row:contains(Alpha) .o_list_record_selector input").click();
    await contains(".o_dialog .o_data_row:contains(Gamma) .o_list_record_selector input").click();
    await clickSelect();
    await done;
    expect(planWrites()).toHaveLength(1);
    expect(planWrites()[0].ids).toEqual([1, 3]);
    expect(planWrites()[0].values).toEqual({
        date_start: "2026-11-12 21:00:00",
        date_stop: "2026-11-13 21:00:00",
    });
});

test("002b A29b: a row click plans at once", async () => {
    await mountTimeline();
    const { done } = await openPlan(14);
    await contains(".o_dialog .o_data_row:contains(Unscheduled) .o_data_cell[name='name']").click();
    await done;
    expect(".o_dialog").toHaveCount(0);
    expect(planWrites()).toHaveLength(1);
    expect(planWrites()[0].ids).toEqual([17]);
    expect(pill("Unscheduled").date_start).toBe("2026-11-13 21:00:00");
    expect(pill("Unscheduled").date_stop).toBe("2026-11-14 21:00:00");
});

test("002b A29c: many2many replaced by the row tag", async () => {
    await mountTimeline({ groupBy: ["x_tags"] });
    pill("Unscheduled").x_tags = [2];
    const { done } = await openPlan(14, "Host Tag 1");
    await contains(".o_dialog .o_data_row:contains(Unscheduled) .o_data_cell[name='name']").click();
    await done;
    expect(planWrites()).toHaveLength(1);
    expect(planWrites()[0].values.x_tags).toEqual([[6, 0, [1]]]);
    expect(pill("Unscheduled").x_tags).toEqual([1]);
});

test("002b A30: ignores the search and date conditions", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H1 });
    await editSearch("Design");
    await validateSearch();
    await openPlan();
    expect(listed()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
});

test("002b A30: the action domain applies, its date conditions go", async () => {
    await mountTimeline({ domain: [["name", "=", "zzz"]] });
    await openPlan();
    expect(listed()).toEqual([]);
});

test("002b A30: date leaves of the action domain are dropped", async () => {
    await mountTimeline({
        domain: [
            ["date_start", ">", "2026-10-13 00:00:00"],
            ["name", "!=", "Gamma"],
        ],
    });
    await openPlan();
    expect(listed()).toEqual(["Alpha", "Beta", "Unscheduled"]);
});

test("002b A30: archived not listed; action search default applies", async () => {
    await mountTimeline();
    pill("Gamma").active = false;
    await openPlan();
    expect(listed()).toEqual(["Alpha", "Beta", "Unscheduled"]);
});

test("002b A30: search default of the action context", async () => {
    await mountTimeline({ context: { search_default_name: "Al" } });
    await openPlan();
    expect(".o_dialog .o_searchview_facet").toHaveCount(1);
    expect(listed()).toEqual(["Alpha"]);
});

test("002b A31: Create New with the default form, then one write", async () => {
    await mountTimeline();
    const { done } = await openPlan(14);
    await contains(".o_dialog .o_create_button").click();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveCount(2);
    expect(queryAllTexts(".o_dialog .modal-title")).toEqual(["Plan", "Create"]);
    expect(queryOne(".o_dialog:last .o_field_widget[name='date_start'] button")).toHaveAttribute(
        "value",
        "11/14/2026 00:00:00"
    );
    // Discard closes only the create dialog
    await contains(".o_dialog:last .o_form_button_cancel").click();
    await animationFrame();
    expect(queryAllTexts(".o_dialog .modal-title")).toEqual(["Plan"]);
    expect(planWrites()).toHaveLength(0);
    await contains(".o_dialog .o_create_button").click();
    await animationFrame();
    await contains(".o_dialog:last .o_field_widget[name='name'] input").edit("Zeta");
    await contains(".o_dialog:last .o_form_button_save").click();
    await done;
    expect(".o_dialog").toHaveCount(0);
    const created = pill("Zeta");
    expect(created.date_start).toBe("2026-11-13 21:00:00");
    expect(planWrites()).toHaveLength(1);
    expect(planWrites()[0].ids).toEqual([created.id]);
    expect(planWrites()[0].values).toEqual({
        date_start: "2026-11-13 21:00:00",
        date_stop: "2026-11-14 21:00:00",
    });
});

test("002b A31b: Create New uses form_view_id", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" form_view_id="2"`) });
    const { done } = await openPlan(14);
    await contains(".o_dialog .o_create_button").click();
    await animationFrame();
    expect(".o_dialog:last .o_field_widget[name='x_progress']").toHaveCount(0);
    expect(".o_dialog:last .o_field_widget[name='name']").toHaveCount(1);
    await contains(".o_dialog:last .o_field_widget[name='name'] input").edit("Eta");
    await contains(".o_dialog:last .o_form_button_save").click();
    await done;
    expect(pill("Eta").date_stop).toBe("2026-11-14 21:00:00");
});

test("002b A31c: Create New runs the create action, no write", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="week" on_create="17"`),
        groupBy: ["parent_id"],
    });
    const calls = [];
    let close;
    patchWithCleanup(getService("action"), {
        doAction(action, options) {
            calls.push({ action, options });
            close = options.onClose;
        },
    });
    const { done } = await openPlan(14, "Alpha");
    await contains(".o_dialog .o_create_button").click();
    await animationFrame();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe(17);
    const context = calls[0].options.additionalContext;
    expect(context.default_date_start).toBe("2026-11-13 21:00:00");
    expect(context.default_parent_id).toBe(1);
    expect(planWrites()).toHaveLength(0);
    const before = timelineMock.calls.length;
    close();
    await done;
    expect(timelineMock.calls.length - before).toBe(1);
    expect(planWrites()).toHaveLength(0);
});

test("002b A32: Close writes nothing", async () => {
    await mountTimeline();
    const { done } = await openPlan();
    await contains(".o_dialog .o_data_row:first-child .o_list_record_selector input").click();
    const before = timelineMock.calls.length;
    await contains(".o_dialog .o_form_button_cancel").click();
    await done;
    expect(writes).toHaveLength(0);
    expect(timelineMock.calls.length - before).toBe(0);
    expect(".o_dialog").toHaveCount(0);
});

test("002b A33: row value as facet Parent: Beta", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const { done } = await openPlan(12, "Beta");
    expect(queryAllTexts(".o_dialog .o_searchview_facet")).toEqual(["Parent\nBeta"]);
    expect(listed()).toEqual(["Unscheduled"]);
    await contains(".o_dialog .o_searchview_facet .o_facet_remove").click();
    await animationFrame();
    expect(listed()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    await contains(".o_dialog .o_form_button_cancel").click();
    await done;
});

test("002b A3/H20: no Create New without cell create", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" create="0"`) });
    await openPlan();
    expect(".o_dialog .o_create_button").toHaveCount(0);
    expect(".o_dialog .o_select_button").toHaveCount(1);
});

test("002b A49c: date-only plan writes the day twice", async () => {
    await mountTimeline({
        arch: HOST_ARCHS.H10,
        resModel: "pill2",
    });
    MockServer.current.env.pill2.create({ name: "Undated", active: true });
    const { model } = controller;
    const column = model.data.columns.findIndex((c) => c.start.month === 11 && c.start.day === 16);
    const { done } = await openPlan(16, null, columnPeriod(model.data, column));
    await contains(".o_dialog .o_data_row:contains(Undated) .o_list_record_selector input").click();
    await clickSelect();
    await done;
    const [write] = writes;
    expect(write.values).toEqual({ date_start: "2026-11-16", date_stop: "2026-11-16" });
});

test("002b R9: a disposed model is not reloaded when the dialog closes", async () => {
    await mountTimeline();
    const { model } = controller;
    const { done } = await openPlan();
    model.dispose();
    expect(model.disposed).toBe(true);
    const before = timelineMock.calls.length;
    await contains(".o_dialog .o_form_button_cancel").click();
    await done;
    expect(timelineMock.calls.length - before).toBe(0);
});

test("002b R9: a disposed model skips the reload of the create dialog", async () => {
    await mountTimeline();
    const done = controller.editor.createFor({ period: dayPeriod(14) });
    await animationFrame();
    controller.model.dispose();
    const before = timelineMock.calls.length;
    await contains(".o_dialog .o_form_button_cancel").click();
    await done;
    expect(timelineMock.calls.length - before).toBe(0);
});

test("002b R9: a new model is not disposed", async () => {
    const { model } = await makeTimelineModel();
    expect(Boolean(model.disposed)).toBe(false);
});
