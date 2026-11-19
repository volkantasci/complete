// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineModel } from "@web_gantt/timeline_model";

import { makeTimelineModel, setupTimelineFixtures } from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("headless");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-12 00:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const days = (range) => [range.start.toISODate(), range.stop.toISODate()];

test("focus hook: the range menu builds the range around the middle of the visible part", async () => {
    const { model } = await makeTimelineModel();
    await model.load({});
    const middle = model.visibleMiddleDate();
    await model.setKind("month");
    expect(model.data.range.focus.toISODate()).toBe(middle.toISODate());
});

test("focus hook: a variant chooses the date the named range is built around", async () => {
    patchWithCleanup(TimelineModel.prototype, {
        _focusForKind(kind) {
            expect.step(kind);
            return DateTime.fromISO("2026-12-25");
        },
    });
    const { model } = await makeTimelineModel();
    await model.load({});
    await model.setKind("week");
    expect.verifySteps(["week"]);
    expect(days(model.data.range)).toEqual(["2026-12-13", "2027-01-02"]);
    // an explicit focus is not asked from the hook
    await model.setKind("week", DateTime.fromISO("2026-11-03"));
    expect.verifySteps([]);
    expect(days(model.data.range)).toEqual(["2026-10-25", "2026-11-14"]);
});
