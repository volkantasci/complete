// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineModel } from "@web_gantt/timeline_model";

import { HOST_ARCHS, makeTimelineModel, setupTimelineFixtures } from "./timeline_test_helpers";

describe.current.tags("headless");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const spanOf = (model, name) =>
    model.data.records.find((record) => record.displayName === name).span;

test("span hook: the plain view places a record as R12 says", async () => {
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H1 });
    await model.load({});
    const { from, to } = spanOf(model, "Review");
    expect(to - from).toBeGreaterThan(0);
});

test("span hook: a variant changes the sub-columns a record covers", async () => {
    const { model: plain } = await makeTimelineModel({ arch: HOST_ARCHS.H1 });
    await plain.load({});
    const original = { ...spanOf(plain, "Build") };
    patchWithCleanup(TimelineModel.prototype, {
        _spanOf(record) {
            const span = super._spanOf(record);
            return span && { ...span, to: span.from + 1 };
        },
    });
    const { model } = await makeTimelineModel({ arch: HOST_ARCHS.H1 });
    await model.load({});
    const changed = spanOf(model, "Build");
    expect(changed.from).toBe(original.from);
    expect(changed.to).toBe(original.from + 1);
    expect(original.to - original.from).toBeGreaterThan(1);
});
