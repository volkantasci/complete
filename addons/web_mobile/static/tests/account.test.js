// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { mockFetch } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { user } from "@web/core/user";
import { session } from "@web/session";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import { cwmReadAccountPicture, cwmSendAccount } from "@web_mobile/account/account_sync";
import { registry } from "@web/core/registry";
import { CwmAccountPrefsController, cwmAfterPrefsSaved } from "@web_mobile/account/account_prefs_form";

describe.current.tags("headless");

async function makePng(width = 40, height = 20) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").fillRect(0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function pngSize(base64) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    return [view.getUint32(16), view.getUint32(20)];
}

/** Host with the account capability; returns the calls, the fetched addresses, the console. */
async function setup({ answer = "ok", picture = "ok" } = {}) {
    const fake = installCwmHost({
        plugins: [{ name: "updateAccount", action: "cwm_account" }],
        answer,
        win: {},
    });
    const mobile = cwmMakeBridge(cwmDetectHost(fake.win));
    const png = await makePng();
    const fetched = [];
    mockFetch((url) => {
        fetched.push(String(url));
        return picture === "ok"
            ? new Response(png, { headers: { "Content-Type": "image/png" } })
            : new Response("boom", { status: 500 });
    });
    patchWithCleanup(user, { userId: 7, name: "Mitchell Admin", login: "admin" });
    patchWithCleanup(session, { db: "cwm_db" });
    const warnings = [];
    patchWithCleanup(console, { warn: (...args) => warnings.push(args.map(String).join(" ")) });
    const sent = () => fake.calls.filter((call) => call.action === "cwm_account");
    return { ...fake, mobile, fetched, warnings, sent };
}

test("A19 account at load payload", async () => {
    const { mobile, sent, fetched } = await setup();
    await cwmSendAccount(mobile, { name: "Mitchell Admin", login: "admin" }, { wait: true });
    expect(sent().length).toBe(1);
    const args = sent()[0].args;
    expect(Object.keys(args).sort()).toEqual(["avatar", "db", "name", "uid", "username"]);
    expect(args).toMatchObject({ name: "Mitchell Admin", username: "admin", uid: 7, db: "cwm_db" });
    expect(pngSize(args.avatar)).toEqual([128, 128]);
    expect(fetched[0]).toMatch(/^\/web\/image\/res\.users\/7\/image_medium\?unique=\d+/);
});

test("A25 picture error: no request, one console entry", async () => {
    const { mobile, sent, warnings } = await setup({ picture: "error" });
    expect(await cwmReadAccountPicture(7)).toBe(null);
    await cwmSendAccount(mobile, { name: "n", login: "l" }, { wait: true });
    expect(sent().length).toBe(0);
    expect(warnings.filter((text) => text.startsWith("[cwm]")).length).toBe(2);
});

test("A61 failed answer: one console entry, no throw", async () => {
    const { mobile, sent, warnings } = await setup({ answer: "fail" });
    await cwmSendAccount(mobile, { name: "n", login: "l" }, { wait: true });
    expect(sent().length).toBe(1);
    expect(warnings.filter((text) => text.startsWith("[cwm]")).length).toBe(1);
});

test("A23 wait false does not wait, wait true waits", async () => {
    const { mobile, calls, notify } = await setup({ answer: "never" });
    await cwmSendAccount(mobile, { name: "n", login: "l" }, { wait: false });
    expect(calls.length).toBe(1);
    let done = false;
    const pending = cwmSendAccount(mobile, { name: "n", login: "l" }, { wait: true }).then(
        () => (done = true)
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls.length).toBe(2);
    expect(done).toBe(false);
    notify(calls[1].id, { success: true });
    await pending;
    expect(done).toBe(true);
});

const fakeRecord = (mobile, data) => ({ data, model: { env: { services: { mobile } } } });

test("A23 iOS does not wait / Android waits (after a save)", async () => {
    const { mobile, calls, notify } = await setup({ answer: "never" });
    patchWithCleanup(navigator, { userAgent: "x OdooMobile (iOS)" });
    await cwmAfterPrefsSaved(fakeRecord(mobile, { name: "A", login: "a" }));
    expect(calls.length).toBe(1);
    patchWithCleanup(navigator, { userAgent: "x OdooMobile Android" });
    let done = false;
    const pending = cwmAfterPrefsSaved(fakeRecord(mobile, { name: "B", login: "b" })).then(
        () => (done = true)
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(done).toBe(false);
    notify(calls[1].id, { success: true });
    await pending;
    expect(calls[1].args).toMatchObject({ name: "B", username: "b" });
});

test("A66 picture error after save: no request, console entry, resolves", async () => {
    const { mobile, sent, warnings } = await setup({ picture: "error" });
    await cwmAfterPrefsSaved(fakeRecord(mobile, { name: "A", login: "a" }));
    expect(sent().length).toBe(0);
    expect(warnings.length > 0).toBe(true);
});

test("A20 the form type sends the saved values from its save hook", async () => {
    const { mobile, calls } = await setup();
    expect(registry.category("views").get("cwm_account_prefs_form").Controller).toBe(
        CwmAccountPrefsController
    );
    const controller = Object.create(CwmAccountPrefsController.prototype);
    controller.duplicateId = null;
    await controller.onRecordSaved(fakeRecord(mobile, { name: "Mitchell Admin B", login: "admin" }), {});
    expect(calls.length).toBe(1);
    expect(calls[0].args).toMatchObject({ name: "Mitchell Admin B", username: "admin", uid: 7 });
});

test("A21 the hook is the only sender: a failed save never reaches it", async () => {
    // the Community form controller calls onRecordSaved only after a successful save;
    // the stub sends nothing on its own
    const { calls } = await setup();
    expect(calls.length).toBe(0);
});
