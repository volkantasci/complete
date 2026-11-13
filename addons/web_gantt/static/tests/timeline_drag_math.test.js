// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { allowTranslations } from "@web/../tests/web_test_helpers";

import { buildColumns } from "@web_gantt/timeline_dates";
import {
    copyDefaults,
    dragBadges,
    dragStep,
    movedBounds,
    moveWriteValues,
    resizedBound,
    resizeIsInvalid,
    rowAcceptsDrop,
    serializeBound,
    shiftBy,
    undoValues,
} from "@web_gantt/timeline_drag_math";
import { rowValueChain } from "@web_gantt/timeline_editing";

const { DateTime } = luxon;

describe.current.tags("headless");

const d = (iso) => DateTime.fromISO(iso);
const iso = (date) => date.toFormat("yyyy-MM-dd HH:mm");

beforeEach(() => {
    allowTranslations();
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
});

const FIELDS = {
    date_start: { type: "datetime" },
    date_stop: { type: "datetime" },
    parent_id: { type: "many2one" },
    x_contact: { type: "many2one" },
    create_uid: { type: "many2one", readonly: true },
    x_tags: { type: "many2many" },
};
const DT = {
    startField: "date_start",
    stopField: "date_stop",
    startIsDate: false,
    stopIsDate: false,
};
const DATES = { ...DT, startIsDate: true, stopIsDate: true };
const DATE_FIELDS = { date_start: { type: "date" }, date_stop: { type: "date" } };

function dataFor(scaleId, parts, start = "2026-11-08", days = 14) {
    const from = d(start);
    return {
        scaleId,
        parts,
        columns: buildColumns(scaleId, { start: from, stop: from.plus({ days }) }),
    };
}

const record = (start, stop, raw = {}) => ({ id: 1, start: d(start), stop: d(stop), raw });

const build = () => record("2026-11-12T09:00", "2026-11-14T18:00");
const half = { unit: "hours", amount: 12 };

test("dragStep: scale, parts and date-only", () => {
    expect(dragStep(dataFor("day", 4), { dateOnly: false })).toEqual({
        unit: "minutes",
        amount: 15,
    });
    expect(dragStep(dataFor("day", 1), { dateOnly: false })).toEqual({
        unit: "minutes",
        amount: 60,
    });
    expect(dragStep(dataFor("week", 2), { dateOnly: false })).toEqual({
        unit: "hours",
        amount: 12,
    });
    expect(dragStep(dataFor("month", 4), { dateOnly: false })).toEqual({
        unit: "hours",
        amount: 6,
    });
    expect(dragStep(dataFor("year", 1), { dateOnly: false })).toEqual({
        unit: "months",
        amount: 1,
    });
    expect(dragStep(dataFor("week", 2), { dateOnly: true })).toEqual({ unit: "days", amount: 1 });
    expect(dragStep(dataFor("day", 4), { dateOnly: true })).toEqual({ unit: "days", amount: 1 });
    expect(dragStep(dataFor("year", 1), { dateOnly: true })).toEqual({
        unit: "months",
        amount: 1,
    });
});

test("A2 Build moved -1 sub-column of 12 h is not rounded", () => {
    const moved = movedBounds(build(), -1, half, DT);
    expect(iso(moved.start)).toBe("2026-11-11 21:00");
    expect(iso(moved.stop)).toBe("2026-11-14 06:00");
});

test("A15 move to Beta by +2 sub-columns of 12 h, nothing the record holds", () => {
    const design = record("2026-11-09T09:00", "2026-11-11T18:00", {
        parent_id: [1, "Alpha"],
        x_contact: [1, "C1"],
        x_tags: [1],
    });
    const bounds = movedBounds(design, 2, half, DT);
    const rows = [
        { id: "|parent_id=1", fieldName: "parent_id", value: [1, "Alpha"], children: [] },
        { id: "|parent_id=2", fieldName: "parent_id", value: [2, "Beta"], children: [] },
    ];
    const values = moveWriteValues({
        record: design,
        bounds,
        n: 2,
        targetChain: rowValueChain(rows, "|parent_id=2", FIELDS),
        fields: FIELDS,
        placement: DT,
    });
    expect(values).toEqual({
        date_start: "2026-11-10 06:00:00",
        date_stop: "2026-11-12 15:00:00",
        parent_id: 2,
    });
});

test("A16 DST: 06:00-07:30 Brussels moved +24 h keeps the local times", () => {
    mockTimeZone("Europe/Brussels");
    const dst = record("2027-03-27T06:00", "2027-03-27T07:30");
    const bounds = movedBounds(dst, 1, { unit: "hours", amount: 24 }, DT);
    expect(serializeBound(bounds.start, "datetime")).toBe("2027-03-28 04:00:00");
    expect(serializeBound(bounds.stop, "datetime")).toBe("2027-03-28 05:30:00");
    // minutes keep the wall-clock time too
    const back = shiftBy(bounds.start, -1, { unit: "minutes", amount: 60 * 24 }, {});
    expect(back.toFormat("HH:mm")).toBe("06:00");
});

test("A19 badge texts per scale", () => {
    const base = (data, extra) => ({
        start: d("2026-11-12T13:00"),
        stop: d("2026-11-12T17:00"),
        oldStart: d("2026-11-12T13:00"),
        oldStop: d("2026-11-12T17:00"),
        dateOnlyStart: false,
        dateOnlyStop: false,
        kind: "move",
        n: 1,
        data,
        ...extra,
    });
    expect(dragBadges(base(dataFor("day", 2), {})).start.text).toBe("1:00 PM");
    const week = dragBadges(base(dataFor("week", 2), { start: d("2026-11-13T13:00") }));
    expect(week.start.text).toBe("11/13/2026, 1:00 PM");
    const year = dragBadges(base(dataFor("year", 1), { start: d("2026-11-09T13:00") }));
    expect(year.start.text).toBe("11/9/2026");
    const yearResize = dragBadges(
        base(dataFor("year", 1), {
            kind: "resize",
            which: "stop",
            oldStop: d("2026-11-11T18:00"),
            stop: d("2026-12-11T18:00"),
            start: d("2026-11-12T13:00"),
        })
    );
    expect(yearResize.stop.text).toBe("12/11/2026 (+1 months)");
    const dayResize = dragBadges(
        base(dataFor("day", 2), { kind: "resize", which: "stop", stop: d("2026-11-12T17:30") })
    );
    expect(dayResize.stop.text).toBe("5:30 PM (+30 minutes)");
});

test("A20 badge roles", () => {
    const common = {
        start: d("2026-11-12T09:00"),
        stop: d("2026-11-14T18:00"),
        oldStart: d("2026-11-12T09:00"),
        oldStop: d("2026-11-14T18:00"),
        data: dataFor("week", 2),
        dateOnlyStart: false,
        dateOnlyStop: false,
    };
    const roles = (extra) => {
        const { start, stop } = dragBadges({ ...common, ...extra });
        return [start.role, stop.role];
    };
    expect(roles({ kind: "move", n: 2 })).toEqual(["success", "success"]);
    expect(roles({ kind: "move", n: -1 })).toEqual(["danger", "danger"]);
    expect(roles({ kind: "move", n: 0 })).toEqual(["black", "black"]);
    expect(roles({ kind: "copy", n: 1 })).toEqual(["success", "success"]);
    const longer = { kind: "resize", which: "stop", stop: d("2026-11-15T18:00") };
    expect(roles(longer)).toEqual(["black", "success"]);
    const shorter = { kind: "resize", which: "stop", stop: d("2026-11-13T18:00") };
    expect(roles(shorter)).toEqual(["black", "danger"]);
    expect(roles({ kind: "resize", which: "start", start: d("2026-11-11T09:00") })).toEqual([
        "success",
        "black",
    ]);
    expect(roles({ kind: "resize", which: "start", start: d("2026-11-13T09:00") })).toEqual([
        "danger",
        "black",
    ]);
});

test("A27 A28 A73 resize texts", () => {
    const common = {
        kind: "resize",
        data: dataFor("week", 2),
        oldStart: d("2026-11-12T09:00"),
        oldStop: d("2026-11-14T18:00"),
        dateOnlyStart: false,
        dateOnlyStop: false,
        n: 0,
    };
    const shorten = dragBadges({
        ...common,
        which: "stop",
        start: common.oldStart,
        stop: d("2026-11-13T18:00"),
    });
    expect(shorten.stop.text).toBe("11/13/2026, 6:00 PM (-24 hours)");
    expect(shorten.start.text).toBe("11/12/2026, 9:00 AM");
    const earlier = dragBadges({
        ...common,
        which: "start",
        start: d("2026-11-11T09:00"),
        stop: common.oldStop,
    });
    expect(earlier.start.text).toBe("11/11/2026, 9:00 AM (+24 hours)");
    const later = dragBadges({
        ...common,
        which: "start",
        start: d("2026-11-13T09:00"),
        stop: common.oldStop,
    });
    expect(later.start.text).toBe("11/13/2026, 9:00 AM (-24 hours)");
    expect(later.start.role).toBe("danger");
});

test("A30 year resize of Design stop + 1 month", () => {
    const design = record("2026-11-09T09:00", "2026-11-11T18:00");
    const step = dragStep(dataFor("year", 1), { dateOnly: false });
    expect(iso(resizedBound(design, "stop", 1, step, DT))).toBe("2026-12-11 18:00");
    expect(iso(design.stop)).toBe("2026-11-11 18:00");
});

test("A31 A32 invalid resizes", () => {
    const review = record("2026-11-12T10:00", "2026-11-12T14:00");
    const stop = resizedBound(review, "stop", -1, half, DT);
    expect(iso(stop)).toBe("2026-11-12 02:00");
    expect(resizeIsInvalid(review, "stop", stop, DT)).toBe(true);
    const start = resizedBound(review, "start", 1, half, DT);
    expect(iso(start)).toBe("2026-11-12 22:00");
    expect(resizeIsInvalid(review, "start", start, DT)).toBe(true);
    expect(resizeIsInvalid(review, "stop", d("2026-11-12T15:00"), DT)).toBe(false);
    expect(resizeIsInvalid(review, "start", d("2026-11-12T09:00"), DT)).toBe(false);
});

test("A12 many-to-many rows and D3", () => {
    const rows = [
        { id: "t1", fieldName: "x_tags", value: [1, "T1"], children: [] },
        { id: "t2", fieldName: "x_tags", value: [2, "T2"], children: [] },
        { id: "none", fieldName: "x_tags", value: false, isEmptyValueRow: true, children: [] },
    ];
    const run = (raw, rowId) =>
        moveWriteValues({
            record: record("2026-11-12T09:00", "2026-11-12T18:00", raw),
            bounds: { start: d("2026-11-12T09:00"), stop: d("2026-11-12T18:00") },
            n: 0,
            targetChain: rowValueChain(rows, rowId, FIELDS),
            fields: FIELDS,
            placement: DT,
        });
    expect(run({ x_tags: [1] }, "t2")).toEqual({ x_tags: [[6, 0, [2]]] });
    expect(run({ x_tags: [1, 2] }, "t2")).toEqual({});
    expect(run({ x_tags: [1, 2] }, "none")).toEqual({ x_tags: false });
    // Review Focus 5: a record without tags dropped on Undefined holds the value already
    expect(run({ x_tags: [] }, "none")).toEqual({});
    expect(run({}, "none")).toEqual({});
});

const PARENTS = [
    {
        id: "|parent_id=1",
        fieldName: "parent_id",
        value: [1, "Alpha"],
        level: 0,
        children: [
            {
                id: "|parent_id=1|x_contact=1",
                fieldName: "x_contact",
                value: [1, "C1"],
                children: [],
            },
        ],
    },
    {
        id: "|parent_id=2",
        fieldName: "parent_id",
        value: [2, "Beta"],
        level: 0,
        children: [
            {
                id: "|parent_id=2|x_contact=3",
                fieldName: "x_contact",
                value: [3, "Floyd"],
                children: [],
            },
        ],
    },
];

test("A10 two levels: Parent Beta and Contact Floyd", () => {
    const review = record("2026-11-12T13:00", "2026-11-12T17:00", {
        parent_id: [1, "Alpha"],
        x_contact: [2, "Douglas"],
    });
    const values = moveWriteValues({
        record: review,
        bounds: { start: review.start, stop: review.stop },
        n: 0,
        targetChain: rowValueChain(PARENTS, "|parent_id=2|x_contact=3", FIELDS),
        fields: FIELDS,
        placement: DT,
    });
    expect(values).toEqual({ parent_id: 2, x_contact: 3 });
});

test("A11 group row writes the Parent only", () => {
    const review = record("2026-11-12T13:00", "2026-11-12T17:00", {
        parent_id: [1, "Alpha"],
        x_contact: [2, "Douglas"],
    });
    const run = (rowId) =>
        moveWriteValues({
            record: review,
            bounds: { start: review.start, stop: review.stop },
            n: 0,
            targetChain: rowValueChain(PARENTS, rowId, FIELDS),
            fields: FIELDS,
            placement: DT,
        });
    expect(run("|parent_id=2")).toEqual({ parent_id: 2 });
    // A72: the group row above its own row holds the value already
    expect(run("|parent_id=1")).toEqual({});
});

test("A23 A72 copyDefaults always has start and stop", () => {
    const bounds = { start: d("2026-11-12T13:00"), stop: d("2026-11-12T17:00") };
    expect(
        copyDefaults({
            bounds,
            targetChain: rowValueChain(PARENTS, "|parent_id=2", FIELDS),
            fields: FIELDS,
            placement: DT,
        })
    ).toEqual({
        date_start: "2026-11-12 10:00:00",
        date_stop: "2026-11-12 14:00:00",
        parent_id: 2,
    });
    // on its own place: every grouping value of the target is given, also those held
    expect(
        copyDefaults({
            bounds,
            targetChain: rowValueChain(PARENTS, "|parent_id=1|x_contact=1", FIELDS),
            fields: FIELDS,
            placement: DT,
        })
    ).toEqual({
        date_start: "2026-11-12 10:00:00",
        date_stop: "2026-11-12 14:00:00",
        parent_id: 1,
        x_contact: 1,
    });
    const tags = [
        { id: "none", fieldName: "x_tags", value: false, isEmptyValueRow: true, children: [] },
    ];
    expect(
        copyDefaults({
            bounds,
            targetChain: rowValueChain(tags, "none", FIELDS),
            fields: FIELDS,
            placement: DT,
        }).x_tags
    ).toBe(false);
});

test("A39 A40 undoValues", () => {
    const design = record("2026-11-09T09:00", "2026-11-11T18:00", {
        date_start: "2026-11-09 06:00:00",
        date_stop: "2026-11-11 15:00:00",
        parent_id: [1, "Alpha"],
        x_tags: [1],
    });
    const fromParent = rowValueChain(PARENTS, "|parent_id=1", FIELDS);
    const params = { record: design, fromChain: fromParent, fields: FIELDS, placement: DT };
    expect(undoValues({ kind: "move", ...params })).toEqual({
        date_start: "2026-11-09 06:00:00",
        date_stop: "2026-11-11 15:00:00",
        parent_id: 1,
    });
    const tags = [{ id: "t1", fieldName: "x_tags", value: [1, "T1"], children: [] }];
    const undo = (rec) =>
        undoValues({
            kind: "move",
            record: rec,
            fromChain: rowValueChain(tags, "t1", FIELDS),
            fields: FIELDS,
            placement: DT,
        });
    expect(undo(design).x_tags).toEqual([[6, 0, [1]]]);
    const buildRecord = record("2026-11-12T09:00", "2026-11-14T18:00", { x_tags: [1, 2] });
    expect(undo(buildRecord).x_tags).toEqual([[6, 0, [1, 2]]]);
    expect(undo(record("2026-11-12T09:00", "2026-11-14T18:00", { x_tags: [] })).x_tags).toBe(
        false
    );
    // a resize writes the bounds only, a copy nothing
    expect(Object.keys(undoValues({ kind: "resize", ...params }))).toEqual([
        "date_start",
        "date_stop",
    ]);
    expect(undoValues({ kind: "copy", ...params })).toEqual({});
});

function creatorRows() {
    const leaf = (parent, creator, contact) => ({
        id: `|parent_id=${parent}|create_uid=${creator}${contact ? `|x_contact=${contact}` : ""}`,
        children: [],
    });
    const make = (parent) => ({
        id: `|parent_id=${parent}`,
        children: [{ ...leaf(parent, 1), children: [leaf(parent, 1, 1), leaf(parent, 1, 2)] }],
    });
    return [make(1), make(2)];
}

test("A50 rowAcceptsDrop with a read-only second level (H30)", () => {
    const rows = creatorRows();
    const groupBy = ["parent_id", "create_uid"];
    const startRowId = "|parent_id=1|create_uid=1";
    const ok = (rowId) => rowAcceptsDrop({ rows, rowId, startRowId, groupBy, fields: FIELDS });
    expect(ok("|parent_id=1|create_uid=1")).toBe(true);
    expect(ok("|parent_id=2|create_uid=1")).toBe(false);
    expect(ok("|parent_id=2")).toBe(true);
    expect(ok("|parent_id=1")).toBe(true);
    expect(ok("missing")).toBe(false);
    // no read-only level: everything accepts
    expect(
        rowAcceptsDrop({
            rows,
            rowId: "|parent_id=2|create_uid=1",
            startRowId: "x",
            groupBy: ["parent_id"],
            fields: FIELDS,
        })
    ).toBe(true);
});

test("A51 rowAcceptsDrop below the read-only level (H32)", () => {
    const rows = creatorRows();
    const groupBy = ["parent_id", "create_uid", "x_contact"];
    const startRowId = "|parent_id=1|create_uid=1|x_contact=2";
    const ok = (rowId) => rowAcceptsDrop({ rows, rowId, startRowId, groupBy, fields: FIELDS });
    expect(ok("|parent_id=1|create_uid=1|x_contact=1")).toBe(true);
    expect(ok(startRowId)).toBe(true);
    expect(ok("|parent_id=1|create_uid=1")).toBe(false);
    expect(ok("|parent_id=2|create_uid=1|x_contact=1")).toBe(false);
    expect(ok("|parent_id=2|create_uid=1")).toBe(false);
    expect(ok("|parent_id=2")).toBe(true);
});

test("A58 date-only: whole-day steps, badges and resize", () => {
    const data = dataFor("month", 2, "2026-11-01", 30);
    const step = dragStep(data, { dateOnly: true });
    expect(step).toEqual({ unit: "days", amount: 1 });
    const rec = { id: 2, start: d("2026-11-11"), stop: d("2026-11-13"), raw: {} };
    const bounds = movedBounds(rec, -1, step, DATES);
    expect(bounds.start.toISODate()).toBe("2026-11-10");
    expect(bounds.stop.toISODate()).toBe("2026-11-12");
    expect(
        moveWriteValues({
            record: rec,
            bounds,
            n: -1,
            targetChain: {},
            fields: DATE_FIELDS,
            placement: DATES,
        })
    ).toEqual({ date_start: "2026-11-10", date_stop: "2026-11-12" });
    const badges = dragBadges({
        ...bounds,
        kind: "move",
        n: -1,
        oldStart: rec.start,
        oldStop: rec.stop,
        data,
        dateOnlyStart: true,
        dateOnlyStop: true,
    });
    expect([badges.start.text, badges.stop.text]).toEqual(["11/10/2026", "11/12/2026"]);
    const stop = resizedBound(rec, "stop", -1, step, DATES);
    expect(stop.toISODate()).toBe("2026-11-12");
    expect(resizeIsInvalid(rec, "stop", stop, DATES)).toBe(false);
    const resize = dragBadges({
        start: rec.start,
        stop,
        which: "stop",
        kind: "resize",
        n: 0,
        oldStart: rec.start,
        oldStop: rec.stop,
        data,
        dateOnlyStart: true,
        dateOnlyStop: true,
    });
    expect(resize.stop.text).toBe("11/12/2026 (-1 days)");
    expect(resize.stop.role).toBe("danger");
    // a date-only pill is never shorter than one day
    expect(resizeIsInvalid(rec, "stop", d("2026-11-11"), DATES)).toBe(false);
    expect(resizeIsInvalid(rec, "stop", d("2026-11-10"), DATES)).toBe(true);
    expect(resizeIsInvalid(rec, "start", d("2026-11-13"), DATES)).toBe(false);
    expect(resizeIsInvalid(rec, "start", d("2026-11-14"), DATES)).toBe(true);
});

test("A59.5 year date-only: Next month +1 month", () => {
    const data = dataFor("year", 1, "2026-01-01", 365);
    const step = dragStep(data, { dateOnly: true });
    const rec = { id: 3, start: d("2026-12-07"), stop: d("2026-12-22"), raw: {} };
    const bounds = movedBounds(rec, 1, step, DATES);
    expect([bounds.start.toISODate(), bounds.stop.toISODate()]).toEqual([
        "2027-01-07",
        "2027-01-22",
    ]);
    const badges = dragBadges({
        ...bounds,
        kind: "move",
        n: 1,
        oldStart: rec.start,
        oldStop: rec.stop,
        data,
        dateOnlyStart: true,
        dateOnlyStop: true,
    });
    expect([badges.start.text, badges.stop.text]).toEqual(["1/7/2027", "1/22/2027"]);
    const resize = dragBadges({
        start: rec.start,
        stop: bounds.stop,
        which: "stop",
        kind: "resize",
        n: 0,
        oldStart: rec.start,
        oldStop: rec.stop,
        data,
        dateOnlyStart: true,
        dateOnlyStop: true,
    });
    expect(resize.stop.text).toBe("1/22/2027 (+1 months)");
    // R17.5: on the year scale a date-only resize can still be invalid
    const short = record("2026-11-20", "2026-12-05");
    const shortStop = resizedBound(short, "stop", -1, step, DATES);
    expect(shortStop.toISODate()).toBe("2026-11-05");
    expect(resizeIsInvalid(short, "stop", shortStop, DATES)).toBe(true);
});

test("serializeBound formats", () => {
    expect(serializeBound(d("2026-11-12T09:00"), "datetime")).toBe("2026-11-12 06:00:00");
    expect(serializeBound(d("2026-11-12T23:30"), "date")).toBe("2026-11-12");
    expect(serializeBound(null, "date")).toBe(false);
});

test("A62 R-C-7 the difference of a resize badge is written with the user's digits, whole badge", () => {
    const arabic = (text) => DateTime.fromISO(text, { locale: "ar-EG" });
    const badges = dragBadges({
        kind: "resize",
        which: "stop",
        start: arabic("2026-11-12T09:00"),
        oldStart: arabic("2026-11-12T09:00"),
        oldStop: arabic("2026-11-14T18:00"),
        stop: arabic("2026-11-15T18:00"),
        data: dataFor("week", 2),
        dateOnlyStart: false,
        dateOnlyStop: false,
    });
    const text = badges.stop.text;
    expect(/[0-9]/.test(text)).toBe(false);
    expect(text).toMatch(/\(\+\u0662\u0664 hours\)$/);
    expect(text).toMatch(/[\u0660-\u0669]/);
    // a date-only bound: days, in the same digits
    const dateOnly = dragBadges({
        kind: "resize",
        which: "stop",
        start: arabic("2026-11-11"),
        oldStart: arabic("2026-11-11"),
        oldStop: arabic("2026-11-13"),
        stop: arabic("2026-11-12"),
        data: dataFor("week", 2),
        dateOnlyStart: true,
        dateOnlyStop: true,
    });
    expect(/[0-9]/.test(dateOnly.stop.text)).toBe(false);
    expect(dateOnly.stop.text).toMatch(/\(-\u0661 days\)$/);
});
