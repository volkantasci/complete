// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, dblclick, edit, press, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";

import {
    getService,
    LEAVE_ARCH,
    mountTimeOff,
    onRpc,
    patchWithCleanup,
    REPORT_ARCH,
    setupTimeOffFixtures,
} from "./time_off_test_helpers";

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
    await resize({ width: 1600, height: 900 });
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

describe("the inputs that stay off (R20)", () => {
    test("the pointer's hover and press stay off: no handle, no move", async () => {
        await openPopover();
        expect(".o_tl_handle").toHaveCount(0);
        expect(LEAVE_ARCH()).toInclude("hr_holidays_gantt_manager_hr_leave");
    });
});
