// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, hover, queryAll, queryAllTexts, queryOne, queryRect } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { contains, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { AttendanceTimelineEditor } from "../src/attendance_timeline_editor";
import { mountAttendances, setupAttendanceFixtures, utc } from "./attendance_test_helpers";

describe.current.tags("desktop");

setupAttendanceFixtures();

/** What the server saw: `write` and `gantt_undo_drag_drop` calls, in order. */
let log;
/** What the editor's write hook saw: `{kind, steps}` of every gesture. */
let gestures;

// The browser's clock is 11 Nov 11:00:02 in Brussels (UTC+1), the load's "now".
beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:02Z");
    patchWithCleanup(localization, { weekStart: 7 });
    log = [];
    gestures = [];
    patchWithCleanup(AttendanceTimelineEditor.prototype, {
        writeValuesFor(change) {
            gestures.push({ kind: change.kind, steps: change.steps });
            return super.writeValuesFor(change);
        },
    });
    onRpc("hag.attendance", "write", ({ args, parent }) => {
        log.push({ call: "write", values: args[1] });
        return parent();
    });
    onRpc("gantt_undo_drag_drop", ({ kwargs }) => {
        log.push({ call: "undo", values: kwargs.values });
        return true;
    });
});

const titlesOf = () => queryAllTexts(".o_tl_pill .o_tl_pill_title");

/** Width of one quarter hour of the Day range, from the width of an hour cell of the grid. */
const quarter = () => {
    const cell = queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_cell")[0];
    return queryRect(cell).width / 4;
};

/**
 * Presses `element` (or its `handle`, shown by a hover) and drags it `dx` px to the right (left
 * when negative), then drops.
 */
async function dragBy(pill, dx, handle) {
    if (handle) {
        await hover(pill);
        await animationFrame();
    }
    const element = handle ? queryOne(`.o_tl_handle_${handle}`, { root: pill }) : pill;
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const x = start.x + dx;
    const target = document.elementFromPoint(x, start.y) || queryOne(".o_tl_renderer");
    await helpers.moveTo(target, { position: { x, y: start.y } });
    await animationFrame();
    await helpers.drop();
    await advanceTime(100);
    await animationFrame();
}

describe("a pill cut at the start of the day", () => {
    // 10 Nov 4:00 to 11 Nov 4:00 Brussels (A - 24h), then one just after it
    const mountCut = () =>
        mountAttendances({
            employees: ["Anita Oliver"],
            attendances: [
                ["Anita Oliver", [10, "4:00"], [11, "4:00"]],
                ["Anita Oliver", [11, "4:00:10"], [11, "9:00"]],
            ],
        });

    test("A33 resizing the uncut end writes the end only, and Undo gives the real check-in back", async () => {
        await mountCut();
        const cut = queryOne(".o_tl_pill_cut_start");
        expect(cut).toHaveCount(1);
        await dragBy(cut, -4 * quarter(), "stop");
        const write = log.find((entry) => entry.call === "write");
        expect(Object.keys(write.values)).toEqual(["check_out"]);
        expect(write.values.check_out).toBe(utc(11, "3:00"));
        await contains(".o_notification .o_notification_buttons button").click();
        await animationFrame();
        const undo = log.find((entry) => entry.call === "undo");
        // the start of the record is on the 10th: not the clipped visible start
        expect(undo.values.check_in).toBe(utc(10, "4:00"));
        expect(undo.values.check_out).toBe(utc(11, "4:00"));
    });
});

describe("an open attendance (R18)", () => {
    // open since 8:00, the data loaded at 11:00:02 (the clock of beforeEach): drawn 8:00 to 11:15
    const mountOpen = () =>
        mountAttendances({
            employees: ["Anita Oliver"],
            attendances: [["Anita Oliver", [11, "8:00"], null]],
        });
    const pill = () => queryOne(".o_tl_pill");
    const undo = async () => {
        await contains(".o_notification .o_notification_buttons button").click();
        await animationFrame();
        // the row's own value (the employee) goes with the undo of a move, as for any record
        const { employee_id, ...values } = log.find((entry) => entry.call === "undo").values;
        return values;
    };
    const writes = () => log.filter((entry) => entry.call === "write");

    test("R18 a move writes the check-in only, Undo gives it back and empties the check-out", async () => {
        await mountOpen();
        expect(titlesOf()).toEqual(["A"]);
        await dragBy(pill(), 8 * quarter());
        expect(gestures).toEqual([{ kind: "move", steps: 8 }]);
        expect(writes().map((entry) => entry.values)).toEqual([{ check_in: utc(11, "10:00") }]);
        expect(await undo()).toEqual({ check_in: utc(11, "8:00"), check_out: false });
    });

    test("R18 a move to another employee's row writes the employee and the check-in, no check-out", async () => {
        const ids = await mountAttendances({
            employees: ["Anita Oliver", "Beth Evans"],
            attendances: [["Anita Oliver", [11, "8:00"], null]],
            expand: true,
        }).then(({ ids }) => ids);
        const rows = queryAll(".o_tl_row:not(.o_tl_total_row)");
        const rect = queryRect(pill());
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const target = queryRect(rows[1]);
        const end = { x: start.x + 4 * quarter(), y: target.top + target.height / 2 };
        const helpers = await drag(pill(), { position: start });
        await helpers.moveTo(document.elementFromPoint(end.x, end.y), { position: end });
        await animationFrame();
        await helpers.drop();
        await advanceTime(100);
        await animationFrame();
        expect(writes().map((entry) => entry.values)).toEqual([
            { check_in: utc(11, "9:00"), employee_id: ids["Beth Evans"] },
        ]);
    });

    test("R18 a move to the left has negative steps", async () => {
        await mountOpen();
        await dragBy(pill(), -4 * quarter());
        expect(gestures).toEqual([{ kind: "move", steps: -4 }]);
        expect(writes().map((entry) => entry.values)).toEqual([{ check_in: utc(11, "7:00") }]);
    });

    test("R18 dragging the end writes now plus the steps, with now's seconds", async () => {
        await mountOpen();
        await dragBy(pill(), 4 * quarter(), "stop");
        expect(gestures).toEqual([{ kind: "resize-stop", steps: 4 }]);
        // 11:00:02 Brussels time plus one hour, though the pill was drawn to 11:15
        expect(writes().map((entry) => entry.values)).toEqual([{ check_out: utc(11, "12:00:02") }]);
        expect(await undo()).toEqual({ check_in: utc(11, "8:00"), check_out: false });
    });

    test("R18 dragging the end to the left has negative steps", async () => {
        await mountOpen();
        await dragBy(pill(), -4 * quarter(), "stop");
        expect(gestures).toEqual([{ kind: "resize-stop", steps: -4 }]);
        expect(writes().map((entry) => entry.values)).toEqual([{ check_out: utc(11, "10:00:02") }]);
    });

    test("R18 dragging the start writes the check-in, Undo gives the earlier check-in alone", async () => {
        await mountOpen();
        await dragBy(pill(), -4 * quarter(), "start");
        expect(gestures).toEqual([{ kind: "resize-start", steps: -4 }]);
        expect(writes().map((entry) => entry.values)).toEqual([{ check_in: utc(11, "7:00") }]);
        expect(await undo()).toEqual({ check_in: utc(11, "8:00") });
    });

    test("R18 a closed attendance keeps the values of a move, a resize and Undo", async () => {
        await mountAttendances({
            employees: ["Anita Oliver"],
            attendances: [["Anita Oliver", [11, "7:00"], [11, "9:30"]]],
        });
        await dragBy(pill(), 8 * quarter());
        expect(writes().map((entry) => entry.values)).toEqual([
            { check_in: utc(11, "9:00"), check_out: utc(11, "11:30") },
        ]);
        expect(await undo()).toEqual({ check_in: utc(11, "7:00"), check_out: utc(11, "9:30") });
    });
});
