// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { mountTimeOff, REPORT_ARCH, setupTimeOffFixtures, utc } from "./time_off_test_helpers";

describe.current.tags("desktop");

setupTimeOffFixtures();

const WRITES = ["web_save", "write", "create", "copy", "unlink"];

/** The ORM calls that write, with their arguments. */
let writes;

beforeEach(async () => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
    writes = [];
    for (const method of WRITES) {
        onRpc(method, ({ method: name, args }) => {
            writes.push([name, args]);
        });
    }
    await resize({ width: 1600, height: 900 });
});

const pillEl = () => queryOne(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
const pillRect = () => queryRect(pillEl());
const root = () => queryOne(".o_timeline_view");
const cursorAt = ({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor;
const middle = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** One request of the given state on 12 to 14 November, in the leave view. */
const mountLeave = (state, { to = 14, from = 12 } = {}) =>
    mountTimeOff({
        employees: ["Anita Oliver"],
        records: [["Anita Oliver", [from, "9:00"], [to, "18:00"], { state }]],
    });

/** Press at the pill's centre, move 120 px to the right and keep the button down. */
async function pressAndMove({ ctrl = false } = {}) {
    const start = middle(pillRect());
    if (ctrl) {
        await keyDown("ctrl");
    }
    const helpers = await drag(pillEl(), { position: start });
    await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
        position: { x: start.x + 120, y: start.y },
    });
    await animationFrame();
    return helpers;
}

async function settle() {
    await advanceTime(300);
    await animationFrame();
}

describe("a request To Approve", () => {
    test("A23 the hand over the pill, resize pointers on the two handles", async () => {
        await mountLeave("confirm");
        await hover(pillEl());
        await animationFrame();
        expect(".o_tl_handle").toHaveCount(2);
        const rect = pillRect();
        const y = rect.top + rect.height / 2;
        expect(cursorAt({ x: rect.left + rect.width / 2, y })).toBe("pointer");
        expect(cursorAt({ x: rect.left + 4, y })).toBe("w-resize");
        expect(cursorAt({ x: rect.right - 4, y })).toBe("e-resize");
    });

    test("A24 a move writes the dates (a day later) and no other value", async () => {
        await mountLeave("confirm", { from: 12, to: 12 });
        const before = Math.round(pillRect().left);
        const start = middle(pillRect());
        const day = pillRect().width;
        const helpers = await drag(pillEl(), { position: start });
        await helpers.moveTo(document.elementFromPoint(start.x + 30, start.y), {
            position: { x: start.x + 30, y: start.y },
        });
        await helpers.moveTo(document.elementFromPoint(start.x + day, start.y), {
            position: { x: start.x + day, y: start.y },
        });
        await animationFrame();
        expect(".o_tl_pill_lock").toHaveCount(0);
        await helpers.drop();
        await settle();
        expect(writes.map(([name]) => name)).toEqual(["write"]);
        const values = writes[0][1][1];
        expect(Object.keys(values).sort()).toEqual(["start", "stop"]);
        expect(Math.round(pillRect().left)).toBeGreaterThan(before);
    });

    test("A27 a resize of the end handle writes the end alone", async () => {
        await mountLeave("confirm", { from: 12, to: 12 });
        await hover(pillEl());
        await animationFrame();
        const rect = pillRect();
        const start = { x: rect.right - 4, y: rect.top + rect.height / 2 };
        const helpers = await drag(".o_tl_handle_stop", { position: start });
        const end = { x: start.x + rect.width, y: start.y };
        await helpers.moveTo(document.elementFromPoint(end.x, end.y), { position: end });
        await helpers.drop();
        await settle();
        expect(writes.map(([name]) => name)).toEqual(["write"]);
        const values = writes[0][1][1];
        expect(Object.keys(values)).toEqual(["stop"]);
        expect(values.stop).not.toBe(utc(12, "18:00"));
    });
});

for (const [name, state] of [
    ["Second Approval", "validate1"],
    ["Approved", "validate"],
]) {
    describe(`a request at ${name} (D7)`, () => {
        test("A23 the hand, no handle, not even at the ends", async () => {
            await mountLeave(state);
            await hover(pillEl());
            await animationFrame();
            expect(".o_tl_handle").toHaveCount(0);
            const rect = pillRect();
            const y = rect.top + rect.height / 2;
            for (const x of [rect.left + 4, rect.left + rect.width / 2, rect.right - 4]) {
                expect(cursorAt({ x, y })).toBe("pointer");
            }
        });

        for (const ctrl of [false, true]) {
            test(`A25 A86 a press and drag${ctrl ? " with Ctrl" : ""} shows the lock, writes nothing, opens nothing`, async () => {
                await mountLeave(state);
                const before = Math.round(pillRect().left);
                const helpers = await pressAndMove({ ctrl });
                expect(".o_tl_pill_moved .o_tl_pill_lock").toHaveCount(1);
                expect(root()).toHaveClass("o_tl_drag_lock");
                expect(cursorAt(middle(pillRect()))).toBe("not-allowed");
                expect(".o_tl_drop").toHaveCount(0);
                expect(".o_tl_selection_badge").toHaveCount(0);
                await helpers.drop();
                if (ctrl) {
                    await keyUp("ctrl");
                }
                await settle();
                expect(".o_tl_pill_moved").toHaveCount(0);
                expect(".o_hhg_pop").toHaveCount(0);
                expect(".modal").toHaveCount(0);
                expect(writes).toEqual([]);
                expect(Math.round(pillRect().left)).toBe(before);
            });
        }

        test("A28 a press at 4 px inside the right end and a drag resize nothing", async () => {
            await mountLeave(state);
            await hover(pillEl());
            await animationFrame();
            const rect = pillRect();
            const start = { x: rect.right - 4, y: rect.top + rect.height / 2 };
            const helpers = await drag(pillEl(), { position: start });
            await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
                position: { x: start.x + 120, y: start.y },
            });
            await animationFrame();
            expect(".o_tl_pill_moved .o_tl_pill_lock").toHaveCount(1);
            await helpers.drop();
            await settle();
            expect(writes).toEqual([]);
            expect(Math.round(pillRect().right)).toBe(Math.round(rect.right));
        });

        test("a plain click still opens the popover", async () => {
            await mountLeave(state);
            const helpers = await drag(pillEl(), { position: middle(pillRect()) });
            await helpers.drop();
            await settle();
            expect(".o_hhg_pop").toHaveCount(1);
            expect(writes).toEqual([]);
        });
    });
}

describe("the report view", () => {
    const mountReport = () =>
        mountTimeOff({
            employees: ["Anita Oliver"],
            records: [["Anita Oliver", [12, "9:00"], [14, "18:00"]]],
            report: true,
            arch: REPORT_ARCH(),
        });

    test("A66 A79 the hand, no handle, a press and drag moves nothing", async () => {
        await mountReport();
        await hover(pillEl());
        await animationFrame();
        expect(".o_tl_handle").toHaveCount(0);
        const rect = pillRect();
        const y = rect.top + rect.height / 2;
        for (const x of [rect.left + 4, rect.left + rect.width / 2, rect.right - 4]) {
            expect(cursorAt({ x, y })).toBe("pointer");
        }
        const before = Math.round(rect.left);
        const helpers = await pressAndMove();
        expect(".o_tl_pill_moved .o_tl_pill_lock").toHaveCount(1);
        expect(".o_tl_selection_badge").toHaveCount(0);
        expect(".o_tl_drop").toHaveCount(0);
        await helpers.drop();
        await settle();
        expect(writes).toEqual([]);
        expect(Math.round(pillRect().left)).toBe(before);
    });
});

describe("empty cells", () => {
    test("A23 D4 the pointer keeps its default shape over an empty cell", async () => {
        await mountLeave("confirm");
        const cell = queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_cell")[20];
        const rect = queryRect(cell);
        expect(cursorAt({ x: rect.left + 10, y: rect.top + rect.height / 2 })).toBe("default");
    });
});
