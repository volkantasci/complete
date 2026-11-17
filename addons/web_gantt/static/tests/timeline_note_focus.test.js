// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { makeTimelineModel, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("headless");

setupTimelineFixtures();

beforeEach(() => {
    mockDate("2030-06-11 09:00:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

const ARCH = timelineArch(`default_range="day"`);

/** The day the view opens on for `initialDate` with the browser at `offset` hours from UTC. */
async function focusOf(initialDate, offset) {
    mockTimeZone(offset);
    const { model } = await makeTimelineModel({ arch: ARCH });
    await model.load({ context: { initialDate } });
    return model.data.range.focus.toISODate();
}

test("002d A34: initialDate is a UTC moment read as its local day", async () => {
    // a date and time is the UTC instant; its calendar day is the browser's
    expect(await focusOf("2030-07-01 22:30:00", 3)).toBe("2030-07-02");
    expect(await focusOf("2030-07-01 18:00:00", -7)).toBe("2030-07-01");
    expect(await focusOf("2030-07-02 05:30:00", -7)).toBe("2030-07-01");
    // a date alone is a local day already
    expect(await focusOf("2030-07-01", 3)).toBe("2030-07-01");
});
