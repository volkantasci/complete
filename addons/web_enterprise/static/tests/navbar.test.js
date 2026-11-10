// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { animationFrame, click, press, queryAll, queryOne, resize } from "@odoo/hoot";
import {
    contains,
    defineActions,
    defineMenus,
    defineModels,
    fields,
    getMockEnv,
    getService,
    mockService,
    models,
    mountWebClient,
    onRpc,
    toggleMenuItem,
    toggleSearchBarMenu,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { registry } from "@web/core/registry";
import { redirect } from "@web/core/utils/urls";
import { config as transitionConfig } from "@web/core/transition";
import { session } from "@web/session";
import { BurgerMenu } from "@web/webclient/burger_menu/burger_menu";

import { CwsBurgerMenu } from "@web_enterprise/burger_menu/burger_menu";

const HOME_ROOT = ".o_home_menu";
const GRID_BUTTON = ".o_menu_toggle";
const BACK_STATE = "o_menu_toggle_back";
const BRAND = ".o_menu_brand";
const BG_CLASS = "o_home_menu_background";

describe.current.tags("desktop");

const body = { root: document.body };

const NAMES = ["Discuss", "Calendar", "CRM"];

class Partner extends models.Model {
    name = fields.Char({ required: true });

    _records = [
        { id: 1, name: "Alpha record" },
        { id: 2, name: "Beta record" },
    ];
    _views = {
        list: `<list><field name="name"/></list>`,
        form: `<form><field name="name"/></form>`,
        search: `<search><field name="name"/><filter name="first" string="Only first" domain="[('id', '=', 1)]"/></search>`,
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
    [
        ...NAMES.map((name, index) => ({
            id: index + 1,
            appID: index + 1,
            name,
            actionID: index + 1,
            xmlid: `cws_test.app_${name.toLowerCase()}`,
            webIconData: "/web/static/img/default_icon_app.png",
            children:
                name === "CRM"
                    ? [
                          {
                              id: 31,
                              appID: index + 1,
                              name: "Pipeline",
                              actionID: index + 1,
                              xmlid: "cws_test.menu_pipeline",
                          },
                      ]
                    : [],
        })),
    ],
    { mode: "replace" }
);

onRpc("has_group", () => true);

beforeEach(() => {
    redirect("/odoo/action-3");
    patchWithCleanup(transitionConfig, { disabled: true });
});

async function toggle(show) {
    getService("home_menu").toggle(show);
    await animationFrame();
    await animationFrame();
    await animationFrame();
}

test("A8 grid button toggles over the application", async () => {
    await mountWebClient();
    expect(GRID_BUTTON).toHaveCount(1);
    expect(GRID_BUTTON).not.toHaveClass(BACK_STATE);
    expect(".o_list_view").toHaveCount(1);
    // the three parts of the one button: glyph, application icon, application name
    for (const part of [".o_cws_grid_icon", ".o_menu_brand_icon", BRAND]) {
        expect(HOME_ROOT).toHaveCount(0);
        // click where the pointer lands: the application icon lets the pointer through
        const partRect = queryOne(part).getBoundingClientRect();
        const target = document.elementFromPoint(
            partRect.left + partRect.width / 2,
            partRect.top + partRect.height / 2
        );
        expect(target.closest(GRID_BUTTON)).not.toBe(null);
        await click(target);
        await animationFrame();
        await animationFrame();
        await animationFrame();
        expect(HOME_ROOT).toHaveCount(1);
        expect(GRID_BUTTON).toHaveClass(BACK_STATE);
        expect(GRID_BUTTON).not.toHaveClass("o_hidden");
        expect(GRID_BUTTON).toHaveAttribute("title", "Previous view");
        expect(GRID_BUTTON).toHaveAttribute("aria-label", "Previous view");
        expect(BRAND).toHaveClass("o_hidden");
        expect(".o_menu_brand_icon").toHaveClass("o_hidden");
        expect(".o_menu_sections").toHaveClass("o_hidden");
        expect(".o_navbar_breadcrumbs").toHaveClass("o_hidden");
        expect(BRAND).not.toBeVisible();
        await toggle(false);
        expect(HOME_ROOT).toHaveCount(0);
    }
});

test("A16 grid button shows explicitly, chevron hides explicitly", async () => {
    await mountWebClient();
    const homeMenu = getService("home_menu");
    const calls = [];
    patchWithCleanup(homeMenu, {
        toggle(show) {
            calls.push(show);
            return super.toggle(...arguments);
        },
    });
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(calls).toEqual([true]);
    expect(HOME_ROOT).toHaveCount(1);
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(calls).toEqual([true, false]);
    expect(HOME_ROOT).toHaveCount(0);
});

test("A87 clicking the application name toggles the home menu", async () => {
    let actionLoads = 0;
    onRpc("/web/action/load", () => {
        actionLoads++;
    });
    await mountWebClient();
    const menu = getService("menu");
    const selected = [];
    patchWithCleanup(menu, {
        selectMenu(...args) {
            selected.push(args);
            return super.selectMenu(...args);
        },
    });
    await toggleSearchBarMenu();
    await toggleMenuItem("Only first");
    await animationFrame();
    expect(".o_searchview_facet").toHaveCount(1);
    const loadsBefore = actionLoads;

    // one visible name, inside the button, tooltip of the whole button
    expect(BRAND).toHaveCount(1);
    expect(`${GRID_BUTTON} ${BRAND}`).toHaveCount(1);
    expect(BRAND).toHaveText("CRM");
    expect(GRID_BUTTON).toHaveAttribute("title", "Home menu");
    expect(queryOne(BRAND).closest("[title]").getAttribute("title")).toBe("Home menu");

    await contains(BRAND).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    expect(GRID_BUTTON).toHaveClass(BACK_STATE);
    expect(actionLoads).toBe(loadsBefore);
    expect(selected).toHaveLength(0);

    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_searchview_facet").toHaveCount(1);
    expect(".o_data_row").toHaveCount(1);
    expect(actionLoads).toBe(loadsBefore);

    // from a record form (two breadcrumbs) the name does not return to the start screen
    await contains(".o_data_row .o_data_cell").click();
    await animationFrame();
    expect(".o_form_view").toHaveCount(1);
    expect(".o_breadcrumb .o_back_button").toHaveCount(1);
    expect(".o_last_breadcrumb_item").toHaveCount(1);
    await contains(BRAND).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    expect(selected).toHaveLength(0);
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(".o_form_view").toHaveCount(1);
});

test("A9 back chevron restores the filtered application", async () => {
    await mountWebClient();
    await toggleSearchBarMenu();
    await toggleMenuItem("Only first");
    await animationFrame();
    expect(".o_searchview_facet").toHaveCount(1);
    expect(".o_data_row").toHaveCount(1);

    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_searchview_facet").toHaveCount(1);
    expect(".o_data_row").toHaveCount(1);
    expect(BRAND).not.toHaveClass("o_hidden");
    expect(GRID_BUTTON).toHaveAttribute("title", "Home menu");

    // same restoration with Escape
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    await press("Escape");
    await animationFrame();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(0);
    expect(".o_searchview_facet").toHaveCount(1);
    expect(".o_data_row").toHaveCount(1);
});

test("A10 no grid button with nothing behind", async () => {
    redirect("/odoo");
    await mountWebClient();
    expect(HOME_ROOT).toHaveCount(1);
    expect(GRID_BUTTON).toHaveClass("o_hidden");
    expect(GRID_BUTTON).not.toBeVisible();
});

test("A16 failed start-up keeps the grid button", async () => {
    redirect("/odoo/action-9999");
    expect.errors(1);
    onRpc("/web/action/load", () => {
        throw new Error("boom");
    });
    await mountWebClient();
    await animationFrame();
    expect(GRID_BUTTON).not.toHaveClass("o_hidden");
    expect(GRID_BUTTON).toBeVisible();
    await contains(GRID_BUTTON).click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(1);
    expect.verifyErrors(["RPC_ERROR: boom"]);
});

test("S4 brand and grid button", async () => {
    await mountWebClient();
    expect(".o_menu_brand_icon").toHaveCount(1);
    expect(".o_menu_brand_icon").not.toHaveClass("o_hidden");
    expect(BRAND).toHaveText("CRM");
    expect(GRID_BUTTON).toHaveAttribute("accesskey", "h");
    expect(GRID_BUTTON).toHaveAttribute("data-hotkey", "h");
    expect(GRID_BUTTON).toHaveAttribute("title", "Home menu");
    expect(GRID_BUTTON).toHaveAttribute("aria-label", "Home menu");
    expect(".o_menu_toggle svg rect").toHaveCount(9);
    const { height } = queryOne(".o_menu_toggle").getBoundingClientRect();
    expect(height).toBe(26);
    expect(getComputedStyle(queryOne(".o_menu_toggle")).borderRadius).toBe("6px");
});

test("S4 grid button visible", async () => {
    await mountWebClient();
    const button = queryOne(".o_menu_toggle");
    const rect = button.getBoundingClientRect();
    expect(rect.width).toBe(94);
    expect(rect.height).toBe(26);
    const icon = queryOne(".o_menu_toggle .o_cws_grid_icon");
    const iconRect = icon.getBoundingClientRect();
    expect(getComputedStyle(icon).display).not.toBe("none");
    expect(iconRect.width).toBe(14);
    expect(iconRect.height).toBe(14);
    const brandIcon = queryOne(".o_menu_brand_icon").getBoundingClientRect();
    expect(brandIcon.width).toBe(26);
    expect(brandIcon.height).toBe(26);
    // the application icon covers the left part of the button, 12 px in
    expect(Math.abs(brandIcon.left - rect.left - 12)).toBeLessThan(1);
    // at rest the grid is hidden; the rule that reveals it is checked below
    expect(getComputedStyle(icon).opacity).toBe("0");
    const name = queryOne(".o_menu_brand");
    const nameRect = name.getBoundingClientRect();
    expect(nameRect.width).toBeGreaterThan(0);
    expect(Math.round(nameRect.left - rect.left)).toBe(46);
    expect(getComputedStyle(name).fontSize).toBe("16.8px");
    expect(getComputedStyle(name).marginLeft).toBe("15px");
    // the name belongs to the button, inside its box
    expect(queryOne(`${GRID_BUTTON} ${BRAND}`)).toBe(name);
    expect(nameRect.right).toBeLessThan(rect.right + 0.5);
});

test("S4 grid revealed on focus", async () => {
    await mountWebClient();
    const icon = queryOne(".o_menu_toggle .o_cws_grid_icon");
    expect(getComputedStyle(icon).opacity).toBe("0");
    // Hoot cannot apply :hover or :focus-visible, so the reveal is checked as a rule
    const rules = [...document.styleSheets].flatMap((sheet) => {
        try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
            return [];
        }
    });
    const reveal = rules.filter(
        (text) => text.includes("focus-visible") && text.includes(".o_cws_grid_icon")
    );
    expect(reveal.length).toBeGreaterThan(0);
    expect(reveal.some((text) => text.includes("opacity: 1"))).toBe(true);
});

test("A18 scoped app link", async () => {
    mockService("pwa", () => ({
        isScopedApp: true,
        startUrl: "/scoped_app/crm",
        canPromptToInstall: false,
        isAvailable: false,
        isSupportedOnBrowser: false,
        hasScopeBeenInstalled: () => false,
        decline() {},
        show() {},
        getManifest() {},
    }));
    await mountWebClient();
    expect("a.o_cws_scoped_link").toHaveCount(1);
    expect("a.o_cws_scoped_link").toHaveAttribute("href", "/scoped_app/crm");
    expect("a.o_cws_scoped_link").toHaveText("CRM");
    expect("a.o_cws_scoped_link .o_menu_brand_icon").toHaveCount(1);
    expect("button.o_menu_toggle").toHaveCount(0);
    // never toggles the home menu
    queryOne("a.o_cws_scoped_link").addEventListener("click", (ev) => ev.preventDefault());
    await contains("a.o_cws_scoped_link").click();
    await animationFrame();
    expect(HOME_ROOT).toHaveCount(0);
    expect(getService("home_menu").hasHomeMenu).toBe(false);
});

test("section weight", async () => {
    await mountWebClient();
    const button = queryOne(".o_menu_sections .o_nav_entry, .o_menu_sections .dropdown-toggle");
    expect(getComputedStyle(button).fontWeight).toBe("400");
});

test("R15 navbar transparent while the home menu is shown", async () => {
    await mountWebClient();
    await toggle(true);
    expect(document.body).toHaveClass(BG_CLASS);
    expect(getComputedStyle(queryOne(".o_main_navbar")).backgroundColor).toBe(
        "rgba(0, 0, 0, 0)"
    );
});

test("R15 entries read as body text on the home menu", async () => {
    await mountWebClient();
    const entry = () =>
        getComputedStyle(
            queryAll(".o_menu_systray .o_nav_entry, .o_menu_systray .dropdown-toggle")[0]
        ).color;
    const inApp = entry();
    await toggle(true);
    const onHome = entry();
    // 001b R5/R6: the bar is the page, so its entries read as body text inside an application too
    expect(inApp).toBe(getComputedStyle(document.body).color);
    expect(onHome).toBe(getComputedStyle(document.body).color);
    expect(getComputedStyle(queryOne(".o_menu_toggle")).color).toBe(
        getComputedStyle(document.body).color
    );
});

describe("mobile", () => {
    beforeEach(async () => {
        await resize({ width: 390, height: 844 });
    });

    test("A42 mobile sidebar and All Apps", async () => {
        await mountWebClient();
        expect("a.o_menu_toggle").toHaveCount(1);
        expect(queryAll(".o_app_menu_sidebar", body)).toHaveCount(0);
        await contains("a.o_menu_toggle").click();
        await animationFrame();
        expect(queryAll(".o_app_menu_sidebar", body)).toHaveCount(1);
        await contains(".o_app_menu_sidebar .o_sidebar_topbar a.btn-primary", body).click();
        await animationFrame();
        await animationFrame();
        expect(HOME_ROOT).toHaveCount(1);
        expect(queryAll(".o_app_menu_sidebar", body)).toHaveCount(0);
        expect("a.o_menu_toggle").toHaveClass(BACK_STATE);
        expect("a.o_menu_toggle").toHaveAttribute("title", "Previous view");
        // the back state draws the chevron of the desktop button, not a font glyph
        expect("a.o_menu_toggle svg.o_cws_back_icon").toHaveCount(1);
        expect("a.o_menu_toggle i").toHaveCount(0);
        await contains("a.o_menu_toggle").click();
        await animationFrame();
        await animationFrame();
        expect(HOME_ROOT).toHaveCount(0);
        expect(".o_list_view").toHaveCount(1);
        expect(queryAll(".o_app_menu_sidebar", body)).toHaveCount(0);
    });

    test("A43 burger without current app on the home menu", async () => {
        const burgers = [];
        patchWithCleanup(CwsBurgerMenu.prototype, {
            setup() {
                super.setup(...arguments);
                burgers.push(this);
            },
        });
        await mountWebClient();
        expect(burgers).toHaveLength(1);
        const [burger] = burgers;
        expect(burger).toBeInstanceOf(BurgerMenu);
        expect(registry.category("systray").get("burger_menu").Component).toBe(CwsBurgerMenu);
        expect(burger.currentApp.name).toBe("CRM");
        await toggle(true);
        // the media query of the toggle follows the real window, not the mocked width
        queryOne(".o_mobile_menu_toggle", body).click();
        await animationFrame();
        expect(queryAll(".o_burger_menu", body)).toHaveCount(1);
        expect(burger.currentApp).toBe(null);
    });
});

test("A83 help entry untouched", async () => {
    patchWithCleanup(session, { support_url: "https://help.example.test/doc" });
    await mountWebClient();
    const expected = registry.category("user_menuitems").get("support")(getMockEnv()).href;
    await contains(".o_user_menu").click();
    const link = queryAll(".o-dropdown--menu a, .o-dropdown--menu .dropdown-item").find((el) =>
        el.textContent.includes("Help")
    );
    expect(link.getAttribute("href")).toBe(expected);
});
