// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, keyDown, keyUp, queryRect } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    patchWithCleanup,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";

import { ARCH, mountAttendances, setupAttendanceFixtures, utc } from "./attendance_test_helpers";

describe.current.tags("desktop");

setupAttendanceFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
});

const settle = async () => {
    await advanceTime(500);
    await animationFrame();
};

test("A41: Shift on a folded header does nothing, a plain click unfolds the day", async () => {
    const { ids } = await mountAttendances({
        employees: ["Anita Oliver"],
        arch: ARCH("week"),
        expand: true,
    });
    // the weekend of the week of 8 to 14 November is unavailable: Sunday 8 and Saturday 14 fold
    timelineMock.unavailability = {
        employee_id: {
            [ids["Anita Oliver"]]: [
                { start: utc(8, "0:00"), stop: utc(9, "0:00") },
                { start: utc(14, "0:00"), stop: utc(15, "0:00") },
            ],
        },
    };
    await click(".o_tl_next");
    await settle();
    await click(".o_tl_previous");
    await settle();
    expect(".o_tl_col.o_tl_folded").toHaveCount(2);
    await keyDown("Shift");
    await click(".o_tl_col.o_tl_folded");
    await keyUp("Shift");
    await settle();
    expect(".o_tl_col.o_tl_folded").toHaveCount(2);
    await click(".o_tl_col.o_tl_folded");
    await settle();
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
});

const allDay = (day) => [{ start: utc(day, "0:00"), stop: utc(day + 1, "0:00") }];

test("A69: after a search that leaves one row unavailable all day, the Day range is one folded column (R21, D4)", async () => {
    const { ids } = await mountAttendances({
        employees: ["Anita Oliver", "Beth Evans"],
        arch: ARCH("day"),
        expand: true,
        searchViewArch: `<search>
            <filter name="named_a" string="Named A" domain="[('name', '=', 'A')]"/>
        </search>`,
    });
    timelineMock.unavailability = { employee_id: { [ids["Beth Evans"]]: allDay(11) } };
    await click(".o_tl_next");
    await settle();
    await click(".o_tl_previous");
    await settle();
    // Anita's row is available all day: no column folds
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    expect(".o_tl_col").toHaveCount(24);
    // the search keeps Beth's one row; the page is folded without building the period again
    timelineMock.expandGroups = [ids["Beth Evans"]];
    await toggleSearchBarMenu();
    await toggleMenuItem("Named A");
    await settle();
    expect(".o_tl_row:not(.o_tl_total_row)").toHaveCount(1);
    expect(".o_tl_col").toHaveCount(1);
    expect(".o_tl_col").toHaveClass("o_tl_folded");
    expect(queryRect(".o_tl_col").width).toBeGreaterThan(1000);
    expect(".o_tl_cell.o_tl_folded_cell").toHaveCount(1);
});

test("A71: the same page reached by building the period folds the same way (R21, D4)", async () => {
    const { ids } = await mountAttendances({
        employees: ["Beth Evans"],
        arch: ARCH("day"),
        expand: true,
    });
    timelineMock.unavailability = { employee_id: { [ids["Beth Evans"]]: allDay(11) } };
    await click(".o_tl_next");
    await settle();
    await click(".o_tl_previous");
    await settle();
    expect(".o_tl_col").toHaveCount(1);
    expect(".o_tl_col").toHaveClass("o_tl_folded");
    // a click opens the run; the next load folds it again, the click of a pill or a reload alike
    await click(".o_tl_col.o_tl_folded");
    await settle();
    expect(".o_tl_col").toHaveCount(24);
    await click(".o_tl_next");
    await settle();
    await click(".o_tl_previous");
    await settle();
    expect(".o_tl_col").toHaveCount(1);
});
