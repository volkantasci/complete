// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    dblclick,
    drag,
    edit,
    hover,
    press,
    queryAll,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";

import { start } from "@mail/../tests/mail_test_helpers";
import { MockServer, mountView } from "@web/../tests/web_test_helpers";

import {
    getService,
    makeTimeOffData,
    mountTimeOff,
    onRpc,
    patchWithCleanup,
    REPORT_ARCH,
    setupTimeOffFixtures,
} from "./time_off_test_helpers";
import { hoursText } from "../src/time_off_hours_field";

describe.current.tags("desktop");

setupTimeOffFixtures();

const LEAVE = ["Anita Oliver", [12, "9:00"], [14, "18:00"]];
const TO_APPROVE = ["Anita Oliver", [12, "9:00"], [14, "18:00"], { state: "confirm" }];

/** The ORM calls that write or reload the view, in order. */
let writes;
let reloads;
let actions;

beforeEach(async () => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    writes = [];
    reloads = 0;
    actions = [];
    for (const method of ["web_save", "write", "create", "copy", "unlink"]) {
        onRpc(method, ({ method: name }) => {
            writes.push(name);
        });
    }
    onRpc("get_gantt_data", () => {
        reloads += 1;
    });
    await resize({ width: 1600, height: 1400 });
});

const pillEl = () => queryOne(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
const popoverEl = () => queryOne(".o_hhg_pop");

async function settle(delay = 300) {
    await advanceTime(delay);
    await animationFrame();
    await animationFrame();
}

/** Mounts a view and opens the popover of its first pill. */
async function openPopover(options = {}) {
    const mounted = await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE], ...options });
    patchWithCleanup(getService("action"), {
        doAction(action, params) {
            actions.push([action, params]);
        },
    });
    reloads = 0;
    await click(pillEl());
    await settle();
    return mounted;
}

describe("opening", () => {
    test("A10 the popover opens after 200 ms under the pill: header, body, footer", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        await click(pillEl());
        await advanceTime(150);
        await animationFrame();
        expect(".o_hhg_pop").toHaveCount(0);
        await settle(100);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_header").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_content .o_form_view").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_footer").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_title").toHaveText("Anita Oliver - 3 days");
        expect(".o_hhg_pop .o_hhg_pop_expand").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_close").toHaveCount(1);
        // the framework's own popover and the form's control panel are not there
        expect(".o_tl_popover").toHaveCount(0);
        expect(".o_hhg_pop .o_control_panel").toHaveCount(0);
        expect(".o_hhg_pop .o_form_status_indicator").toHaveCount(0);
        // beside the pill's top or bottom edge, centred on it, in a gap that holds the arrow
        const pill = queryRect(pillEl());
        const frame = queryRect(".o_popover");
        const gap = frame.top >= pill.bottom ? frame.top - pill.bottom : pill.top - frame.bottom;
        expect(gap).toBeGreaterThan(4);
        expect(gap).toBeLessThan(12);
        expect(Math.abs(frame.left + frame.width / 2 - (pill.left + pill.width / 2))).toBeLessThan(
            6
        );
        expect(writes).toEqual([]);
    });

    test("R2.1 the popover never covers its pill, whatever side it takes", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        await click(pillEl());
        await settle();
        const pill = queryRect(pillEl());
        const frame = queryRect(".o_popover");
        const apart =
            frame.top >= pill.bottom - 1 ||
            frame.bottom <= pill.top + 1 ||
            frame.left >= pill.right - 1 ||
            frame.right <= pill.left + 1;
        expect(apart).toBe(true);
    });

    test("A11 titles: one day, two days, four hours, and Employee without one", async () => {
        const record = (day, extra) => ["Anita Oliver", [day, "9:00"], [day, "18:00"], extra];
        const titles = [];
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records: [
                record(12, { duration_display: "1 day" }),
                record(16, { duration_display: "2 days" }),
                record(18, { duration_display: "4:00 hours" }),
                record(20, { duration_display: "1 day", employee_id: false }),
            ],
        });
        const pills = queryAll(".o_tl_pill");
        expect(pills).toHaveLength(4);
        for (const pill of pills) {
            await click(pill);
            await settle();
            titles.push(queryOne(".o_hhg_pop_title").textContent);
        }
        expect(titles.sort()).toEqual([
            "Anita Oliver - 1 day",
            "Anita Oliver - 2 days",
            "Anita Oliver - 4:00 hours",
            "Employee - 1 day",
        ]);
    });

    test("A22 the focus lies on the type: its link when read-only", async () => {
        await openPopover();
        expect(".o_hhg_pop_type a").toHaveCount(1);
        expect(document.activeElement).toBe(queryOne(".o_hhg_pop_type a"));
    });

    test("R5 a request To Approve opens editable, its type input has the focus (A22)", async () => {
        await openPopover({ records: [TO_APPROVE] });
        expect(".o_hhg_pop .o_form_editable").toHaveCount(1);
        expect(".o_hhg_pop_type input").toHaveCount(1);
        expect(document.activeElement).toBe(queryOne(".o_hhg_pop_type input"));
    });

    test("R5 an Approved request opens read-only", async () => {
        await openPopover();
        expect(".o_hhg_pop .o_form_readonly").toHaveCount(1);
        expect(".o_hhg_pop .o_form_editable").toHaveCount(0);
    });

    test("R5 the report's popover is read-only, whatever the state", async () => {
        await openPopover({ report: true, arch: REPORT_ARCH(), records: [LEAVE] });
        expect(".o_hhg_pop.o_hhg_pop_report").toHaveCount(1);
        expect(".o_hhg_pop .o_form_readonly").toHaveCount(1);
        expect(".o_hhg_pop input").toHaveCount(0);
        expect(".o_hhg_pop .o_hhg_pop_title").toHaveText("Anita Oliver - 3 days");
    });

    test("A69 a click 4 px inside the end of a pill opens the popover", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        const rect = queryRect(pillEl());
        const y = rect.top + rect.height / 2;
        await click(pillEl(), { position: { x: rect.right - 4, y } });
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        expect(".modal").toHaveCount(0);
    });

    test("one at a time: another pill's click opens that pill's popover in its place", async () => {
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records: [LEAVE, ["Anita Oliver", [18, "9:00"], [19, "18:00"], { duration_display: "2 days" }]],
        });
        const [first, second] = queryAll(".o_tl_pill");
        await click(first);
        await settle();
        const title = queryOne(".o_hhg_pop_title").textContent;
        await click(second);
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        expect(queryOne(".o_hhg_pop_title").textContent).not.toBe(title);
    });
});

describe("clicks (R2 point 2, R11)", () => {
    test("A12 two clicks within 200 ms open one dialog and no popover", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        await click(pillEl());
        await advanceTime(60);
        await click(pillEl());
        await settle(400);
        expect(".modal").toHaveCount(1);
        expect(".o_hhg_pop").toHaveCount(0);
    });

    test("A12 the browser's double click opens one dialog and no popover", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        await dblclick(pillEl());
        await settle(400);
        expect(".modal").toHaveCount(1);
        expect(".o_hhg_pop").toHaveCount(0);
    });

    test("A12 a second click after 400 ms leaves the open popover as it is", async () => {
        await openPopover();
        const same = popoverEl();
        await click(pillEl());
        await advanceTime(60);
        await animationFrame();
        // inside 200 ms of the second click's own window: wait it out, then click again
        await settle(400);
        await click(pillEl());
        await settle(400);
        expect(".modal").toHaveCount(0);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(popoverEl()).toBe(same);
    });

    test("R2.2 a click on the pill of the open popover leaves it open", async () => {
        await openPopover();
        const same = popoverEl();
        await click(pillEl());
        await settle(400);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(popoverEl()).toBe(same);
        expect(".modal").toHaveCount(0);
    });

    test("A12 on the phone, two taps within 200 ms open the dialog", async () => {
        mockTouch(true);
        await resize({ width: 390, height: 844 });
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        pillEl().scrollIntoView();
        await animationFrame();
        await click(pillEl());
        await advanceTime(60);
        await click(pillEl());
        await settle(400);
        expect(".modal").toHaveCount(1);
        expect(".o_hhg_pop").toHaveCount(0);
    });

    test("R21 a tap on the phone opens 002a's sheet with this part's frame", async () => {
        mockTouch(true);
        await resize({ width: 390, height: 844 });
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        pillEl().scrollIntoView();
        await animationFrame();
        await click(pillEl());
        await settle();
        expect(".o_hhg_pop.o_tl_popover.o_tl_popover_sheet").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_header").toHaveCount(1);
        expect(".o_hhg_pop .o_hhg_pop_footer").toHaveCount(1);
    });
});

describe("closing (R2 point 3, R9, R23)", () => {
    test("A50 the close icon closes it and the view does not reload", async () => {
        await openPopover();
        await click(".o_hhg_pop_close");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(reloads).toBe(0);
        expect(writes).toEqual([]);
    });

    test("A50 a click outside closes it", async () => {
        await openPopover();
        await click(".o_tl_row_header");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(reloads).toBe(0);
    });

    test("A50 Escape closes it in one press", async () => {
        await openPopover();
        await press("Escape");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(reloads).toBe(0);
    });

    test("A51 Escape from inside a field drops the pending change, no write, no reload", async () => {
        await openPopover({ records: [TO_APPROVE] });
        await click(".o_hhg_pop [name='name'] input");
        await edit("typed");
        await press("Escape");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(writes).toEqual([]);
        expect(reloads).toBe(0);
        // the next opening shows the stored value again
        await click(pillEl());
        await settle();
        expect(".o_hhg_pop [name='name'] input").toHaveValue("L");
    });

    test("A48 the expand icon opens the request's form in the management action", async () => {
        await openPopover();
        await click(".o_hhg_pop_expand");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(actions).toHaveLength(1);
        const [action, params] = actions[0];
        expect(action).toBe("hr_holidays.hr_leave_action_action_approve_department");
        expect(params.viewType).toBe("form");
        expect(params.props.resId).toBeGreaterThan(0);
    });

    test("A48 the report's expand opens the request's form by the line's id", async () => {
        await openPopover({ report: true, arch: REPORT_ARCH() });
        await click(".o_hhg_pop_expand");
        await settle();
        expect(actions).toHaveLength(1);
        expect(actions[0][0]).toBe("hr_holidays.hr_leave_action_action_approve_department");
        expect(actions[0][1].props.resId).toBeGreaterThan(0);
    });
});

describe("a locked pill (R20, D7)", () => {
    test("hover and press on an Approved pill: no handle, only the locked lift, no write", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        const before = queryRect(pillEl());
        await hover(pillEl());
        await settle();
        expect(".o_tl_handle").toHaveCount(0);
        const start = { x: before.left + before.width / 2, y: before.top + before.height / 2 };
        const helpers = await drag(pillEl(), { position: start });
        await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
            position: { x: start.x + 120, y: start.y },
        });
        await animationFrame();
        expect(".o_tl_pill_moved .o_tl_pill_lock").toHaveCount(1);
        await helpers.drop();
        await settle();
        expect(".o_tl_pill_moved").toHaveCount(0);
        expect(".o_tl_handle").toHaveCount(0);
        expect(writes).toEqual([]);
        expect(queryRect(pillEl()).left).toBe(before.left);
    });
});

describe("the hour line (R4 point 2)", () => {
    test("A19 hours read 4h and 4h30", () => {
        expect(hoursText(4)).toBe("4h");
        expect(hoursText(4.5)).toBe("4h30");
        expect(hoursText(0.25)).toBe("0h15");
        expect(hoursText(0)).toBe("0h");
        expect(hoursText(12.5).length).toBeLessThan(10);
    });
});

describe("Escape with a dropdown open (R23, D4)", () => {
    test("A51 one Escape closes the popover while the type's dropdown is open", async () => {
        await openPopover({ records: [TO_APPROVE] });
        await click(".o_hhg_pop_type input");
        await edit("A");
        await settle();
        expect(".o-autocomplete--dropdown-menu").toHaveCount(1);
        await press("Escape");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(writes).toEqual([]);
        expect(reloads).toBe(0);
    });
});

// The footer's buttons (R6 to R10) ---------------------------------------------------------------

const names = () => queryAll(".o_hhg_pop_footer button").map((button) => button.getAttribute("name"));
const leaves = () => MockServer.current.env["hhg.leave"];

/** A request with the Community's flags for the reading user. */
const REQUEST = (values) => ["Anita Oliver", [12, "9:00"], [14, "18:00"], values];

/** Types a note and leaves the field: the record holds a pending change. */
async function typeNote() {
    await click(".o_hhg_pop [name='name'] input");
    await edit("Dentist");
    // Tab leaves the field: the change is committed to the record
    await press("Tab");
    await settle();
}

const ALL = { can_approve: true, can_validate: true, can_refuse: true, can_back_to_approve: true };

// state, flags, pending change, the buttons left to right (R6)
const MATRIX = [
    ["To Approve, no right: Delete alone", { state: "confirm" }, false, ["delete"]],
    [
        "To Approve, may send back only: no Edit (the request is To Approve)",
        { state: "confirm", can_back_to_approve: true },
        false,
        ["delete"],
    ],
    ["To Approve, may approve", { state: "confirm", can_approve: true }, false, ["approve", "delete"]],
    ["To Approve, may validate", { state: "confirm", can_validate: true }, false, ["approve", "delete"]],
    ["To Approve, may refuse", { state: "confirm", can_refuse: true }, false, ["refuse", "delete"]],
    ["To Approve, every right", { state: "confirm", ...ALL }, false, ["approve", "refuse", "delete"]],
    ["Second Approval, every right: Edit and Delete, no Approve (D2)", { state: "validate1", ...ALL }, false, ["edit", "delete"]],
    ["Second Approval, no right: Delete alone", { state: "validate1" }, false, ["delete"]],
    ["Approved, may send back", { state: "validate", ...ALL }, false, ["edit", "delete"]],
    ["Refused, may send back", { state: "refuse", ...ALL }, false, ["edit", "delete"]],
    ["Refused, no right", { state: "refuse" }, false, ["delete"]],
    ["Cancelled, no right: Delete alone", { state: "cancel" }, false, ["delete"]],
    ["pending change, no right: Save and Discard", { state: "confirm" }, true, ["save", "discard"]],
    [
        "pending change, may approve: Approve and Discard, no Save",
        { state: "confirm", can_approve: true },
        true,
        ["approve", "discard"],
    ],
    [
        "pending change, may refuse: Refuse and Discard, no Save",
        { state: "confirm", can_refuse: true },
        true,
        ["refuse", "discard"],
    ],
    [
        "pending change, every right: Approve, Refuse and Discard",
        { state: "confirm", ...ALL },
        true,
        ["approve", "refuse", "discard"],
    ],
];

describe("the footer's buttons (R6)", () => {
    for (const [title, values, dirty, expected] of MATRIX) {
        test(`R6 ${title}`, async () => {
            await openPopover({ records: [REQUEST(values)] });
            if (dirty) {
                await typeNote();
            }
            expect(names()).toEqual(expected);
            // absent, never disabled
            expect(".o_hhg_pop_footer button[disabled]").toHaveCount(0);
            // the last button lies at the right end
            const last = queryRect(".o_hhg_pop_footer button:last-child");
            const footer = queryRect(".o_hhg_pop_footer");
            expect(Math.abs(footer.right - 16 - last.right)).toBeLessThan(1);
        });
    }

    test("R6 the buttons are 4 px apart and carry the labels and the theme's colours", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        const [approve, refuse] = queryAll(".o_hhg_pop_footer button");
        expect(approve).toHaveText("Approve");
        expect(refuse).toHaveText("Refuse");
        expect(".o_hhg_pop_approve").toHaveClass("btn-success");
        expect(".o_hhg_pop_refuse").toHaveClass("btn-danger");
        expect(".o_hhg_pop_delete").toHaveClass("btn-danger");
        expect(queryRect(refuse).left - queryRect(approve).right).toBeCloseTo(4, { margin: 0.6 });
        expect(".o_hhg_pop_approve .oi").toHaveAttribute("data-icon", "thumb_up");
        expect(".o_hhg_pop_refuse .oi").toHaveAttribute("data-icon", "close");
        expect(".o_hhg_pop_delete .oi").toHaveAttribute("data-icon", "delete");
    });

    test("R6 Edit is primary, with the pencil and its label", async () => {
        await openPopover({ records: [REQUEST({ state: "validate", ...ALL })] });
        expect(".o_hhg_pop_edit").toHaveClass("btn-primary");
        expect(".o_hhg_pop_edit").toHaveText("Edit");
        expect(".o_hhg_pop_edit .oi").toHaveAttribute("data-icon", "edit");
    });

    test("R6 Save is primary with the disk, Discard secondary", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm" })] });
        await typeNote();
        expect(".o_hhg_pop_save").toHaveClass("btn-primary");
        expect(".o_hhg_pop_save").toHaveText("Save");
        expect(".o_hhg_pop_save .oi").toHaveAttribute("data-icon", "save");
        expect(".o_hhg_pop_discard").toHaveClass("btn-secondary");
        expect(".o_hhg_pop_discard").toHaveText("Discard");
    });

    test("R9 the report's popover holds Delete alone, whatever the state", async () => {
        await openPopover({
            report: true,
            arch: REPORT_ARCH(),
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"], {}]],
        });
        expect(names()).toEqual(["delete"]);
    });
});

describe("what the buttons do (R7 to R10)", () => {
    let calls;

    beforeEach(() => {
        calls = [];
        for (const method of ["action_back_to_approval", "action_approve", "action_refuse"]) {
            onRpc(method, ({ args, model, method: name }) => {
                calls.push([name, model, args[0]]);
                const state = {
                    action_back_to_approval: "confirm",
                    action_approve: "validate",
                    action_refuse: "refuse",
                }[name];
                leaves().write(args[0], { state });
                return true;
            });
        }
    });

    test("A34 Edit: the request is To Approve and editable, the popover stays open", async () => {
        await openPopover({ records: [REQUEST({ state: "validate", ...ALL })] });
        expect(".o_hhg_pop .o_form_readonly").toHaveCount(1);
        const same = popoverEl();
        await click(".o_hhg_pop_edit");
        await settle();
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe("action_back_to_approval");
        expect(calls[0][2]).toHaveLength(1);
        expect(reloads).toBe(1);
        expect(popoverEl()).toBe(same);
        expect(".o_hhg_pop .o_form_editable").toHaveCount(1);
        expect(names()).toEqual(["approve", "refuse", "delete"]);
        // the focus is not moved into the form
        expect(document.activeElement).not.toBe(queryOne(".o_hhg_pop_type input"));
    });

    test("A35 Approve: read-only again, Edit and Delete, the view reloads", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        const same = popoverEl();
        await click(".o_hhg_pop_approve");
        await settle();
        expect(calls.map(([name]) => name)).toEqual(["action_approve"]);
        expect(reloads).toBe(1);
        expect(popoverEl()).toBe(same);
        expect(".o_hhg_pop .o_form_readonly").toHaveCount(1);
        expect(names()).toEqual(["edit", "delete"]);
    });

    test("A38 Approve saves a pending change first", async () => {
        const order = [];
        onRpc("web_save", () => {
            order.push("web_save");
        });
        onRpc("action_approve", () => {
            order.push("action_approve");
        });
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        await typeNote();
        await click(".o_hhg_pop_approve");
        await settle();
        expect(order).toEqual(["web_save", "action_approve"]);
        expect(leaves()[0].name).toBe("Dentist");
        expect(leaves()[0].state).toBe("validate");
        expect(names()).toEqual(["edit", "delete"]);
    });

    test("A38 a refused save stops Approve: nothing else happens", async () => {
        expect.errors(1);
        onRpc("web_save", () => {
            throw new Error("Not allowed");
        });
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        await typeNote();
        await click(".o_hhg_pop_approve");
        await settle();
        expect(calls).toEqual([]);
        expect(reloads).toBe(0);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(names()).toEqual(["approve", "refuse", "discard"]);
        expect.verifyErrors(["RPC_ERROR: Not allowed"]);
    });

    test("A37 Refuse in the Overview: the pill is gone, the popover stays open on its place", async () => {
        onRpc("action_refuse", ({ args }) => {
            // the Overview shows no refused request: the pill leaves the data
            leaves().write(args[0], { active: false });
        });
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        const same = popoverEl();
        const before = queryRect(same);
        const pill = queryRect(pillEl());
        await click(".o_hhg_pop_refuse");
        await settle();
        expect(calls.map(([name]) => name)).toEqual(["action_refuse"]);
        expect(reloads).toBe(1);
        expect(".o_tl_pill").toHaveCount(0);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(popoverEl()).toBe(same);
        expect(popoverEl().isConnected).toBe(true);
        // on its place: still over the pill's former span and at the same height (the body is
        // shorter read-only and the grid under it is laid out again, so a few pixels may move)
        const after = queryRect(same);
        expect(after.left).toBeLessThan(pill.right);
        expect(after.right).toBeGreaterThan(pill.left);
        expect(Math.abs(after.top - before.top)).toBeLessThan(6);
        expect(".o_hhg_pop .o_form_readonly").toHaveCount(1);
        expect(names()).toEqual(["edit", "delete"]);
        // it closes with the close icon, and the next opening holds no hidden anchor
        await click(".o_hhg_pop_close");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(".o_hhg_pop_anchor").toHaveCount(0);
    });

    test("R8 point 4 a click elsewhere still closes a popover that outlived its pill", async () => {
        onRpc("action_refuse", ({ args }) => {
            leaves().write(args[0], { active: false });
        });
        await openPopover({ records: [REQUEST({ state: "confirm", ...ALL })] });
        await click(".o_hhg_pop_refuse");
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        await click(".o_tl_row_header");
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
    });

    test("R8 point 1 Save writes the change, then the request and the view load again", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm" })] });
        await typeNote();
        await click(".o_hhg_pop_save");
        await settle();
        expect(writes).toEqual(["web_save"]);
        expect(reloads).toBe(1);
        expect(".o_hhg_pop").toHaveCount(1);
        expect(".o_hhg_pop .o_form_editable").toHaveCount(1);
        expect(names()).toEqual(["delete"]);
        expect(".o_hhg_pop [name='name'] input").toHaveValue("Dentist");
    });

    test("R8 point 2 Discard brings back the stored values, writes nothing, reloads the view", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm" })] });
        await typeNote();
        await click(".o_hhg_pop_discard");
        await settle();
        expect(writes).toEqual([]);
        expect(reloads).toBe(1);
        expect(".o_hhg_pop [name='name'] input").toHaveValue("L");
        expect(names()).toEqual(["delete"]);
        expect(".o_hhg_pop").toHaveCount(1);
    });

    test("A52 Delete accepted: the popover closes and the view reloads", async () => {
        await openPopover({ records: [REQUEST({ state: "confirm" })] });
        await click(".o_hhg_pop_delete");
        await settle();
        expect(writes).toEqual(["unlink"]);
        expect(reloads).toBe(1);
        expect(".o_hhg_pop").toHaveCount(0);
        expect(".o_tl_pill").toHaveCount(0);
    });

    test("A53 Delete refused: the error shows, the popover stays open, nothing changes", async () => {
        expect.errors(2);
        onRpc("unlink", () => {
            throw new Error("Only administrators delete approved requests");
        });
        await openPopover({ records: [REQUEST({ state: "validate" })] });
        await click(".o_hhg_pop_delete");
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        expect(reloads).toBe(0);
        expect(".o_tl_pill").toHaveCount(1);
        expect(names()).toEqual(["delete"]);
        // the next press goes through the same path
        await click(".o_hhg_pop_delete");
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        expect.verifyErrors([
            "RPC_ERROR: Only administrators delete approved requests",
            "RPC_ERROR: Only administrators delete approved requests",
        ]);
    });

    test("A33 the report's Delete calls the request's deletion with the line's id", async () => {
        const unlinked = [];
        onRpc("unlink", ({ args, model }) => {
            unlinked.push([model, args[0]]);
            return true;
        });
        await openPopover({
            report: true,
            arch: REPORT_ARCH(),
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"], {}]],
        });
        await click(".o_hhg_pop_delete");
        await settle();
        expect(unlinked).toHaveLength(1);
        expect(unlinked[0][0]).toBe("hr.leave");
        expect(unlinked[0][1]).toEqual([1]);
        expect(".o_hhg_pop").toHaveCount(0);
        expect(reloads).toBe(1);
    });
});

describe("the hour widget (R4 point 2)", () => {
    test("A19 reads 4h30, 4:30 and 4.5 and shows hours in edit mode", async () => {
        await makeTimeOffData(["Anita Oliver"], [REQUEST({ hours: 4 })]);
        await start();
        await mountView({
            type: "form",
            resModel: "hhg.leave",
            resId: 1,
            arch: `<form><field name="hours" widget="hhg_hours"/></form>`,
        });
        expect("[name='hours'] input").toHaveValue("4h");
        for (const [typed, shown] of [
            ["4h30", "4h30"],
            ["4:30", "4h30"],
            ["4.5", "4h30"],
            ["2h", "2h"],
            ["0:15", "0h15"],
        ]) {
            await click("[name='hours'] input");
            await edit(typed);
            await press("Tab");
            await animationFrame();
            expect("[name='hours'] input").toHaveValue(shown, { message: `${typed} reads ${shown}` });
        }
    });
});
