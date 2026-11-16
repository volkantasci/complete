// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { animationFrame, mockTouch } from "@odoo/hoot-mock";
import {
    defineWebModels,
    makeMockServer,
    MockServer,
    mountView,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { bufferSpan, subColumnHoursAt } from "@web_gantt/timeline_buffers";

import { setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

const { DateTime } = luxon;

setupTimelineFixtures();
defineWebModels();

const BUFFERS = `string="Pills" default_range="week" color="x_color"
    dependency_field="dependency_field" dependency_inverted_field="dependency_inverted_field"
    buffer_start="x_buffer_before" buffer_stop="x_buffer_after"`;
const DESIGN = 4;
const REVIEW = 6;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    await resize({ width: 1600, height: 900 });
});

/** H44's values: Design 24 and 12 hours, Review 12 and 24 hours (or `review`). */
async function mountBuffers({ review = [12, 24], design = [24, 12], groupBy } = {}) {
    await makeMockServer();
    const records = MockServer.current.env.pill;
    for (const [id, [before, after]] of [
        [DESIGN, design],
        [REVIEW, review],
    ]) {
        Object.assign(records.find((record) => record.id === id), {
            x_buffer_before: before,
            x_buffer_after: after,
        });
    }
    await mountView({ type: "gantt", resModel: "pill", arch: timelineArch(BUFFERS), groupBy });
    await animationFrame();
    await animationFrame();
}

const placeOf = (id) => queryAll(`.o_tl_buffer_place[data-pill-id="${id}"]`);
const pillOf = (id) => queryOne(`.o_tl_pill[data-pill-id="${id}"]:not(.o_tl_pill_moved)`);
const part = () => queryRect(`.o_tl_col[data-date="2026-11-12"]`).width / 2;

test("002c: bufferSpan rounds each side to whole sub-columns and clips to the period", () => {
    const record = (before, after) => ({ raw: { b: before, a: after } });
    const params = { beforeField: "b", afterField: "a", subColumnHours: 12, from: 3, to: 5, partsTotal: 14 };
    expect(bufferSpan(record(12, 24), params)).toEqual({ from: 2, to: 7 });
    expect(bufferSpan(record(5.9, 5.9), params)).toBe(null); // 0.5 rounds up, 0.49 down
    expect(bufferSpan(record(6, 0), params)).toEqual({ from: 2, to: 5 });
    expect(bufferSpan(record(6, 0), params)).toEqual({ from: 2, to: 5 });
    expect(bufferSpan(record(0, -24), params)).toBe(null);
    expect(bufferSpan(record(false, 18), params)).toEqual({ from: 3, to: 7 });
    expect(bufferSpan(record(1000, 1000), params)).toEqual({ from: 0, to: 14 });
    expect(bufferSpan(record(12, 12), { ...params, beforeField: null, afterField: null })).toBe(null);
    expect(bufferSpan(record(11, 0), { ...params, subColumnHours: () => 24 })).toBe(null);
    const column = { start: DateTime.fromISO("2030-01-01"), stop: DateTime.fromISO("2030-01-02") };
    expect(subColumnHoursAt([column], 2)(1)).toBe(12);
});

test("002c A64: bands of Review and Design, under their pills", async () => {
    await mountBuffers();
    // Review: one sub-column before, two after
    const review = placeOf(REVIEW);
    expect(review).toHaveCount(1);
    const pill = queryRect(pillOf(REVIEW));
    const place = queryRect(review[0]);
    const band = queryRect(".o_tl_buffer_band", { root: review[0] });
    expect(place.left).toBeWithin(pill.left - part() - 2, pill.left - part() + 2);
    expect(place.right).toBeWithin(pill.right + 2 * part() - 2, pill.right + 2 * part() + 2);
    // the pill's box with the pixel around it
    expect(place.height).toBe(pill.height + 2);
    expect(place.top).toBe(pill.top - 1);
    expect(band.height).toBeWithin(place.height * 0.6 - 0.01, place.height * 0.6 + 0.01);
    expect(band.top).toBeWithin(place.top + place.height * 0.2 - 0.01, place.top + place.height * 0.2 + 0.01);
    expect(band.width).toBe(place.width);
    expect(getComputedStyle(review[0]).zIndex).toBe("9");
    expect(getComputedStyle(pillOf(REVIEW)).zIndex).toBe("10");
    const style = getComputedStyle(queryOne(".o_tl_buffer_band", { root: review[0] }));
    expect(style.opacity).toBe("0.6");
    expect(style.borderTopLeftRadius).toBe("6px");
    // the colour of the pill's palette entry (the exact values are probes M36 to M38)
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    // Design: two sub-columns before (24 hours), one after
    const design = queryRect(placeOf(DESIGN)[0]);
    const designPill = queryRect(pillOf(DESIGN));
    expect(design.left).toBeWithin(designPill.left - 2 * part() - 2, designPill.left - 2 * part() + 2);
    expect(design.right).toBeWithin(designPill.right + part() - 2, designPill.right + part() + 2);
    expect(getComputedStyle(queryOne(".o_tl_buffer_band", { root: placeOf(DESIGN)[0] })).backgroundColor).not.toBe(
        style.backgroundColor
    );
    // a pill without a buffer value has no place box
    expect(placeOf(5)).toHaveCount(0);
});

test("002c A64: four hours before is less than half a sub-column", async () => {
    await mountBuffers({ review: [4, 24] });
    const pill = queryRect(pillOf(REVIEW));
    const place = queryRect(placeOf(REVIEW)[0]);
    expect(place.left).toBeWithin(pill.left - 2, pill.left + 2);
    expect(place.right).toBeWithin(pill.right + 2 * part() - 2, pill.right + 2 * part() + 2);
});

test("002c A65: the band is hidden while its pill is moved, back after Escape", async () => {
    await mountBuffers();
    const rect = queryRect(pillOf(REVIEW));
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(pillOf(REVIEW), { position: start });
    for (let step = 1; step <= 12; step++) {
        const x = start.x + (192 * step) / 12;
        const y = start.y + (41 * step) / 12;
        await helpers.moveTo(document.elementFromPoint(x, y), { position: { x, y } });
    }
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(1);
    expect(placeOf(REVIEW)[0]).toHaveStyle({ display: "none" });
    // the band of the other pill stays
    expect(placeOf(DESIGN)[0]).not.toHaveStyle({ display: "none" });
    await helpers.cancel();
    await animationFrame();
    expect(".o_tl_pill_moved").toHaveCount(0);
    expect(placeOf(REVIEW)[0]).not.toHaveStyle({ display: "none" });
});

test("002c A68: a pill out of view still has its band drawn", async () => {
    await resize({ width: 1000, height: 900 });
    await mountBuffers();
    const scroller = queryOne(".o_tl_renderer");
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    scroller.scrollLeft = scroller.scrollWidth;
    await animationFrame();
    // the pill and its band are both in the DOM wherever the scroll is
    expect(placeOf(REVIEW)).toHaveCount(1);
    expect(pillOf(REVIEW)).toHaveCount(1);
    expect(queryRect(placeOf(REVIEW)[0]).right).toBeGreaterThan(queryRect(pillOf(REVIEW)).right);
});

test("002c A78: zero and negative values draw nothing, 24 brings the band back", async () => {
    await mountBuffers({ review: [0, -24] });
    expect(placeOf(REVIEW)).toHaveCount(0);
    expect(placeOf(DESIGN)).toHaveCount(1);
});

test("002c A78: Buffer after back to 24 draws the band after Review", async () => {
    await mountBuffers({ review: [0, 24] });
    const pill = queryRect(pillOf(REVIEW));
    const place = queryRect(placeOf(REVIEW)[0]);
    expect(place.left).toBeWithin(pill.left - 2, pill.left + 2);
    expect(place.right).toBeWithin(pill.right + 2 * part() - 2, pill.right + 2 * part() + 2);
});

test("002c A65: the phone draws the band too", async () => {
    mockTouch(true);
    await resize({ width: 390, height: 844 });
    await mountBuffers();
    expect(placeOf(REVIEW)).toHaveCount(1);
    expect(queryRect(".o_tl_buffer_band", { root: placeOf(REVIEW)[0] }).height).toBeWithin(
        (queryRect(pillOf(REVIEW)).height + 2) * 0.6 - 0.01,
        (queryRect(pillOf(REVIEW)).height + 2) * 0.6 + 0.01
    );
    expect(".o_tl_arrow_layer, .o_tl_connect").toHaveCount(0);
});
