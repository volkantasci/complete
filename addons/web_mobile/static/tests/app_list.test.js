// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { EventBus } from "@odoo/owl";
import { tileHref } from "@web_enterprise/home_menu/home_menu";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import { cwmAppListSyncService, cwmBuildAppList } from "@web_mobile/home_apps/app_list_sync";

describe.current.tags("headless");

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const app = (name, extra = {}) => ({
    xmlid: `cwm.${name}`,
    name,
    label: name,
    href: `/odoo/${name.toLowerCase()}`,
    webIconData: PNG,
    ...extra,
});

/**
 * Start the sync service on a bus; `trigger(apps)` plays the home menu's list event,
 * `toggle(shown)` its display event, `display(apps)` a build followed by the display.
 */
function setup({ plugins = [{ name: "updateAvailableApps", action: "cwm_apps" }] } = {}) {
    const fake = installCwmHost({ plugins, win: {} });
    const mobile = cwmMakeBridge(cwmDetectHost(fake.win));
    const bus = new EventBus();
    cwmAppListSyncService.start({ bus }, { mobile });
    const trigger = (apps) => bus.trigger("HOME-MENU:APPS-UPDATED", { apps });
    const toggle = (shown) => bus.trigger("HOME-MENU:TOGGLED", shown);
    const display = (apps) => {
        trigger(apps);
        toggle(true);
    };
    const sent = () => fake.calls.filter((call) => call.action === "cwm_apps");
    return { ...fake, trigger, toggle, display, sent };
}

test("A15 first display sends the ordered list", () => {
    const { display, sent } = setup();
    display([app("Discuss"), app("CRM")]);
    expect(sent().length).toBe(1);
    expect(sent()[0].args).toEqual([
        { xmlid: "cwm.Discuss", link: "/odoo/discuss", name: "Discuss", pngIcon: "iVBORw0KGgo=" },
        { xmlid: "cwm.CRM", link: "/odoo/crm", name: "CRM", pngIcon: "iVBORw0KGgo=" },
    ]);
});

test("A16 the same list is not sent again", () => {
    const { display, toggle, sent } = setup();
    display([app("Discuss"), app("CRM")]);
    toggle(false);
    display([app("Discuss"), app("CRM")]);
    toggle(false);
    display([app("Discuss"), app("CRM")]);
    expect(sent().length).toBe(1);
});

test("A17 a new order is sent at the next display", () => {
    const { display, toggle, sent } = setup();
    display([app("Discuss"), app("CRM")]);
    toggle(false);
    display([app("CRM"), app("Discuss")]);
    expect(sent().length).toBe(2);
    expect(sent()[1].args.map((entry) => entry.name)).toEqual(["CRM", "Discuss"]);
});

test("test_001e_a5_list_sent_at_next_display", () => {
    const { display, trigger, toggle, sent } = setup();
    display([app("Discuss"), app("CRM")]);
    expect(sent().length).toBe(1);
    // a drop while the home menu is shown: the list event fires, nothing is sent
    trigger([app("CRM"), app("Discuss")]);
    expect(sent().length).toBe(1);
    // leaving the home menu sends nothing either
    toggle(false);
    expect(sent().length).toBe(1);
    // the next display sends the latest list
    display([app("CRM"), app("Discuss")]);
    expect(sent().length).toBe(2);
    expect(sent()[1].args.map((entry) => entry.name)).toEqual(["CRM", "Discuss"]);
    // E1: dropped away and back to where it was, so the next display sends nothing
    toggle(false);
    display([app("CRM"), app("Discuss")]);
    trigger([app("Discuss"), app("CRM")]);
    trigger([app("CRM"), app("Discuss")]);
    toggle(false);
    display([app("CRM"), app("Discuss")]);
    expect(sent().length).toBe(2);
});

test("test_001e_a5 the list that came after the display signal is still sent once", () => {
    const { trigger, toggle, sent } = setup();
    toggle(true);
    trigger([app("Discuss")]);
    expect(sent().length).toBe(1);
});

test("A18 glyph and svg icons give null, action without path gives action-<id>", () => {
    const list = cwmBuildAppList([
        app("Glyph", { webIconData: false }),
        app("Svg", { webIconData: "data:image/svg+xml;base64,PHN2Zy8+" }),
        app("Placeholder", { webIconData: "/web/static/img/default_icon_app.png" }),
        app("Plain", { href: tileHref({ actionID: 42 }) }),
    ]);
    expect(list.map((entry) => entry.pngIcon)).toEqual([null, null, null, "iVBORw0KGgo="]);
    expect(list[3].link).toBe("/odoo/action-42");
    expect(tileHref({ actionPath: "crm", actionID: 1 })).toBe("/odoo/crm");
});

test("no application list capability: nothing is sent", () => {
    const { display, calls } = setup({ plugins: [{ name: "switchAccount", action: "x" }] });
    display([app("CRM")]);
    expect(calls.length).toBe(0);
});
