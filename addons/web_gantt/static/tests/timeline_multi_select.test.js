// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";

import {
    countPickedRecords,
    firstPickedBlock,
    isMultiSelectMode,
    pickedDaysByRow,
    TimelinePickedCells,
} from "@web_gantt/timeline_multi_select";

describe.current.tags("headless");

// H34-like layout: 12 rows in display order; parts 0..13 are Sunday 8 to Saturday 14, two a day.
const ROWS = [
    ["undefP", true],
    ["undefP/U", false],
    ["alpha", true],
    ["alpha/C1", false],
    ["alpha/C2", false],
    ["beta", true],
    ["beta/U", false],
    ["beta/C2", false],
    ["beta/C3", false],
    ["gamma", true],
    ["gamma/U", false],
    ["gamma/C3", false],
];
const ORDER = ROWS.map(([id]) => id);
const ROWS_BY_ID = Object.fromEntries(ROWS.map(([id, isGroup]) => [id, { id, isGroup }]));
const ALL_PARTS = Array.from({ length: 14 }, (_, i) => i);
const dayParts = (index) => [index * 2, index * 2 + 1];
// day index 0 = Sunday 8; Monday 9 = 1
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const ctrl = { ctrl: true };

const keys = (picked) =>
    picked
        .cells()
        .map((c) => `${c.rowId}|${c.part}`)
        .sort();
const rowsOf = (picked) => [...new Set(picked.cells().map((c) => c.rowId))];
const partsOf = (picked) => [...new Set(picked.cells().map((c) => c.part))].sort((a, b) => a - b);
const column = (picked, index, mods = {}) =>
    picked.clickColumnHeader(dayParts(index), index, mods, ORDER, dayParts);
const rowHeader = (picked, rowId, mods = {}) =>
    picked.clickRowHeader(rowId, mods, ORDER, ALL_PARTS);

test("002b3 A7: a click picks both halves of the day and replaces", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("beta/U", dayParts(MON), {});
    expect(picked.size).toBe(2);
    expect(picked.has("beta/U", 2)).toBe(true);
    expect(picked.has("beta/U", 3)).toBe(true);
    picked.clickColumnOfRow("beta/C2", dayParts(TUE), {});
    expect(keys(picked)).toEqual(["beta/C2|4", "beta/C2|5"]);
    expect(picked.isEmpty).toBe(false);
});

test("002b3 A8: Ctrl+click toggles the day", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("beta/U", dayParts(MON), {});
    picked.clickColumnOfRow("beta/C2", dayParts(TUE), ctrl);
    picked.clickColumnOfRow("beta/U", dayParts(WED), ctrl);
    expect(picked.size).toBe(6);
    picked.clickColumnOfRow("beta/C2", dayParts(TUE), ctrl);
    picked.clickColumnOfRow("beta/U", dayParts(WED), ctrl);
    expect(keys(picked)).toEqual(["beta/U|2", "beta/U|3"]);
});

test("002b3 A9: a drawing covers 15 cells over five rows", () => {
    const picked = new TimelinePickedCells();
    picked.startDrawing("beta/U", 4, {});
    expect(picked.isDrawing).toBe(true);
    const drawn = picked.drawTo("gamma/U", 6, ORDER);
    expect(drawn.length).toBe(15);
    expect(rowsOf({ cells: () => drawn })).toEqual([
        "beta/U",
        "beta/C2",
        "beta/C3",
        "gamma",
        "gamma/U",
    ]);
    expect(picked.drawnCells().length).toBe(15);
    expect(picked.size).toBe(0);
    picked.endDrawing();
    expect(picked.isDrawing).toBe(false);
    expect(picked.size).toBe(15);
    expect(picked.has("gamma", 5)).toBe(true);
});

test("002b3 A9: a drawing works upwards and leftwards, and a press without move changes nothing", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("beta/U", dayParts(MON), {});
    picked.startDrawing("beta/C2", 5, {});
    picked.endDrawing();
    expect(picked.size).toBe(2);
    picked.startDrawing("beta/C2", 5, {});
    picked.drawTo("beta/U", 4, ORDER);
    picked.endDrawing();
    expect(keys(picked)).toEqual(["beta/C2|4", "beta/C2|5", "beta/U|4", "beta/U|5"]);
});

test("002b3 A11: Ctrl at the start of a drawing adds", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("alpha/C1", dayParts(MON), {});
    picked.startDrawing("beta/U", 8, ctrl);
    const drawn = picked.drawTo("beta/U", 9, ORDER);
    expect(drawn.length).toBe(4);
    picked.endDrawing();
    expect(picked.size).toBe(4);
    expect(picked.has("alpha/C1", 2)).toBe(true);
    // without Ctrl the earlier cells go
    picked.startDrawing("beta/C3", 8, {});
    expect(picked.drawTo("beta/C3", 8, ORDER).length).toBe(1);
    picked.endDrawing();
    expect(keys(picked)).toEqual(["beta/C3|8"]);
});

test("002b3 A12: a cancelled drawing clears everything", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("alpha/C1", dayParts(MON), {});
    picked.startDrawing("beta/U", 8, ctrl);
    picked.drawTo("beta/C2", 9, ORDER);
    picked.cancelDrawing();
    expect(picked.isDrawing).toBe(false);
    expect(picked.size).toBe(0);
    expect(picked.drawnCells()).toEqual([]);
});

test("002b3 A17: column headers with Shift and Ctrl", () => {
    const picked = new TimelinePickedCells();
    column(picked, MON);
    expect(picked.size).toBe(24);
    expect(rowsOf(picked).length).toBe(12);
    column(picked, WED, { shift: true });
    expect(partsOf(picked)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(picked.size).toBe(72);
    expect(picked.columnAnchor).toBe(MON);
    column(picked, FRI, ctrl);
    expect(picked.size).toBe(96);
    column(picked, FRI, ctrl);
    expect(partsOf(picked)).toEqual([2, 3, 4, 5, 6, 7]);
    // the anchor is Friday: Shift+Ctrl on Thursday acts as Shift
    column(picked, THU, { shift: true, ctrl: true });
    expect(partsOf(picked)).toEqual([8, 9, 10, 11]);
    expect(picked.columnAnchor).toBe(FRI);
});

test("002b3 A18: row headers with Shift and Ctrl", () => {
    const picked = new TimelinePickedCells();
    rowHeader(picked, "beta/C2");
    expect(picked.size).toBe(14);
    expect(rowsOf(picked)).toEqual(["beta/C2"]);
    rowHeader(picked, "gamma/C3", { shift: true });
    expect(rowsOf(picked)).toEqual(["beta/C2", "beta/C3", "gamma", "gamma/U", "gamma/C3"]);
    expect(picked.rowAnchor).toBe("beta/C2");
    picked.clear();
    rowHeader(picked, "beta/C3", ctrl);
    expect(rowsOf(picked)).toEqual(["beta/C3"]);
    rowHeader(picked, "beta/C3", ctrl);
    expect(picked.size).toBe(0);
    picked.clear();
    rowHeader(picked, "gamma/U", { shift: true });
    expect(rowsOf(picked)).toEqual(["gamma/U"]);
    expect(picked.rowAnchor).toBe("gamma/U");
});

test("002b3 A20: a row anchor then a column click clears first; a cell click forgets the column anchor", () => {
    const picked = new TimelinePickedCells();
    rowHeader(picked, "beta/C2");
    column(picked, TUE);
    expect(partsOf(picked)).toEqual([4, 5]);
    expect(picked.size).toBe(24);
    expect(picked.rowAnchor).toBe(null);
    column(picked, THU, { shift: true });
    expect(partsOf(picked)).toEqual([4, 5, 6, 7, 8, 9]);
    // and the other way round
    picked.clear();
    column(picked, MON);
    picked.clickColumnOfRow("beta/U", dayParts(FRI), {});
    expect(picked.columnAnchor).toBe(null);
    column(picked, WED, { shift: true });
    expect(partsOf(picked)).toEqual([6, 7]);
    expect(picked.size).toBe(12 * 2);
    // a column click then a row click without Shift clears first
    rowHeader(picked, "alpha/C1");
    expect(rowsOf(picked)).toEqual(["alpha/C1"]);
});

test("002b3 A21: folded parts are never picked", () => {
    const folded = new Set([4, 5]);
    const picked = new TimelinePickedCells({ isFolded: (part) => folded.has(part) });
    picked.clickColumnOfRow("beta/U", dayParts(TUE), {});
    expect(picked.size).toBe(0);
    column(picked, TUE, ctrl);
    expect(picked.size).toBe(0);
    column(picked, THU, { shift: true });
    expect(partsOf(picked)).toEqual([6, 7, 8, 9]);
    column(picked, WED, { shift: true });
    expect(partsOf(picked)).toEqual([6, 7]);
    picked.startDrawing("beta/U", 3, {});
    picked.drawTo("beta/U", 7, ORDER);
    picked.endDrawing();
    expect(partsOf(picked)).toEqual([3, 6, 7]);
    rowHeader(picked, "beta/U");
    expect(picked.size).toBe(12);
});

test("002b3 A22: a pill over several cells counts once; group rows never count", () => {
    const picked = new TimelinePickedCells();
    picked.startDrawing("beta", 2, {});
    picked.drawTo("beta/C2", 5, ORDER);
    picked.endDrawing();
    const pills = {
        beta: [{ resId: 99, from: 0, to: 13 }],
        "beta/U": [{ resId: 1, from: 3, to: 4 }],
        "beta/C2": [
            { resId: 1, from: 4, to: 6 },
            { resId: 2, from: 8, to: 9 },
        ],
    };
    const ids = countPickedRecords(picked.cells(), ROWS_BY_ID, (rowId) => pills[rowId] || []);
    expect([...ids].sort()).toEqual([1]);
    const single = new TimelinePickedCells();
    single.clickColumnOfRow("beta/C2", dayParts(THU), {});
    expect(countPickedRecords(single.cells(), ROWS_BY_ID, (r) => pills[r] || []).size).toBe(1);
    const empty = new TimelinePickedCells();
    empty.clickColumnOfRow("beta/C3", dayParts(THU), {});
    expect(countPickedRecords(empty.cells(), ROWS_BY_ID, (r) => pills[r] || []).size).toBe(0);
});

test("002b3 A30/A62: one entry per day and record row", () => {
    const day = (part) => `2026-11-${String(8 + Math.floor(part / 2)).padStart(2, "0")}`;
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("beta/U", dayParts(MON), {});
    expect(pickedDaysByRow(picked.cells(), ROWS_BY_ID, day)).toEqual([
        { rowId: "beta/U", day: "2026-11-09", firstPart: 2, lastPart: 3 },
    ]);
    // A62: Tuesday second half and Wednesday first half
    picked.clear();
    picked.startDrawing("beta/U", 5, {});
    picked.drawTo("beta/U", 6, ORDER);
    picked.endDrawing();
    expect(pickedDaysByRow(picked.cells(), ROWS_BY_ID, day)).toEqual([
        { rowId: "beta/U", day: "2026-11-10", firstPart: 5, lastPart: 5 },
        { rowId: "beta/U", day: "2026-11-11", firstPart: 6, lastPart: 6 },
    ]);
    // group rows are skipped, rows come in display order
    picked.clear();
    picked.startDrawing("gamma/U", 2, {});
    picked.drawTo("beta", 3, ORDER);
    picked.endDrawing();
    expect(pickedDaysByRow(picked.cells(), ROWS_BY_ID, day).map((e) => e.rowId)).toEqual([
        "beta/U",
        "beta/C2",
        "beta/C3",
        "gamma/U",
    ]);
});

test("002b3 A35: the first block", () => {
    const picked = new TimelinePickedCells();
    picked.clickColumnOfRow("beta/C3", dayParts(THU), {});
    picked.startDrawing("beta/U", 3, ctrl);
    picked.drawTo("beta/U", 4, ORDER);
    picked.endDrawing();
    expect(firstPickedBlock(picked.cells(), ORDER)).toEqual({
        rowId: "beta/U",
        fromPart: 3,
        toPart: 4,
    });
    expect(firstPickedBlock([], ORDER)).toBe(null);
    // a gap ends the block
    const gap = [
        { rowId: "beta/U", part: 2 },
        { rowId: "beta/U", part: 4 },
    ];
    expect(firstPickedBlock(gap, ORDER)).toEqual({ rowId: "beta/U", fromPart: 2, toPart: 2 });
});

test("002b3 A4: the mode conditions", () => {
    const base = { multiCreateView: "pill,1,form", isSmall: false, displayMode: "dense" };
    expect(isMultiSelectMode({ ...base, scale: "week" })).toBe(true);
    expect(isMultiSelectMode({ ...base, scale: "month" })).toBe(true);
    expect(isMultiSelectMode({ ...base, scale: "day" })).toBe(false);
    expect(isMultiSelectMode({ ...base, scale: "year" })).toBe(false);
    expect(isMultiSelectMode({ ...base, scale: "week", displayMode: "sparse" })).toBe(false);
    expect(isMultiSelectMode({ ...base, scale: "week", isSmall: true })).toBe(false);
    expect(isMultiSelectMode({ ...base, scale: "week", multiCreateView: false })).toBe(false);
    expect(isMultiSelectMode({ ...base, scale: "week", multiCreateView: "" })).toBe(false);
});

test("002b3: Shift without an anchor acts as a plain click", () => {
    const picked = new TimelinePickedCells();
    column(picked, WED, { shift: true });
    expect(partsOf(picked)).toEqual([6, 7]);
    expect(picked.columnAnchor).toBe(WED);
    picked.clear();
    column(picked, MON);
    column(picked, WED, ctrl);
    picked.clear();
    column(picked, THU, { shift: true, ctrl: true });
    expect(partsOf(picked)).toEqual([8, 9]);
    // the first click made Thursday the anchor: the second one is a Shift click
    column(picked, THU, { shift: true, ctrl: true });
    expect(partsOf(picked)).toEqual([8, 9]);
});

test("002b3: Shift with Ctrl and an anchor acts as Shift", () => {
    const picked = new TimelinePickedCells();
    rowHeader(picked, "beta/U");
    rowHeader(picked, "beta/C3", { shift: true, ctrl: true });
    expect(rowsOf(picked)).toEqual(["beta/U", "beta/C2", "beta/C3"]);
    expect(picked.size).toBe(42);
});
