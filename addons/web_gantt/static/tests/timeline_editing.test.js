// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { allowTranslations } from "@web/../tests/web_test_helpers";

import {
    badgeText,
    columnPeriod,
    creationContext,
    newButtonPeriod,
    partPeriod,
    planWriteValues,
    rowValueChain,
} from "@web_gantt/timeline_editing";
import { buildColumns } from "@web_gantt/timeline_dates";

const { DateTime } = luxon;

describe.current.tags("headless");

const d = (iso) => DateTime.fromISO(iso);
const span = (period) => [period.start.toISO(), period.stop.toISO()];

beforeEach(() => {
    allowTranslations();
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
});

const FIELDS = {
    parent_id: { type: "many2one" },
    tag_ids: { type: "many2many" },
    kind: { type: "char" },
};
const DT = {
    startField: "date_start",
    stopField: "date_stop",
    startIsDate: false,
    stopIsDate: false,
};
const DATES = { ...DT, startIsDate: true, stopIsDate: true };

test("002b A5: New on week, Sunday start", () => {
    expect(span(newButtonPeriod("week", d("2026-11-12"), 7))).toEqual([
        d("2026-11-08").toISO(),
        d("2026-11-15").toISO(),
    ]);
});

test("002b A5b: Monday start", () => {
    const expected = [d("2026-11-09").toISO(), d("2026-11-16").toISO()];
    expect(span(newButtonPeriod("week", d("2026-11-12"), 1))).toEqual(expected);
    expect(span(newButtonPeriod("week", d("2026-11-15T10:00"), 1))).toEqual(expected);
});

test("002b A6: day, month, year periods", () => {
    const focus = d("2026-11-12T15:00");
    expect(span(newButtonPeriod("day", focus, 7))).toEqual([
        d("2026-11-12").toISO(),
        d("2026-11-13").toISO(),
    ]);
    expect(span(newButtonPeriod("month", focus, 7))).toEqual([
        d("2026-11-01").toISO(),
        d("2026-12-01").toISO(),
    ]);
    expect(span(newButtonPeriod("year", focus, 7))).toEqual([
        d("2026-01-01").toISO(),
        d("2027-01-01").toISO(),
    ]);
});

test("002b A49b: date-only stops", () => {
    const run = (placement, period) => {
        const context = creationContext({ baseContext: {}, period, placement, fields: FIELDS });
        return [context.date_start, context.date_stop];
    };
    const at = (scale, iso = "2026-11-12") => newButtonPeriod(scale, d(iso), 7);
    expect(run(DATES, at("day"))).toEqual(["2026-11-12", "2026-11-12"]);
    expect(run(DATES, at("week"))).toEqual(["2026-11-08", "2026-11-14"]);
    expect(run(DATES, at("month"))).toEqual(["2026-11-01", "2026-11-30"]);
    expect(run(DATES, at("year"))).toEqual(["2026-01-01", "2026-12-31"]);
    expect(run({ ...DATES, stopIsDate: false }, at("week"))).toEqual([
        "2026-11-08",
        "2026-11-14 21:00:00",
    ]);
});

test("002b A24: context keys", () => {
    const period = { start: d("2026-11-08T12:00"), stop: d("2026-11-10T12:00") };
    const base = { lang: "en_US", default_date_start: "old" };
    const context = creationContext({ baseContext: base, period, placement: DT, fields: FIELDS });
    expect(context).toEqual({
        lang: "en_US",
        date_start: "2026-11-08 09:00:00",
        default_date_start: "2026-11-08 09:00:00",
        date_stop: "2026-11-10 09:00:00",
        default_date_stop: "2026-11-10 09:00:00",
    });
    const withRow = creationContext({
        baseContext: base,
        period,
        placement: DT,
        fields: FIELDS,
        rowValues: { parent_id: 7 },
    });
    expect(withRow.parent_id).toBe(7);
    expect(withRow.default_parent_id).toBe(7);
    expect(withRow.search_default_parent_id).toBe(7);
    const click = { start: d("2026-11-16"), stop: d("2026-11-17") };
    const dateOnly = creationContext({ baseContext: {}, period: click, placement: DATES, fields: FIELDS });
    expect(dateOnly.date_start).toBe("2026-11-16");
    expect(dateOnly.date_stop).toBe("2026-11-16");
});

test("002b A24b: one field for start and stop gives its start only", () => {
    const placement = { ...DT, stopField: "date_start" };
    const period = { start: d("2026-11-08T12:00"), stop: d("2026-11-10T12:00") };
    const context = creationContext({ baseContext: {}, period, placement, fields: FIELDS });
    expect(context).toEqual({
        date_start: "2026-11-08 09:00:00",
        default_date_start: "2026-11-08 09:00:00",
    });
});

const ROWS = [
    {
        id: "a",
        fieldName: "parent_id",
        resId: 7,
        value: [7, "Alpha"],
        isEmptyValueRow: false,
        children: [
            {
                id: "a|b",
                fieldName: "tag_ids",
                resId: 3,
                value: [3, "Red"],
                isEmptyValueRow: false,
                children: [],
            },
            {
                id: "a|c",
                fieldName: "kind",
                resId: null,
                value: "x",
                isEmptyValueRow: false,
                children: [],
            },
        ],
    },
    {
        id: "u",
        fieldName: "parent_id",
        resId: null,
        value: false,
        isEmptyValueRow: true,
        children: [],
    },
];

test("002b A21/E3: row replaces action default; Undefined row gives false", () => {
    const period = { start: d("2026-11-08"), stop: d("2026-11-09") };
    expect(rowValueChain(ROWS, "u", FIELDS)).toEqual({ parent_id: false });
    const context = creationContext({
        baseContext: { default_parent_id: 99, search_default_parent_id: 99 },
        period,
        placement: DT,
        fields: FIELDS,
        rowValues: rowValueChain(ROWS, "u", FIELDS),
    });
    expect(context.parent_id).toBe(false);
    expect(context.default_parent_id).toBe(false);
    expect(context.search_default_parent_id).toBe(false);
});

test("002b A22: many2many row gives [id]", () => {
    expect(rowValueChain(ROWS, "a|b", FIELDS).tag_ids).toEqual([3]);
});

test("002b A23: two levels give both values", () => {
    expect(rowValueChain(ROWS, "a|b", FIELDS)).toEqual({ parent_id: 7, tag_ids: [3] });
    expect(rowValueChain(ROWS, "a|c", FIELDS)).toEqual({ parent_id: 7, kind: "x" });
    expect(rowValueChain(ROWS, "missing", FIELDS)).toEqual({});
});

function week() {
    const start = d("2026-11-15");
    const period = { start, stop: start.plus({ days: 7 }) };
    return { columns: buildColumns("week", period), parts: 2 };
}

test("002b A49: half-day parts on date-only", () => {
    const data = week();
    // column 1 is Monday the 16th (parts 2 and 3), column 3 is the 18th (parts 6 and 7)
    const run = (from, to) => {
        const context = creationContext({
            baseContext: {},
            period: partPeriod(data, from, to),
            placement: DATES,
            fields: FIELDS,
        });
        return [context.date_start, context.date_stop];
    };
    expect(run(3, 7)).toEqual(["2026-11-16", "2026-11-18"]);
    expect(run(3, 6)).toEqual(["2026-11-16", "2026-11-18"]);
    expect(run(2, 4)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(run(7, 3)).toEqual(["2026-11-16", "2026-11-18"]);
    expect(span(partPeriod(data, 3, 3))).toEqual([
        d("2026-11-16T12:00").toISO(),
        d("2026-11-17").toISO(),
    ]);
    expect(span(columnPeriod(data, 1))).toEqual([d("2026-11-16").toISO(), d("2026-11-17").toISO()]);
});

test("002b R9: plan values", () => {
    const period = { start: d("2026-11-12"), stop: d("2026-11-13") };
    const args = {
        period,
        placement: DT,
        fields: FIELDS,
        rowValues: { parent_id: 7, tag_ids: [3] },
        records: [1, 2],
        shownById: new Map(),
    };
    expect(planWriteValues(args)).toEqual({
        date_start: "2026-11-11 21:00:00",
        date_stop: "2026-11-12 21:00:00",
        parent_id: 7,
        tag_ids: [[6, 0, [3]]],
    });
    expect(planWriteValues({ ...args, rowValues: { tag_ids: false } }).tag_ids).toBe(false);
    expect(planWriteValues({ ...args, placement: DATES }).date_stop).toBe("2026-11-12");
});

test("002b R9: plan values leave out what shown records hold (O2b-1)", () => {
    const period = { start: d("2026-11-12"), stop: d("2026-11-13") };
    const record = (id, parent) => ({
        id,
        raw: { parent_id: parent, tag_ids: [3], date_start: false, date_stop: false },
    });
    const args = {
        period,
        placement: DT,
        fields: FIELDS,
        rowValues: { parent_id: 7, tag_ids: [3] },
        records: [1, 2],
        shownById: new Map([
            [1, record(1, [7, "Alpha"])],
            [2, record(2, [7, "Alpha"])],
        ]),
    };
    expect(Object.keys(planWriteValues(args)).sort()).toEqual(["date_start", "date_stop"]);
    // one record holds another parent: the value stays for everybody
    args.shownById.set(2, record(2, [8, "Beta"]));
    expect(planWriteValues(args).parent_id).toBe(7);
    // one checked record is not shown in the view: nothing is left out
    args.shownById.delete(2);
    expect(Object.keys(planWriteValues(args))).toHaveLength(4);
});

test("002b A13: badge texts by scale", () => {
    const date = d("2026-11-08T12:00");
    expect(badgeText(date, "day", 1)).toBe("12:00 PM");
    expect(badgeText(date, "week", 2)).toBe("11/8/2026, 12:00 PM");
    expect(badgeText(date, "month", 4)).toBe("11/8/2026, 12:00 PM");
    expect(badgeText(date, "week", 1)).toBe("11/8/2026");
    expect(badgeText(date, "month", 1)).toBe("11/8/2026");
    expect(badgeText(date, "year", 2)).toBe("11/8/2026");
});
