// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { parseSearchQuery } from "@web/core/browser/router";
import { registry } from "@web/core/registry";

/**
 * Tell the app about the query parameters at each history move whose query differs from the
 * previous history move's (the first one always counts). Returns a function that stops it.
 *
 * @param {object} mobile the bridge service value
 * @param {Window} [win]
 */
export function cwmInstallNavigationNotice(mobile, win = window) {
    if (!mobile.has("hashChange")) {
        return () => {};
    }
    let lastSearch = undefined;
    const onMove = () => {
        const search = win.location.search;
        if (search === lastSearch) {
            return;
        }
        lastSearch = search;
        mobile
            .hashChange(parseSearchQuery(search))
            .catch((error) => console.warn("[cwm] the app refused the navigation notice", error));
    };
    win.addEventListener("popstate", onMove);
    return () => win.removeEventListener("popstate", onMove);
}

export const cwmNavigationNoticeService = {
    dependencies: ["mobile"],
    start(env, { mobile }) {
        cwmInstallNavigationNotice(mobile);
    },
};

registry.category("services").add("cwm_navigation_notice", cwmNavigationNoticeService);
