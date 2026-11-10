// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
/*
 * Test host: stands in for the native mobile app.
 *
 * Run before the page's own scripts. The Python helper prepends
 * `window.__cwmHostSetup = {...};` with these optional keys:
 *   plugins    list of {name, action}; default: every capability of the contract (eleven
 *              names), each with action == name
 *   answers    map action -> "ok" | "fail" | "never" | list of {success, data} or "never" (the n-th
 *              call gets the n-th entry, the last one repeats); default "ok"
 *   files      list of {uri, name, type} returned by the shared files capability
 *   fileStatus map uri -> HTTP status served for /share_target.localhost/?uri=<uri>
 *   fileBase64 base64 text served as the body of every shared file (default: text)
 *   delayMs    delay before an automatic answer (default 5)
 * Every call is recorded in window.__cwmHostLog = [{action, args, id, at}] and can be
 * answered by hand with window.__cwmHostAnswer(id, result).
 */
(() => {
    if (window !== window.top) {
        return;
    }
    const setup = window.__cwmHostSetup || {};
    const names = [
        "addHomeShortcut",
        "switchAccount",
        "updateAvailableApps",
        "updateAccount",
        "downloadFile",
        "hashChange",
        "overrideBackButton",
        "crashManager",
        "getShareTargetFiles",
        "enableReader",
        "getReaderData",
    ];
    const plugins = setup.plugins || names.map((name) => ({ name, action: name }));
    const answers = setup.answers || {};
    const delayMs = setup.delayMs ?? 5;
    const files = setup.files || [];
    const fileStatus = setup.fileStatus || {};
    const fileBytes = setup.fileBase64
        ? Uint8Array.from(atob(setup.fileBase64), (c) => c.charCodeAt(0))
        : null;
    const log = (window.__cwmHostLog = []);
    const counts = {};
    // action -> capability name (the later list entry wins, as for the web client)
    const nameOf = {};
    for (const plugin of plugins) {
        nameOf[plugin.action] = plugin.name;
    }

    const notify = (id, result) => window.odoo.native_notify(id, result);
    window.__cwmHostAnswer = notify;

    function okResult(action) {
        const name = nameOf[action];
        if (name === "getShareTargetFiles") {
            return { success: true, data: files };
        }
        if (name === "getReaderData") {
            return { success: true, data: "" };
        }
        return { success: true };
    }

    // The answer to send for this call, or undefined for none.
    function pickAnswer(action) {
        const spec = Object.hasOwn(answers, action) ? answers[action] : "ok";
        const index = counts[action] || 0;
        counts[action] = index + 1;
        if (Array.isArray(spec)) {
            const entry = spec[Math.min(index, spec.length - 1)];
            return entry === "never" ? undefined : entry;
        }
        if (spec === "never") {
            return undefined;
        }
        if (spec === "fail") {
            return { success: false, data: "cwm test host: refused" };
        }
        return okResult(action);
    }

    window.OdooDeviceUtility = {
        list_plugins() {
            return JSON.stringify(plugins);
        },
        execute(action, args, id) {
            log.push({ action, args: JSON.parse(args), id, at: performance.now() });
            const result = pickAnswer(action);
            if (result !== undefined) {
                setTimeout(() => notify(id, result), delayMs);
            }
        },
    };

    const realFetch = window.fetch.bind(window);
    window.__cwmHostFetches = [];
    window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input?.url || String(input);
        if (url.includes("/share_target.localhost/")) {
            const uri = new URL(url, location.href).searchParams.get("uri");
            window.__cwmHostFetches.push(uri);
            const status = Object.hasOwn(fileStatus, uri) ? fileStatus[uri] : 200;
            return Promise.resolve(
                new Response(status === 200 ? fileBytes || `cwm-file:${uri}` : "", { status })
            );
        }
        return realFetch(input, init);
    };
})();
