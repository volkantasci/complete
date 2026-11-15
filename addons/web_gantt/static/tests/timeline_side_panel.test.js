// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryFirst, queryRect, resize } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { defineWebModels, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

setupTimelineFixtures();
defineWebModels();

let controller;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineController.prototype, {
        setup() {
            super.setup(...arguments);
            controller = this;
        },
    });
    await resize({ width: 1600, height: 900 });
});

// the test page may sit left of the window's edge: measure from the view
const leftOfBox = () => queryRect(".o_tl_box").left - queryRect(".o_timeline_view").left;

const KEY = "timelinePanelOpen-view-5-action-7";

async function mountPanel(arch = HOST_ARCHS.H36, { groupBy = ["parent_id"], ...rest } = {}) {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch,
        viewId: 5,
        config: { actionId: 7 },
        groupBy,
        ...rest,
    });
    await animationFrame();
}

test.tags("desktop");
test("002b3 A43: the panel and its button show on H36 and H37", async () => {
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(1);
    expect(".o_tl_panel_strip").toHaveCount(1);
    expect(".o_tl_panel_toggle").toHaveCount(1);
    expect(".o_tl_panel_toggle").toHaveClass("active");
    expect(".o_tl_panel_toggle").toHaveAttribute("title", "Show or hide the panel");
    expect(".o_tl_panel").toHaveClass("d-print-none");
    expect(".o_tl_panel_toggle").toHaveClass("d-print-none");
    expect(queryRect(".o_tl_panel").width).toBe(262);
    expect(queryRect(".o_tl_panel_strip").width).toBe(18);
    expect(leftOfBox()).toBe(16);
    expect(queryRect(".o_tl_box").width).toBe(1288);
    expect(queryRect(".o_tl_box").right + 18 + 262 + 16).toBe(queryRect(".o_timeline_view").right);
    expect(".o_tl_box").toHaveStyle({
        borderTopWidth: "1px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
        borderBottomWidth: "0px",
        borderTopLeftRadius: "12px",
        marginLeft: "16px",
    });
    // H36 without grouping shows it as well
    expect(controller.hasPanel).toBe(true);
});

test.tags("desktop");
test("002b3 A43: no panel without the option, with edit off, in the sample state", async () => {
    await mountPanel(HOST_ARCHS.H5);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(leftOfBox()).toBe(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("desktop");
test("002b3 A43: no panel with edit off", async () => {
    await mountPanel(HOST_ARCHS.H39);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("desktop");
test("002b3 A43: no panel in the sample state", async () => {
    await mountPanel(
        `<gantt date_start="date_start" date_stop="date_stop" string="Pills" default_range="week" schedule="1" sample="1"/>`,
        { domain: [["id", "=", -1]], groupBy: [] }
    );
    expect(".o_tl_box_sample").toHaveCount(1);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("mobile");
test("002b3 A43: no panel on the phone", async () => {
    await resize({ width: 390, height: 844 });
    await mountPanel();
    expect(".o_tl_phone").toHaveCount(1);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(leftOfBox()).toBe(0);
    expect(queryRect(".o_tl_box").width).toBe(390);
});

test.tags("desktop");
test("002b3 A54: the button closes and opens; the state is stored per view and action", async () => {
    await mountPanel();
    expect(browser.localStorage.getItem(KEY)).toBe(null);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_strip").toHaveCount(0);
    expect(".o_tl_panel_toggle").not.toHaveClass("active");
    expect(browser.localStorage.getItem(KEY)).toBe("false");
    // closed: the grid box reaches the screen's right edge, its margin and border stay
    expect(leftOfBox()).toBe(16);
    expect(queryRect(".o_tl_box").width).toBe(1584);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(1);
    expect(browser.localStorage.getItem(KEY)).toBe("true");
    expect(queryRect(".o_tl_box").width).toBe(1288);
});

test.tags("desktop");
test("002b3 A54: a second mount reads the stored state of its own view and action", async () => {
    browser.localStorage.setItem(KEY, "false");
    // another action of the same view keeps its own state: still open
    browser.localStorage.setItem("timelinePanelOpen-view-5-action-8", "true");
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(1);
    expect(".o_tl_panel_toggle").not.toHaveClass("active");
});

test.tags("desktop");
test("002b3 A54: closed shows the count text before the button", async () => {
    await mountPanel();
    controller.model.panel.count = 4;
    await animationFrame();
    // open: the count is in the panel title, not before the button
    expect(".o_tl_panel_count").toHaveCount(0);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 4");
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel_count").toHaveText("Unscheduled: 4");
    expect(".o_tl_panel_count").toHaveClass("d-print-none");
    expect(queryRect(".o_tl_panel_count").right).toBeLessThan(queryRect(".o_tl_panel_toggle").left);
    controller.model.panel.count = 0;
    await animationFrame();
    expect(".o_tl_panel_count").toHaveText("All records are scheduled");
});

test.tags("desktop");
test("002b3 R18: the grid's columns follow the panel", async () => {
    // a wide screen and the year range (36 months) without row headers (they take a part of the
    // width): the months share the width of the box
    await resize({ width: 4000, height: 900 });
    await mountPanel(timelineArch(`string="Pills" default_range="year" schedule="1"`), {
        groupBy: [],
    });
    const header = () => queryRect(queryFirst(".o_tl_col[data-index]"));
    const open = header().width;
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(open).toBeLessThan(header().width);
});
