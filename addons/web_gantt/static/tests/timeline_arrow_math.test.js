// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { deserializeDate, deserializeDateTime } from "@web/core/l10n/dates";
import {
    ARROW_COLOURS,
    arrowConflict,
    arrowRoute,
    dependencyPairs,
} from "@web_gantt/timeline_arrow_math";

describe.current.tags("headless");

test("002c A16: routes of the four measured arrows", () => {
    const cases = [
        [{ x: 932, y: 260.5 }, { x: 934, y: 260.5 }, { x: 904, y: 260.5, width: 58, height: 0 }],
        [{ x: 1508, y: 260.5 }, { x: 1126, y: 326.5 }, { x: 1096, y: 260.5, width: 442, height: 66 }],
        [{ x: 1124, y: 285.5 }, { x: 550, y: 417.5 }, { x: 520, y: 285.5, width: 634, height: 132 }],
        [{ x: 1508, y: 260.5 }, { x: 934, y: 442.5 }, { x: 904, y: 260.5, width: 634, height: 182 }],
    ];
    for (const [from, to, box] of cases) {
        expect(arrowRoute(from, to).box).toEqual(box);
    }
    expect(arrowRoute({ x: 1508, y: 260.5 }, { x: 1126, y: 326.5 }).mid).toEqual({
        x: 1317,
        y: 293.5,
    });
});

test("002c A16: a forward route turns halfway", () => {
    const route = arrowRoute({ x: 100, y: 50 }, { x: 300, y: 90 });
    expect(route.box).toEqual({ x: 100, y: 50, width: 200, height: 40 });
    // the vertical leg is at x = 200, corners of radius 8
    expect(route.d).toBe("M100 50 L192 50 A8 8 0 0 1 200 58 L200 82 A8 8 0 0 0 208 90 L300 90");
    // a straight line when the heights are equal
    expect(arrowRoute({ x: 100, y: 50 }, { x: 300, y: 50 }).d).toBe("M100 50 L300 50");
    // a small dx shrinks the horizontal radius to half of dx
    expect(arrowRoute({ x: 100, y: 50 }, { x: 110, y: 90 }).d.includes("A5 8")).toBe(true);
});

test("002c A17: right-to-left mirrors the route", () => {
    const ltr = arrowRoute({ x: 100, y: 50 }, { x: 300, y: 90 });
    const rtl = arrowRoute({ x: 300, y: 50 }, { x: 100, y: 90 }, { rtl: true });
    expect(rtl.box).toEqual(ltr.box);
    expect(rtl.d).toBe("M300 50 L208 50 A8 8 0 0 0 200 58 L200 82 A8 8 0 0 1 192 90 L100 90");
    // wrap-around: the legs leave to the left of the source and enter from the right
    const wrap = arrowRoute({ x: 500, y: 50 }, { x: 800, y: 150 }, { rtl: true });
    expect(wrap.box).toEqual({ x: 470, y: 50, width: 360, height: 100 });
});

test("002c A18: colours", () => {
    const fields = { startField: "start", stopField: "stop" };
    const span = (from, to) => ({
        start: deserializeDateTime(from),
        stop: deserializeDateTime(to),
    });
    const source = span("2026-11-02 08:00:00", "2026-11-04 08:00:00");
    const colour = (start) => arrowConflict(source, span(start, "2026-11-09 08:00:00"), fields);
    expect(colour("2026-11-04 08:00:00")).toBe("none");
    expect(colour("2026-11-03 08:00:00")).toBe("warning");
    expect(colour("2026-11-02 08:00:00")).toBe("warning");
    expect(colour("2026-11-01 08:00:00")).toBe("error");
    expect(arrowConflict(source, { start: null, stop: null }, fields)).toBe("none");
    // serialized strings are accepted
    expect(
        arrowConflict(
            { start: "2026-11-02 08:00:00", stop: "2026-11-04 08:00:00" },
            { start: "2026-11-03 08:00:00" },
            fields
        )
    ).toBe("warning");
    expect(ARROW_COLOURS).toEqual({
        none: [143, 143, 143],
        warning: [236, 151, 31],
        error: [211, 65, 59],
    });
});

test("002c A19: date-only stop counts as the end of its day", () => {
    const fields = { startField: "start", stopField: "stop", dateOnly: true };
    const day = (text) => deserializeDate(text);
    const source = { start: day("2026-11-02"), stop: day("2026-11-04") };
    const colour = (start, options = fields) =>
        arrowConflict(source, { start: day(start), stop: day("2026-11-09") }, options);
    expect(colour("2026-11-04")).toBe("warning");
    expect(colour("2026-11-05")).toBe("none");
    expect(colour("2026-11-01")).toBe("error");
    // without the flag the stored dates are compared
    expect(colour("2026-11-04", { ...fields, dateOnly: false })).toBe("none");
});

test("002c A19: a model with a date start and a datetime stop reads each field", () => {
    // only a date stop counts as the end of its day
    const source = { start: deserializeDate("2026-11-02"), stop: deserializeDateTime("2026-11-04 08:00:00") };
    const target = (start) => ({ start: deserializeDateTime(start) });
    const options = { startField: "start", stopField: "stop", startIsDate: true, stopIsDate: false };
    expect(arrowConflict(source, target("2026-11-04 12:00:00"), options)).toBe("none");
    expect(arrowConflict(source, target("2026-11-04 07:00:00"), options)).toBe("warning");
    const dateStop = { start: deserializeDateTime("2026-11-02 08:00:00"), stop: deserializeDate("2026-11-04") };
    const options2 = { startField: "start", stopField: "stop", startIsDate: false, stopIsDate: true };
    expect(arrowConflict(dateStop, target("2026-11-04 12:00:00"), options2)).toBe("warning");
    expect(arrowConflict(dateStop, target("2026-11-05 00:00:00"), options2)).toBe("none");
});

function records(spec) {
    return new Map(
        Object.entries(spec).map(([id, deps]) => [Number(id), { id: Number(id), raw: { dep: deps } }])
    );
}

test("002c A14: pairs in several rows (H43)", () => {
    // 1 Design, 2 Build, 3 Test, 4 Review, 5 Overlap A; Build is in rows C and V, Review and
    // Overlap A (neither has a tag) both in the row U
    const rows = [
        { kind: "group", row: { id: "g", recordIds: [1, 2, 3, 4, 5] } },
        { kind: "pills", row: { id: "C", recordIds: [1, 2] } },
        { kind: "pills", row: { id: "V", recordIds: [2] } },
        { kind: "pills", row: { id: "U", recordIds: [3, 4, 5] } },
    ];
    const pairs = dependencyPairs(rows, records({ 1: [], 2: [1], 3: [2], 4: [], 5: [4] }), "dep");
    // five arrows: the four of A14 and Review to Overlap A (the fifth) inside the row U
    expect(pairs.map((pair) => pair.key)).toEqual([
        "C|1>C|2",
        "C|1>V|2",
        "C|2>U|3",
        "V|2>U|3",
        "U|4>U|5",
    ]);
    expect(pairs[1]).toEqual({
        key: "C|1>V|2",
        sourceId: 1,
        targetId: 2,
        sourceRowId: "C",
        targetRowId: "V",
    });
});

test("002c A14: a missing source gives no pair", () => {
    const rows = [{ kind: "pills", id: "r", recordIds: [1, 2] }];
    expect(dependencyPairs(rows, records({ 1: [], 2: [1] }), "dep")).toHaveLength(1);
    // the source is archived or outside the period: not loaded, no pair, no error
    expect(dependencyPairs(rows, records({ 2: [1, 99] }), "dep")).toEqual([]);
    expect(dependencyPairs(rows, records({ 1: false, 2: false }), "dep")).toEqual([]);
});
