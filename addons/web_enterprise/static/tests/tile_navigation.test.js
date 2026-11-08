// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from "@odoo/hoot";

import { nextTileIndex } from "@web_enterprise/home_menu/tile_navigation";

describe.current.tags("headless");

const KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Tab", "Shift+Tab"];

test("A19 first move focuses tile 0", () => {
    for (const key of KEYS) {
        expect(nextTileIndex(key, null, 11, 6)).toBe(0);
    }
});

test("A20 arrows on a full grid", () => {
    const steps = [
        ["ArrowRight", 0, 1],
        ["ArrowDown", 1, 7],
        ["ArrowDown", 7, 1],
        ["ArrowUp", 1, 7],
        ["ArrowRight", 7, 8],
        ["ArrowRight", 8, 9],
        ["ArrowRight", 9, 10],
        ["ArrowRight", 10, 6],
        ["ArrowLeft", 6, 10],
    ];
    for (const [key, from, to] of steps) {
        expect(nextTileIndex(key, from, 11, 6)).toBe(to);
    }
});

test("A21 single short row", () => {
    expect(nextTileIndex("ArrowRight", 3, 4, 6)).toBe(0);
    expect(nextTileIndex("ArrowLeft", 0, 4, 6)).toBe(3);
    for (let i = 0; i < 4; i++) {
        expect(nextTileIndex("ArrowDown", i, 4, 6)).toBe(i);
        expect(nextTileIndex("ArrowUp", i, 4, 6)).toBe(i);
    }
});

test("A22 up from first row", () => {
    expect(nextTileIndex("ArrowUp", 5, 11, 6)).toBe(10);
    expect(nextTileIndex("ArrowUp", 3, 11, 6)).toBe(9);
});

test("A23 tab wraps", () => {
    expect(nextTileIndex("Tab", 10, 11, 6)).toBe(0);
    expect(nextTileIndex("Shift+Tab", 0, 11, 6)).toBe(10);
    expect(nextTileIndex("Tab", 3, 11, 6)).toBe(4);
    expect(nextTileIndex("Shift+Tab", 3, 11, 6)).toBe(2);
});

test("A84 row length follows the grid shown", () => {
    expect(nextTileIndex("ArrowRight", null, 11, 4)).toBe(0);
    expect(nextTileIndex("ArrowDown", 0, 11, 4)).toBe(4);
    expect(nextTileIndex("ArrowUp", 4, 11, 6)).toBe(10);
    expect(nextTileIndex("ArrowDown", 10, 11, 6)).toBe(4);
});

test("down into a shorter row lands on the last tile", () => {
    expect(nextTileIndex("ArrowDown", 5, 8, 6)).toBe(7);
});

test("E1 no tiles", () => {
    for (const key of KEYS) {
        expect(nextTileIndex(key, null, 0, 6)).toBe(null);
    }
});
