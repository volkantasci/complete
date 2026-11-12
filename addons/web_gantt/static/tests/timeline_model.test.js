// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { MockServer, makeTestApp, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { pillSpan } from "@web_gantt/timeline_layout";

import {
    HOST_ARCHS,
    MIX_ARCHS,
    makeTimelineModel,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("headless");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const span = (range) => [range.start.toISODate(), range.stop.toISODate()];
const names = (rows) => rows.map((row) => row.name);
const recordNames = (model, row) =>
    row.recordIds.map((id) => model.data.recordsById.get(id).displayName);
const calls = () => timelineMock.calls;
const lastCall = () => timelineMock.calls.at(-1);
const hasLeaf = (domain, leaf) => domain.some((item) => JSON.stringify(item) === JSON.stringify(leaf));
const storedRange = (viewId) => browser.localStorage.getItem(`rangeOf-viewId-${viewId}`);

const GROUPED_ARCH = (attrs = "") =>
    timelineArch(
        `default_range="week" color="x_color" progress="x_progress" total_row="1" ${attrs}`,
        `<field name="x_flagged"/><field name="x_done"/>`
    );

test("A19: inverted, undated and out-of-period records are not drawn", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["parent_id"] });
    const drawn = model.data.records.map((record) => record.displayName);
    expect(drawn.includes("Wrong order")).toBe(false);
    expect(drawn.includes("Unscheduled")).toBe(false);
    expect(drawn.includes("Plan")).toBe(true);
    expect(drawn).toHaveLength(12);
    // the server still returns the inverted record, so its group exists but shows no pill
    const beta = model.data.rows.find((row) => row.name === "Beta");
    expect(recordNames(model, beta)).toEqual(["Test", "Deploy"]);

    const { model: dated } = await makeTimelineModel({
        arch: HOST_ARCHS.H10,
        resModel: "pill2",
        viewId: 10,
    });
    await dated.load({});
    expect(dated.data.records.map((record) => record.displayName)).toEqual([
        "Day one",
        "Three days",
        "Next month",
    ]);
    const loaded = dated.step(-1);
    await advanceTime(500);
    await loaded;
    expect(dated.data.records.map((record) => record.displayName)).toEqual([
        "Day one",
        "Three days",
    ]);
});

test("A21: default custom range of three months", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H5 });
    await model.load({});
    expect(model.data.range.kind).toBe("custom");
    expect(span(model.data.range)).toEqual(["2026-11-01", "2027-01-31"]);
    expect(model.data.scaleId).toBe("month");
});

test("A22: context range and context dates", async () => {
    const open = async (context, viewId) => {
        const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H5, viewId });
        await model.load({ context });
        return model.data.range;
    };
    let range = await open({ default_range: "month" }, 1);
    expect([range.kind, ...span(range)]).toEqual(["month", "2026-10-01", "2026-12-31"]);
    range = await open({ default_start_date: "2026-11-15" }, 2);
    expect([range.kind, ...span(range)]).toEqual(["custom", "2026-11-15", "2027-01-31"]);
    range = await open({ default_stop_date: "2026-12-10" }, 3);
    expect([range.kind, ...span(range)]).toEqual(["custom", "2026-10-01", "2026-12-10"]);
    range = await open({ default_start_date: "2026-11-05", default_stop_date: "2026-11-25" }, 4);
    expect([range.kind, ...span(range)]).toEqual(["custom", "2026-11-05", "2026-11-25"]);
    expect(range.focus.toISODate()).toBe("2026-11-12");
});

test("A23: initial focus date", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ context: { initialDate: "2026-12-15" } });
    expect(span(model.data.range)).toEqual(["2026-12-06", "2026-12-26"]);
    expect(model.data.range.focus.toISODate()).toBe("2026-12-15");
});

test("A24: offered ranges", async () => {
    let { config } = await makeTimelineModel({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    expect(config.offeredKinds).toEqual(["day", "week", "month"]);
    ({ config } = await makeTimelineModel({
        arch: timelineArch(`scales="week,month" default_range="year"`),
    }));
    expect(config.offeredKinds).toEqual(["week", "month", "year"]);
    ({ config } = await makeTimelineModel({ arch: timelineArch(`scales="week,decade"`) }));
    expect(config.offeredKinds).toEqual(["week"]);
});

test("A28: quick clicks load once", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    expect(calls()).toHaveLength(1);
    model.step(1);
    model.step(1);
    const done = model.step(1);
    expect(calls()).toHaveLength(1);
    expect(model.data.pendingRange.start.toISODate()).toBe("2026-11-22");
    await advanceTime(500);
    await done;
    expect(calls()).toHaveLength(2);
    expect(span(model.data.range)).toEqual(["2026-11-22", "2026-12-12"]);
    expect(model.data.pendingRange).toBe(null);
    expect(lastCall().start_date).toBe("2026-11-21 21:00:00");
});

test("A28: a delayed older response does not overwrite a newer one", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    timelineMock.beforeReply = (kwargs, index) => (index === 1 ? gate : undefined);
    model.step(1);
    await advanceTime(500);
    await animationFrame();
    expect(calls()).toHaveLength(2); // the first response is still pending
    const done = model.step(1);
    await advanceTime(500);
    await animationFrame();
    expect(calls()).toHaveLength(3);
    await done;
    expect(span(model.data.range)).toEqual(["2026-11-15", "2026-12-05"]);
    release();
    await animationFrame();
    expect(span(model.data.range)).toEqual(["2026-11-15", "2026-12-05"]);
});

test("A35: remembered range", async () => {
    const { model } = await makeTimelineModel({ viewId: 1 });
    await model.load({});
    expect(model.data.range.kind).toBe("week");
    expect(storedRange(1)).toBe("week");
    expect(storedRange(2)).toBe(null);

    await model.setKind("month");
    expect(storedRange(1)).toBe("month");
    let other = (await makeTimelineModel({ viewId: 1 })).model;
    await other.load({ context: { default_range: "day" } });
    expect(other.data.range.kind).toBe("month");

    await other.applyCustom(model.data.range.start, model.data.range.stop.plus({ days: 10 }));
    expect(storedRange(1)).toBe("custom");
    other = (await makeTimelineModel({ viewId: 1 })).model;
    await other.load({});
    expect(other.data.range.kind).toBe("week");
    expect(storedRange(2)).toBe(null);
});

test("A53: grouping and the empty-value row", async () => {
    const { model } = await makeTimelineModel({ arch: GROUPED_ARCH() });
    await model.load({ groupBy: ["parent_id"] });
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Alpha", "Beta", "Gamma"]);
    expect(recordNames(model, model.data.rows[0])).toEqual(["Plan"]);
    expect(model.data.rows.map((row) => row.isEmptyValueRow)).toEqual([true, false, false, false]);
});

test("A54: the empty-value row exists without such a record", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["parent_id"], domain: [["parent_id", "=", 1]] });
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Alpha"]);
    expect(model.data.rows[0].recordIds).toEqual([]);
});

test("A55: no empty-value row for a required field", async () => {
    const fieldsOverride = { x_contact: { required: true } };
    const { model } = await makeTimelineModel({ fieldsOverride });
    await model.load({ groupBy: ["x_contact"], domain: [["x_contact", "!=", false]] });
    expect(names(model.data.rows)).toEqual(["Host Contact 1", "Host Contact 2", "Host Contact 3"]);
    await model.load({ groupBy: ["x_contact"], domain: [["name", "=", "no such record"]] });
    expect(model.data.rows).toHaveLength(1);
    expect(model.data.rows[0].name).toBe("");
    expect(model.data.rows[0].recordIds).toEqual([]);
});

test("A56: date group-bys are ignored", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["date_start:month"] });
    expect(model.data.groupBy).toEqual([]);
    expect(names(model.data.rows)).toEqual([""]);
    expect(lastCall().groupby).toEqual([]);
    await model.load({ groupBy: ["date_start:month", "parent_id"] });
    expect(model.data.groupBy).toEqual(["parent_id"]);
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Alpha", "Beta", "Gamma"]);
});

test("A57: many-to-many grouping", async () => {
    const { model } = await makeTimelineModel({ arch: GROUPED_ARCH() });
    await model.load({ groupBy: ["x_tags"] });
    const rows = model.data.rows;
    expect(names(rows)).toEqual(["Undefined Tags", "Host Tag 1", "Host Tag 2"]);
    expect(recordNames(model, rows[1])).toEqual(["Design", "Build"]);
    expect(recordNames(model, rows[2])).toEqual(["Build"]);
    expect(recordNames(model, rows[0]).includes("Build")).toBe(false);
    const all = rows.flatMap((row) => row.recordIds);
    expect(new Set(all).size).toBe(model.data.records.length);
});

test("A58: row names", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["x_flagged"] });
    expect(names(model.data.rows)).toEqual(["False", "True"]);
    expect(recordNames(model, model.data.rows[1])).toEqual(["Test"]);
    await model.load({ groupBy: ["x_state"] });
    expect(names(model.data.rows)).toEqual(["Undefined State", "Draft", "In progress"]);
});

test("A67 and A113: group paging keeps the empty-value row on every page", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H6 });
    await model.load({ groupBy: ["parent_id"] });
    expect(model.data.length).toBe(4);
    expect(model.data.offset).toBe(0);
    expect([lastCall().limit, lastCall().offset]).toEqual([2, 0]);
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Alpha", "Beta"]);
    await model.setOffset(2);
    expect(model.data.offset).toBe(2);
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Gamma"]);
    expect(names(model.data.rows[0].children)).toEqual(["Plan"]);
    // sparse mode: groups with rows of their own, an empty group shows one unnamed row
    await model.setOffset(0);
    expect(names(model.data.rows[0].children)).toEqual([""]);
    expect(model.data.rows.every((row) => row.isGroup)).toBe(true);
    // no grouping, no paging
    await model.load({ groupBy: [] });
    expect(lastCall().limit).toBe(undefined);
    expect(model.data.rows.every((row) => !row.isGroup)).toBe(true);
});

test("A65: record rows follow the pill order under each group (F4)", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H6 });
    await model.load({ groupBy: ["parent_id"] });
    const group = (name) => model.data.rows.find((row) => row.name === name);
    expect(names(group("Alpha").children)).toEqual(["Design", "Build", "Review"]);
    await model.setOffset(2);
    expect(names(group("Gamma").children)).toEqual([
        "Long task",
        "Color eleven",
        "Overlap A",
        "Overlap B",
        "Overlap C",
        "Color ten",
    ]);
});

test("A73: progress is asked only when the field is grouped", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H12 });
    await model.load({ groupBy: ["parent_id"] });
    expect(lastCall().progress_bar_fields).toBe(undefined);
    timelineMock.progress = { x_contact: { 1: { value: 130, max_value: 120 } } };
    await model.load({ groupBy: ["x_contact"] });
    expect(lastCall().progress_bar_fields).toEqual(["x_contact"]);
    expect(model.data.progress).toEqual({ x_contact: { 1: { value: 130, max_value: 120 } } });
});

test("A83: sample state flag set on an empty first load and cleared on the next", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H8 });
    const search = { domain: [["name", "=", "no such record"]], groupBy: ["parent_id"] };
    await model.load(search);
    expect(model.data.isSample).toBe(true);
    expect(model.data.records).toEqual([]);
    expect(model.data.rows.length).toBeGreaterThan(1);
    expect(names(model.data.rows)[0]).toBe("Undefined Parent");
    expect(model.data.progress).toEqual({});
    await model.load(search);
    expect(model.data.isSample).toBe(false);
    expect(names(model.data.rows)).toEqual(["Undefined Parent"]);

    const { model: plain } = await makeTimelineModel({ arch: HOST_ARCHS.H5 });
    await plain.load({ domain: [["name", "=", "no such record"]] });
    expect(plain.data.isSample).toBe(false);
});

test("A85: server call period", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    const kwargs = lastCall();
    expect(hasLeaf(kwargs.domain, ["date_start", "<", "2026-11-21 21:00:00"])).toBe(true);
    expect(hasLeaf(kwargs.domain, ["date_stop", ">", "2026-10-31 21:00:00"])).toBe(true);
    expect(kwargs.scale).toBe("week");
    expect(kwargs.start_date).toBe("2026-10-31 21:00:00");
    expect(kwargs.stop_date).toBe("2026-11-21 21:00:00");
    expect(kwargs.groupby).toEqual([]);
    for (const name of [
        "display_name",
        "date_start",
        "date_stop",
        "x_color",
        "x_progress",
        "x_flagged",
        "x_done",
    ]) {
        expect(name in kwargs.read_specification).toBe(true);
    }
    expect(kwargs.unavailability_fields).toBe(undefined);
    await model.load({ groupBy: ["x_tags", "parent_id"] });
    expect(lastCall().read_specification.x_tags).toEqual({});
    expect(lastCall().read_specification.parent_id).toEqual({ fields: { display_name: {} } });
});

test("A56: a date property group-by is dropped", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["pill_properties.when_prop"] });
    expect(model.data.groupBy).toEqual([]);
    expect(lastCall().groupby).toEqual([]);
});

test("R4: each bound follows its own field type, in local days", async () => {
    // at UTC+3: a date-only field is compared with the local dates of the period, a date-time
    // field with the UTC instants of its local midnights, whatever the other field is
    const dateStop = { date_stop: { type: "date" } };
    let { model } = await makeTimelineModel({ fieldsOverride: dateStop });
    await model.load({});
    expect(hasLeaf(lastCall().domain, ["date_start", "<", "2026-11-21 21:00:00"])).toBe(true);
    expect(hasLeaf(lastCall().domain, ["date_stop", ">=", "2026-11-01"])).toBe(true);
    ({ model } = await makeTimelineModel({ fieldsOverride: { date_start: { type: "date" } } }));
    await model.load({});
    expect(hasLeaf(lastCall().domain, ["date_start", "<", "2026-11-22"])).toBe(true);
    expect(hasLeaf(lastCall().domain, ["date_stop", ">", "2026-10-31 21:00:00"])).toBe(true);
});

for (const [zone, label, bounds] of [
    [3, "east of UTC", ["2026-11-21 21:00:00", "2026-10-31 21:00:00"]],
    [-5, "west of UTC", ["2026-11-22 05:00:00", "2026-11-01 05:00:00"]],
]) {
    test(`A123: mixed date and date-time fields, ${label}`, async () => {
        mockTimeZone(zone);
        mockDate("2026-11-12 00:30:00");
        const drawn = async (arch) => {
            const { model } = await makeTimelineModel({ arch, resModel: "mix" });
            await model.load({});
            return model;
        };
        const spans = (model) =>
            Object.fromEntries(
                model.data.records.map((record) => [record.displayName, record.span])
            );
        // days 1 to 21 November: 21 columns of two parts; day n is column n - 1
        const half = (day, part) => (day - 1) * 2 + part;

        let model = await drawn(MIX_ARCHS.H14);
        // the data call: local dates for the date-only field, UTC instants of local midnights
        expect(hasLeaf(lastCall().domain, ["day", "<", "2026-11-22"])).toBe(true);
        expect(hasLeaf(lastCall().domain, ["date_stop", ">", bounds[1]])).toBe(true);
        let found = spans(model);
        expect(Object.keys(found)).toEqual(["MIX first", "MIX last"]);
        if (zone === 3) {
            // 13:00 to 15:00 local: the whole day
            expect(found["MIX first"]).toMatchObject({ from: half(1, 0), to: half(1, 2) });
            expect(found["MIX last"]).toMatchObject({ from: half(21, 0), to: half(21, 2) });
        } else {
            // 05:00 to 07:00 local: the morning half
            expect(found["MIX first"]).toMatchObject({ from: half(1, 0), to: half(1, 1) });
            expect(found["MIX last"]).toMatchObject({ from: half(21, 0), to: half(21, 1) });
        }

        model = await drawn(MIX_ARCHS.H15);
        expect(hasLeaf(lastCall().domain, ["date_start", "<", bounds[0]])).toBe(true);
        expect(hasLeaf(lastCall().domain, ["day", ">=", "2026-11-01"])).toBe(true);
        found = spans(model);
        expect(Object.keys(found)).toEqual(["MIX first", "MIX last"]);
        // from the half containing the start to the end of its day
        const from = zone === 3 ? 1 : 0;
        expect(found["MIX first"]).toMatchObject({ from: half(1, from), to: half(1, 2) });
        expect(found["MIX last"]).toMatchObject({ from: half(21, from), to: half(21, 2) });
        expect(model.data.period.start.toISODate()).toBe("2026-11-01");
    });
}

test("A123: same-day records are drawn, an inverted one is left out", async () => {
    const h15 = await makeTimelineModel({ arch: MIX_ARCHS.H15, resModel: "mix" });
    await h15.model.load({});
    // date-time start 13:00 local on 1 November, date-only stop the same day: drawn from the
    // half containing 13:00 to the end of the day
    const first = h15.model.data.records.find((r) => r.displayName === "MIX first");
    expect(first.span.to - first.span.from).toBe(1);
    // date-only start, date-time stop 15:00 local the same day (H14): the whole day
    const h14 = await makeTimelineModel({ arch: MIX_ARCHS.H14, resModel: "mix" });
    await h14.model.load({});
    const first14 = h14.model.data.records.find((r) => r.displayName === "MIX first");
    expect(first14.span.to - first14.span.from).toBe(2);
    // a date-only stop on a local day before the start is left out (E3)
    const { columns, parts } = h15.model.data;
    // (the stop is read under the placement's own stop field, "day" in H15)
    const { placement } = h15.model.data;
    expect(placement.stopField).toBe("day");
    const record = {
        date_start: DateTime.local(2026, 11, 6, 10),
        [placement.stopField]: DateTime.local(2026, 11, 5),
    };
    expect(pillSpan(record, placement, columns, parts)).toBe(null);
    // the same record with its stop on the start's day is drawn: the null above is the order check
    record[placement.stopField] = DateTime.local(2026, 11, 6);
    expect(pillSpan(record, placement, columns, parts)).not.toBe(null);
});

test("R24: a range change on a later page without groups goes back to the first page", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H6 });
    await model.load({ groupBy: ["parent_id"] });
    await model.setOffset(2);
    expect(model.data.offset).toBe(2);
    await model.applyCustom(DateTime.local(2030, 1, 1), DateTime.local(2030, 1, 10));
    expect(model.data.offset).toBe(0);
    expect(lastCall().offset).toBe(0);
});

test("R19: a field with its own empty-value label uses it", async () => {
    const { model } = await makeTimelineModel({
        fieldsOverride: { x_state: { falsy_value_label: "Not started" } },
    });
    await model.load({ groupBy: ["x_state"] });
    expect(names(model.data.rows)).toEqual(["Not started", "Draft", "In progress"]);
    await model.load({ groupBy: ["x_contact"] });
    expect(names(model.data.rows)[0]).toBe("Undefined Contact");
});

test("R19: integer group values are formatted for the locale", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["x_color"] });
    expect(model._valueName("x_color", 12345)).toBe("12,345");
});

test("R33: sample rows request no thumbnail", async () => {
    const { model } = await makeTimelineModel({
        arch: timelineArch(
            `default_range="week" sample="1" thumbnails="{'x_contact': 'avatar_128'}"`
        ),
    });
    await model.load({ domain: [["name", "=", "no such record"]], groupBy: ["x_contact"] });
    expect(model.data.isSample).toBe(true);
    expect(model.data.rows.map((row) => row.thumbnailUrl)).toEqual([null, null, null]);
});

test("a search made while a range change is loading keeps the requested range", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    timelineMock.beforeReply = (kwargs, index) => (index === 1 ? gate : undefined);
    const changing = model.setKind("month");
    await animationFrame();
    expect(calls()).toHaveLength(2);
    await model.load({ domain: [["name", "!=", "x"]] });
    expect(model.data.range.kind).toBe("month");
    release();
    changing.catch(() => {});
    await animationFrame();
    expect(model.data.range.kind).toBe("month");
});

test("leaving the view clears the pending step", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    model.step(1);
    model.dispose();
    await advanceTime(1000);
    expect(calls()).toHaveLength(1);
});

test("T8: a failed load during a step restores the committed range", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    timelineMock.beforeReply = (kwargs, index) => {
        if (index === 1) {
            throw new Error("load failed");
        }
    };
    expect.errors(1);
    const done = model.step(1);
    expect(model.data.pendingRange.start.toISODate()).toBe("2026-11-08");
    await advanceTime(500);
    await done;
    await animationFrame();
    expect(model.data.pendingRange).toBe(null);
    expect(span(model.data.range)).toEqual(["2026-11-01", "2026-11-21"]);
    expect.verifyErrors([/load failed/]);
});

test("a changed context resets the page offset", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H6 });
    await model.load({ groupBy: ["parent_id"] });
    await model.setOffset(2);
    await model.load({ groupBy: ["parent_id"] });
    expect(model.data.offset).toBe(2);
    await model.load({ groupBy: ["parent_id"], context: { other: 1 } });
    expect(model.data.offset).toBe(0);
});

test("R10.5: a click made while a step load is in flight is not lost", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    model.step(1);
    await advanceTime(500); // the load of the first step is now in flight
    const done = model.step(1); // a second click arms the timer again
    await animationFrame(); // the first response arrives before the timer fires
    await advanceTime(500);
    await done;
    expect(span(model.data.range)).toEqual(["2026-11-15", "2026-12-05"]);
});

test("A86: date-only period condition", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    await model.load({});
    expect(hasLeaf(lastCall().domain, ["date_start", "<", "2027-01-01"])).toBe(true);
    expect(hasLeaf(lastCall().domain, ["date_stop", ">=", "2026-10-01"])).toBe(true);
    expect(lastCall().start_date).toBe("2026-09-30 21:00:00");
});

test("A87: unavailability is asked only for a relational last grouping", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H12 });
    await model.load({ groupBy: ["parent_id", "x_flagged"] });
    expect(lastCall().unavailability_fields).toBe(undefined);
    await model.load({ groupBy: ["x_flagged", "x_contact"] });
    expect(lastCall().unavailability_fields).toEqual(["x_contact"]);
    await model.load({ groupBy: [] });
    expect(lastCall().unavailability_fields).toBe(undefined);
    const { model: plain } = await makeTimelineModel({ arch: HOST_ARCHS.H1 });
    await plain.load({ groupBy: ["x_contact"] });
    expect(lastCall().unavailability_fields).toBe(undefined);
});

test("A87: unavailable periods are turned into dates", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H12 });
    timelineMock.unavailability = {
        x_contact: { 1: [{ start: "2026-11-12 06:00:00", stop: "2026-11-12 09:00:00" }] },
    };
    await model.load({ groupBy: ["x_contact"] });
    const [period] = model.data.unavailability.x_contact[1];
    expect(period.start.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-11-12 09:00");
    expect(period.stop.toFormat("HH:mm")).toBe("12:00");
});

test("A100: paging with two grouping levels", async () => {
    const { model } = await makeTimelineModel({ arch: GROUPED_ARCH(`groups_limit="2"`) });
    await model.load({ groupBy: ["parent_id", "x_contact"] });
    expect(model.data.length).toBe(8);
    const tree = () =>
        model.data.rows.map((row) => [row.name, names(row.children)]);
    expect(tree()).toEqual([
        ["Undefined Parent", ["Undefined Contact"]],
        ["Alpha", ["Host Contact 1", "Host Contact 2"]],
    ]);
    await model.setOffset(2);
    expect(tree()).toEqual([
        ["Undefined Parent", ["Undefined Contact"]],
        ["Beta", ["Host Contact 2", "Host Contact 3"]],
    ]);
    await model.setOffset(6);
    expect(tree()).toEqual([
        ["Undefined Parent", ["Undefined Contact"]],
        ["Gamma", ["Undefined Contact"]],
    ]);
    // the empty-value parent holds "Plan" on the last page, where it also has a combination
    expect(recordNames(model, model.data.rows[0].children[0])).toEqual(["Plan"]);
});

test("A102: expanded empty group row", async () => {
    timelineMock.expandGroups = [1, 2, 3];
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["parent_id"], domain: [["parent_id", "=", 1]] });
    expect(names(model.data.rows)).toEqual(["Undefined Parent", "Alpha", "Beta", "Gamma"]);
    expect(model.data.rows[2].recordIds).toEqual([]);
});

test("A103: archived records", async () => {
    await makeTestApp();
    MockServer.current.env["pill"].find((record) => record.name === "Overlap C").active =
        false;
    const { model } = await makeTimelineModel();
    await model.load({});
    const has = () => model.data.records.some((record) => record.displayName === "Overlap C");
    expect(has()).toBe(false);
    await model.load({ domain: [["active", "=", false]] });
    expect(has()).toBe(true);
});

test("A111: grouping by a property", async () => {
    await makeTestApp();
    const records = MockServer.current.env["pill"];
    records.find((record) => record.name === "Design").pill_properties = { color_prop: "red" };
    records.find((record) => record.name === "Build").pill_properties = { color_prop: "blue" };
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["pill_properties.color_prop"] });
    expect(names(model.data.rows)).toEqual(["Undefined Prop", "Blue", "Red"]);
    expect(recordNames(model, model.data.rows[1])).toEqual(["Build"]);
    expect(recordNames(model, model.data.rows[2])).toEqual(["Design"]);
});

test("A112: zero colour is Undefined Color", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["x_color"] });
    expect(names(model.data.rows)[0]).toBe("Undefined Color");
    expect(recordNames(model, model.data.rows[0])).toEqual(["Plan"]);
    expect(names(model.data.rows).filter((name) => name === "0")).toEqual([]);
});

test("A115: old two-week default opens on the default custom range", async () => {
    const { model, config } = await makeTimelineModel({
        arch: timelineArch(`default_scale="week_2"`),
    });
    expect(config.defaultKind).toBe(null);
    await model.load({});
    expect(model.data.range.kind).toBe("custom");
    expect(span(model.data.range)).toEqual(["2026-11-01", "2027-01-31"]);
});

test("navigation: today, kinds, custom dates and display mode", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["parent_id", "x_contact"] });
    expect(await model.goToday()).toBe("scrolled");
    expect(calls()).toHaveLength(1);
    await model.setKind("month", model.data.range.focus);
    expect(model.data.range.kind).toBe("month");
    expect(model.data.scaleId).toBe("month");
    expect(await model.goToday()).toBe("scrolled");
    await model.applyCustom(model.data.range.start, model.data.range.start.plus({ days: 3 }));
    expect(model.data.range.kind).toBe("custom");
    expect(model.data.scaleId).toBe("day");
    expect(await model.goToday()).toBe("reloaded");
    expect(model.data.range.start.toISODate()).toBe("2026-11-11");
    model.setAllCollapsed(true);
    expect(model.data.visibleRows).toHaveLength(model.data.rows.length);
    model.setAllCollapsed(false);
    expect(model.data.visibleRows.length).toBeGreaterThan(model.data.rows.length);
    model.toggleDisplayMode();
    expect(model.data.displayMode).toBe("sparse");
    expect(model.data.rows.every((row) => row.isGroup)).toBe(true);
    expect(model.data.rows.some((row) => row.collapsed)).toBe(false);
    model.toggleRow(model.data.rows[1].id);
    expect(model.data.rows[1].collapsed).toBe(true);
    expect(model.data.visibleRows.includes(model.data.rows[1].children[0])).toBe(false);
});

test("thumbnails link the related image", async () => {
    const { model } = await makeTimelineModel();
    await model.load({ groupBy: ["x_contact"] });
    const row = model.data.rows.find((r) => r.resId === 1);
    expect(row.thumbnailUrl.endsWith("/web/image/partner/1/avatar_128")).toBe(true);
    expect(model.data.rows[0].thumbnailUrl).toBe(null);
});
