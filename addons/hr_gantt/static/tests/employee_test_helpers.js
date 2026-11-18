// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineHrModels } from "@hr/../tests/hr_test_helpers";
import {
    defineModels,
    fields,
    getMockEnv,
    getService,
    makeMockServer,
    makeTestApp,
    models,
} from "@web/../tests/web_test_helpers";
import { parseXML } from "@web/core/utils/xml";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { setupTimelineFixtures } from "@web_gantt/../tests/timeline_test_helpers";
import { EmployeeTimelineModel } from "../src/employee_timeline_model";

const { DateTime } = luxon;

/**
 * Fixtures of the employee variant tests. They need Employees and the Gantt view only (no
 * attendance module): a scratch model with an employee field, a department and two dates.
 */
export class Shift extends models.Model {
    _name = "hrg.shift";

    name = fields.Char();
    active = fields.Boolean({ default: true });
    employee_id = fields.Many2one({ relation: "hr.employee", string: "Employee" });
    department_id = fields.Many2one({ relation: "hr.department", string: "Department" });
    start = fields.Datetime({ string: "Start" });
    stop = fields.Datetime({ string: "Stop" });

    _views = {
        "search,false": `<search>
            <field name="name"/>
            <filter name="with_a" string="Name has an a" domain="[('name', 'ilike', 'a')]"/>
        </search>`,
        "list,false": `<list>
            <field name="name"/>
        </list>`,
        "form,false": `<form>
            <field name="name"/>
        </form>`,
    };
}

/** Defines the mock models and the `get_gantt_data` handler. Call once at the top of a file. */
export function setupEmployeeFixtures() {
    setupTimelineFixtures();
    defineHrModels();
    defineModels([Shift]);
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
 * Creates employees (and their public records, with the same ids as the server's view) and
 * shifts `[name, employeeName, [day, "H:MM"], [day, "H:MM"]]`.
 * @returns {Promise<Object>} employee ids by name
 */
export async function makeEmployeeData(employeeNames, shifts = []) {
    const { env } = await makeMockServer();
    const ids = env["hr.employee"].create(employeeNames.map((name) => ({ name })));
    const publicIds = env["hr.employee.public"].create(
        employeeNames.map((name, index) => ({ name, employee_id: ids[index] }))
    );
    if (JSON.stringify(ids) !== JSON.stringify(publicIds)) {
        throw new Error("the public employee records must share the ids of the employees");
    }
    const byName = Object.fromEntries(employeeNames.map((name, index) => [name, ids[index]]));
    env["hrg.shift"].create(
        shifts.map(([name, employee, start, stop]) => ({
            name,
            employee_id: employee ? byName[employee] : false,
            start: utc(...start),
            stop: utc(...stop),
        }))
    );
    return byName;
}

// the precisions of the attendance view (hours by quarters, days by quarters, months by halves)
const PRECISION = `precision="{'day': 'hour:quarter', 'week': 'day:quarter', 'month': 'day:half'}"`;

export const ARCH = (attrs = "", precision = PRECISION) =>
    `<gantt date_start="start" date_stop="stop" js_class="hr_gantt" ${precision} ${attrs}/>`;

/** Precision with half-hour parts on the day scale: not half-day precision (R7, R8). */
export const HALF_HOUR_PRECISION = `precision="{'day': 'hour:half', 'week': 'day:quarter', 'month': 'day:half'}"`;

/** An employee-variant model on `hrg.shift` without a UI. */
export async function makeEmployeeModel({ arch = ARCH(), groupBy = ["employee_id"], context = {} } = {}) {
    if (!getMockEnv()) {
        await makeTestApp();
    }
    const orm = getService("orm");
    const modelFields = await orm.call("hrg.shift", "fields_get", []);
    const config = parseTimelineArch(parseXML(arch), modelFields);
    const model = new EmployeeTimelineModel(
        getMockEnv(),
        { resModel: "hrg.shift", fields: modelFields, config, viewId: 1 },
        { orm }
    );
    await model.load({ groupBy, context });
    return model;
}
