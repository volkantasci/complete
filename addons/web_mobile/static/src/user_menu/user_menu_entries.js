// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
// the Community entries are registered by this module; load it first
import "@web/webclient/user_menu/user_menu_items";
import { cwmDetectedHost } from "@web_mobile/bridge/bridge_service";

/** The two menu labels the spec prescribes. */
const cwmLabels = {
    get shortcut() {
        return _t("Add to Home Screen");
    },
    get switchAccount() {
        return _t("Switch/Add Account");
    },
};

const CWM_DATA_URL = /^data:[^,;]*;base64,(.+)$/s;

/**
 * Base64 part of an image data URL, or null when the application menu has no image icon
 * (glyph icon, default placeholder address, no icon).
 *
 * @param {string|false|null|undefined} webIconData
 */
export function cwmIconBase64(webIconData) {
    const match = typeof webIconData === "string" && CWM_DATA_URL.exec(webIconData);
    return match ? match[1] : null;
}

function cwmWarn(env, message) {
    env.services.notification.add(message, { type: "warning" });
}

/** "Add to Home Screen" entry (R4, R5). */
export function cwmShortcutEntry(env) {
    return {
        type: "item",
        id: "web_mobile.shortcut",
        description: cwmLabels.shortcut,
        sequence: 100,
        callback() {
            const { menu, home_menu: home, mobile } = env.services;
            const app = home?.hasHomeMenu ? null : menu.getCurrentApp();
            if (!app) {
                cwmWarn(
                    env,
                    _t("Open an app first: the main menu can't be pinned to your home screen.")
                );
                return;
            }
            const icon = cwmIconBase64(app.webIconData);
            if (!icon) {
                cwmWarn(
                    env,
                    _t("This app has no image icon, so it can't be pinned to your home screen.")
                );
                return;
            }
            // the answer is not awaited; the page stays as it is
            mobile
                .addHomeShortcut({
                    title: document.title,
                    shortcut_url: window.location.href,
                    web_icon: icon,
                })
                .catch((error) => console.warn("[cwm] adding the shortcut failed", error));
        },
    };
}

/** "Switch/Add Account" entry (R6). */
export function cwmSwitchEntry(env) {
    return {
        type: "item",
        id: "web_mobile.switch",
        description: cwmLabels.switchAccount,
        sequence: 100,
        callback() {
            env.services.mobile
                .switchAccount()
                .catch((error) => console.warn("[cwm] switching the account failed", error));
        },
    };
}

/**
 * Register the entries the app lists, in the order shortcut, switch; and take the log-out
 * entry away when the app switches accounts.
 *
 * @param {ReturnType<typeof registry.category>} menuItems
 * @param {{active: boolean, actions: Map<string, string>}} host
 */
export function cwmRegisterUserMenuEntries(menuItems, host) {
    if (!host.active) {
        return;
    }
    if (host.actions.has("addHomeShortcut")) {
        menuItems.add("web_mobile.shortcut", cwmShortcutEntry);
    }
    if (host.actions.has("switchAccount")) {
        menuItems.add("web_mobile.switch", cwmSwitchEntry);
        if (menuItems.contains("log_out")) {
            menuItems.remove("log_out");
        }
    }
}

cwmRegisterUserMenuEntries(registry.category("user_menuitems"), cwmDetectedHost());
