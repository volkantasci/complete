// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { animationFrame, press, queryAll, waitFor } from "@odoo/hoot";
import {
    contains,
    defineActions,
    defineMenus,
    defineModels,
    fields,
    getMockEnv,
    getService,
    models,
    mountWebClient,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { browser, location } from "@web/core/browser/browser";
import { redirect } from "@web/core/utils/urls";

const HOME_ROOT = ".o_home_menu";
const BG_CLASS = "o_home_menu_background";
const HOME_ACTION = "menu";

describe.current.tags("desktop");

const NAMES = [
    "Discuss",
    "Calendar",
    "To-do",
    "Contacts",
    "CRM",
    "Sales",
    "Dashboards",
    "Invoicing",
    "Project",
    "Apps",
    "Settings",
];

class Partner extends models.Model {
    name = fields.Char({ required: true });

    _records = [
        { id: 1, name: "Alpha record" },
        { id: 2, name: "Beta record" },
    ];
    _views = {
        list: `<list><field name="name"/></list>`,
        form: `<form><field name="name"/></form>`,
        search: `<search/>`,
    };
}
defineModels([Partner]);

defineActions(
    NAMES.map((name, index) => ({
        id: index + 1,
        xml_id: `cws_test.action_${index + 1}`,
        name,
        res_model: "partner",
        views: [
            [false, "list"],
            [false, "form"],
        ],
    }))
);
defineMenus(
    NAMES.map((name, index) => ({
        id: index + 1,
        appID: index + 1,
        name,
        actionID: index + 1,
        xmlid: `cws_test.app_${name.toLowerCase().replace(/\W/g, "")}`,
        webIconData: "/web/static/img/default_icon_app.png",
    })),
    { mode: "replace" }
);

onRpc("has_group", () => true);

beforeEach(() => {
    redirect("/odoo");
});

/** Count the history entries added from now on. */
function countPushes() {
    const counter = { count: 0 };
    patchWithCleanup(browser.history, {
        pushState() {
            counter.count++;
            return super.pushState(...arguments);
        },
    });
    return counter;
}

/** The home menu and an application never show together. */
function bothVisible() {
    return queryAll(".o_home_menu").length > 0 && queryAll(".o_list_view, .o_form_view").length > 0;
}

/** Wait for a promise of the service, letting the mocked timers run. */
async function settle(promise) {
    let done = false;
    promise.then(
        () => (done = true),
        () => (done = true)
    );
    while (!done) {
        await animationFrame();
        expect(bothVisible()).toBe(false);
    }
    await animationFrame();
}

async function toggle(show) {
    await settle(getService("home_menu").toggle(show));
}

/** Open the n-th tile (0-based) from the home menu. */
async function openTile(index) {
    await contains(`.o_home_menu .o_app:eq(${index})`).click();
    await animationFrame();
}

function breadcrumbCount() {
    return getService("action").currentController.config.breadcrumbs.length;
}

test("A1 home menu is the landing page", async () => {
    await mountWebClient();
    expect(HOME_ROOT).toHaveCount(1);
    expect(".o_list_view, .o_form_view").toHaveCount(0);
    expect(location.pathname).toBe("/odoo");
    expect(document.title).toInclude("Home");
});

test("A2 address naming an action skips the home menu", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_list_view").toHaveCount(1);
    expect(getService("home_menu").hasHomeMenu).toBe(false);
});

test("A4 clicking a tile adds one history entry", async () => {
    await mountWebClient();
    const pushes = countPushes();
    await openTile(1);
    expect(pushes.count).toBe(1);
    expect(".o_list_view").toHaveCount(1);
    expect(HOME_ROOT).toHaveCount(0);
});

test("A10 nothing behind the home menu on landing", async () => {
    await mountWebClient();
    const homeMenu = getService("home_menu");
    expect(homeMenu.hasHomeMenu).toBe(true);
    expect(homeMenu.hasBackgroundAction).toBe(false);
    await press("Escape");
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    await toggle(false);
    expect(HOME_ROOT).toHaveCount(1);
});

test("A11 a tile chosen over an application starts a new stack", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    await contains(".o_data_row:eq(0) .o_data_cell").click();
    expect(".o_form_view").toHaveCount(1);
    expect(breadcrumbCount()).toBe(2);
    await toggle(true);
    expect(getService("home_menu").hasBackgroundAction).toBe(true);
    await openTile(1);
    expect(breadcrumbCount()).toBe(1);
    expect(getService("action").currentController.action.id).toBe(2);
    await toggle();
    expect(HOME_ROOT).toHaveCount(1);
    await toggle();
    expect(HOME_ROOT).toHaveCount(0);
    expect(getService("action").currentController.action.id).toBe(2);
    expect(".o_list_view").toHaveCount(1);
});

test("A12 unsaved form changes are saved on toggle", async () => {
    redirect("/odoo/action-1");
    onRpc("partner", "web_save", () => expect.step("web_save"));
    await mountWebClient();
    await contains(".o_data_row:eq(0) .o_data_cell").click();
    await contains(".o_field_widget[name=name] input").edit("changed");
    await toggle(true);
    expect.verifySteps(["web_save"]);
    expect(".modal").toHaveCount(0);
    expect(HOME_ROOT).toHaveCount(1);
    await toggle(false);
    expect(".o_form_view").toHaveCount(1);
    expect(".o_field_widget[name=name] input").toHaveValue("changed");
});

test("A12b invalid edits keep the form open", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    await contains(".o_data_row:eq(0) .o_data_cell").click();
    await contains(".o_field_widget[name=name] input").edit("", { confirm: false });
    await toggle(true);
    expect(".o_form_view").toHaveCount(1);
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_notification").toHaveCount(1);
    expect(getService("home_menu").hasHomeMenu).toBe(false);
});

test("A13 fast repeated toggling", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    const homeMenu = getService("home_menu");
    const sampled = [];
    getMockEnv().bus.addEventListener("ACTION_MANAGER:UPDATE", () => sampled.push(bothVisible()));
    const first = homeMenu.toggle();
    const second = homeMenu.toggle();
    const third = homeMenu.toggle();
    await settle(Promise.all([first, second, third]));
    expect(homeMenu.hasHomeMenu).toBe(true);
    expect(homeMenu.hasBackgroundAction).toBe(true);
    expect(HOME_ROOT).toHaveCount(1);
    expect(".o_list_view").toHaveCount(0);
    expect(sampled.some(Boolean)).toBe(false);
});

test("A13b toggle then a tile", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    const pending = getService("home_menu").toggle(true);
    await waitFor(HOME_ROOT);
    await contains(".o_home_menu .o_app:eq(2)").click();
    await settle(pending);
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_list_view").toHaveCount(1);
    expect(getService("action").currentController.action.id).toBe(3);
    expect(getService("home_menu").hasHomeMenu).toBe(false);
});

test("A14 browser back returns to the home menu", async () => {
    await mountWebClient();
    await openTile(0);
    expect(".o_list_view").toHaveCount(1);
    browser.history.back();
    await animationFrame();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    expect(getService("home_menu").hasBackgroundAction).toBe(false);
});

test("A15 a dialog action opens over the home menu", async () => {
    await mountWebClient();
    await getService("action").doAction({
        type: "ir.actions.act_window",
        res_model: "partner",
        target: "new",
        views: [[false, "form"]],
    });
    await animationFrame();
    expect(".modal").toHaveCount(1);
    expect(HOME_ROOT).toHaveCount(1);
});

test("A16 a failed start-up action leaves no home menu", async () => {
    redirect("/odoo/action-1");
    expect.errors(1);
    onRpc("/web/action/load", () => {
        throw new Error("boom");
    });
    await mountWebClient();
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_list_view").toHaveCount(0);
    expect(getService("home_menu").hasHomeMenu).toBe(false);
    expect.verifyErrors(["boom"]);
});

test("A41 the background class follows the home menu", async () => {
    await mountWebClient();
    expect(document.body).toHaveClass(BG_CLASS);
    await openTile(0);
    expect(document.body).not.toHaveClass(BG_CLASS);
    await toggle(true);
    expect(document.body).toHaveClass(BG_CLASS);
    await toggle(false);
    expect(document.body).not.toHaveClass(BG_CLASS);
});

test("A71 running menu again changes nothing", async () => {
    await mountWebClient();
    await press("ArrowRight");
    await press("ArrowRight");
    await animationFrame();
    expect(".o_app.o_focused").toHaveCount(1);
    expect(queryAll(".o_app")[1]).toHaveClass("o_focused");
    const pushes = countPushes();
    await getService("action").doAction(HOME_ACTION);
    await animationFrame();
    expect(pushes.count).toBe(0);
    expect(HOME_ROOT).toHaveCount(1);
    expect(queryAll(".o_app")[1]).toHaveClass("o_focused");
});

test("A73 a missing action falls back to the home menu", async () => {
    redirect("/odoo/action-999");
    await mountWebClient();
    expect(HOME_ROOT).toHaveCount(1);
});

test("A74 the in-app back on the first screen shows the home menu", async () => {
    redirect("/odoo/m-partner/1");
    await mountWebClient();
    expect(".o_form_view").toHaveCount(1);
    getService("action").currentController.config.historyBack();
    await animationFrame();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
});

test("events: HOME-MENU:TOGGLED fires on show and hide", async () => {
    redirect("/odoo/action-1");
    await mountWebClient();
    const homeMenu = getService("home_menu");
    getMockEnv().bus.addEventListener("HOME-MENU:TOGGLED", () => expect.step("toggled"));
    await toggle(true);
    expect.verifySteps(["toggled"]);
    await toggle(false);
    expect.verifySteps(["toggled"]);
    expect(homeMenu.hasHomeMenu).toBe(false);
});
