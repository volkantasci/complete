// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser, location } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";

const COOKIE_NAME = "color_scheme";
// Own sessionStorage key: holds the scheme we already reloaded for, so a
// cookie that cannot be written never makes the page reload forever.
const RELOAD_GUARD_KEY = "cws_scheme_reloaded";

/**
 * @param {string|undefined} preference "light", "dark" or "system" (or missing)
 * @param {boolean} prefersDark the operating system asks for a dark scheme
 * @returns {"light"|"dark"}
 */
export function effectiveScheme(preference, prefersDark) {
    if (preference === "light" || preference === "dark") {
        return preference;
    }
    return prefersDark ? "dark" : "light";
}

export const colorSchemeService = {
    start() {
        const prefersDark = browser.matchMedia("(prefers-color-scheme: dark)").matches;
        const effective = effectiveScheme(user.settings.color_scheme, prefersDark);
        const remembered = cookie.get(COOKIE_NAME);
        const api = {
            get activeScheme() {
                return effective;
            },
        };
        if (remembered === effective) {
            browser.sessionStorage.removeItem(RELOAD_GUARD_KEY);
            return api;
        }
        cookie.set(COOKIE_NAME, effective);
        const needsReload = remembered !== undefined || effective === "dark";
        if (needsReload && browser.sessionStorage.getItem(RELOAD_GUARD_KEY) !== effective) {
            browser.sessionStorage.setItem(RELOAD_GUARD_KEY, effective);
            // The `location` export of the browser module, so tests can mock it.
            location.reload();
            // Never resolves: the web client must not be drawn with the wrong scheme.
            return new Promise(() => {});
        }
        return api;
    },
};

registry.category("services").add("color_scheme", colorSchemeService);
