// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    hover,
    keyDown,
    keyUp,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";

import { hhgSplitBorderAt } from "../src/time_off_split_tool";
import { mountTimeOff, onRpc, REPORT_ARCH, setupTimeOffFixtures } from "./time_off_test_helpers";

const { DateTime } = luxon;

setupTimeOffFixtures();
describe.current.tags("desktop");

// ---------------------------------------------------------------------------------------------
// The border math (R16, R17 point 1, D11): pure, no view
// ---------------------------------------------------------------------------------------------

/** `count` columns of the given width from `left`, the first on `first` (a luxon day). */
function columnsOf({ left, width, count, first = DateTime.local(2026, 11, 16), rtl = false }) {
    const result = [];
    for (let i = 0; i < count; i++) {
        const start = first.plus({ days: i });
        const from = rtl ? left - (i + 1) * width : left + i * width;
        result.push({ left: from, right: from + width, start });
    }
    return result;
}

/**
 * The week of the spec: Monday 16 from x 303, 252.203 px a day, a pill of three days. The pill's
 * rect is its whole 25 px box (the 1 px inset included): from y 213 to 0.5 px above its bottom
 * edge, y 237.5 (R16, A43).
 */
const WEEK = columnsOf({ left: 302.985, width: 252.203, count: 5 });
const PILL = { left: 302.985, right: 302.985 + 3 * 252.203, top: 213, bottom: 237.5 };
const MIDDLE = 225.5;

describe("the border math", () => {
    test("A40 2 px right of the border between Monday 16 and Tuesday 17 splits at Tuesday 17", () => {
        const found = hhgSplitBorderAt({ x: 557.188, y: MIDDLE, pillRect: PILL, columns: WEEK });
        expect(found.day).toBe("2026-11-17");
        expect(found.borderX).toBeWithin(555.18, 555.2);
        // the box lies over the day after the border
        expect(found.box.left).toBeWithin(555.18, 555.2);
        expect(found.box.right - found.box.left).toBeWithin(252.2, 252.21);
    });

    test("A43 shows from 8 px left to 8 px right of the border, and nowhere else", () => {
        const shown = [];
        for (let x = 541.2; x <= 569.3; x += 1) {
            if (hhgSplitBorderAt({ x, y: MIDDLE, pillRect: PILL, columns: WEEK })) {
                shown.push(Math.round(x * 10) / 10);
            }
        }
        expect(shown[0]).toBe(547.2);
        expect(shown.at(-1)).toBe(562.2);
        expect(shown).toHaveLength(16);
    });

    test("A43 the pill's whole 25 px box: y 213 to 237.5, its 1 px inset included, not y 238 or 212", () => {
        const at = (y) => hhgSplitBorderAt({ x: 558, y, pillRect: PILL, columns: WEEK });
        expect(at(213)).not.toBe(null);
        expect(at(214)).not.toBe(null);
        expect(at(237)).not.toBe(null);
        expect(at(237.5)).not.toBe(null);
        expect(at(212.9)).toBe(null);
        expect(at(211)).toBe(null);
        expect(at(238)).toBe(null);
        expect(at(240)).toBe(null);
    });

    test("E7 A44 no tool at the pill's first and last edges, nor on a one-day pill", () => {
        const first = hhgSplitBorderAt({ x: 305, y: MIDDLE, pillRect: PILL, columns: WEEK });
        expect(first).toBe(null);
        const last = hhgSplitBorderAt({ x: PILL.right - 3, y: MIDDLE, pillRect: PILL, columns: WEEK });
        expect(last).toBe(null);
        const one = { ...PILL, right: 302.985 + 252.203 };
        for (const x of [305, 550, 555.188, 560]) {
            expect(hhgSplitBorderAt({ x, y: MIDDLE, pillRect: one, columns: WEEK })).toBe(null);
        }
    });

    test("A70 a pill cut by the period's edge: the border inside shows, the cut end does not", () => {
        // Friday 20 and Saturday 21 are the last two columns; the pill ends at the grid's edge
        const columns = columnsOf({
            left: 0,
            width: 192,
            count: 2,
            first: DateTime.local(2026, 11, 20),
        });
        const pillRect = { left: 0, right: 384, top: 213, bottom: 237.5 };
        const found = hhgSplitBorderAt({ x: 190, y: MIDDLE, pillRect, columns });
        expect(found.day).toBe("2026-11-21");
        expect(found.borderX).toBe(192);
        expect(hhgSplitBorderAt({ x: 381, y: MIDDLE, pillRect, columns })).toBe(null);
    });

    test("A44 the Quarter range: where both borders of a column are near, the end border wins", () => {
        const columns = columnsOf({ left: 100, width: 14.6, count: 8 });
        const pillRect = { left: 100, right: 100 + 8 * 14.6, top: 213, bottom: 237.5 };
        // the middle of the third column (Wednesday 18): both borders within 8 px
        const middle = 100 + 2 * 14.6 + 7.3;
        const found = hhgSplitBorderAt({ x: middle, y: MIDDLE, pillRect, columns });
        expect(found.day).toBe("2026-11-19");
        expect(found.borderX).toBeWithin(100 + 3 * 14.6 - 0.01, 100 + 3 * 14.6 + 0.01);
        // 1 px after its start only the start border is within 8 px
        const near = hhgSplitBorderAt({ x: 100 + 2 * 14.6 + 1, y: MIDDLE, pillRect, columns });
        expect(near.day).toBe("2026-11-18");
    });

    test("A76 D11 right to left: the border at a column's start is its right edge", () => {
        // Arabic, Week of 14 to 20 November at 1600 px: Monday 16 from x 1037.6 to 1297, Tuesday 17
        // from 778.2 to 1037.6, Wednesday 18 from 518.8 to 778.2
        const make = (day, left, right) => ({ left, right, start: DateTime.local(2026, 11, day) });
        const columns = [make(16, 1037.6, 1297), make(17, 778.2, 1037.6), make(18, 518.8, 778.2)];
        const monday = columns[0];
        const pillRect = { left: 518.8, right: monday.right, top: 213, bottom: 237.5 };
        // 7.6 px left of the border between Monday 16 and Tuesday 17
        const found = hhgSplitBorderAt({ x: monday.left - 7.6, y: 225, pillRect, columns, rtl: true });
        expect(found.day).toBe("2026-11-17");
        expect(found.borderX).toBe(monday.left);
        // the day after the border lies on its left: Tuesday 17
        expect(found.box.right).toBe(monday.left);
        expect(found.box.left).toBeWithin(778.1, 778.3);
        // the edges: Monday's right edge (the pill's start) takes no tool
        expect(hhgSplitBorderAt({ x: monday.right - 3, y: 225, pillRect, columns, rtl: true })).toBe(null);
    });
});

// ---------------------------------------------------------------------------------------------
// The tool in the view
// ---------------------------------------------------------------------------------------------

describe("the split tool in the view", () => {
    let rpcLog;
    let reloads;
    const REQUEST = ["Anita Oliver", [12, "9:00"], [14, "18:00"], { state: "validate" }];
    const ANSWER = { new_ids: [901], end_day: "2026-11-14", end_period: "afternoon", end_hour: 18 };

    beforeEach(async () => {
        mockTimeZone(1);
        mockDate("2026-11-11T10:00:05Z");
        rpcLog = [];
        reloads = 0;
        onRpc("get_gantt_data", function noteReload() {
            reloads += 1;
        });
        onRpc("hhg_cut_request", ({ args, kwargs }) => {
            rpcLog.push(["cut", args, kwargs]);
            return ANSWER;
        });
        onRpc("hhg_rejoin_request", ({ args, kwargs }) => {
            rpcLog.push(["rejoin", args, kwargs]);
            return true;
        });
        await resize({ width: 1600, height: 900 });
    });

    const pillEl = () => queryOne(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
    const middleY = () => {
        const rect = queryRect(pillEl());
        return rect.top + rect.height / 2;
    };
    /** The x of the border after the pill's `n`th day column. */
    const borderAfter = (n) => {
        const width = document.querySelector(".o_tl_col[data-index]").getBoundingClientRect().width;
        return queryRect(pillEl()).left + n * width;
    };
    const settle = async (delay = 300) => {
        await advanceTime(delay);
        await animationFrame();
        await animationFrame();
    };
    let lastPoint;
    const moveTo = async (x) => {
        lastPoint = { x, y: middleY() };
        await hover(pillEl(), { position: lastPoint });
        await animationFrame();
    };
    // a click where the pointer rests (a click on the element alone moves it to the centre)
    const clickHere = () => click(pillEl(), { position: lastPoint });
    const mountLeave = async (options = {}) => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [REQUEST], ...options });
        reloads = 0;
    };

    test("A40 the tool shows 2 px right of a border inside the pill, at the pill's height", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        expect(".o_hhg_split_tool").toHaveCount(1);
        const tool = queryRect(".o_hhg_split_tool");
        const pill = queryRect(pillEl());
        expect(tool.left).toBeWithin(borderAfter(1) - 1.5, borderAfter(1) + 1.5);
        expect(tool.height).toBe(25);
        // the pill's outer box is one pixel taller than its body at each end
        expect(tool.top).toBe(pill.top - 1);
        const line = queryRect(".o_hhg_split_line");
        expect(getComputedStyle(queryOne(".o_hhg_split_line")).borderLeftStyle).toBe("dashed");
        expect(getComputedStyle(queryOne(".o_hhg_split_line")).opacity).toBe("0.6");
        expect(line.top).toBe(tool.top + 2);
        expect(getComputedStyle(queryOne(".o_hhg_split_tool")).pointerEvents).toBe("none");
        // away from the border the tool goes
        await moveTo(borderAfter(1) + 20);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("E7 the first border and the last (the pill's edges) take no tool", async () => {
        await mountLeave();
        await moveTo(borderAfter(0) + 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
        await moveTo(borderAfter(3) - 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("A44 no tool for a user below the Officer group", async () => {
        onRpc("has_group", () => false);
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("A44 no tool in the report view", async () => {
        await mountLeave({
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"]]],
            report: true,
            arch: REPORT_ARCH(),
        });
        await moveTo(borderAfter(1) + 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("A59 no tool on the phone", async () => {
        await resize({ width: 390, height: 844 });
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("A41 a click splits at the day after the border, no popover, the view reloads", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        expect(rpcLog).toHaveLength(1);
        expect(rpcLog[0][0]).toBe("cut");
        expect(rpcLog[0][2].split_day).toBe("2026-11-13");
        expect(".o_hhg_pop").toHaveCount(0);
        expect(reloads).toBe(1);
        expect(".o_notification.o_tl_notification_success").toHaveCount(1);
        expect(".o_notification_buttons > button").toHaveCount(1);
        expect(".o_hhg_split_tool").toHaveCount(0);
    });

    test("R16 a press at the split point that has not moved splits on release; a 10 px move starts the move and hides the tool", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        // pressed and released in place: the split
        const still = await drag(pillEl(), { position: lastPoint });
        await still.drop();
        await settle();
        expect(rpcLog.map(([name]) => name)).toEqual(["cut"]);
        rpcLog.length = 0;
        // pressed, then 12 px along: the move of R12 starts, the tool goes, nothing is cut
        await moveTo(borderAfter(1) + 2);
        const held = await drag(pillEl(), { position: lastPoint });
        for (const shift of [12, 24]) {
            const at = { x: lastPoint.x + shift, y: lastPoint.y };
            await held.moveTo(document.elementFromPoint(at.x, at.y), { position: at });
            await settle(100);
        }
        expect(".o_hhg_split_tool").toHaveCount(0);
        await held.cancel();
        await settle();
        expect(rpcLog).toHaveLength(0);
    });

    test("A45 a click away from a border opens the popover as ever; a split closes the popover", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 20);
        await clickHere();
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        expect(rpcLog).toHaveLength(0);
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        expect(".o_hhg_pop").toHaveCount(0);
        expect(rpcLog).toHaveLength(1);
    });

    test("A45 a second split replaces the notification of the first", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        expect(".o_notification").toHaveCount(1);
        await moveTo(borderAfter(2) + 2);
        await clickHere();
        await settle();
        expect(rpcLog.map((entry) => entry[2].split_day)).toEqual(["2026-11-13", "2026-11-14"]);
        expect(".o_notification").toHaveCount(1);
    });

    test("R17 point 5 a split that creates nothing shows no notification", async () => {
        onRpc("hhg_cut_request", () => ({ ...ANSWER, new_ids: [] }));
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        expect(reloads).toBe(1);
        expect(".o_notification").toHaveCount(0);
    });

    test("A42 Undo calls the rejoin with the answer, then a success notification without Undo", async () => {
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        await click(".o_notification .o_notification_buttons button");
        await settle();
        const rejoin = rpcLog.find(([name]) => name === "rejoin");
        expect(rejoin[2].new_ids).toEqual([901]);
        expect(rejoin[2].end_day).toBe("2026-11-14");
        expect(rejoin[2].end_period).toBe("afternoon");
        expect(rejoin[2].end_hour).toBe(18);
        expect(reloads).toBe(2);
        expect(".o_notification").toHaveCount(1);
        expect(".o_notification.o_tl_notification_success").toHaveCount(1);
        expect(".o_notification .o_notification_buttons button").toHaveCount(0);
    });

    test("A46 E6 Undo that the server answers false shows a danger notification", async () => {
        onRpc("hhg_rejoin_request", () => false);
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        await click(".o_notification .o_notification_buttons button");
        await settle();
        expect(".o_notification").toHaveCount(1);
        expect(".o_notification.o_tl_notification_danger").toHaveCount(1);
    });

    test("E14 Undo that the server refuses with an error shows the error, no success notice, and reloads", async () => {
        expect.errors(1);
        onRpc("hhg_rejoin_request", () => {
            throw new Error("not made by the split");
        });
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        await click(".o_notification .o_notification_buttons button");
        await settle();
        expect.verifyErrors(["RPC_ERROR: not made by the split"]);
        expect(".o_notification.o_tl_notification_success").toHaveCount(0);
        // the view reads the records again, so that it shows what the server holds
        expect(reloads).toBe(2);
    });

    test("R17 point 6 while the call runs the tool is off and a click opens the popover", async () => {
        let resolve;
        const answer = new Promise((done) => (resolve = done));
        onRpc("hhg_cut_request", () => answer);
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await animationFrame();
        // the call is pending: the tool is off, even at the same place
        await moveTo(borderAfter(2) + 2);
        expect(".o_hhg_split_tool").toHaveCount(0);
        await clickHere();
        await settle();
        expect(".o_hhg_pop").toHaveCount(1);
        resolve(ANSWER);
        await settle();
        // after the call it is back
        await moveTo(borderAfter(2) + 3);
        expect(".o_hhg_split_tool").toHaveCount(1);
    });

    test("D9 E11 a refused split shows the error, reloads nothing, and the tool works again", async () => {
        expect.errors(1);
        onRpc("hhg_cut_request", () => {
            throw new Error("gone");
        });
        await mountLeave();
        await moveTo(borderAfter(1) + 2);
        await clickHere();
        await settle();
        expect(reloads).toBe(0);
        expect(".o_notification").toHaveCount(0);
        await moveTo(borderAfter(2) + 2);
        expect(".o_hhg_split_tool").toHaveCount(1);
        expect.verifyErrors(["RPC_ERROR: gone"]);
    });
});

// ---------------------------------------------------------------------------------------------
// Task 8 carry-over: the browser's zone goes in the context of every write
// ---------------------------------------------------------------------------------------------

describe("the browser's zone in the writes (R25)", () => {
    const calls = [];

    beforeEach(async () => {
        // a zone that is not Brussels
        mockTimeZone(5);
        mockDate("2026-11-11T10:00:05Z");
        calls.length = 0;
        for (const method of ["write", "copy", "unlink"]) {
            onRpc(method, ({ method: name, kwargs }) => {
                calls.push([name, kwargs.context?.tz]);
            });
        }
        await resize({ width: 1600, height: 900 });
    });

    test("A24 a move and a copy name the browser's zone, not Brussels", async () => {
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records: [["Anita Oliver", [12, "9:00"], [12, "18:00"], { state: "confirm" }]],
        });
        const rect = queryRect(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        for (const ctrl of [false, true]) {
            if (ctrl) {
                await keyDown("ctrl");
            }
            const helpers = await drag(".o_tl_row:not(.o_tl_total_row) .o_tl_pill", { position: start });
            for (const shift of [30, rect.width]) {
                await helpers.moveTo(document.elementFromPoint(start.x + shift, start.y), {
                    position: { x: start.x + shift, y: start.y },
                });
            }
            await helpers.drop();
            if (ctrl) {
                await keyUp("ctrl");
            }
            await advanceTime(300);
            await animationFrame();
        }
        const names = calls.map(([name]) => name);
        expect(names).toInclude("write");
        expect(names).toInclude("copy");
        for (const [, tz] of calls) {
            expect(tz).toBe("UTC+5");
        }
    });

    test("A52 a deletion names the browser's zone", async () => {
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"], { state: "confirm" }]],
        });
        await click(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
        await advanceTime(300);
        await animationFrame();
        await click(".o_hhg_pop_delete");
        await advanceTime(300);
        await animationFrame();
        expect(calls).toEqual([["unlink", "UTC+5"]]);
    });
});

describe("the browser's zone in the popover's decisions (R25)", () => {
    const calls = [];

    beforeEach(async () => {
        mockTimeZone(5);
        mockDate("2026-11-11T10:00:05Z");
        calls.length = 0;
        for (const method of ["action_approve", "action_refuse", "action_back_to_approval"]) {
            onRpc(method, ({ method: name, kwargs }) => {
                calls.push([name, kwargs.context?.tz]);
                return true;
            });
        }
        await resize({ width: 1600, height: 1400 });
    });

    /** Opens the popover of a request of the given state and flags and presses a button. */
    async function press(extra, button) {
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"], extra]],
        });
        const box = queryRect(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
        await click(".o_tl_row:not(.o_tl_total_row) .o_tl_pill", {
            position: { x: box.left + 10, y: box.top + box.height / 2 },
        });
        await advanceTime(400);
        await animationFrame();
        await animationFrame();
        await click(button);
        await advanceTime(400);
        await animationFrame();
    }

    test("A33 Approve names the browser's zone", async () => {
        await press({ state: "confirm", can_approve: true }, ".o_hhg_pop_approve");
        expect(calls).toEqual([["action_approve", "UTC+5"]]);
    });

    test("A33 Refuse names the browser's zone", async () => {
        await press({ state: "confirm", can_refuse: true }, ".o_hhg_pop_refuse");
        expect(calls).toEqual([["action_refuse", "UTC+5"]]);
    });

    test("A33 Edit (back to approval) names the browser's zone", async () => {
        await press({ state: "validate", can_back_to_approve: true }, ".o_hhg_pop_edit");
        expect(calls).toEqual([["action_back_to_approval", "UTC+5"]]);
    });
});
