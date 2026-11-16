// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from "@odoo/hoot";
import { browser } from "@web/core/browser/browser";
import {
    readRescheduleMethod,
    readShowConnectors,
    RESCHEDULE_METHODS,
    writeRescheduleMethod,
    writeShowConnectors,
} from "@web_gantt/timeline_dependency_prefs";

test("002c A74: storage keys of the rescheduling method", () => {
    expect(RESCHEDULE_METHODS).toEqual(["manual", "consumeBuffer", "maintainBuffer"]);
    expect(readRescheduleMethod(7)).toBe("maintainBuffer");
    writeRescheduleMethod(7, "consumeBuffer");
    expect(browser.localStorage.getItem("rescheduleMethod-viewId-7")).toBe("consumeBuffer");
    expect(readRescheduleMethod(7)).toBe("consumeBuffer");
    browser.localStorage.setItem("rescheduleMethod-viewId-7", "bogus");
    expect(readRescheduleMethod(7)).toBe("maintainBuffer");
    writeRescheduleMethod(7, "manual");
    expect(readRescheduleMethod(7)).toBe("manual");
    expect(readRescheduleMethod(8)).toBe("maintainBuffer");
});

test("002c A74: storage keys of the show dependencies switch", () => {
    expect(readShowConnectors(3, 4)).toBe(true);
    writeShowConnectors(3, 4, false);
    expect(browser.localStorage.getItem("gantt_show_connectors,3,4")).toBe("false");
    expect(readShowConnectors(3, 4)).toBe(false);
    expect(readShowConnectors(3, 5)).toBe(true);
    writeShowConnectors(3, 4, true);
    expect(readShowConnectors(3, 4)).toBe(true);
});
