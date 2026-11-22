// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, press, queryAll, queryOne, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { getService, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";

import { LEAVE_ARCH, mountTimeOff, REPORT_ARCH, setupTimeOffFixtures } from "./time_off_test_helpers";
import { dashboardScale } from "../src/time_off_avatar_card";

describe.current.tags("desktop");

setupTimeOffFixtures();

const LEAVE = ["Anita Oliver", [12, "9:00"], [14, "18:00"]];
const SUMMARY = [
    { name: "Sick", taken: 1, left: 0, requires_allocation: false, unit: "hours" },
    { name: "Legal", taken: 11, left: 9, requires_allocation: true, unit: "days" },
    { name: "Single", taken: 1, left: 4, requires_allocation: true, unit: "days" },
];

let calls;
let reads;
let actions;
let officer;

beforeEach(async () => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    calls = [];
    reads = 0;
    actions = [];
    officer = true;
    await resize({ width: 1600, height: 900 });
});

/** Answers the card's own data; `hours` and `summary` as the server stores them. */
function mockCard({ hours = 40, summary = SUMMARY } = {}) {
    onRpc("hr.employee.public", "read", ({ args, kwargs }) => {
        const fields = args[1] || kwargs.fields || [];
        if (fields.includes("avatar_leave_summary")) {
            reads += 1;
            return [
                {
                    id: args[0][0],
                    avatar_leave_summary: summary.length ? summary : false,
                    avatar_hours_per_week: hours,
                },
            ];
        }
    });
    onRpc("hr.employee.public", "hhg_open_leave_dashboard", ({ args, kwargs }) => {
        calls.push(["dashboard", args[0], kwargs.scale]);
        return { type: "ir.actions.act_window", res_model: "hr.leave", name: "Dashboard" };
    });
    onRpc("hr.employee", "create_version", ({ args }) => {
        calls.push(["create_version", args[0], args[1]]);
        return 77;
    });
    onRpc("res.users", "has_group", () => officer);
}

async function openCard(options = {}) {
    mockCard(options.card);
    const mounted = await mountTimeOff({
        employees: ["Anita Oliver"],
        records: [LEAVE],
        ...options.mount,
    });
    patchWithCleanup(getService("action"), {
        doAction(action) {
            actions.push(action);
        },
    });
    await click(".o_tl_row_header .o_hrg_avatar");
    await animationFrame();
    await advanceTime(300);
    return mounted;
}

describe("the leave view", () => {
    test("A16: the band sits under the body, there is no footer, and the schedule button has the focus", async () => {
        await openCard();
        expect(".o_avatar_card").toHaveCount(1);
        expect(".o_avatar_card .o_avatar_card_details").toHaveCount(0);
        const children = [...queryOne(".o_avatar_card").children];
        expect(children.map((child) => child.className.split(" ")[0])).toEqual([
            "card-body",
            "o_hhg_card_band",
        ]);
        expect(".o_hhg_card_band").toHaveClass("bg-100");
        expect(".o_hhg_card_schedule").toHaveText("40 h / Week");
        expect(".o_hhg_card_schedule").toBeFocused();
        expect(".o_hhg_card_head > *:first-child").toHaveClass("o_hhg_card_schedule");
        expect(".o_hhg_card_head > *:last-child").toHaveClass("o_hhg_card_version");
        // the band's layout, from the stylesheet
        const band = getComputedStyle(queryOne(".o_hhg_card_band"));
        expect([band.paddingLeft, band.paddingRight, band.paddingBottom, band.paddingTop]).toEqual([
            "16px",
            "16px",
            "8px",
            "0px",
        ]);
        expect(getComputedStyle(queryOne(".o_hhg_card_head")).marginTop).toBe("8px");
        expect(getComputedStyle(queryOne(".o_hhg_card_schedule")).fontWeight).toBe("500");
        expect(getComputedStyle(queryAll(".o_hhg_card_taken")[0]).fontWeight).toBe("500");
    });

    test("A16: the hours are shown as stored; no hours reads Time Off", async () => {
        await openCard({ card: { hours: 37.5 } });
        expect(".o_hhg_card_schedule").toHaveText("37.5 h / Week");
    });

    test("A16: a schedule of 0 hours reads Time Off", async () => {
        await openCard({ card: { hours: 0 } });
        expect(".o_hhg_card_schedule").toHaveText("Time Off");
    });

    test("A17: one line per entry, the left part only when an allocation is needed", async () => {
        await openCard();
        const lines = queryAll(".o_hhg_card_line");
        expect(lines).toHaveCount(3);
        expect(lines[0].textContent.replace(/\s+/g, " ").trim()).toBe("Sick: 1 hour");
        expect(lines[0].querySelectorAll(".o_hhg_card_left")).toHaveLength(0);
        expect(lines[1].textContent.replace(/\s+/g, " ").trim()).toBe("Legal: 11 days /9 days");
        expect(lines[1].querySelector(".o_hhg_card_taken")).toHaveText("11 days");
        expect(lines[1].querySelector(".o_hhg_card_left")).toHaveClass("text-muted");
        expect(lines[2].querySelector(".o_hhg_card_taken")).toHaveText("1 day");
        expect(lines[2].querySelector(".o_hhg_card_left")).toHaveText("/4 days");
    });

    test("A17: an empty summary (read as false) draws no line", async () => {
        await openCard({ card: { summary: [] } });
        expect(".o_hhg_card_line").toHaveCount(0);
        expect(".o_hhg_card_schedule").toHaveCount(1);
    });

    test("A20: a user outside the Employees officers gets neither the lines nor the pencil", async () => {
        officer = false;
        await openCard({ card: { summary: [] } });
        expect(".o_hhg_card_schedule").toHaveCount(1);
        expect(".o_hhg_card_line").toHaveCount(0);
        expect(".o_hhg_card_version").toHaveCount(0);
    });

    test("A16: the card reads both values with one read", async () => {
        await openCard();
        expect(reads).toBe(1);
    });

    test("A18: the dashboard opens on the month scale from the Month range", async () => {
        await openCard();
        await click(".o_hhg_card_schedule");
        await animationFrame();
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe("dashboard");
        expect(calls[0][2]).toBe("month");
        expect(actions).toHaveLength(1);
        expect(actions[0].name).toBe("Dashboard");
        expect(".o_avatar_card").toHaveCount(0);
    });

    test("A18: the week scale from the Week range", async () => {
        await openCard({
            mount: { arch: LEAVE_ARCH().replace('default_range="month"', 'default_range="week"') },
        });
        await click(".o_hhg_card_schedule");
        await animationFrame();
        expect(calls[0][2]).toBe("week");
    });

    test("A18: the year scale from the Quarter range", async () => {
        await openCard({
            mount: { arch: LEAVE_ARCH().replace('default_range="month"', 'default_range="quarter"') },
        });
        await click(".o_hhg_card_schedule");
        await animationFrame();
        expect(calls[0][2]).toBe("year");
    });

    test("A18: the scale by kind, the year when unknown", () => {
        expect(dashboardScale("week")).toBe("week");
        expect(dashboardScale("month")).toBe("month");
        for (const kind of ["quarter", "day", "year", "custom", undefined]) {
            expect(dashboardScale(kind)).toBe("year");
        }
    });

    test("A19: a picked date creates the version and opens the form on it", async () => {
        await openCard();
        await click(".o_hhg_card_version");
        await animationFrame();
        expect(".o_datetime_picker").toHaveCount(1);
        await click(".o_datetime_picker .o_date_item_cell:not(.o_out_of_range)");
        await animationFrame();
        await advanceTime(300);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe("create_version");
        expect(calls[0][2].date_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(actions).toHaveLength(1);
        expect(actions[0].res_model).toBe("hr.employee");
        expect(actions[0].views).toEqual([[false, "form"]]);
        expect(actions[0].context.version_id).toBe(77);
    });

    test("A19: closing the picker without a date creates nothing", async () => {
        await openCard();
        await click(".o_hhg_card_version");
        await animationFrame();
        expect(".o_datetime_picker").toHaveCount(1);
        await press("escape");
        await animationFrame();
        await advanceTime(300);
        expect(calls).toHaveLength(0);
        expect(actions).toHaveLength(0);
    });

    test("R18 point 5: Escape closes the card, and so does a click outside", async () => {
        await openCard();
        await press("escape");
        await animationFrame();
        expect(".o_avatar_card").toHaveCount(0);
        await click(".o_tl_row_header .o_hrg_avatar");
        await animationFrame();
        expect(".o_avatar_card").toHaveCount(1);
        await click(document.body);
        await animationFrame();
        expect(".o_avatar_card").toHaveCount(0);
    });
});

describe("the report view", () => {
    test("A82: the same card, with the band, the line and the pencil", async () => {
        await openCard({ mount: { report: true, arch: REPORT_ARCH() } });
        expect(".o_avatar_card .o_hhg_card_band").toHaveCount(1);
        expect(".o_avatar_card .o_avatar_card_details").toHaveCount(0);
        expect(".o_hhg_card_line").toHaveCount(3);
        expect(".o_hhg_card_version").toHaveCount(1);
        expect(".o_hhg_card_schedule").toBeFocused();
    });
});
