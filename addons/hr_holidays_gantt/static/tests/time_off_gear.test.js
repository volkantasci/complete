// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, resize } from "@odoo/hoot-dom";
import { animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    contains,
    defineModels,
    fields,
    models,
    onRpc,
    patchWithCleanup,
    toggleActionMenu,
} from "@web/../tests/web_test_helpers";
import { download } from "@web/core/network/download";

import {
    Leave,
    LEAVE_ARCH,
    mountTimeOff,
    REPORT_ARCH,
    setupTimeOffFixtures,
} from "./time_off_test_helpers";

/** The leave view's real model name, over the scratch model's fields. */
class HrLeave extends models.Model {
    _name = "hr.leave";

    name = fields.Char();
    active = fields.Boolean({ default: true });
    employee_id = fields.Many2one({ relation: "hr.employee", string: "Employee" });
    state = fields.Selection({ selection: [["validate", "Approved"]] });
    start = fields.Datetime({ string: "Start" });
    stop = fields.Datetime({ string: "Stop" });

    _views = { ...Leave.prototype._views };
}

describe.current.tags("desktop");

setupTimeOffFixtures();
defineModels([HrLeave]);

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
});

const ACTION = { actionType: "ir.actions.act_window" };

function allowExport(allowed = true) {
    onRpc("has_group", ({ args }) => (args[1] === "base.group_allow_export" ? allowed : true));
}

async function open({
    report = false,
    arch = report ? REPORT_ARCH() : LEAVE_ARCH(),
    resModel = "hr.leave",
    ...rest
} = {}) {
    await mountTimeOff({
        employees: ["Anita Oliver"],
        resModel,
        report,
        arch,
        config: ACTION,
        ...rest,
    });
}

function menuEntries() {
    return queryAll(".o-dropdown--menu .dropdown-item").map((el) => el.textContent.trim());
}

describe("desktop", () => {
    test("a21 the gear lists Import then Export on the leave view", async () => {
        allowExport();
        await open();
        await toggleActionMenu();
        expect(menuEntries()).toEqual(["Import", "Export"]);
        expect(".o_import_menu").toHaveCount(1);
        expect(".o_hhg_export_menu").toHaveCount(1);
    });

    test("a21 a user outside the export group sees Import only", async () => {
        allowExport(false);
        await open();
        await toggleActionMenu();
        expect(menuEntries()).toEqual(["Import"]);
    });

    test("a21 a view with create=0 has no Import", async () => {
        allowExport();
        await open({ arch: LEAVE_ARCH('create="0"') });
        await toggleActionMenu();
        expect(menuEntries()).toEqual(["Export"]);
    });

    test("a22 Export downloads the five columns of the current search, with no dialog", async () => {
        allowExport();
        const calls = [];
        patchWithCleanup(download, {
            _download: (options) => {
                calls.push(options);
            },
        });
        await open({ domain: [["state", "=", "validate"]] });
        await toggleActionMenu();
        await contains(".o_hhg_export_menu").click();
        await animationFrame();
        expect(calls.length).toBe(1);
        expect(calls[0].url).toBe("/web/export/xlsx");
        const payload = JSON.parse(calls[0].data.data);
        expect(payload.model).toBe("hr.leave");
        expect(payload.fields.map((field) => field.name)).toEqual([
            "id",
            "employee_id",
            "work_entry_type_id/id",
            "request_date_from",
            "request_date_to",
        ]);
        expect(payload.import_compat).toBe(true);
        expect(payload.domain).toEqual([["state", "=", "validate"]]);
        expect(payload.groupby).toEqual([]);
        expect(payload.ids).toBe(false);
        expect(".modal").toHaveCount(0);
    });

    test("a46 the report view gets neither entry", async () => {
        allowExport();
        await open({ report: true, resModel: "hhg.report" });
        expect(".o_cp_action_menus").toHaveCount(0);
        expect(".o_import_menu, .o_hhg_export_menu").toHaveCount(0);
    });

    test("a46 another model's Gantt view gets neither entry", async () => {
        allowExport();
        await open({ resModel: "hhg.leave" });
        expect(".o_import_menu, .o_hhg_export_menu").toHaveCount(0);
    });
});

describe("phone", () => {
    test("a84 the phone has neither entry, so no gear is drawn", async () => {
        allowExport();
        mockTouch(true);
        await resize({ width: 390, height: 844 });
        await open();
        expect(".o_cp_action_menus").toHaveCount(0);
        expect(".o_import_menu, .o_hhg_export_menu").toHaveCount(0);
    });
});
