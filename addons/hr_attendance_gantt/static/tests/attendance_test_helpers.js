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
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { parseXML } from "@web/core/utils/xml";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { setupTimelineFixtures, timelineMock } from "@web_gantt/../tests/timeline_test_helpers";
import { AttendanceTimelineModel } from "../src/attendance_timeline_model";

const { DateTime } = luxon;

/** An arch of the given root tag that just lists `columns` as fields (one per entry). */
function plainArch(root, columns) {
    return `<${root}>${columns.map((column) => `<field name="${column}"/>`).join("")}</${root}>`;
}

/**
 * Fixtures of the attendance variant tests: a scratch model with the fields of the attendance
 * view (an employee, a check-in and a check-out), a Gantt arch like the module's and the helpers
 * to make employees and attendances. The Attendances application has no mock model, and the
 * variant only reads the fields named in the arch.
 */
export class Attendance extends models.Model {
    _name = "hag.attendance";

    name = fields.Char();
    employee_id = fields.Many2one({ relation: "hr.employee", string: "Employee", required: true });
    department_id = fields.Many2one({ relation: "hr.department", string: "Department" });
    check_in = fields.Datetime({ string: "Check In" });
    check_out = fields.Datetime({ string: "Check Out" });

    _views = {
        "search,false": `<search>
            <field name="employee_id"/>
            <filter name="with_a" string="Named A" domain="[('name', '=', 'A')]"/>
            <group>
                <filter name="by_employee" string="Employee" context="{'group_by': 'employee_id'}"/>
            </group>
        </search>`,
        "list,false": plainArch("list", ["name", "check_in"]),
        "form,false": plainArch("form", ["name", "employee_id"]),
    };
}

/** Defines the mock models and the `get_gantt_data` handler. Call once at the top of a file. */
export function setupAttendanceFixtures() {
    setupTimelineFixtures();
    defineHrModels();
    defineModels([Attendance]);
}

/** Server text (UTC) of a Brussels local time in November (UTC+1). */
export function utc(day, clock, month = 11) {
    const [hour, minute, second = 0] = clock.split(":").map(Number);
    return DateTime.utc(2026, month, day, hour, minute, second)
        .minus({ hours: 1 })
        .reconfigure({ locale: "en", numberingSystem: "latn" })
        .toFormat("yyyy-MM-dd HH:mm:ss");
}

/**
 * Creates employees (and their public records, with the same ids) and attendances
 * `[employeeName, [day, "H:MM"], [day, "H:MM"] | null]`; a null check-out is an open attendance.
 * @returns {Promise<Object>} employee ids by name
 */
export async function makeAttendanceData(employeeNames, attendances = []) {
    const { env } = await makeMockServer();
    const ids = env["hr.employee"].create(employeeNames.map((name) => ({ name })));
    const publicIds = env["hr.employee.public"].create(
        employeeNames.map((name, index) => ({ name, employee_id: ids[index] }))
    );
    if (JSON.stringify(ids) !== JSON.stringify(publicIds)) {
        throw new Error("the public employee records must share the ids of the employees");
    }
    const byName = Object.fromEntries(employeeNames.map((name, index) => [name, ids[index]]));
    env["hag.attendance"].create(
        attendances.map(([employee, checkIn, checkOut]) => ({
            name: "A",
            employee_id: byName[employee],
            check_in: utc(...checkIn),
            check_out: checkOut ? utc(...checkOut) : false,
        }))
    );
    return byName;
}

// the precisions of the attendance view
const PRECISION = `precision="{'day': 'hour:quarter', 'week': 'day:quarter', 'month': 'day:half', '2weeks': 'day:half'}"`;

/** The arch of the module's view (on the scratch model), with another default range or `attrs` added. */
export const ARCH = (range = "day", attrs = "") =>
    `<gantt js_class="attendance_gantt" string="Days" date_start="check_in" date_stop="check_out"
        default_group_by="employee_id" groups_limit="20" default_range="${range}" default_scale="day"
        ${PRECISION} display_unavailability="1" progress_bar="employee_id" ${attrs}/>`;

/** An attendance-variant model on `hag.attendance` without a UI. */
export async function makeAttendanceModel({ arch = ARCH(), groupBy = ["employee_id"], context = {} } = {}) {
    if (!getMockEnv()) {
        await makeTestApp();
    }
    const orm = getService("orm");
    const modelFields = await orm.call("hag.attendance", "fields_get", []);
    const config = parseTimelineArch(parseXML(arch), modelFields);
    const model = new AttendanceTimelineModel(
        getMockEnv(),
        { resModel: "hag.attendance", fields: modelFields, config, viewId: 1 },
        { orm }
    );
    await model.load({ groupBy, context });
    return model;
}

/**
 * Lets the answer of the data call carry the list of employees without a contract (R19), as the
 * server of the module does; `ids` is read when the answer is committed.
 */
export function answerWithoutContract(ids) {
    patchWithCleanup(AttendanceTimelineModel.prototype, {
        _commit(request, result) {
            result.hag_without_contract = typeof ids === "function" ? ids() : ids;
            return super._commit(request, result);
        },
    });
}

/**
 * Mounts the view on the scratch model: the employees by name, their attendances, the answers of
 * the progress hook by employee name (`progress`) and whether every employee gets a row even
 * without an attendance (`expand`). Returns the employee ids and the view.
 */
export async function mountAttendances({
    employees,
    attendances = [],
    progress = null,
    expand = false,
    withoutContract = null,
    arch = ARCH(),
    groupBy = ["employee_id"],
    ...rest
}) {
    const ids = await makeAttendanceData(employees, attendances);
    if (progress) {
        timelineMock.progress = {
            employee_id: Object.fromEntries(
                Object.entries(progress).map(([name, answer]) => [ids[name], answer])
            ),
        };
    }
    if (withoutContract) {
        answerWithoutContract(withoutContract.map((name) => ids[name]));
    }
    if (expand) {
        timelineMock.expandGroups = Object.values(ids);
    }
    await start();
    const view = await mountView({ type: "gantt", resModel: "hag.attendance", arch, groupBy, ...rest });
    await animationFrame();
    return { ids, view };
}
