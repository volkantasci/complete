// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";
import { Domain } from "@web/core/domain";
import { stripDateConditions } from "@web_gantt/timeline_panel_math";

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
