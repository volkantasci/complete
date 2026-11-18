// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, keyDown, keyUp } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
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
