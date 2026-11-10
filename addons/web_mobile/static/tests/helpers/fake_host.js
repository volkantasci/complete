// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Install a fake native host on `win` (default: the page's window).
 *
 * @param {object} [options]
 * @param {Array<{name: string, action: string}>|string} [options.plugins] capability list,
 *  or the raw text `list_plugins()` must return (to test malformed lists)
 * @param {"ok"|"fail"|"never"|"sync"|Function} [options.answer] how requests are answered:
 *  "ok" (default) answers success after a microtask, "sync" answers from inside `execute`,
 *  "fail" answers a failure, "never" does not answer; a function receives the request
 *  and the `notify` function and decides itself.
 * @param {object} [options.polyfill] value of `OdooDevicePolyfill`
 * @param {object} [options.win] target object (default: `window`)
 * @param {object} [options.listThrows] make `list_plugins` throw
 * @returns {{win: object, calls: Array<{action, args, id}>, notify: Function}}
 */
export function installCwmHost({
    plugins = [],
    answer = "ok",
    polyfill,
    win = window,
    listThrows = false,
} = {}) {
    const calls = [];
    const notify = (id, result) => odoo.native_notify(id, result);
    win.OdooDeviceUtility = {
        list_plugins() {
            if (listThrows) {
                throw new Error("list failed");
            }
            return typeof plugins === "string" ? plugins : JSON.stringify(plugins);
        },
        execute(action, args, id) {
            const call = { action, args: JSON.parse(args), rawArgs: args, id };
            calls.push(call);
            const ok = { success: true, data: "" };
            if (typeof answer === "function") {
                answer(call, notify);
            } else if (answer === "sync") {
                notify(id, ok);
            } else if (answer === "ok") {
                Promise.resolve().then(() => notify(id, ok));
            } else if (answer === "fail") {
                Promise.resolve().then(() => notify(id, { success: false, data: "no" }));
            }
        },
    };
    if (polyfill) {
        win.OdooDevicePolyfill = polyfill;
    }
    return { win, calls, notify };
}
