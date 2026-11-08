// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, mockDate, test } from "@odoo/hoot";
import { animationFrame, queryAll, queryAllTexts, queryFirst, resize } from "@odoo/hoot";
import {
    contains,
    mockOffline,
    mountWithCleanup,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { user } from "@web/core/user";
import { session } from "@web/session";

import { HomeMenu, tileHref, tileIcon } from "@web_enterprise/home_menu/home_menu";

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

function makeApps(overrides = {}) {
    return NAMES.map((name, index) => ({
        id: index + 1,
        xmlid: `cws_test.app_${name.toLowerCase().replace(/\W/g, "")}`,
        name,
        actionID: 100 + index,
        actionPath: false,
        webIcon: false,
        webIconData: "/web/static/img/default_icon_app.png",
        ...(overrides[index] || {}),
    }));
}

async function mountHome({ apps = makeApps(), onOpenApp = () => {} } = {}) {
    return mountWithCleanup(HomeMenu, { props: { apps, onOpenApp } });
}

function setMessage(value, { isSystem = false } = {}) {
    patchWithCleanup(session, { sysadmin_message: value });
    patchWithCleanup(user, { isSystem });
}

test("A3 one tile per app in order", async () => {
    await mountHome();
    expect(".o_apps .o_app").toHaveCount(11);
    expect(queryAllTexts(".o_app .o_caption")).toEqual(NAMES);
});

test("A3b the saved order is applied", async () => {
    patchWithCleanup(user, {
        settings: { homemenu_config: JSON.stringify(["cws_test.app_discuss"]) },
    });
    await mountHome();
    const texts = queryAllTexts(".o_app .o_caption");
    expect(texts).toHaveLength(11);
    expect(texts.at(-1)).toBe("Discuss");
    expect(texts[0]).toBe("Calendar");
});

test("A5 tiles are links", async () => {
    await mountHome();
    const apps = makeApps();
    queryAll(".o_app").forEach((el, index) => {
        expect(el.getAttribute("href")).toBe(`/odoo/action-${apps[index].actionID}`);
        expect(el.dataset.menuXmlid).toBe(apps[index].xmlid);
    });
});

test("A76 tile link format", async () => {
    expect(tileHref({ actionPath: "crm", actionID: 12 }, "")).toBe("/odoo/crm");
    expect(tileHref({ actionPath: false, actionID: 12 }, "")).toBe("/odoo/action-12");
    expect(tileHref({ actionPath: "crm", actionID: 12 }, "1")).toBe("/odoo/crm?debug=1");
    expect(tileHref({ actionID: 12 }, "assets")).toBe("/odoo/action-12?debug=assets");
    await mountHome({ apps: makeApps({ 4: { actionPath: "crm" } }) });
    expect(queryAll(".o_app")[4]).toHaveAttribute("href", "/odoo/crm");
});

test("A76b debug mode is appended to the link", async () => {
    patchWithCleanup(odoo, { debug: "1" });
    await mountHome();
    expect(queryAll(".o_app")[0]).toHaveAttribute("href", "/odoo/action-100?debug=1");
});

test("A68 missing icon image", async () => {
    await mountHome({
        apps: makeApps({
            0: { webIconData: false, webIcon: "fa-cube,#fff,#123" },
            1: { webIconData: false, webIcon: "fa-cube,#fff" },
            2: { webIconData: "data:image/png;base64,AAAA" },
        }),
    });
    const [glyph, fallback, image, other] = queryAll(".o_app .o_app_icon");
    expect(glyph.tagName).toBe("DIV");
    expect(glyph.getAttribute("style")).toInclude("rgb(17, 34, 51)");
    expect(glyph.querySelector("i")).toHaveAttribute("data-icon", "fa-cube");
    expect(glyph.querySelector("i").getAttribute("style")).toInclude("rgb(255, 255, 255)");
    expect(fallback.tagName).toBe("IMG");
    expect(image.tagName).toBe("IMG");
    expect(other.tagName).toBe("IMG");
    // Hoot replaces image sources, so the sources are checked on the description
    expect(tileIcon({ webIcon: "fa-cube,#fff", webIconData: false })).toEqual({
        kind: "default",
        src: "/web/static/img/default_icon_app.png",
    });
    expect(tileIcon({ webIconData: "data:image/png;base64,AAAA" })).toEqual({
        kind: "image",
        src: "data:image/png;base64,AAAA",
    });
    expect(tileIcon({ webIcon: "a,b,", webIconData: false }).kind).toBe("default");
    expect(tileIcon({ webIcon: false, webIconData: false }).kind).toBe("default");
});

test("A6 row pitch", async () => {
    await resize({ width: 1366 });
    await mountHome();
    expect(getComputedStyle(queryFirst(".o_apps")).rowGap).toBe("15px");
    const tiles = queryAll(".o_apps .o_draggable");
    const pitch = tiles[6].getBoundingClientRect().top - tiles[0].getBoundingClientRect().top;
    expect(pitch).toBe(130);
});

test("A67 user with no application", async () => {
    await mountHome({ apps: [] });
    expect(".o_apps").toHaveCount(0);
    expect(".o_home_menu_search_input").toHaveAttribute("aria-expanded", "false");
});

test("A48 message for all users", async () => {
    setMessage({ message: "<p>Maintenance <b>tonight</b></p>", warning_type: "user" });
    await mountHome();
    expect(".o_cws_admin_message").toHaveCount(1);
    expect(".o_cws_admin_message b").toHaveText("tonight");
});

test("A49 message for administrators", async () => {
    setMessage({ message: "<p>Hello</p>", warning_type: "admin" }, { isSystem: true });
    await mountHome();
    expect(".o_cws_admin_message").toHaveCount(1);
});

test("A49b administrator message hidden from other users", async () => {
    setMessage({ message: "<p>Hello</p>", warning_type: "admin" }, { isSystem: false });
    await mountHome();
    expect(".o_cws_admin_message").toHaveCount(0);
});

test("A50 no message", async () => {
    setMessage(undefined);
    await mountHome();
    expect(".o_cws_admin_message").toHaveCount(0);
    expect(".o_apps .o_app").toHaveCount(11);
});

test("A50b malformed message", async () => {
    for (const value of [
        { message: "", warning_type: "user" },
        { message: "   ", warning_type: "user" },
        { message: "x" },
        { warning_type: "user" },
        { message: "x", warning_type: "other" },
        { message: 5, warning_type: "user" },
        "text",
        null,
    ]) {
        setMessage(value, { isSystem: true });
        const component = await mountHome();
        expect(".o_cws_admin_message").toHaveCount(0);
        expect(component.adminMessage).toBe(null);
    }
});

test("A82 no time condition", async () => {
    setMessage({ message: "<p>Still here</p>", warning_type: "user" });
    mockDate("2027-11-08 10:00:00");
    await mountHome();
    expect(".o_cws_admin_message").toHaveCount(1);
});

test("A39 offline dimming", async () => {
    const setOffline = mockOffline();
    patchWithCleanup(OfflinePlugin.prototype, {
        isAvailableOffline(actionId) {
            return actionId === 104;
        },
    });
    const opened = [];
    await mountHome({ onOpenApp: (app) => opened.push(app.name) });
    expect(".o_app.o_disabled_offline").toHaveCount(0);
    await setOffline(true);
    await animationFrame();
    expect(".o_app.o_disabled_offline").toHaveCount(10);
    expect(queryAll(".o_app")[4]).not.toHaveClass("o_disabled_offline");
    await contains(".o_app:eq(0)").click();
    expect(opened).toEqual(["Discuss"]);
});

test("A44 iOS list layout", async () => {
    patchWithCleanup(navigator, { userAgent: "Mozilla/5.0 OdooMobile (iOS)" });
    await mountHome();
    expect(".o_home_menu").not.toHaveClass("o_cws_ios_list");
    await resize({ width: 390 });
    await animationFrame();
    expect(".o_home_menu").toHaveClass("o_cws_ios_list");
});

test("A44b no list layout outside the iOS app", async () => {
    patchWithCleanup(navigator, { userAgent: "Mozilla/5.0 Firefox" });
    await mountHome();
    await resize({ width: 390 });
    await animationFrame();
    expect(".o_home_menu").not.toHaveClass("o_cws_ios_list");
});

test("a11y roles", async () => {
    const component = await mountHome();
    expect(".o_apps").toHaveAttribute("role", "listbox");
    expect(".o_app[role=option]").toHaveCount(11);
    expect(queryAll(".o_app")[3]).toHaveAttribute("id", "result_app_3");
    const input = queryFirst(".o_home_menu_search_input");
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("placeholder", "Search for a menu...");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    component.state.focusedIndex = 2;
    await animationFrame();
    expect(input).toHaveAttribute("aria-activedescendant", "result_app_2");
    expect(queryAll(".o_app")[2]).toHaveClass("o_focused");
});
