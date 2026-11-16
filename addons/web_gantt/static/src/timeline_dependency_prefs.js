// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";

export const RESCHEDULE_METHODS = ["manual", "consumeBuffer", "maintainBuffer"];

const methodKey = (viewId) => `rescheduleMethod-viewId-${viewId}`;
const connectorsKey = (viewId, actionId) => `gantt_show_connectors,${viewId},${actionId}`;

/** The rescheduling method kept for a view; anything else gives "maintainBuffer". */
export function readRescheduleMethod(viewId) {
    const stored = browser.localStorage.getItem(methodKey(viewId));
    return RESCHEDULE_METHODS.includes(stored) ? stored : "maintainBuffer";
}

export function writeRescheduleMethod(viewId, method) {
    browser.localStorage.setItem(methodKey(viewId), method);
}

/** Whether dependencies are shown for a view and action (default yes). */
export function readShowConnectors(viewId, actionId) {
    return browser.localStorage.getItem(connectorsKey(viewId, actionId)) !== "false";
}

export function writeShowConnectors(viewId, actionId, on) {
    browser.localStorage.setItem(connectorsKey(viewId, actionId), on ? "true" : "false");
}
