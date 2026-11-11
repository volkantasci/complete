// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { session } from "@web/session";

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

// How long a reader poll may stay unanswered before it is abandoned.
const CWM_POLL_LIMIT = 1000;
const CWM_DEFAULT_INTERVAL = 100;

function cwmWarn(what, reason) {
    console.warn(`[cwm] ${what}`, reason);
}

/**
 * The event channel of the bridge. It counts its listeners (of any event type) and, while
 * there is at least one, keeps the app's reader on and polls it, one request at a time.
 */
class CwmReaderChannel extends EventTarget {
    constructor(bridge, interval) {
        super();
        this._bridge = bridge;
        this._interval = interval;
        // registered listeners as EventTarget sees them: { type, callback, capture, helper }
        this._entries = [];
        this._generation = 0;
        this._running = false;
    }

    addEventListener(type, callback, options) {
        if (callback === null || callback === undefined) {
            return;
        }
        const capture = typeof options === "boolean" ? options : !!options?.capture;
        const known = this._entries.some(
            (e) => e.type === String(type) && e.callback === callback && e.capture === capture
        );
        super.addEventListener(type, callback, options);
        if (known) {
            return;
        }
        if (options?.signal?.aborted) {
            return;
        }
        const entry = { type: String(type), callback, capture, helper: null };
        this._entries.push(entry);
        if (options?.once) {
            // added after the listener itself, so it runs right after it
            entry.helper = () => this._forget(entry);
            super.addEventListener(type, entry.helper, { once: true, capture });
        }
        if (options?.signal) {
            options.signal.addEventListener("abort", () => this._forget(entry), { once: true });
        }
        this._changed();
    }

    removeEventListener(type, callback, options) {
        super.removeEventListener(type, callback, options);
        const capture = typeof options === "boolean" ? options : !!options?.capture;
        const entry = this._entries.find(
            (e) => e.type === String(type) && e.callback === callback && e.capture === capture
        );
        if (entry) {
            this._forget(entry);
        }
    }

    _forget(entry) {
        const index = this._entries.indexOf(entry);
        if (index < 0) {
            return;
        }
        this._entries.splice(index, 1);
        if (entry.helper) {
            super.removeEventListener(entry.type, entry.helper, { capture: entry.capture });
        }
        this._changed();
    }

    _changed() {
        const wanted =
            this._entries.length > 0 &&
            this._bridge.has("enableReader") &&
            this._bridge.has("getReaderData");
        if (wanted && !this._running) {
            this._start();
        } else if (!wanted && this._running) {
            this._stop();
        }
    }

    _start() {
        this._running = true;
        const generation = ++this._generation;
        this._bridge.enableReader().catch((reason) => cwmWarn("reader could not be turned on", reason));
        // the first read goes out one interval later, whether or not reader-on has answered
        this._poll(generation);
    }

    _stop() {
        this._running = false;
        this._generation++;
    }

    async _poll(generation) {
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, this._interval));
            if (this._generation !== generation) {
                return;
            }
            let outcome;
            let timer;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => resolve({ timedOut: true }), CWM_POLL_LIMIT);
            });
            try {
                const answer = this._bridge.getReaderData().then(
                    (value) => ({ value }),
                    (error) => ({ error })
                );
                outcome = await Promise.race([answer, timeout]);
            } catch (error) {
                outcome = { error };
            }
            clearTimeout(timer);
            if (this._generation !== generation) {
                return;
            }
            if (outcome.error !== undefined) {
                cwmWarn("reader data could not be read", outcome.error);
            } else if (outcome.timedOut) {
                cwmWarn("reader data request was not answered in time", CWM_POLL_LIMIT);
            } else {
                const data = outcome.value?.data;
                if (typeof data === "string" && data !== "") {
                    this.dispatchEvent(new CustomEvent("mobile_reader_scanned", { detail: { data } }));
                }
            }
        }
    }
}

// One callables object per detection result, shared by the service and the module of
// `@web_mobile/js/services/core`.
const cwmCallableCache = new WeakMap();

/**
 * The functions of the capabilities the app lists, keyed by name (empty without an app).
 * Built once per detection result: every caller gets the very same function objects.
 *
 * @param {ReturnType<typeof cwmDetectHost>} host
 */
export function cwmCallables(host) {
    let callables = cwmCallableCache.get(host);
    if (callables) {
        return callables;
    }
    callables = {};
    for (const [name, action] of host.actions) {
        if (CWM_RESERVED.has(name) || Object.hasOwn(callables, name)) {
            continue;
        }
        callables[name] = (args) =>
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
    cwmCallableCache.set(host, callables);
    return callables;
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
        bus: null,
    };
    bridge.bus = new CwmReaderChannel(
        bridge,
        session.time_between_reads_in_ms || CWM_DEFAULT_INTERVAL
    );
    Object.assign(bridge, cwmCallables(host));
    return bridge;
}

// Detect now, before the services start.
cwmDetectedHost();

export const cwmBridgeService = {
    start() {
        return cwmMakeBridge(cwmDetectedHost());
    },
};

registry.category("services").add("mobile", cwmBridgeService);
