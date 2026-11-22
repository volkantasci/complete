// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineHrModels } from "@hr/../tests/hr_test_helpers";
import { start } from "@mail/../tests/mail_test_helpers";
import { animationFrame } from "@odoo/hoot-mock";
import {
    defineModels,
    fields,
    getMockEnv,
    getService,
    makeMockServer,
    makeTestApp,
    models,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { parseXML } from "@web/core/utils/xml";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { setupTimelineFixtures, timelineMock } from "@web_gantt/../tests/timeline_test_helpers";
import { TimeOffLeaveModel } from "../src/time_off_view";

// Re-exported so that the tests of the slice take their framework helpers from one place.
export { getService, onRpc, patchWithCleanup };

const { DateTime } = luxon;

/** An arch of the given root tag that just lists `columns` as fields (one per entry). */
function plainArch(root, columns) {
    return `<${root}>${columns.map((column) => `<field name="${column}"/>`).join("")}</${root}>`;
}

const SEARCH = `<search>
    <field name="employee_id"/>
    <filter name="validated" string="Approved" domain="[('state', '=', 'validate')]"/>
        <filter name="group_employee" string="Employee" context="{'group_by': 'employee_id'}"/>
        <filter name="group_type" string="Type" context="{'group_by': 'state'}"/>
        <filter name="group_state" string="Status" context="{'group_by': 'state'}"/>
        <filter name="group_date_from" string="Date" context="{'group_by': 'start'}"/>
</search>`;

/** The scratch model of the leave view: an employee, a state and two dates. */
export class Leave extends models.Model {
    _name = "hhg.leave";

    name = fields.Char();
    active = fields.Boolean({ default: true });
    employee_id = fields.Many2one({ relation: "hr.employee", string: "Employee" });
    state = fields.Selection({
        string: "Status",
        selection: [
            ["confirm", "To Approve"],
            ["validate", "Approved"],
        ],
    });
    start = fields.Datetime({ string: "Start" });
    stop = fields.Datetime({ string: "Stop" });

    _views = {
        "search,false": SEARCH,
        "list,false": plainArch("list", ["name", "start"]),
        "form,false": plainArch("form", ["name", "employee_id"]),
    };
}

/** The scratch model of the report view. */
export class Report extends models.Model {
    _name = "hhg.report";

    name = fields.Char();
    employee_id = fields.Many2one({ relation: "hr.employee", string: "Employee" });
    start = fields.Datetime({ string: "Start" });
    stop = fields.Datetime({ string: "Stop" });

    _views = {
        "search,false": SEARCH,
        "list,false": plainArch("list", ["name", "start"]),
        "form,false": plainArch("form", ["name", "employee_id"]),
    };
}

/** Defines the mock models and the `get_gantt_data` handler. Call once at the top of a file. */
export function setupTimeOffFixtures() {
    setupTimelineFixtures();
    defineHrModels();
    defineModels([Leave, Report]);
}

/** Server text (UTC) of a Brussels local time in November (UTC+1). */
export function utc(day, clock) {
    const [hour, minute] = clock.split(":").map(Number);
    return DateTime.utc(2026, 11, day, hour, minute)
        .minus({ hours: 1 })
        .reconfigure({ locale: "en", numberingSystem: "latn" })
        .toFormat("yyyy-MM-dd HH:mm:ss");
}

/**
 * Creates employees (and their public records, with the same ids) and records
 * `[employeeName, [day, "H:MM"], [day, "H:MM"]]` on `resModel`.
 * @returns {Promise<Object>} employee ids by name
 */
export async function makeTimeOffData(employeeNames, records = [], resModel = "hhg.leave") {
    const { env } = await makeMockServer();
    const ids = env["hr.employee"].create(employeeNames.map((name) => ({ name })));
    const publicIds = env["hr.employee.public"].create(
        employeeNames.map((name, index) => ({ name, employee_id: ids[index] }))
    );
    if (JSON.stringify(ids) !== JSON.stringify(publicIds)) {
        throw new Error("the public employee records must share the ids of the employees");
    }
    const byName = Object.fromEntries(employeeNames.map((name, index) => [name, ids[index]]));
    env[resModel].create(
        records.map(([employee, from, to]) => ({
            name: "L",
            employee_id: byName[employee],
            start: utc(...from),
            stop: utc(...to),
            ...(resModel === "hhg.report" ? {} : { state: "validate" }),
        }))
    );
    return byName;
}

export const LEAVE_ARCH = (attrs = "") =>
    `<gantt js_class="hr_holidays_gantt_manager_hr_leave" string="Days" date_start="start"
        date_stop="stop" default_group_by="employee_id" groups_limit="20" default_range="month"
        scales="week,month,quarter" precision="{'week': 'day:full', 'month': 'day:full'}"
        plan="0" ${attrs}/>`;

export const REPORT_ARCH = (attrs = "") =>
    `<gantt js_class="hr_holidays_report_gantt" string="Time Off" date_start="start"
        date_stop="stop" default_group_by="employee_id" groups_limit="20" default_range="month"
        precision="{'month': 'day:full'}" create="0" edit="0" delete="0" ${attrs}/>`;

/** A leave-variant model (or the report's) on the scratch model, without a UI. */
export async function makeTimeOffModel({
    report = false,
    arch = report ? REPORT_ARCH() : LEAVE_ARCH(),
    groupBy = ["employee_id"],
    context = {},
} = {}) {
    if (!getMockEnv()) {
        await makeTestApp();
    }
    const resModel = report ? "hhg.report" : "hhg.leave";
    const orm = getService("orm");
    const modelFields = await orm.call(resModel, "fields_get", []);
    const config = parseTimelineArch(parseXML(arch), modelFields);
    const model = new TimeOffLeaveModel(
        getMockEnv(),
        { resModel, fields: modelFields, config, viewId: 1 },
        { orm }
    );
    await model.load({ groupBy, context });
    return model;
}

/** Mounts the leave view (or the report's) on the scratch model. Returns the ids and the view. */
export async function mountTimeOff({
    employees,
    records = [],
    report = false,
    progress = null,
    expand = false,
    arch = report ? REPORT_ARCH() : LEAVE_ARCH(),
    groupBy = ["employee_id"],
    resModel = report ? "hhg.report" : "hhg.leave",
    ...rest
}) {
    const ids = await makeTimeOffData(employees, records, resModel);
    if (progress) {
        // the progress hook's answer by employee name
        timelineMock.progress = {
            employee_id: Object.fromEntries(
                Object.entries(progress).map(([name, answer]) => [ids[name], answer])
            ),
        };
    }
    if (expand) {
        // every employee gets a row, as the server's data call gives them (R13)
        timelineMock.expandGroups = Object.values(ids);
    }
    await start();
    const view = await mountView({
        type: "gantt",
        resModel,
        arch,
        groupBy,
        searchViewArch: SEARCH,
        ...rest,
    });
    await animationFrame();
    return { ids, view };
}
