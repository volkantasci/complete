// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import {
    cwmCallables,
    cwmDetectHost,
    cwmDetectedHost,
    cwmMakeBridge,
} from "@web_mobile/bridge/bridge_service";
import core, { methods } from "@web_mobile/js/services/core";

describe.current.tags("headless");

const plugin = (name, action = name) => ({ name, action });

function startBridge(options) {
    const fake = installCwmHost(options);
    const bridge = cwmMakeBridge(cwmDetectHost(fake.win));
    return { ...fake, bridge };
}

test("A1 host detected and global removed", () => {
    const { win, bridge } = startBridge({ plugins: [plugin("switchAccount")], win: {} });
    expect(win.OdooDeviceUtility).toBe(undefined);
    expect(bridge.active).toBe(true);
    expect(bridge.has("switchAccount")).toBe(true);
    expect(bridge.has("other")).toBe(false);
    expect(typeof bridge.switchAccount).toBe("function");
    expect(bridge.bus instanceof EventTarget).toBe(true);
});

test("A1 the detection of the page runs once and is cached", () => {
    expect(cwmDetectedHost()).toBe(cwmDetectedHost());
});

test("A2 no host: no request, native_notify exists", () => {
    const win = {};
    const bridge = cwmMakeBridge(cwmDetectHost(win));
    expect(bridge.active).toBe(false);
    expect(bridge.has("switchAccount")).toBe(false);
    expect(bridge.switchAccount).toBe(undefined);
    expect(typeof odoo.native_notify).toBe("function");
    // answering with nothing pending is harmless
    odoo.native_notify("cwm-none", { success: true });
});

test("A3 request format: action, JSON object text, distinct string ids", async () => {
    const { bridge, calls } = startBridge({
        plugins: [plugin("switchAccount", "act_switch"), plugin("hashChange", "act_hash")],
        win: {},
    });
    await bridge.switchAccount();
    await bridge.hashChange({ a: 1, b: "x" });
    await bridge.hashChange(null);
    expect(calls.map((c) => c.action)).toEqual(["act_switch", "act_hash", "act_hash"]);
    expect(calls.map((c) => c.rawArgs)).toEqual(["{}", '{"a":1,"b":"x"}', "{}"]);
    for (const call of calls) {
        expect(typeof call.id).toBe("string");
    }
    expect(new Set(calls.map((c) => c.id)).size).toBe(3);
});

test("A3 a list argument is sent as a JSON list", async () => {
    const { bridge, calls } = startBridge({ plugins: [plugin("updateAvailableApps")], win: {} });
    await bridge.updateAvailableApps([{ xmlid: "a" }]);
    expect(calls[0].rawArgs).toBe('[{"xmlid":"a"}]');
});

test("A4 success resolves with whole answer / failure rejects with whole answer", async () => {
    const answers = [
        { success: true, data: "yes", extra: 1 },
        { success: false, data: "no" },
        { success: "true" },
        undefined,
    ];
    let index = 0;
    const { bridge } = startBridge({
        plugins: [plugin("switchAccount")],
        win: {},
        answer: (call, notify) => notify(call.id, answers[index++]),
    });
    expect(await bridge.switchAccount()).toEqual({ success: true, data: "yes", extra: 1 });
    let caught;
    await bridge.switchAccount().catch((error) => (caught = error));
    expect(caught).toEqual({ success: false, data: "no" });
    caught = null;
    await bridge.switchAccount().catch((error) => (caught = error));
    expect(caught).toEqual({ success: "true" });
    // an answer that is not an object is a failure too
    let rejected = false;
    await bridge.switchAccount().catch(() => (rejected = true));
    expect(rejected).toBe(true);
});

test("A4 unknown and repeated ids are ignored", async () => {
    const { bridge, calls } = startBridge({
        plugins: [plugin("switchAccount")],
        win: {},
        answer: "never",
    });
    const promise = bridge.switchAccount();
    odoo.native_notify("cwm-unknown", { success: true });
    odoo.native_notify(calls[0].id, { success: true, data: 1 });
    odoo.native_notify(calls[0].id, { success: false, data: 2 });
    expect(await promise).toEqual({ success: true, data: 1 });
});

test("A4 sync answer from inside execute resolves", async () => {
    const { bridge } = startBridge({
        plugins: [plugin("switchAccount")],
        win: {},
        answer: "sync",
    });
    expect(await bridge.switchAccount()).toEqual({ success: true, data: "" });
});

test("A4 a host that throws rejects the call and leaves nothing pending", async () => {
    const { bridge, win } = startBridge({ plugins: [plugin("switchAccount")], win: {} });
    expect(win.OdooDeviceUtility).toBe(undefined);
    const throwing = cwmMakeBridge({
        active: true,
        actions: new Map([["switchAccount", "x"]]),
        execute() {
            throw new Error("boom");
        },
        polyfills: {},
    });
    let caught;
    await throwing.switchAccount().catch((error) => (caught = error));
    expect(caught.message).toBe("boom");
    expect(bridge.active).toBe(true);
});

test("A6 duplicate capability: later action wins, one entry", async () => {
    const { bridge, calls } = startBridge({
        plugins: [plugin("addHomeShortcut", "first"), plugin("addHomeShortcut", "second")],
        win: {},
    });
    expect(Object.keys(bridge).filter((key) => key === "addHomeShortcut").length).toBe(1);
    await bridge.addHomeShortcut();
    expect(calls.map((c) => c.action)).toEqual(["second"]);
});

test("A7 unknown capability callable with args", async () => {
    const { bridge, calls } = startBridge({
        plugins: [plugin("madeUpThing", "made_up_action")],
        win: {},
    });
    expect(bridge.has("madeUpThing")).toBe(true);
    await bridge.madeUpThing({ k: [1, 2] });
    expect(calls[0].action).toBe("made_up_action");
    expect(calls[0].args).toEqual({ k: [1, 2] });
});

test("malformed list_plugins: no app", () => {
    for (const plugins of ["not json", '{"name": "a"}', "null", "42"]) {
        const bridge = cwmMakeBridge(cwmDetectHost(installCwmHost({ plugins, win: {} }).win));
        expect(bridge.active).toBe(false);
        expect(bridge.has("a")).toBe(false);
    }
    const throwing = installCwmHost({ listThrows: true, win: {} });
    expect(cwmDetectHost(throwing.win).active).toBe(false);
    // entries without a usable name or action are skipped
    const partial = cwmMakeBridge(
        cwmDetectHost(installCwmHost({ plugins: [{ name: "a" }, 3, plugin("b")], win: {} }).win)
    );
    expect(partial.has("a")).toBe(false);
    expect(partial.has("b")).toBe(true);
});

test("a host missing a function is not a host", () => {
    const win = { OdooDeviceUtility: { list_plugins: () => "[]" } };
    expect(cwmDetectHost(win).active).toBe(false);
});

test("polyfills kept or empty object", () => {
    const polyfill = { print() {} };
    const withIt = startBridge({ plugins: [], polyfill, win: {} });
    expect(withIt.bridge.polyfills).toBe(polyfill);
    expect(withIt.win.OdooDevicePolyfill).toBe(polyfill);
    const without = startBridge({ plugins: [], win: {} });
    expect(without.bridge.polyfills).toEqual({});
});

test("reserved member names are not overwritten by capabilities", () => {
    const { bridge } = startBridge({ plugins: [plugin("bus"), plugin("has")], win: {} });
    expect(bridge.bus instanceof EventTarget).toBe(true);
    expect(typeof bridge.has).toBe("function");
});

test("methods holds one function per listed capability, reserved names included", () => {
    const fake = installCwmHost({ plugins: [plugin("bus"), plugin("other")], win: {} });
    expect(Object.keys(cwmCallables(cwmDetectHost(fake.win)))).toEqual(["bus", "other"]);
});

test("test_001e_a9_original_capability_object", async () => {
    // the callables of a detection result are built once and shared with the service
    const fake = installCwmHost({
        plugins: [plugin("addHomeShortcut", "act_short"), plugin("switchAccount", "act_switch")],
        win: {},
        polyfill: { helper: 1 },
    });
    const host = cwmDetectHost(fake.win);
    const callables = cwmCallables(host);
    expect(cwmCallables(host)).toBe(callables);
    expect(Object.keys(callables)).toEqual(["addHomeShortcut", "switchAccount"]);
    const bridge = cwmMakeBridge(host);
    expect(bridge.addHomeShortcut).toBe(callables.addHomeShortcut);
    expect(bridge.switchAccount).toBe(callables.switchAccount);
    // a call through the shared function is one request
    const answer = await callables.addHomeShortcut({ title: "T", shortcut_url: "U", web_icon: "I" });
    expect(answer.success).toBe(true);
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0].action).toBe("act_short");
    expect(fake.calls[0].args).toEqual({ title: "T", shortcut_url: "U", web_icon: "I" });
    // a capability the app does not list has no function
    expect(callables.enableReader).toBe(undefined);
    expect("enableReader" in callables).toBe(false);
});

test("test_001e_a9 the module without an app", () => {
    // a normal browser: nothing listed, nothing offered
    expect(methods).toEqual({});
    expect(core.methods).toBe(methods);
    expect(core.polyfills).toEqual({});
    expect(Object.keys(cwmCallables(cwmDetectedHost()))).toEqual(Object.keys(methods));
});
