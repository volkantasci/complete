// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { start } from "@mail/../tests/mail_test_helpers";
import { describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAllTexts } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { mountView, toggleSearchBarMenu } from "@web/../tests/web_test_helpers";
import {
    makeAttendanceData,
    mountAttendances,
    setupAttendanceFixtures,
} from "./attendance_test_helpers";

describe.current.tags("desktop");

setupAttendanceFixtures();

// a search view shaped like the Community's: the Date grouping by the name `groupby_month`, plus
// a week grouping, and a grouping on a date that has another name
const SEARCH = `<search>
    <field name="employee_id"/>
    <group>
        <filter name="employee" string="Employee" context="{'group_by': 'employee_id'}"/>
        <filter name="groupby_month" string="Date" context="{'group_by': 'check_in:month'}"/>
        <filter name="groupby_week" string="Week of Check In" context="{'group_by': 'check_in:week'}"/>
        <filter name="by_day" string="Day of Check In" context="{'group_by': 'check_in:day'}"/>
    </group>
</search>`;

const groupings = () =>
    queryAllTexts(".o_search_bar_menu .o_menu_item").filter((text) =>
        ["Employee", "Date", "Week of Check In", "Day of Check In"].includes(text)
    );

test("R5 groupby_month hidden in gantt", async () => {
    await mountAttendances({ employees: ["Anita Oliver"], searchViewArch: SEARCH });
    await toggleSearchBarMenu();
    expect(groupings()).not.toInclude("Date");
});

test("R5 groupby_week hidden in gantt, another date grouping stays", async () => {
    await mountAttendances({ employees: ["Anita Oliver"], searchViewArch: SEARCH });
    await toggleSearchBarMenu();
    expect(groupings()).toEqual(["Employee", "Day of Check In"]);
});

test("R5 a default naming a hidden grouping is no error and stays out of the menu", async () => {
    await mountAttendances({
        employees: ["Anita Oliver"],
        searchViewArch: SEARCH,
        context: { search_default_groupby_month: 1 },
    });
    await animationFrame();
    expect(".o_tl_renderer").toHaveCount(1);
    await toggleSearchBarMenu();
    expect(groupings()).toEqual(["Employee", "Day of Check In"]);
});

test("R5 the list view of the same search view keeps Date", async () => {
    await makeAttendanceData(["Anita Oliver"]);
    await start();
    await mountView({ type: "list", resModel: "hag.attendance", searchViewArch: SEARCH });
    await toggleSearchBarMenu();
    expect(groupings()).toEqual(["Employee", "Date", "Week of Check In", "Day of Check In"]);
});

test("R5 a favourite naming the month of check-in is dropped, not an error", async () => {
    // the attendance lies on the displayed day, so that the employee's row shows
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    await mountAttendances({
        employees: ["Anita Oliver"],
        attendances: [["Anita Oliver", [11, "8:00"], [11, "9:00"]]],
        searchViewArch: SEARCH,
        irFilters: [
            {
                user_ids: [2],
                name: "By month",
                id: 5,
                context: `{"group_by": ["check_in:month"]}`,
                domain: "[]",
                is_default: true,
                model_id: "hag.attendance",
                action_id: false,
            },
        ],
    });
    await animationFrame();
    expect(".o_tl_renderer").toHaveCount(1);
    // the employee's row shows (a blank view fails here), and no row is a month of the
    // check-in: the grouping is not applied
    expect(queryAllTexts(".o_tl_row_header").join(" ")).toMatch(/Anita Oliver/);
    expect(queryAllTexts(".o_tl_row_header").join(" ")).not.toMatch(/November|2026/);
    await toggleSearchBarMenu();
    expect(groupings()).toEqual(["Employee", "Day of Check In"]);
});
