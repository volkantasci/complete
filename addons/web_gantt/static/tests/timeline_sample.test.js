// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { markup } from "@odoo/owl";
import { contains, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
    await resize({ width: 1600, height: 900 });
});

const HELP = markup`<p class="o_view_nocontent_smiling_face">No pill yet</p><p>Create one to see it here.</p>`;
const H8 = HOST_ARCHS.H8;
const H9 = timelineArch(`string="Pills" default_range="week"`);

async function mountEmpty(arch, rest = {}) {
    // a domain that matches no record
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch,
        domain: [["id", "=", 0]],
        ...rest,
    });
}

test("D-2: the help is fully visible over the faded grid, whatever the scroll position", async () => {
    await mountEmpty(H8, { noContentHelp: HELP });
    const renderer = queryOne(".o_tl_renderer");
    expect(renderer.scrollWidth).toBeGreaterThan(renderer.clientWidth);
    for (const left of [0, renderer.scrollWidth]) {
        renderer.scrollLeft = left;
        await animationFrame();
        const help = queryOne(".o_tl_box .o_view_nocontent .o_nocontent_help");
        // only the cells are faded: no element from the help up to the page is
        let opacity = 1;
        for (let element = help; element; element = element.parentElement) {
            opacity *= Number(getComputedStyle(element).opacity);
        }
        expect(opacity).toBe(1);
        const box = queryRect(".o_tl_box");
        const rect = queryRect(help);
        expect(rect.width).toBeGreaterThan(50);
        expect(rect.left).not.toBeLessThan(box.left);
        expect(rect.right).not.toBeGreaterThan(box.right);
        expect(rect.top).not.toBeLessThan(box.top);
        expect(rect.bottom).not.toBeGreaterThan(box.bottom);
    }
});

test("A83: sample state then next ends it", async () => {
    await mountEmpty(H8, { noContentHelp: HELP });
    expect(".o_tl_row:not(.o_tl_total_row)").toHaveCount(1);
    expect(".o_tl_pill").toHaveCount(0);
    expect(".o_tl_cell.o_tl_sample").toHaveCount(queryAll(".o_tl_cell").length);
    expect(".o_tl_cell").toHaveStyle({ opacity: "0.06", pointerEvents: "none" });
    // a body cell that is not today's column keeps no fill
    expect(queryAll(".o_tl_cell:not(.o_tl_is_today)")[0]).toHaveStyle({
        backgroundColor: "rgba(0, 0, 0, 0)",
    });
    // the help is drawn over the grid, below the first header row
    expect(".o_tl_box .o_view_nocontent").toHaveCount(1);
    expect(".o_tl_box .o_view_nocontent").toHaveText("No pill yet\n\nCreate one to see it here.");
    const grid = queryRect(".o_tl_renderer");
    const help = queryRect(".o_tl_box .o_view_nocontent");
    // just below the first header row (the column group headers), under the line above the grid
    expect(help.top - grid.top).toBe(queryRect(queryAll(".o_tl_col_group")[0]).height + 1);
    expect(queryAll(".o_view_sample_data")).toHaveLength(1);
    await contains(".o_tl_next").click();
    await advanceTime(500);
    await animationFrame();
    expect(".o_view_nocontent").toHaveCount(0);
    expect(".o_tl_sample").toHaveCount(0);
    expect(".o_view_sample_data").toHaveCount(0);
    expect(".o_tl_row:not(.o_tl_total_row)").toHaveCount(1);
});

test("A83: grouped sample rows are faded and ignore the pointer", async () => {
    await mountEmpty(H8, { noContentHelp: HELP, groupBy: ["parent_id"] });
    expect(queryAll(".o_tl_row_header").length).toBeGreaterThan(0);
    for (const header of queryAll(".o_tl_row_header")) {
        expect(header).toHaveClass("o_tl_sample");
    }
    expect(".o_tl_pill").toHaveCount(0);
    expect(".o_tl_group_pill").toHaveCount(0);
    // a click on a sample row folds nothing
    for (const selector of [".o_tl_row", ".o_tl_row_header", ".o_tl_cell", ".o_tl_col"]) {
        expect(queryAll(selector)[0]).toHaveStyle({ pointerEvents: "none" });
    }
    // a real click on a sample row folds nothing
    try {
        await click(".o_tl_row_header");
    } catch {
        // the pointer cannot reach the row at all
    }
    await animationFrame();
    expect(".o_tl_collapsed").toHaveCount(0);
});

test("A84: empty view without help", async () => {
    await mountEmpty(H9, { noContentHelp: HELP });
    expect(".o_tl_row:not(.o_tl_total_row)").toHaveCount(1);
    expect(".o_tl_pill").toHaveCount(0);
    expect(".o_view_nocontent").toHaveCount(0);
    expect(".o_tl_sample").toHaveCount(0);
    expect(".o_tl_cell").not.toHaveStyle({ opacity: "0.06" });
});

test("A114: no pill in the sample state", async () => {
    await mountEmpty(H8, { noContentHelp: HELP });
    expect(".o_tl_pill").toHaveCount(0);
    expect(".o_tl_cell").toHaveStyle({ opacity: "0.06" });
    expect(".o_tl_box .o_view_nocontent").toHaveCount(1);
});

test("A114: sample state without action help draws no help", async () => {
    await mountEmpty(H8);
    expect(".o_tl_sample").not.toHaveCount(0);
    expect(".o_view_nocontent").toHaveCount(0);
});

test("a sample view that finds records is not a sample", async () => {
    await mountView({ type: "gantt", resModel: "pill", arch: H8, noContentHelp: HELP });
    expect(".o_tl_sample").toHaveCount(0);
    expect(".o_view_nocontent").toHaveCount(0);
});
