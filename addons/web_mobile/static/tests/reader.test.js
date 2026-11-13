// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, freezeTime, test } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";
import { installCwmHost } from "@web_mobile/../tests/helpers/fake_host";
import { cwmDetectHost, cwmMakeBridge } from "@web_mobile/bridge/bridge_service";
import { session } from "@web/session";

describe.current.tags("headless");

const plugins = [
    { name: "enableReader", action: "reader_on" },
    { name: "getReaderData", action: "reader_get" },
];

beforeEach(() => {
    // the mock clock only moves with advanceTime: the "not yet" checks do not race real time
    freezeTime();
});

afterEach(() => {
    delete session.time_between_reads_in_ms;
});

/** Let pending answers (promise chains) settle without moving the mock clock. */
async function flush() {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

/** Let `ms` pass in small steps, so that chained answers get their turn between them. */
async function run(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed++) {
        await flush();
        await advanceTime(1, { animationFrame: false });
    }
    await flush();
}

/**
 * `reads`: per getReaderData call, an object `{data}` (success), `{fail}` or "never";
 * the last entry repeats. Answers are given at once, from inside `execute`.
 */
function startReader({ reads = [{ data: "" }], interval } = {}) {
    if (interval) {
        session.time_between_reads_in_ms = interval;
    }
    let readCount = 0;
    const pendingIds = [];
    const times = [];
    const fake = installCwmHost({
        plugins,
        win: {},
        answer: (call, notify) => {
            if (call.action !== "reader_get") {
                notify(call.id, { success: true });
                return;
            }
            times.push(performance.now());
            const read = reads[Math.min(readCount++, reads.length - 1)];
            if (read === "never") {
                pendingIds.push(call.id);
            } else if (read.fail) {
                notify(call.id, { success: false, data: "refused" });
            } else {
                notify(call.id, { success: true, data: read.data });
            }
        },
    });
    const bridge = cwmMakeBridge(cwmDetectHost(fake.win));
    const events = [];
    const listener = (ev) => events.push(ev.detail.data);
    const count = (action) => fake.calls.filter((c) => c.action === action).length;
    return { ...fake, bridge, events, listener, count, pendingIds, times };
}

test("A40 one reader-on, polls one interval after answer, one event for ABC, second listener no new reader-on, stop on leave", async () => {
    const r = startReader({ reads: [{ data: "" }, { data: "ABC" }, { data: "" }] });
    const second = () => {};
    r.bridge.bus.addEventListener("mobile_reader_scanned", r.listener);
    expect(r.count("reader_on")).toBe(1);
    expect(r.count("reader_get")).toBe(0);
    await flush();
    await run(99);
    expect(r.count("reader_get")).toBe(0);
    await run(1);
    expect(r.count("reader_get")).toBe(1);
    await run(100);
    expect(r.count("reader_get")).toBe(2);
    expect(r.events).toEqual(["ABC"]);
    // a listener of another type counts too and does not turn the reader on again
    r.bridge.bus.addEventListener("other", second);
    expect(r.count("reader_on")).toBe(1);
    await run(300);
    expect(r.count("reader_get")).toBe(5);
    expect(r.events).toEqual(["ABC"]);
    // the listener of the other type still counts: polling goes on
    r.bridge.bus.removeEventListener("mobile_reader_scanned", r.listener);
    await run(300);
    expect(r.count("reader_get")).toBe(8);
    expect(r.events).toEqual(["ABC"]);
    r.bridge.bus.removeEventListener("other", second);
    const stopped = r.count("reader_get");
    await run(500);
    expect(r.count("reader_get")).toBe(stopped);
    expect(r.count("reader_on")).toBe(1);
    expect(r.calls.map((c) => c.action).filter((a) => a !== "reader_on" && a !== "reader_get")).toEqual([]);
});

test("A40 the same listener added twice counts once", async () => {
    const r = startReader();
    r.bridge.bus.addEventListener("x", r.listener);
    r.bridge.bus.addEventListener("x", r.listener);
    r.bridge.bus.removeEventListener("x", r.listener);
    const before = r.count("reader_get");
    await run(500);
    expect(r.count("reader_get")).toBe(before);
});

test("A41 300 ms interval", async () => {
    const r = startReader({ interval: 300 });
    r.bridge.bus.addEventListener("x", r.listener);
    expect(r.count("reader_get")).toBe(0);
    await run(290);
    expect(r.count("reader_get")).toBe(0);
    await run(10);
    expect(r.count("reader_get")).toBe(1);
    await run(300);
    expect(r.count("reader_get")).toBe(2);
});

test("A64 errors logged, polling continues, re-join re-enables", async () => {
    const r = startReader({ reads: [{ fail: true }, { fail: true }, { data: "" }] });
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        r.bridge.bus.addEventListener("x", r.listener);
        await run(300);
        expect(r.count("reader_get")).toBe(3);
        expect(warnings.length).toBe(2);
        expect(warnings.every((w) => w.startsWith("[cwm]"))).toBe(true);
        r.bridge.bus.removeEventListener("x", r.listener);
        r.bridge.bus.addEventListener("x", r.listener);
        expect(r.count("reader_on")).toBe(2);
        const before = r.count("reader_get");
        await run(150);
        expect(r.count("reader_get")).toBe(before + 1);
    } finally {
        console.warn = original;
    }
});

test("A64 a rejected reader-on is logged", async () => {
    const fake = installCwmHost({
        plugins,
        win: {},
        answer: (call, notify) =>
            notify(call.id, call.action === "reader_on" ? { success: false } : { success: true, data: "" }),
    });
    const bridge = cwmMakeBridge(cwmDetectHost(fake.win));
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        bridge.bus.addEventListener("x", () => {});
        await run(0);
        expect(warnings.length).toBe(1);
    } finally {
        console.warn = original;
    }
});

test("A67 no second poll before 1000 ms, then one interval later, late answer broadcasts nothing", async () => {
    const r = startReader({ reads: ["never", { data: "" }] });
    const original = console.warn;
    console.warn = () => {};
    try {
        r.bridge.bus.addEventListener("mobile_reader_scanned", r.listener);
        await run(110);
        expect(r.count("reader_get")).toBe(1);
        // keep a margin around the limits all the same
        await run(980);
        expect(r.count("reader_get")).toBe(1);
        await run(20);
        expect(r.count("reader_get")).toBe(1);
        await run(80);
        expect(r.count("reader_get")).toBe(1);
        await run(20);
        expect(r.count("reader_get")).toBe(2);
        r.notify(r.pendingIds[0], { success: true, data: "LATE" });
        await run(500);
        expect(r.events).toEqual([]);
    } finally {
        console.warn = original;
    }
});

test("no reader capabilities: no polling", async () => {
    const fake = installCwmHost({ plugins: [{ name: "enableReader", action: "reader_on" }], win: {} });
    const bridge = cwmMakeBridge(cwmDetectHost(fake.win));
    bridge.bus.addEventListener("x", () => {});
    await run(300);
    expect(fake.calls.length).toBe(0);
});

test("test_001e_a6_first_poll_one_interval_after_reader_on", async () => {
    // the host never answers reader-on: the first read still goes out one interval later
    try {
        for (const interval of [undefined, 300]) {
            if (interval) {
                session.time_between_reads_in_ms = interval;
            }
            const fake = installCwmHost({
                plugins,
                win: {},
                answer: (call, notify) => {
                    if (call.action === "reader_get") {
                        notify(call.id, { success: true, data: "" });
                    }
                },
            });
            const bridge = cwmMakeBridge(cwmDetectHost(fake.win));
            const listener = () => {};
            bridge.bus.addEventListener("x", listener);
            const count = (action) => fake.calls.filter((c) => c.action === action).length;
            // reader-on is sent at once, no read yet
            expect(count("reader_on")).toBe(1);
            expect(count("reader_get")).toBe(0);
            const wait = interval || 100;
            await run(wait - 30);
            expect(count("reader_get")).toBe(0);
            await run(60);
            expect(count("reader_get")).toBe(1);
            // the next one follows the answer by one interval
            await run(wait - 60);
            expect(count("reader_get")).toBe(1);
            await run(60);
            expect(count("reader_get")).toBe(2);
            bridge.bus.removeEventListener("x", listener);
        }
    } finally {
        delete session.time_between_reads_in_ms;
    }
});

test("test_001e_a6 leaving before the first poll cancels it", async () => {
    const r = startReader();
    r.bridge.bus.addEventListener("x", r.listener);
    await run(50);
    r.bridge.bus.removeEventListener("x", r.listener);
    await run(500);
    expect(r.count("reader_get")).toBe(0);
    expect(r.count("reader_on")).toBe(1);
});
