// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, freezeTime, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, drag, pointerDown, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import { mountView, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    DEPENDENCY_ATTRS,
    linkPills,
    PILL_ID,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

/**
 * 002d R3 (A17, A18): with touch at desktop size the handles follow the pill last tapped, not the
 * finger of a gesture; a tap on an empty cell clears them; a tap on another pill moves them there.
 */

describe.current.tags("desktop");

setupTimelineFixtures();

const ARCH = timelineArch(DEPENDENCY_ATTRS);

let log;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    log = [];
    timelineMock.beforeReply = () => {};
    onRpc("write", ({ args }) => {
        log.push({ call: "write", ids: args[0], values: args[1] });
    });
    onRpc("web_gantt_reschedule", ({ args }) => {
        log.push({ call: "reschedule", ids: args[0] });
        return { type: "success", message: "Records rescheduled", old_vals_per_pill_id: {} };
    });
    await resize({ width: 1600, height: 900 });
});

async function mountDependencies() {
    await linkPills();
    await mountView({ type: "gantt", resModel: "pill", arch: ARCH, groupBy: ["parent_id"] });
    await animationFrame();
    await animationFrame();
    log.length = 0;
}

const pillEl = (name) => queryOne(`.o_tl_pill[data-pill-id="${PILL_ID[name]}"]:not(.o_tl_pill_moved)`);
const connectHandles = (name) =>
    queryAll(`.o_tl_connect[data-pill-id="${PILL_ID[name]}"] .o_tl_connect_handle`);
const resizeHandles = (name) =>
    queryAll(`.o_tl_pill[data-pill-id="${PILL_ID[name]}"]:not(.o_tl_pill_moved) .o_tl_handle`);
const handlesOf = (name) => connectHandles(name).length + resizeHandles(name).length;
const lit = () => queryAll(".o_tl_arrow.o_tl_arrow_lit");
const centre = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

function outerBox() {
    const body = queryRect(pillEl("Build"));
    return { L: body.left - 1, R: body.right + 1, T: body.top - 1, B: body.bottom + 1, M: (body.top + body.bottom) / 2 };
}

async function settle() {
    await advanceTime(100);
    await animationFrame();
}

async function tapBuild() {
    freezeTime();
    mockTouch(true);
    const box = outerBox();
    await click(pillEl("Build"), { position: { x: box.L + 368, y: box.M } });
    await advanceTime(600);
    await animationFrame();
    expect(connectHandles("Build")).toHaveLength(2);
    return box;
}

/** A91's drawing: a finger on Build's end handle, to the middle of "Overlap C", lifted. */
async function touchDrawing() {
    const handle = queryOne(`.o_tl_connect[data-pill-id="${PILL_ID.Build}"] .o_tl_connect_stop`);
    const start = centre(queryRect(handle));
    const held = await drag(handle, { position: start });
    await advanceTime(400);
    await animationFrame();
    const over = centre(queryRect(pillEl("Overlap C")));
    for (let i = 1; i <= 10; i++) {
        const x = start.x + ((over.x - start.x) * i) / 10;
        const y = start.y + ((over.y - start.y) * i) / 10;
        await held.moveTo(document.elementFromPoint(x, y) || queryOne(".o_tl_renderer"), {
            position: { x, y },
        });
        await animationFrame();
    }
    await advanceTime(400);
    await held.drop();
    await settle();
}

test("A17: after a touch drawing is saved no arrow is lit, Build shows its handles, Overlap C none", async () => {
    await mountDependencies();
    await tapBuild();
    expect(".o_popover").toHaveCount(1);
    expect(lit()).toHaveLength(0);
    await touchDrawing();
    expect(log).toEqual([
        { call: "write", ids: [PILL_ID["Overlap C"]], values: { dependency_field: [[4, PILL_ID.Build]] } },
    ]);
    for (const wait of [1500, 1500]) {
        await advanceTime(wait);
        await animationFrame();
        expect(lit()).toHaveLength(0);
        expect(".o_tl_arrow_remove").toHaveCount(0);
        expect(connectHandles("Build")).toHaveLength(2);
        expect(connectHandles("Overlap C")).toHaveLength(0);
        expect(handlesOf("Overlap C")).toBe(0);
    }
    // a finger put down on an empty cell: Build's handles go, nothing is lit (the tour taps it)
    const cell = queryAll(".o_tl_row[data-row-id] .o_tl_cell").at(0);
    await pointerDown(cell);
    await advanceTime(600);
    await animationFrame();
    expect(handlesOf("Build")).toBe(0);
    expect(lit()).toHaveLength(0);
});

test("A17: a tap on Overlap C instead shows its handles and popover, no arrow lit", async () => {
    await mountDependencies();
    await tapBuild();
    await touchDrawing();
    await advanceTime(1500);
    await animationFrame();
    await click(pillEl("Overlap C"));
    await advanceTime(600);
    await animationFrame();
    expect(connectHandles("Overlap C")).toHaveLength(2);
    expect(handlesOf("Build")).toBe(0);
    expect(".o_popover").toHaveCount(1);
    expect(lit()).toHaveLength(0);
});

test("A18: a finger on a pill not tapped before lights its arrows, no handles; a move is written, then nothing", async () => {
    freezeTime();
    await mountDependencies();
    mockTouch(true);
    const box = outerBox();
    const at = { x: box.L + 267, y: box.M };
    const held = await drag(pillEl("Build"), { position: at });
    await advanceTime(500);
    await animationFrame();
    expect(lit()).toHaveLength(2);
    expect(".o_tl_arrow_remove").toHaveCount(2);
    expect(handlesOf("Build")).toBe(0);
    // the grid of the test page is narrower than the original's: 260 px change the dates
    for (let i = 1; i <= 10; i++) {
        const x = at.x - (260 * i) / 10;
        await held.moveTo(document.elementFromPoint(x, at.y) || queryOne(".o_tl_renderer"), {
            position: { x, y: at.y },
        });
        await animationFrame();
    }
    await held.drop();
    await settle();
    await advanceTime(1500);
    await animationFrame();
    expect(log.map((entry) => entry.call)).toEqual(["reschedule"]);
    expect(lit()).toHaveLength(0);
    expect(handlesOf("Build")).toBe(0);
    expect(handlesOf("Overlap C")).toBe(0);
});
