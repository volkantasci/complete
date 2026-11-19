// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { TimelineRenderer } from "@web_gantt/timeline_renderer";
import { timelineView } from "@web_gantt/timeline_view";

import { at, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const ARCH = (extra = "") =>
    timelineArch(
        `string="Pills" default_range="week" display_unavailability="1" progress_bar="x_contact" ${extra}`
    );

async function mountWithHalfDayGrey(arch) {
    // D+2 is unavailable on its first half only
    timelineMock.unavailability = {
        x_contact: { 1: [{ start: at(2, "00:00"), stop: at(2, "12:00") }] },
    };
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch,
        groupBy: ["x_contact"],
        domain: [["id", "in", [4, 5, 6, 9]]],
    });
    await animationFrame();
    const row = queryAll(".o_tl_row").find(
        (el) => el.querySelector(".o_tl_row_name")?.textContent.trim() === "Host Contact 1"
    );
    return [...row.querySelectorAll(".o_tl_cell")][13];
}

test("cell hook: the plain view draws a half grey cell with 002a's vertical halves", async () => {
    const cell = await mountWithHalfDayGrey(ARCH());
    expect(getComputedStyle(cell).backgroundImage).toMatch(/^linear-gradient\(to right, /);
});

test("cell hook: a variant draws the style of a partly unavailable cell", async () => {
    class DiagonalRenderer extends TimelineRenderer {
        partialCellStyle(covered) {
            this.lastCovered = JSON.stringify(covered);
            return "background-image: linear-gradient(325deg, red 49%, blue 50%)";
        }
    }
    registry.category("views").add("test_cell_gantt", { ...timelineView, Renderer: DiagonalRenderer });
    const cell = await mountWithHalfDayGrey(ARCH(`js_class="test_cell_gantt"`));
    expect(getComputedStyle(cell).backgroundImage).toMatch(/^linear-gradient\(325deg, /);
});
