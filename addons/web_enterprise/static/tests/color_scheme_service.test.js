// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, mockMatchMedia, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { browser, location } from "@web/core/browser/browser";
import { cookie } from "@web/core/browser/cookie";
import { _makeUser, user } from "@web/core/user";

import {
    colorSchemeService,
    effectiveScheme,
} from "@web_enterprise/color_scheme/color_scheme_service";

describe.current.tags("headless");

const GUARD_KEY = "cws_scheme_reloaded";

/**
 * Set the conditions of one page start, then start the service.
 *
 * @param {{ preference?: string, prefersDark?: boolean, remembered?: string, guard?: string }} options
 * @returns {{ started: Promise<any>, settled: () => boolean }}
 */
function startService({ preference, prefersDark = false, remembered, guard } = {}) {
    const settings = preference === undefined ? {} : { color_scheme: preference };
    patchWithCleanup(user, _makeUser({ user_settings: settings }));
    mockMatchMedia({ "prefers-color-scheme": prefersDark ? "dark" : "light" });
    // the Hoot cookie jar starts empty in every test and ignores deletions
    if (remembered !== undefined) {
        cookie.set("color_scheme", remembered);
    }
    browser.sessionStorage.removeItem(GUARD_KEY);
    if (guard !== undefined) {
        browser.sessionStorage.setItem(GUARD_KEY, guard);
    }
    patchWithCleanup(location, {
        reload() {
            expect.step("reload");
        },
    });
    let settled = false;
    const started = Promise.resolve(colorSchemeService.start({})).then((value) => {
        settled = true;
        return value;
    });
    return { started, settled: () => settled };
}

test("effective scheme table", () => {
    for (const prefersDark of [true, false]) {
        expect(effectiveScheme("light", prefersDark)).toBe("light");
        expect(effectiveScheme("dark", prefersDark)).toBe("dark");
    }
    expect(effectiveScheme("system", true)).toBe("dark");
    expect(effectiveScheme("system", false)).toBe("light");
    // a missing preference counts as System
    expect(effectiveScheme(undefined, true)).toBe("dark");
    expect(effectiveScheme(undefined, false)).toBe("light");
});

test("A58 system follows the OS", async () => {
    const { settled } = startService({
        preference: "system",
        prefersDark: true,
        remembered: "light",
    });
    expect(cookie.get("color_scheme")).toBe("dark");
    expect.verifySteps(["reload"]);
    await animationFrame();
    expect(settled()).toBe(false);
});

test("A58b system with a light OS and no cookie", async () => {
    const { started } = startService({ preference: "system", prefersDark: false });
    const service = await started;
    expect(cookie.get("color_scheme")).toBe("light");
    expect.verifySteps([]);
    expect(service.activeScheme).toBe("light");
});

test("A57 dark preference reloads once", async () => {
    const first = startService({ preference: "dark", remembered: "light" });
    expect(cookie.get("color_scheme")).toBe("dark");
    expect.verifySteps(["reload"]);
    await animationFrame();
    expect(first.settled()).toBe(false);

    const second = startService({ preference: "dark", remembered: "dark" });
    expect.verifySteps([]);
    const service = await second.started;
    expect(service.activeScheme).toBe("dark");
});

test("A78 first visit dark OS", async () => {
    // the server wrote `light` because it could not know the OS setting
    const { settled } = startService({
        preference: "system",
        prefersDark: true,
        remembered: "light",
    });
    expect(cookie.get("color_scheme")).toBe("dark");
    expect.verifySteps(["reload"]);
    await animationFrame();
    expect(settled()).toBe(false);
});

test("A59 not drawn before reload", async () => {
    const { settled } = startService({ preference: "dark", remembered: "light" });
    await animationFrame();
    expect(settled()).toBe(false);
    expect(browser.sessionStorage.getItem(GUARD_KEY)).toBe("dark");
    expect.verifySteps(["reload"]);
});

test("A59b no reload loop", async () => {
    // the cookie cannot be written: it keeps the old value after the first reload
    patchWithCleanup(cookie, { set() {} });
    const { started } = startService({ preference: "dark", remembered: "light", guard: "dark" });
    expect.verifySteps([]);
    const service = await started;
    expect(service.activeScheme).toBe("dark");
});

test("guard key is cleared when the cookie matches", async () => {
    const { started } = startService({ preference: "light", remembered: "light", guard: "dark" });
    await started;
    expect(browser.sessionStorage.getItem(GUARD_KEY)).toBe(null);
    expect.verifySteps([]);
});

test("first visit in light only stores the value", async () => {
    const { started } = startService({ preference: "light" });
    const service = await started;
    expect(cookie.get("color_scheme")).toBe("light");
    expect(service.activeScheme).toBe("light");
    expect.verifySteps([]);
});

test("missing preference counts as system", async () => {
    const { started } = startService({ prefersDark: false, remembered: "light" });
    const service = await started;
    expect(service.activeScheme).toBe("light");
    expect.verifySteps([]);
});
