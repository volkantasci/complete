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
    expect(getComputedStyle(cell).backgroundImage).toMatch(/^linear-gradient\(90deg, /);
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

async function mountWithNightGrey(days) {
    // quarters night / day / day / night on each of the given days (R23)
    const periods = days.flatMap((day) => [
        { start: at(day, "00:00"), stop: at(day, "06:00") },
        { start: at(day, "18:00"), stop: at(day + 1, "00:00") },
    ]);
    timelineMock.unavailability = { x_contact: { 1: periods } };
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: ARCH(`precision="{'week': 'day:quarter'}"`),
        groupBy: ["x_contact"],
        domain: [["id", "in", [4, 5, 6, 9]]],
    });
    await animationFrame();
    const row = queryAll(".o_tl_row").find(
        (el) => el.querySelector(".o_tl_row_name")?.textContent.trim() === "Host Contact 1"
    );
    return [...row.querySelectorAll(".o_tl_cell")];
}

test("R23 available quarters painted", async () => {
    const cells = await mountWithNightGrey([0, 2]);
    const grey = "rgb(233, 236, 239)";
    const stops = (day) =>
        `linear-gradient(90deg, ${grey} 24%, ${day} 25%, ${day} 49%, ${day} 50%, ${day} 74%, ${grey} 75%)`;
    // an ordinary day (M82): the available quarters take the view background, not transparent
    expect(getComputedStyle(cells[13]).backgroundImage).toBe(stops("rgb(255, 255, 255)"));
    // today's column (M83): they take today's shade
    expect(cells[11]).toHaveClass("o_tl_is_today");
    expect(getComputedStyle(cells[11]).backgroundImage).toBe(stops("rgb(255, 250, 235)"));
});
