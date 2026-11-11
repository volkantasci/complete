// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from "@odoo/hoot";
import { tick } from "@odoo/hoot-mock";
import { patchTranslations } from "@web/../tests/web_test_helpers";
import { download,downloadFile } from "@web/core/network/download";
import * as cwmHooks from "@web/core/utils/hooks";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import { cwmInstallBackOverride } from "@web_mobile/device/back_override";
import { cwmInstallDownloadHandoff, cwmReducedAddress } from "@web_mobile/device/download_handoff";
import { cwmInstallNavigationNotice } from "@web_mobile/device/navigation_notice";

describe.current.tags("headless");

/** Simulates the app's back button: it reaches the page as a "backbutton" event (I4). */
function pressDeviceBack() {
    document.dispatchEvent(new Event("backbutton"));
}

const WARNING = "This file is generated in the page and can't be saved from inside the mobile app.";
const undo = [];
afterEach(() => {
    while (undo.length) {
        undo.pop()();
    }
});

function startBridge(names, options = {}) {
    const fake = installCwmHost({
        plugins: names.map((name) => ({ name, action: name })),
        win: {},
        ...options,
    });
    return { ...fake, bridge: cwmMakeBridge(cwmDetectHost(fake.win)) };
}

function startDownloads(names = ["downloadFile"]) {
    const started = startBridge(names);
    const notices = [];
    undo.push(
        cwmInstallDownloadHandoff(started.bridge, {
            add: (message, options) => notices.push([String(message), options]),
        })
    );
    return { ...started, notices };
}

function setCsrf(value) {
    const saved = odoo.csrf_token;
    odoo.csrf_token = value;
    undo.push(() => (odoo.csrf_token = saved));
}

test("A26 request download handed over with reduced url and csrf, resolves at once", async () => {
    setCsrf("tok");
    const { calls } = startDownloads();
    const result = await download({
        url: "http://h.test:8080/web/report?x=1#f",
        data: { data: "[1]" },
    });
    expect(result).toBe(undefined);
    expect(calls.length).toBe(1);
    expect(calls[0].args).toEqual({
        url: "/web/report?x=1",
        data: { data: "[1]" },
        csrf_token: "tok",
    });
});

test("A26 no csrf token: the key is absent", async () => {
    setCsrf("");
    const { calls } = startDownloads();
    await download({ url: "/a", data: {} });
    expect("csrf_token" in calls[0].args).toBe(false);
});

test("A27 file address GET", () => {
    const { calls } = startDownloads();
    expect(downloadFile("/web/content/7?download=true")).toBe(true);
    expect(calls[0].args).toEqual({ form: { method: "GET" }, url: "/web/content/7?download=true" });
});

test("A28 three addresses reduced", () => {
    expect(cwmReducedAddress("http://example.test:8080/report/x?id=4&lang=fr#top")).toBe(
        "/report/x?id=4&lang=fr"
    );
    expect(cwmReducedAddress("https://example.org/files/one")).toBe("/files/one");
    expect(cwmReducedAddress("/report/y?id=5")).toBe("/report/y?id=5");
});

test("A29 in-memory content: warning, no request", () => {
    patchTranslations();
    const { calls, notices } = startDownloads();
    downloadFile("hello", "a.txt", "text/plain");
    downloadFile(new Blob(["x"]));
    downloadFile("hello", "a.txt");
    expect(calls.length).toBe(0);
    expect(notices.length).toBe(3);
    expect(notices[0]).toEqual([WARNING, { type: "warning" }]);
});

test("A29 data and blob addresses: warning, no request", () => {
    patchTranslations();
    const { calls, notices } = startDownloads();
    expect(downloadFile("data:text/plain;base64,aGk=")).toBe(false);
    expect(downloadFile("blob:http://x.test/1234")).toBe(false);
    expect(calls.length).toBe(0);
    expect(notices.length).toBe(2);
    expect(notices[0]).toEqual([WARNING, { type: "warning" }]);
});

test("A30 no capability: Community download", () => {
    const before = [download._download, downloadFile._download];
    const { calls } = startDownloads(["hashChange"]);
    expect([download._download, downloadFile._download]).toEqual(before);
    expect(calls.length).toBe(0);
});

function fakeWindow(search) {
    const target = new EventTarget();
    target.location = { search };
    return target;
}

test("A31 first popstate sends empty params, same query again sends nothing", async () => {
    const { bridge, calls } = startBridge(["hashChange"]);
    const win = fakeWindow("");
    undo.push(cwmInstallNavigationNotice(bridge, win));
    win.dispatchEvent(new Event("popstate"));
    win.dispatchEvent(new Event("popstate"));
    await tick();
    expect(calls.map((c) => c.args)).toEqual([{}]);
    win.location.search = "?a=1";
    win.dispatchEvent(new Event("popstate"));
    expect(calls.length).toBe(2);
});

test("A32 params typed", () => {
    const { bridge, calls } = startBridge(["hashChange"]);
    const win = fakeWindow("?view_type=list&cwm_probe=7");
    undo.push(cwmInstallNavigationNotice(bridge, win));
    win.dispatchEvent(new Event("popstate"));
    expect(calls[0].args).toEqual({ view_type: "list", cwm_probe: 7 });
});

test("navigation: no capability, no listener", () => {
    const { bridge, calls } = startBridge(["downloadFile"]);
    const win = fakeWindow("?a=1");
    undo.push(cwmInstallNavigationNotice(bridge, win));
    win.dispatchEvent(new Event("popstate"));
    expect(calls.length).toBe(0);
});

function startBack(names = ["overrideBackButton"]) {
    const started = startBridge(names);
    undo.push(cwmInstallBackOverride(started.bridge));
    const flips = () => started.calls.map((c) => c.args.enabled);
    return { ...started, flips, manager: new cwmHooks.BackButtonManager() };
}

const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

test("A33 popover: true then back closes then false", async () => {
    const { manager, flips } = startBack();
    const length = history.length;
    const closed = [];
    const scope = {};
    manager.addListener(scope, () => {
        closed.push("popover");
        manager.removeListener(scope);
    });
    expect(flips()).toEqual([true]);
    pressDeviceBack();
    await settle();
    expect(closed).toEqual(["popover"]);
    expect(flips()).toEqual([true, false]);
    expect(history.length).toBe(length);
    // the listener is gone
    pressDeviceBack();
    expect(closed.length).toBe(1);
});

test("A34 two layers: top first, on once, off once", async () => {
    const { manager, flips } = startBack();
    const closed = [];
    const dialog = {};
    const popover = {};
    manager.addListener(dialog, () => {
        closed.push("dialog");
        manager.removeListener(dialog);
    });
    manager.addListener(popover, () => {
        closed.push("popover");
        manager.removeListener(popover);
    });
    pressDeviceBack();
    await settle();
    expect(closed).toEqual(["popover"]);
    expect(flips()).toEqual([true]);
    pressDeviceBack();
    await settle();
    expect(closed).toEqual(["popover", "dialog"]);
    expect(flips()).toEqual([true, false]);
});

test("layer swap in one tick sends nothing extra", async () => {
    const { manager, flips } = startBack();
    const first = {};
    const second = {};
    manager.addListener(first, () => {});
    manager.removeListener(first);
    manager.addListener(second, () => {});
    await settle();
    expect(flips()).toEqual([true]);
    manager.removeListener(second);
    await settle();
    expect(flips()).toEqual([true, false]);
});

test("A35 no capability: Community manager untouched", () => {
    const { calls } = startBack(["downloadFile"]);
    expect(cwmHooks.BackButtonManager.prototype._activate.toString().includes("_cwm")).toBe(false);
    expect(calls.length).toBe(0);
});

test("A63 late enable: a layer turning back handling on later", async () => {
    const { manager, flips } = startBack();
    const layer = {};
    expect(flips()).toEqual([]);
    manager.addListener(layer, () => {});
    expect(flips()).toEqual([true]);
    manager.removeListener(layer);
    await settle();
    expect(flips()).toEqual([true, false]);
    manager.addListener(layer, () => {});
    expect(flips()).toEqual([true, false, true]);
});
