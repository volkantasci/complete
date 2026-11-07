// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { advanceTime, describe, expect, mockDate, test } from "@odoo/hoot";
import { getService, makeTestApp } from "@web/../tests/web_test_helpers";

import { Timer } from "@timer/timer_service";

const { DateTime } = luxon;

describe.current.tags("desktop");

defineMailModels();

async function createTimer() {
    await makeTestApp();
    return getService("timer").createTimer();
}

test("R20: offset 1.5 h formats as 01:30:00", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    timer.setTimer(1.5, DateTime.now());
    expect(timer.time).toBe("01:30:00");
    expect(timer.toSeconds).toBe(5400);
    expect(timer.floatValue).toBe(1.5);
});

test("U6: fractional offset shows whole minutes", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    timer.setTimer(0.33, DateTime.now());
    expect(timer.time).toBe("00:19:48");
    timer.setTimer(0.33, DateTime.now().minus({ seconds: 2 }));
    expect(timer.time).toBe("00:19:50");
    timer.resetTimer();
    timer.addFloatTime(0.33);
    timer.formatTime();
    expect(timer.time).toBe("00:19:48");
});

test("U7: long duration shows 48:00:00", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    timer.setTimer(0, DateTime.now().minus({ hours: 48 }));
    expect(timer.time).toBe("48:00:00");
    timer.setTimer(0, DateTime.now().minus({ hours: 123, seconds: 5 }));
    expect(timer.time).toBe("123:00:05");
});

test("U10: browser clock behind shows absolute difference", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    const start = DateTime.now().plus({ seconds: 10 });
    timer.setTimer(0, start);
    expect(timer.time).toBe("00:00:10");
    await advanceTime(3000);
    timer.updateTimer(start);
    expect(timer.time).toBe("00:00:07");
    expect(timer.getInterval(start, DateTime.now())).toBe(7);
    // the interval is absolute, whichever moment comes first
    expect(timer.getInterval(DateTime.now(), start)).toBeWithin(6, 7);
});

test("R19: tick recomputes from start without drift", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    const start = DateTime.now();
    timer.setTimer(1, start);
    await advanceTime(1000);
    await advanceTime(1500);
    await advanceTime(400);
    timer.updateTimer(start);
    expect(timer.time).toBe("01:00:02");
    // ticking again without time passing does not add anything
    timer.updateTimer(start);
    timer.updateTimer(start);
    expect(timer.time).toBe("01:00:02");
    await advanceTime(600);
    timer.updateTimer(start);
    expect(timer.time).toBe("01:00:03");
    expect(timer.getCurrentTime().toMillis()).toBe(DateTime.now().toMillis());
});

test("R19: a paused timer uses the end moment, not now", async () => {
    mockDate("2026-05-01 12:00:00");
    const timer = await createTimer();
    const start = DateTime.now().minus({ hours: 2 });
    const end = DateTime.now().minus({ hours: 1 });
    timer.setTimer(0, start, end);
    expect(timer.time).toBe("01:00:00");
    await advanceTime(5000);
    expect(timer.time).toBe("01:00:00");
});

test("R22: two timers are independent", async () => {
    mockDate("2026-05-01 12:00:00");
    await makeTestApp();
    const first = getService("timer").createTimer();
    const second = getService("timer").createTimer();
    expect(first).not.toBe(second);
    expect(first).toBeInstanceOf(Timer);
    first.setTimer(1.5, DateTime.now());
    second.setTimer(0, DateTime.now().minus({ minutes: 5 }));
    expect(first.time).toBe("01:30:00");
    expect(second.time).toBe("00:05:00");
    second.resetTimer();
    expect(second.time).toBe("");
    expect(second.toSeconds).toBe(0);
    expect(first.time).toBe("01:30:00");
});
