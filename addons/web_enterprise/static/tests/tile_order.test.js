// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";

import { orderTiles, readSavedOrder } from "@web_enterprise/home_menu/tile_order";

describe.current.tags("headless");

const NAMES = [
    "discuss",
    "calendar",
    "todo",
    "contacts",
    "crm",
    "sales",
    "dashboards",
    "invoicing",
    "project",
    "apps",
    "settings",
];
const APPS = NAMES.map((name, index) => ({ id: index + 1, xmlid: `cws_test.app_${name}`, name }));
const id = (name) => `cws_test.app_${name}`;
const names = (apps) => apps.map((app) => app.name);

test("A35 applies a partial saved order", () => {
    const result = orderTiles(APPS, [id("settings"), id("crm"), id("contacts")]);
    expect(names(result)).toEqual([
        "discuss",
        "calendar",
        "todo",
        "sales",
        "dashboards",
        "invoicing",
        "project",
        "apps",
        "settings",
        "crm",
        "contacts",
    ]);
});

test("A36 ignores unknown identifiers", () => {
    const result = orderTiles(APPS, ["gone.menu", id("crm")]);
    expect(names(result)).toEqual([
        "discuss",
        "calendar",
        "todo",
        "contacts",
        "sales",
        "dashboards",
        "invoicing",
        "project",
        "apps",
        "settings",
        "crm",
    ]);
});

test("A36b duplicates and non-string entries", () => {
    const saved = readSavedOrder([id("crm"), id("crm"), 5, null, id("contacts")]);
    const result = orderTiles(APPS, saved);
    expect(result).toHaveLength(11);
    expect(names(result).slice(-2)).toEqual(["crm", "contacts"]);
    expect(new Set(names(result)).size).toBe(11);
    // duplicates count once even when the list is given directly
    const direct = orderTiles(APPS, [id("crm"), id("contacts"), id("crm")]);
    expect(names(direct).slice(-2)).toEqual(["crm", "contacts"]);
    expect(direct).toHaveLength(11);
});

test("applications without an identifier stay unlisted", () => {
    const apps = [...APPS, { id: 99, xmlid: "", name: "bare" }];
    const result = orderTiles(apps, ["", id("discuss")]);
    expect(names(result)[0]).toBe("calendar");
    expect(names(result).slice(-2)).toEqual(["bare", "discuss"]);
});

test("A80 unreadable saved order", () => {
    for (const raw of ["not json", '{"a":1}', "42", false, undefined, ""]) {
        expect(readSavedOrder(raw)).toEqual([]);
    }
    expect(readSavedOrder('["a","b"]')).toEqual(["a", "b"]);
    expect(readSavedOrder(["a"])).toEqual(["a"]);
});
