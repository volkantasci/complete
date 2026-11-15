// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";

import { buildMultiCreateValues } from "@web_gantt/timeline_multi_create";
import { pickedDaysByRow } from "@web_gantt/timeline_multi_select";

describe.current.tags("headless");

const { DateTime } = luxon;
const ZONE = "UTC+3";

// parts 0..13 are Sunday 8 to Saturday 14 November 2026, two half days each, in a zone 3 hours ahead
function partBounds(part) {
    const day = DateTime.fromISO("2026-11-08", { zone: ZONE }).plus({ days: Math.floor(part / 2) });
    const start = day.plus({ hours: (part % 2) * 12 });
    return { start, stop: start.plus({ hours: 12 }) };
}
const MON_1 = 2;
const MON_2 = 3;
const TUE_1 = 4;
const TUE_2 = 5;
const WED_1 = 6;
const THU_1 = 8;
const THU_2 = 9;

const FIELDS = {
    name: { type: "char" },
    date_start: { type: "datetime" },
    date_stop: { type: "datetime" },
    parent_id: { type: "many2one" },
    x_contact: { type: "many2one" },
    x_tags: { type: "many2many" },
    x_color: { type: "integer" },
};
const TIMES = { start: { hour: 12, minute: 0 }, end: { hour: 13, minute: 0 } };

function build(params) {
    return buildMultiCreateValues({
        fields: FIELDS,
        startField: "date_start",
        stopField: "date_stop",
        timeRange: TIMES,
        partBounds,
        tz: ZONE,
        formValues: { name: "Sprint", x_contact: false, x_color: 0 },
        rows: {},
        entries: [],
        ...params,
    });
}

const entry = (rowId, day, firstPart, lastPart = firstPart) => ({ rowId, day, firstPart, lastPart });

test("002b3 A29: one clicked day gives one record at 12:00–13:00 local in UTC", () => {
    const values = build({
        entries: [entry("beta/U", "2026-11-09", MON_1, MON_2)],
        rows: { "beta/U": { parent_id: 2, x_contact: false } },
    });
    expect(values).toEqual([
        {
            name: "Sprint",
            x_color: 0,
            parent_id: 2,
            x_contact: false,
            date_start: "2026-11-09 09:00:00",
            date_stop: "2026-11-09 10:00:00",
        },
    ]);
});

test("002b3 A30: one record per row; the rows' values win", () => {
    const values = build({
        entries: [
            entry("beta/U", "2026-11-09", MON_1),
            entry("beta/C2", "2026-11-09", MON_1),
            entry("beta/C3", "2026-11-09", MON_1),
        ],
        rows: {
            "beta/U": { parent_id: 2, x_contact: false },
            "beta/C2": { parent_id: 2, x_contact: 2 },
            "beta/C3": { parent_id: 2, x_contact: 3 },
        },
        formValues: { name: "Row test", x_contact: false },
    });
    expect(values.map((v) => [v.parent_id, v.x_contact, v.name])).toEqual([
        [2, false, "Row test"],
        [2, 2, "Row test"],
        [2, 3, "Row test"],
    ]);
    for (const value of values) {
        expect(value.date_start).toBe("2026-11-09 09:00:00");
        expect(value.date_stop).toBe("2026-11-09 10:00:00");
    }
});

test("002b3 A31: a many2many row gives that tag only; Undefined gives none", () => {
    const values = build({
        entries: [entry("t1", "2026-11-09", MON_1), entry("undef", "2026-11-09", MON_1)],
        rows: { t1: { x_tags: [1] }, undef: { x_tags: false } },
        formValues: { name: "Tags", x_tags: [[6, 0, [2]]] },
    });
    expect(values[0].x_tags).toEqual([[6, 0, [1]]]);
    expect(values[1].x_tags).toEqual([[6, 0, []]]);
});

test("002b3 A32: date-only gives the day as start and stop", () => {
    const values = build({
        fields: { ...FIELDS, date_start: { type: "date" }, date_stop: { type: "date" } },
        timeRange: null,
        entries: [entry("r", "2026-11-14", 12, 13)],
        rows: { r: {} },
    });
    expect(values[0].date_start).toBe("2026-11-14");
    expect(values[0].date_stop).toBe("2026-11-14");
});

test("002b3 A62: two half days on two days give two records; mixed bounds", () => {
    const two = build({
        entries: [entry("r", "2026-11-10", TUE_2), entry("r", "2026-11-11", WED_1)],
        rows: { r: {} },
    });
    expect(two.map((v) => [v.date_start, v.date_stop])).toEqual([
        ["2026-11-10 09:00:00", "2026-11-10 10:00:00"],
        ["2026-11-11 09:00:00", "2026-11-11 10:00:00"],
    ]);
    const mixed = { ...FIELDS, date_start: { type: "date" } };
    const first = build({
        fields: mixed,
        timeRange: null,
        entries: [entry("r", "2026-11-12", THU_1)],
        rows: { r: {} },
    });
    expect(first[0].date_start).toBe("2026-11-12");
    // Thursday 12, 12:00 local
    expect(first[0].date_stop).toBe("2026-11-12 09:00:00");
    const both = build({
        fields: mixed,
        timeRange: null,
        entries: [entry("r", "2026-11-12", THU_1, THU_2)],
        rows: { r: {} },
    });
    // Friday 13, 00:00 local
    expect(both[0].date_stop).toBe("2026-11-12 21:00:00");
    // the other way round: a date-only stop, a start at the first sub-column's start
    const reverse = build({
        fields: { ...FIELDS, date_stop: { type: "date" } },
        timeRange: null,
        entries: [entry("r", "2026-11-12", THU_2)],
        rows: { r: {} },
    });
    expect(reverse[0].date_start).toBe("2026-11-12 09:00:00");
    expect(reverse[0].date_stop).toBe("2026-11-12");
});

test("002b3 A64: the cell wins over a filled Contact and over dates in the form; Color kept", () => {
    const values = build({
        entries: [entry("beta/U", "2026-11-09", MON_1, MON_2)],
        rows: { "beta/U": { parent_id: 2, x_contact: false } },
        formValues: {
            name: "Cell wins",
            x_contact: 2,
            x_color: 5,
            date_start: "2026-11-20 08:00:00",
            date_stop: "2026-11-21 08:00:00",
        },
    });
    expect(values[0].x_contact).toBe(false);
    expect(values[0].x_color).toBe(5);
    expect(values[0].date_start).toBe("2026-11-09 09:00:00");
    expect(values[0].date_stop).toBe("2026-11-09 10:00:00");
});

test("002b3 E4: only group-row cells create nothing", () => {
    // the picked days leave group rows out: no entry, no record
    const entries = pickedDaysByRow(
        [{ rowId: "beta", part: MON_1 }],
        { beta: { id: "beta", isGroup: true } },
        () => "2026-11-09",
        ["beta"]
    );
    expect(entries).toEqual([]);
    expect(build({ entries, rows: {} })).toEqual([]);
});
