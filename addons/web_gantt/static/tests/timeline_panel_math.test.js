// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { Domain } from "@web/core/domain";
import { clampPanelWidth, panelSpan, stripDateConditions } from "@web_gantt/timeline_panel_math";

const strip = (domain) => stripDateConditions(domain, "date_start", "date_stop");

describe.current.tags("headless");

test("002b3 A45: the conditions on the start and the stop field are left out", () => {
    expect(strip([])).toEqual([]);
    expect(strip([["name", "ilike", "a"]])).toEqual([["name", "ilike", "a"]]);
    expect(strip([["date_start", "!=", false]])).toEqual([]);
    expect(
        strip([
            ["name", "ilike", "a"],
            ["date_start", ">", "2026-11-01 00:00:00"],
            ["date_stop", "<", "2026-12-01 00:00:00"],
            ["parent_id", "=", 1],
        ])
    ).toEqual(["&", ["name", "ilike", "a"], ["parent_id", "=", 1]]);
    // a path through the field counts as well, a longer name does not
    expect(strip([["date_start.year", "=", 2026]])).toEqual([]);
    expect(strip([["date_start_extra", "=", 1]])).toEqual([["date_start_extra", "=", 1]]);
});

test("002b3 A45: a condition left out of & | ! keeps the domain valid", () => {
    // "&": the other side stays
    expect(strip(["&", ["date_start", "!=", false], ["name", "=", "a"]])).toEqual([
        ["name", "=", "a"],
    ]);
    // "|": the other side stays (what the Community's removeDomainLeaves does as well)
    expect(strip(["|", ["date_start", "!=", false], ["name", "=", "a"]])).toEqual([
        ["name", "=", "a"],
    ]);
    expect(strip(["|", ["date_start", "!=", false], ["date_stop", "!=", false]])).toEqual([]);
    // "!": a negated condition on a date is left out whole
    expect(strip(["!", ["date_start", "=", false]])).toEqual([]);
    expect(strip(["!", ["name", "=", "a"]])).toEqual(["!", ["name", "=", "a"]]);
    expect(strip(["&", "!", ["date_stop", "=", false], ["name", "=", "a"]])).toEqual([
        ["name", "=", "a"],
    ]);
    // a deeper mix
    expect(
        strip([
            "&",
            "|",
            ["date_start", "!=", false],
            ["parent_id", "=", 1],
            "!",
            ["date_stop", "=", false],
        ])
    ).toEqual([["parent_id", "=", 1]]);
    // the result is always a valid domain
    for (const domain of [
        ["|", ["date_start", "=", 1], "!", ["name", "=", "x"]],
        ["!", "|", ["date_start", "=", 1], ["name", "=", "x"]],
    ]) {
        expect(() => new Domain(strip(domain)).toList()).not.toThrow();
    }
});

test("002b3 A45: the Community's removeDomainLeaves turns a negation into never", () => {
    // documents why the panel does not use it: "!" of a left-out leaf is "!" TRUE
    const removed = Domain.removeDomainLeaves(["!", ["date_start", "=", false]], ["date_start"]);
    expect(removed.toList()).toEqual(["!", [1, "=", 1]]);
    expect(strip(["!", ["date_start", "=", false]])).toEqual([]);
});

test("002b3 A55: the width is clamped between 150 and the larger of half the window and the start", () => {
    // moving left (a negative move) widens
    expect(clampPanelWidth(262, -300, 1600)).toBe(562);
    expect(clampPanelWidth(262, 0, 1600)).toBe(262);
    expect(clampPanelWidth(262, 100, 1600)).toBe(162);
    expect(clampPanelWidth(262, 200, 1600)).toBe(150);
    expect(clampPanelWidth(262, -1500, 1600)).toBe(800);
    // a start wider than half the window never grows, and may shrink
    expect(clampPanelWidth(900, 500, 1600)).toBe(400);
    expect(clampPanelWidth(900, 0, 1600)).toBe(900);
    expect(clampPanelWidth(900, -100, 1600)).toBe(900);
    // a start under the minimum is lifted to it
    expect(clampPanelWidth(100, 0, 1600)).toBe(150);
});

test("002b3 A47: the span of a line is one column long, its start under the pointer for p = 1 and 2", () => {
    // one sub-column per column: the span is the sub-column under the pointer
    expect(panelSpan({ part: 5, partsPerColumn: 1, gridParts: 14 })).toEqual({ from: 5, to: 5 });
    // half days: the sub-column under the pointer, a day long
    expect(panelSpan({ part: 7, partsPerColumn: 2, gridParts: 14 })).toEqual({ from: 7, to: 8 });
    expect(panelSpan({ part: 6, partsPerColumn: 2, gridParts: 14 })).toEqual({ from: 6, to: 7 });
});

test("002b3 A47: with quarter precision the span starts one sub-column before the pointer", () => {
    expect(panelSpan({ part: 10, partsPerColumn: 4, gridParts: 28 })).toEqual({ from: 9, to: 12 });
});

test("002b3 A47: the span stays inside the grid and keeps its length", () => {
    expect(panelSpan({ part: 0, partsPerColumn: 4, gridParts: 28 })).toEqual({ from: 0, to: 3 });
    expect(panelSpan({ part: 27, partsPerColumn: 4, gridParts: 28 })).toEqual({ from: 24, to: 27 });
    expect(panelSpan({ part: 13, partsPerColumn: 2, gridParts: 14 })).toEqual({ from: 12, to: 13 });
    expect(panelSpan({ part: 13, partsPerColumn: 1, gridParts: 14 })).toEqual({ from: 13, to: 13 });
    // a grid shorter than the span: the span is cut at the grid's end
    expect(panelSpan({ part: 1, partsPerColumn: 4, gridParts: 3 })).toEqual({ from: 0, to: 2 });
});
