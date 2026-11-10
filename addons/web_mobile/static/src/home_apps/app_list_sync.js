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
 * Send the list to the app, but only when it differs from the last one sent in this page's life.
 */
export function cwmAppListSender(mobile) {
    let last = null;
    return function cwmSendAppList({ apps }) {
        if (!mobile.has("updateAvailableApps")) {
            return;
        }
        const list = cwmBuildAppList(apps);
        const text = JSON.stringify(list);
        if (text === last) {
            return;
        }
        last = text;
        mobile
            .updateAvailableApps(list)
            .catch((error) => console.warn("[cwm] the app refused the application list", error));
    };
}

export const cwmAppListSyncService = {
    dependencies: ["mobile"],
    start(env, { mobile }) {
        if (mobile.has("updateAvailableApps")) {
            const send = cwmAppListSender(mobile);
            env.bus.addEventListener("HOME-MENU:APPS-UPDATED", (ev) => send(ev.detail));
        }
    },
};

registry.category("services").add("cwm_app_list_sync", cwmAppListSyncService);
