// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, mockFetch, test } from "@odoo/hoot";
import { patchTranslations, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { registry } from "@web/core/registry";
import { shareTargetService } from "@web/webclient/share_target/share_target_service";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import { cwmRelayError } from "@web_mobile/device/error_relay";
import { cwmInstallSharedFiles } from "@web_mobile/device/shared_files";

describe.current.tags("headless");

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

function captureWarnings() {
    const warnings = [];
    patchWithCleanup(console, { warn: (...args) => warnings.push(args.map(String).join(" ")) });
    return warnings;
}

test("error handler sits at sequence 96 and never stops the chain", () => {
    const registered = registry.category("error_handlers");
    expect(registered.get("cwm_relay_error")).toBe(cwmRelayError);
    const names = registered.getEntries().map(([name]) => name);
    expect(names.indexOf("cwm_relay_error")).toBeLessThan(names.indexOf("rpcErrorHandler"));
});

test("A36 error sent as plain data, handler does not stop the chain", async () => {
    const { bridge, calls } = startBridge(["crashManager"]);
    const error = Object.assign(new Error("boom"), { traceback: "tb", name: "UncaughtClientError" });
    const result = cwmRelayError({ services: { mobile: bridge } }, error, "original");
    expect(result).toBe(false);
    expect(calls.length).toBe(1);
    expect(calls[0].action).toBe("crashManager");
    expect(calls[0].args).toEqual({
        traceback: "tb",
        name: "UncaughtClientError",
        originalError: "original",
    });
});

test("no capability: nothing sent", () => {
    const { bridge, calls } = startBridge(["hashChange"]);
    expect(cwmRelayError({ services: { mobile: bridge } }, new Error("x"), "x")).toBe(false);
    expect(calls.length).toBe(0);
});

test("A66 failed answer: console entry only", async () => {
    const warnings = captureWarnings();
    const { bridge, calls } = startBridge(["crashManager"], { answer: "fail" });
    expect(cwmRelayError({ services: { mobile: bridge } }, new Error("x"), "x")).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/^\[cwm\]/);
});

test("A66 cyclic error: one console entry, no request", () => {
    const warnings = captureWarnings();
    const { bridge, calls } = startBridge(["crashManager"]);
    const cyclic = new Error("x");
    cyclic.self = cyclic;
    expect(cwmRelayError({ services: { mobile: bridge } }, cyclic, cyclic)).toBe(false);
    expect(calls.length).toBe(0);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/^\[cwm\]/);
});

// ---- shared files ----

const NOTICE_ALL = "The files shared with the app could not be loaded.";

function addShareItem() {
    const items = registry.category("share_target_items");
    items.add("cwm_probe_item", { name: "cwm_probe_item", sequence: 1 });
    undo.push(() => items.remove("cwm_probe_item"));
}

function startShares({ files, answer, status = {}, items = true }) {
    patchTranslations();
    if (items) {
        addShareItem();
    }
    const fake = startBridge(["getShareTargetFiles"], {
        answer:
            answer ||
            ((call, notify) => Promise.resolve().then(() => notify(call.id, { success: true, data: files }))),
    });
    const fetched = [];
    mockFetch((url) => {
        fetched.push(String(url));
        const uri = new URL(String(url), "http://x.test").searchParams.get("uri");
        const code = uri in status ? status[uri] : 200;
        return new Response(code === 200 ? "bytes" : "", { status: code });
    });
    const notices = [];
    const original = shareTargetService._getShareTargetFiles;
    undo.push(() => (shareTargetService._getShareTargetFiles = original));
    undo.push(
        cwmInstallSharedFiles(fake.bridge, {
            add: (message, options) => notices.push([String(message), options]),
        })
    );
    return { ...fake, fetched, notices };
}

test("A37 files fetched and returned as File objects", async () => {
    const { fetched, notices } = startShares({
        files: [{ uri: "cwm 1", name: "receipt.png", type: "image/png" }],
    });
    const files = await shareTargetService._getShareTargetFiles();
    expect(fetched).toEqual(["/share_target.localhost/?uri=cwm%201"]);
    expect(files.length).toBe(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe("receipt.png");
    expect(files[0].type).toBe("image/png");
    expect(notices.length).toBe(0);
});

test("A38 unreadable file: named warning, empty list", async () => {
    const { notices } = startShares({
        files: [{ uri: "u1", name: "bad.pdf", type: "application/pdf" }],
        status: { u1: 404 },
    });
    const files = await shareTargetService._getShareTargetFiles();
    expect(files).toEqual([]);
    expect(notices).toEqual([
        ['The shared file "bad.pdf" could not be loaded from the app.', { type: "warning" }],
    ]);
});

test("A39 empty list: nothing at all", async () => {
    const { notices, fetched } = startShares({ files: [] });
    const files = await shareTargetService._getShareTargetFiles();
    expect(files).toEqual([]);
    expect(notices.length).toBe(0);
    expect(fetched.length).toBe(0);
});

test("A39 failure answer: generic warning", async () => {
    captureWarnings();
    const { notices } = startShares({ files: [], answer: "fail" });
    const files = await shareTargetService._getShareTargetFiles();
    expect(files).toEqual([]);
    expect(notices).toEqual([[NOTICE_ALL, { type: "warning" }]]);
});

test("A39 malformed entries: generic warning, no throw", async () => {
    for (const files of [[null], ["text"], [{ name: "no-uri.png" }], [{ uri: 5 }]]) {
        captureWarnings();
        const { notices, fetched } = startShares({ files });
        const result = await shareTargetService._getShareTargetFiles();
        expect(result).toEqual([]);
        expect(notices).toEqual([[NOTICE_ALL, { type: "warning" }]]);
        expect(fetched.length).toBe(0);
        while (undo.length) {
            undo.pop()();
        }
    }
});

test("no share items: no request", async () => {
    const { calls, notices } = startShares({ files: [], items: false });
    const files = await shareTargetService._getShareTargetFiles();
    expect(files).toEqual([]);
    expect(calls.length).toBe(0);
    expect(notices.length).toBe(0);
});

test("no capability: Community method stays", () => {
    const original = shareTargetService._getShareTargetFiles;
    const { bridge } = startBridge(["hashChange"]);
    undo.push(cwmInstallSharedFiles(bridge, { add() {} }));
    expect(shareTargetService._getShareTargetFiles).toBe(original);
});
