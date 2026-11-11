// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

const CWM_PNG_PREFIX = "data:image/png;base64,";

/** The list the app expects, built from the detail of the home menu's event. */
export function cwmBuildAppList(apps) {
    return apps.map((app) => ({
        xmlid: app.xmlid,
        link: app.href,
        name: app.label,
        pngIcon:
            typeof app.webIconData === "string" && app.webIconData.startsWith(CWM_PNG_PREFIX)
                ? app.webIconData.slice(CWM_PNG_PREFIX.length)
                : null,
    }));
}

/**
 * Keeps the latest list the home menu announced and sends it when the home menu is next
 * displayed, but only when it differs from the last list sent in this page's life.
 * `update` takes the detail of the list event, `display` plays the "home menu shown" event.
 */
export function cwmAppListSender(mobile) {
    let last = null;
    let latest = null;
    let shown = false;
    function flush() {
        if (latest === null || !mobile.has("updateAvailableApps")) {
            return;
        }
        const text = JSON.stringify(latest);
        if (text === last) {
            return;
        }
        last = text;
        mobile
            .updateAvailableApps(latest)
            .catch((error) => console.warn("[cwm] the app refused the application list", error));
    }
    return {
        update({ apps }) {
            latest = cwmBuildAppList(apps);
            // the very first list is not held back when the display signal came first
            if (shown && last === null) {
                flush();
            }
        },
        display(isShown) {
            shown = !!isShown;
            if (shown) {
                flush();
            }
        },
    };
}

export const cwmAppListSyncService = {
    dependencies: ["mobile"],
    start(env, { mobile }) {
        if (mobile.has("updateAvailableApps")) {
            const send = cwmAppListSender(mobile);
            env.bus.addEventListener("HOME-MENU:APPS-UPDATED", (ev) => send.update(ev.detail));
            env.bus.addEventListener("HOME-MENU:TOGGLED", (ev) => send.display(ev.detail));
        }
    },
};

registry.category("services").add("cwm_app_list_sync", cwmAppListSyncService);
