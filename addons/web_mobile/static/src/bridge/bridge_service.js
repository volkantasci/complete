// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Bridge between the web client and the native mobile app.
 *
 * The app (when there is one) defines a host object on the page before any script runs.
 * Detection happens once, when this module is evaluated, so that modules evaluated after
 * it can already ask `cwmDetectedHost()` which capabilities exist.
 */

// Names of the members of the bridge object: a capability may not take one of them.
const CWM_RESERVED = new Set(["active", "has", "polyfills", "bus"]);

// Requests waiting for an answer from the app: id -> { resolve, reject }.
const cwmPending = new Map();
let cwmLastId = 0;

/**
 * Called by the app to answer a request. Answers whose id is unknown (never used, or
 * already answered) are ignored.
 */
function cwmNativeNotify(id, result) {
    const entry = cwmPending.get(id);
    if (!entry) {
        return;
    }
    cwmPending.delete(id);
    if (result?.success === true) {
        entry.resolve(result);
    } else {
        entry.reject(result);
    }
}

// Always defined, with or without an app.
odoo.native_notify = cwmNativeNotify;

function cwmReadCapabilities(rawList) {
    let list;
    try {
        list = JSON.parse(rawList);
    } catch {
        return null;
    }
    if (!Array.isArray(list)) {
        return null;
    }
    const actions = new Map();
    for (const entry of list) {
        if (typeof entry?.name === "string" && typeof entry.action === "string") {
            // a later entry replaces an earlier one with the same name
            actions.set(entry.name, entry.action);
        }
    }
    return actions;
}

/**
 * Look for the host object in `win`, read its capability list and remove the global.
 *
 * @param {Window|object} [win]
 * @returns {{active: boolean, actions: Map<string, string>, execute: Function|null, polyfills: object}}
 */
export function cwmDetectHost(win = window) {
    const host = win.OdooDeviceUtility;
    const polyfills = win.OdooDevicePolyfill || {};
    const none = { active: false, actions: new Map(), execute: null, polyfills };
    if (!host || typeof host.list_plugins !== "function" || typeof host.execute !== "function") {
        return none;
    }
    // the page keeps no public way to the host from here on
    delete win.OdooDeviceUtility;
    let actions = null;
    try {
        actions = cwmReadCapabilities(host.list_plugins());
    } catch {
        actions = null;
    }
    if (!actions) {
        return none;
    }
    return {
        active: true,
        actions,
        execute: (action, args, id) => host.execute(action, args, id),
        polyfills,
    };
}

let cwmHostCache = null;

/** The detection result of the page, detecting on the first call. */
export function cwmDetectedHost() {
    if (!cwmHostCache) {
        cwmHostCache = cwmDetectHost(window);
    }
    return cwmHostCache;
}

/**
 * Build the value of the `mobile` service from a detection result.
 *
 * @param {ReturnType<typeof cwmDetectHost>} host
 */
export function cwmMakeBridge(host) {
    const bridge = {
        active: host.active,
        has: (name) => host.active && host.actions.has(name),
        polyfills: host.polyfills,
        bus: new EventTarget(),
    };
    for (const [name, action] of host.actions) {
        if (CWM_RESERVED.has(name) || Object.hasOwn(bridge, name)) {
            continue;
        }
        bridge[name] = (args) =>
            new Promise((resolve, reject) => {
                const id = `cwm-${++cwmLastId}`;
                // registered first: the app may answer from inside `execute`
                cwmPending.set(id, { resolve, reject });
                try {
                    host.execute(action, JSON.stringify(args ?? {}), id);
                } catch (error) {
                    cwmPending.delete(id);
                    reject(error);
                }
            });
    }
    return bridge;
}

// Detect now, before the services start.
cwmDetectedHost();

export const cwmMobileService = {
    start() {
        return cwmMakeBridge(cwmDetectedHost());
    },
};

registry.category("services").add("mobile", cwmMobileService);
