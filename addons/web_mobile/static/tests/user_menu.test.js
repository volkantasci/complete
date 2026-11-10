// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { Registry } from "@web/core/registry";
import { patchTranslations } from "@web/../tests/web_test_helpers";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import {
    cwmIconBase64,
    cwmRegisterUserMenuEntries,
} from "@web_mobile/user_menu/user_menu_entries";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";

describe.current.tags("headless");

const plugin = (name, action = name) => ({ name, action });
const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** Community-like registry, the app's list applied, the entries read as the menu reads them. */
function setup({ plugins, app = { webIconData: PNG, webIcon: "" }, home = false } = {}) {
    patchTranslations();
    const fake = installCwmHost({ plugins, win: {} });
    const detection = cwmDetectHost(fake.win);
    const menuItems = new Registry();
    menuItems.add("support", () => ({ sequence: 20 }));
    menuItems.add("preferences", () => ({ sequence: 50 }));
    menuItems.add("log_out", () => ({ sequence: 70 }));
    cwmRegisterUserMenuEntries(menuItems, detection);
    const notes = [];
    const env = {
        services: {
            mobile: cwmMakeBridge(detection),
            menu: { getCurrentApp: () => app },
            home_menu: { hasHomeMenu: home },
            notification: {
                add: (message, options) => notes.push({ message: String(message), options }),
            },
        },
    };
    const entries = menuItems.getAll().map((make) => make(env));
    const find = (id) => entries.find((entry) => entry.id === id);
    return { ...fake, menuItems, env, notes, entries, find };
}

const both = [plugin("addHomeShortcut", "act_short"), plugin("switchAccount", "act_switch")];

test("A5 without shortcut: switch shown, shortcut and log out hidden", () => {
    const { menuItems } = setup({ plugins: [plugin("switchAccount")] });
    expect(menuItems.contains("web_mobile.switch")).toBe(true);
    expect(menuItems.contains("web_mobile.shortcut")).toBe(false);
    expect(menuItems.contains("log_out")).toBe(false);
});

test("A5 without switch: shortcut and log out shown", () => {
    const { menuItems } = setup({ plugins: [plugin("addHomeShortcut")] });
    expect(menuItems.contains("web_mobile.shortcut")).toBe(true);
    expect(menuItems.contains("web_mobile.switch")).toBe(false);
    expect(menuItems.contains("log_out")).toBe(true);
});

test("A10 no host: log out, no app entries", () => {
    const menuItems = new Registry();
    menuItems.add("log_out", () => ({}));
    cwmRegisterUserMenuEntries(menuItems, cwmDetectHost({}));
    expect(menuItems.getEntries().map(([key]) => key)).toEqual(["log_out"]);
});

test("order: preferences, shortcut, switch at the end", () => {
    const { entries } = setup({ plugins: both });
    const sorted = entries
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.sequence - b.entry.sequence || a.index - b.index)
        .map(({ entry }) => entry);
    expect(entries.find((e) => e.id === "web_mobile.shortcut").sequence).toBe(100);
    expect(entries.find((e) => e.id === "web_mobile.switch").sequence).toBe(100);
    expect(sorted.slice(-2).map((entry) => entry.id)).toEqual([
        "web_mobile.shortcut",
        "web_mobile.switch",
    ]);
    expect(sorted.at(-3).sequence).toBe(50);
});

test("labels", () => {
    const { find } = setup({ plugins: both });
    expect(String(find("web_mobile.shortcut").description)).toBe("Add to Home Screen");
    expect(String(find("web_mobile.switch").description)).toBe("Switch/Add Account");
});

test("A11 shortcut sends title, full address, icon base64", async () => {
    const { find, calls, notes } = setup({ plugins: both });
    find("web_mobile.shortcut").callback();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe("act_short");
    expect(calls[0].args).toEqual({
        title: document.title,
        shortcut_url: window.location.href,
        web_icon: "iVBORw0KGgo=",
    });
    expect(notes).toHaveLength(0);
});

test("A12 no current app: warning, no request", () => {
    for (const setupOptions of [{ app: null }, { home: true }]) {
        const { find, calls, notes } = setup({ plugins: both, ...setupOptions });
        find("web_mobile.shortcut").callback();
        expect(calls).toHaveLength(0);
        expect(notes).toEqual([
            {
                message: "Open an app first: the main menu can't be pinned to your home screen.",
                options: { type: "warning" },
            },
        ]);
    }
});

test("A13 glyph icon and no icon: warning, no request", () => {
    const apps = [
        { webIconData: false, webIcon: "fa fa-rocket,#fff,#333" },
        { webIconData: false, webIcon: false },
        { webIconData: "/web/static/img/default_icon_app.png", webIcon: "" },
    ];
    for (const app of apps) {
        const { find, calls, notes } = setup({ plugins: both, app });
        find("web_mobile.shortcut").callback();
        expect(calls).toHaveLength(0);
        expect(notes).toEqual([
            {
                message: "This app has no image icon, so it can't be pinned to your home screen.",
                options: { type: "warning" },
            },
        ]);
    }
});

test("A14 switch sends no args, page unchanged", () => {
    const { find, calls, notes } = setup({ plugins: both });
    const before = window.location.href;
    find("web_mobile.switch").callback();
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe("act_switch");
    expect(calls[0].args).toEqual({});
    expect(notes).toHaveLength(0);
    expect(window.location.href).toBe(before);
});

test("icon base64 helper", () => {
    expect(cwmIconBase64(PNG)).toBe("iVBORw0KGgo=");
    expect(cwmIconBase64("data:image/svg+xml;base64,PHN2Zz4=")).toBe("PHN2Zz4=");
    expect(cwmIconBase64("/web/static/img/default_icon_app.png")).toBe(null);
    expect(cwmIconBase64(false)).toBe(null);
});
