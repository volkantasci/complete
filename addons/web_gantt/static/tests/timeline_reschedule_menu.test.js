// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryAll, queryAllTexts, queryOne, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    defineWebModels,
    makeMockServer,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

const DEPENDENCIES = `string="Pills" default_range="week" color="x_color"
    dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"`;
const METHOD_KEY = (view) => `rescheduleMethod-viewId-${view}`;
const SWITCH_KEY = (view, action) => `gantt_show_connectors,${view},${action}`;

let controller;
let loads;

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
    loads = 0;
    onRpc("get_gantt_data", async () => {
        loads += 1;
    });
    await resize({ width: 1600, height: 900 });
});

async function mountMenu({ arch, view = 5, action = 7, ...rest } = {}) {
    await makeMockServer();
    const pills = MockServer.current.env["pill"];
    pills.find((record) => record.id === 5).dependency_field = [4];
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: arch || timelineArch(DEPENDENCIES),
        groupBy: ["parent_id"],
        viewId: view,
        config: { actionId: action },
        ...rest,
    });
    await animationFrame();
    await animationFrame();
    loads = 0;
}

const labels = () => queryAllTexts(".o_tl_reschedule_menu .dropdown-item");
const buttonLabel = () => queryOne(".o_tl_reschedule_button").textContent.trim();

test("002c A35: the method menu", async () => {
    await mountMenu();
    // right after the collapse-all button, before the panel tools
    const row = queryOne(".o_tl_controls");
    const kids = [...row.children];
    expect(kids.indexOf(queryOne(".o_tl_reschedule_button").closest(".o-dropdown"))).toBe(
        kids.indexOf(queryOne(".o_tl_collapse_all")) + 1
    );
    expect(buttonLabel()).toBe("Auto-Reschedule (Keep Buffer)");
    await click(".o_tl_reschedule_button");
    await animationFrame();
    expect(labels()).toEqual([
        "Manual Reschedule",
        "Auto-Reschedule (Use Buffer)",
        "Auto-Reschedule (Keep Buffer)",
        "Show dependencies",
    ]);
    expect(".o_tl_reschedule_menu .dropdown-divider").toHaveCount(1);
    expect(queryAll(".o_tl_reschedule_menu .selected").map((el) => el.textContent.trim())).toEqual([
        "Auto-Reschedule (Keep Buffer)",
        "Show dependencies",
    ]);
    expect(".o_tl_reschedule_menu .o_tl_check").toHaveCount(2);
    await click(".o_tl_reschedule_manual");
    await animationFrame();
    // the menu closes, the label changes and the choice is stored at once
    expect(".o_tl_reschedule_menu").toHaveCount(0);
    expect(buttonLabel()).toBe("Manual Reschedule");
    expect(browser.localStorage.getItem(METHOD_KEY(5))).toBe("manual");
    // the data is loaded again 500 ms later, and only then does a move read the new method
    expect(controller.rescheduleMethod).toBe("maintainBuffer");
    await advanceTime(400);
    expect(loads).toBe(0);
    expect(controller.rescheduleMethod).toBe("maintainBuffer");
    await advanceTime(150);
    await animationFrame();
    expect(loads).toBe(1);
    expect(controller.rescheduleMethod).toBe("manual");
});

test("002c A35: the last choice counts and is kept per view", async () => {
    await mountMenu();
    for (const item of ["consumeBuffer", "manual"]) {
        await click(".o_tl_reschedule_button");
        await animationFrame();
        await click(`.o_tl_reschedule_${item}`);
        await advanceTime(100);
    }
    await advanceTime(600);
    await animationFrame();
    expect(loads).toBe(1);
    expect(controller.rescheduleMethod).toBe("manual");
    // another view does not read it, another action of the same view does
    expect(browser.localStorage.getItem(METHOD_KEY(6))).toBe(null);
});

test("002c A35: another action of the same view reads the method", async () => {
    browser.localStorage.setItem(METHOD_KEY(5), "consumeBuffer");
    await mountMenu({ action: 9 });
    expect(buttonLabel()).toBe("Auto-Reschedule (Use Buffer)");
    expect(controller.rescheduleMethod).toBe("consumeBuffer");
});

test("002c A35: another view does not read it", async () => {
    browser.localStorage.setItem(METHOD_KEY(5), "manual");
    await mountMenu({ view: 6 });
    expect(buttonLabel()).toBe("Auto-Reschedule (Keep Buffer)");
});

test("002c A33: the switch", async () => {
    await mountMenu();
    expect(controller.dependencies.shown).toBe(true);
    await click(".o_tl_reschedule_button");
    await animationFrame();
    await click(".o_tl_dependencies_item");
    await animationFrame();
    expect(".o_tl_reschedule_menu").toHaveCount(0);
    expect(controller.dependencies.shown).toBe(false);
    expect(browser.localStorage.getItem(SWITCH_KEY(5, 7))).toBe("false");
    // nothing is loaded again for a switch
    await advanceTime(600);
    expect(loads).toBe(0);
    expect(getComputedStyle(queryOne(".o_tl_arrow")).opacity).toBe("0");
    await click(".o_tl_reschedule_button");
    await animationFrame();
    expect(".o_tl_dependencies_item .o_tl_check").toHaveCount(0);
    await click(".o_tl_dependencies_item");
    await animationFrame();
    expect(controller.dependencies.shown).toBe(true);
    expect(browser.localStorage.getItem(SWITCH_KEY(5, 7))).toBe("true");
    // the switch is per action: another action of the view keeps its own
    expect(browser.localStorage.getItem(SWITCH_KEY(5, 8))).toBe(null);
});

test("002c A37: no menu on sample data", async () => {
    await mountMenu({
        arch: timelineArch(`${DEPENDENCIES} sample="1"`),
        domain: [["name", "=", "no such record"]],
    });
    expect(".o_tl_reschedule_button").toHaveCount(0);
});

test("002c A37: no menu without a dependency field", async () => {
    await mountMenu({ arch: timelineArch(`string="Pills" default_range="week"`) });
    expect(".o_tl_reschedule_button").toHaveCount(0);
});

test("002c A37: no menu or switch on a phone", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountMenu();
    expect(".o_tl_reschedule_button").toHaveCount(0);
    await click(".o_tl_gear");
    await animationFrame();
    expect(".o_tl_gear_menu .o_tl_dependencies_item").toHaveCount(0);
    expect(queryOne(".o_tl_gear_menu").textContent).not.toMatch(/Reschedule|dependencies/);
    // a stored method still counts on the phone
    expect(controller.rescheduleMethod).toBe("maintainBuffer");
});

test("002c A70: the menu is shown without the edit permission", async () => {
    await mountMenu({ arch: timelineArch(`${DEPENDENCIES} edit="0"`) });
    expect(".o_tl_reschedule_button").toHaveCount(1);
    await click(".o_tl_reschedule_button");
    await animationFrame();
    expect(labels()).toHaveLength(4);
});

test("002c A74: storage values set before the view opens", async () => {
    browser.localStorage.setItem(METHOD_KEY(5), "manual");
    browser.localStorage.setItem(SWITCH_KEY(5, 7), "false");
    await mountMenu();
    expect(buttonLabel()).toBe("Manual Reschedule");
    expect(controller.rescheduleMethod).toBe("manual");
    expect(controller.dependencies.shown).toBe(false);
    await click(".o_tl_reschedule_button");
    await animationFrame();
    expect(queryAll(".o_tl_reschedule_menu .selected").map((el) => el.textContent.trim())).toEqual([
        "Manual Reschedule",
    ]);
});
