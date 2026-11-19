// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { start } from "@mail/../tests/mail_test_helpers";
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, dblclick, hover, queryAll, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    mountView,
    patchWithCleanup,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";
import { CLICK_LOCK } from "../src/attendance_timeline_renderer";
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

// ----------------------------------------------------------------------------
// R9 to R12: what a click on a pill does
// ----------------------------------------------------------------------------

const DIALOG = ".o_dialog";
const pills = () => queryAll(".o_tl_pill");
const titles = () => queryAllTexts(`${DIALOG} .modal-title`);
let controller;

describe("R9 to R12 clicks", () => {
    beforeEach(() => {
        mockTimeZone(1);
        mockDate("2026-11-11T10:00:05Z");
        patchWithCleanup(localization, { weekStart: 7 });
        patchWithCleanup(TimelineController.prototype, {
            setup() {
                super.setup(...arguments);
                controller = this;
            },
        });
    });

    /** Two employees with an attendance each on the Day range of 11 November. */
    const mountPills = async () => {
        await mountAttendances({
            employees: ["Anita Oliver", "Beth Evans"],
            attendances: [
                ["Anita Oliver", [11, "8:00"], [11, "9:30"]],
                ["Beth Evans", [11, "9:00"], [11, "10:00"]],
            ],
        });
        // the clock stands still from here: only advanceTime moves it (the 200 ms locks)
        freezeTime();
    };

    /** Lets the record dialog open and its form render (the clock stands still). */
    const dialogReady = async () => {
        for (let turn = 0; turn < 20 && !queryAll(`${DIALOG} .o_form_view`).length; turn++) {
            await animationFrame();
        }
        await animationFrame();
    };

    /** Closes the open record dialog with its Discard button (the view reloads). */
    async function discard() {
        await contains(`${DIALOG} .o_form_button_cancel`).click();
        await animationFrame();
    }

    test("R9 click opens dialog at once without popover", async () => {
        await mountPills();
        await click(pills()[0]);
        // no wait: not one tick of the clock has passed
        await animationFrame();
        await dialogReady();
        expect(DIALOG).toHaveCount(1);
        expect(titles()).toEqual(["Open"]);
        await advanceTime(400);
        expect(".o_tl_popover").toHaveCount(0);
        expect(DIALOG).toHaveCount(1);
    });

    test("R9 no Remove button", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        expect(`${DIALOG} .o_form_button_remove`).toHaveCount(0);
        expect(`${DIALOG} .o_form_button_cancel`).toHaveCount(1);
    });

    test("R10 busy guard: a second click and a double click while the dialog is open open nothing", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        await click(pills()[0]);
        await animationFrame();
        expect(DIALOG).toHaveCount(1);
        await dblclick(pills()[0]);
        await animationFrame();
        expect(DIALOG).toHaveCount(1);
    });

    test("R10 lock alone: the dialog closed within 200 ms, a click before 200 ms opens nothing", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        await discard();
        expect(DIALOG).toHaveCount(0);
        // no dialog is opening or open: only the lock of the first click holds
        await advanceTime(100);
        await click(pills()[0]);
        await animationFrame();
        expect(DIALOG).toHaveCount(0);
    });

    test("R10 click after 200 ms opens again", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        await discard();
        await advanceTime(CLICK_LOCK);
        await click(pills()[0]);
        await dialogReady();
        expect(DIALOG).toHaveCount(1);
    });

    test("R10 ignored click does not restart the lock", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        await discard();
        await advanceTime(150);
        await click(pills()[0]); // ignored, at 150 ms
        await animationFrame();
        expect(DIALOG).toHaveCount(0);
        await advanceTime(60); // 210 ms after the first click, 60 after the ignored one
        await click(pills()[0]);
        await dialogReady();
        expect(DIALOG).toHaveCount(1);
    });

    test("R10 other pill opens at once when no dialog", async () => {
        await mountPills();
        await click(pills()[0]);
        await dialogReady();
        await discard();
        await advanceTime(50);
        await click(pills()[1]);
        await dialogReady();
        expect(DIALOG).toHaveCount(1);
        expect(`${DIALOG} .o_field_widget[name='employee_id'] input`).toHaveValue("Beth Evans");
    });

    test("R10 no second dialog while opening", async () => {
        await mountPills();
        let release;
        controller.model.trackWrite(new Promise((resolve) => (release = resolve)));
        await click(pills()[0]);
        await animationFrame();
        // the dialog waits for the write: a click on another pill opens nothing either
        await click(pills()[1]);
        await advanceTime(300);
        await click(pills()[0]);
        await animationFrame();
        expect(DIALOG).toHaveCount(0);
        release();
        await dialogReady();
        await animationFrame();
        expect(DIALOG).toHaveCount(1);
        expect(`${DIALOG} .o_field_widget[name='employee_id'] input`).toHaveValue("Anita Oliver");
        // and still none while it is open, after the locks are long gone
        await click(pills()[1]);
        await animationFrame();
        expect(DIALOG).toHaveCount(1);
    });

    test("R12 handle press-release opens dialog", async () => {
        await mountPills();
        await hover(pills()[0]);
        await animationFrame();
        await click(queryOne(".o_tl_handle_stop"));
        await dialogReady();
        expect(DIALOG).toHaveCount(1);
        expect(titles()).toEqual(["Open"]);
        expect(".o_tl_popover").toHaveCount(0);
    });

});
