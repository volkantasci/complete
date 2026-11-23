// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryAllTexts } from "@odoo/hoot-dom";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { hoursLabel } from "../src/time_off_layout";
import { LEAVE_ARCH, mountTimeOff, setupTimeOffFixtures } from "./time_off_test_helpers";

describe.current.tags("desktop");

setupTimeOffFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
});

const PROGRESS_ARCH = LEAVE_ARCH(`progress_bar="employee_id"`);

test("a34 label text: whole hours, a half rounds away from zero", () => {
    expect(hoursLabel(166.5)).toBe("167h");
    expect(hoursLabel(79.4)).toBe("79h");
    expect(hoursLabel(0)).toBe("0h");
    expect(hoursLabel(-0.5)).toBe("-1h");
    expect(hoursLabel(-0.2)).toBe("0h");
    expect(hoursLabel(168)).toBe("168h");
});

test("a34 label alone: no bar, no tooltip, no warning, at every value", async () => {
    await mountTimeOff({
        employees: ["Anita Oliver", "Mitchell Admin", "Marc Demo"],
        arch: PROGRESS_ARCH,
        expand: true,
        progress: {
            "Anita Oliver": { value: 79.4 },
            "Mitchell Admin": { value: 166.5 },
            "Marc Demo": { value: 0, max_value: 40, warning: "no schedule" },
        },
    });
    expect(".o_hhg_time_off").toHaveCount(1);
    expect(queryAllTexts(".o_tl_progress_label")).toEqual(["79h", "167h", "0h"]);
    expect(".o_tl_progress").toHaveCount(0);
    expect(".o_tl_progress_fill").toHaveCount(0);
    expect(".o_tl_progress_warning").toHaveCount(0);
    for (const label of queryAll(".o_tl_progress_label")) {
        expect(label.hasAttribute("data-tooltip")).toBe(false);
        expect(label.hasAttribute("title")).toBe(false);
        expect(label).not.toHaveClass("o_tl_over");
    }
});

test("a34 label sits at the end of the row header's title line", async () => {
    await mountTimeOff({
        employees: ["Anita Oliver"],
        arch: PROGRESS_ARCH,
        expand: true,
        progress: { "Anita Oliver": { value: 80 } },
    });
    expect(".o_tl_row_header .o_tl_row_line > .o_tl_progress_label").toHaveCount(1);
    const style = getComputedStyle(document.querySelector(".o_tl_progress_label"));
    expect(style.paddingLeft).toBe("4px");
    expect(style.marginRight).toBe("4px");
    expect(style.fontSize).toBe("13px");
});

test("a34 the report variant draws no label", async () => {
    await mountTimeOff({
        employees: ["Anita Oliver"],
        report: true,
        expand: true,
        progress: { "Anita Oliver": { value: 80 } },
    });
    expect(".o_tl_grid").toHaveCount(1);
    expect(".o_tl_progress_label").toHaveCount(0);
    expect(".o_tl_progress").toHaveCount(0);
});
