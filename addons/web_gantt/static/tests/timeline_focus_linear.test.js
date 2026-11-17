// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryOne } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { defineWebModels, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2030-06-11 06:00:00"); // 09:00 local on 11 June 2030
    patchWithCleanup(localization, { weekStart: 7 });
});

const renderer = () => queryOne(".o_tl_renderer");

/** The middle of the visible cells: the grid minus the title cell stuck at its start. */
function visibleCentre() {
    const box = renderer().getBoundingClientRect();
    const title = queryAll(".o_tl_title_cell")[0];
    const left = title ? Math.max(box.left, title.getBoundingClientRect().right) : box.left;
    return (left + box.left + renderer().clientWidth) / 2;
}

test("A58: the focus date is a linear share of the whole period, not a place inside its month", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(`default_range="year"`),
    });
    await animationFrame();
    const headers = queryAll(".o_tl_col[data-date]");
    const first = headers[0];
    const last = headers.at(-1);
    const start = DateTime.fromISO(first.dataset.date);
    const stop = DateTime.fromISO(last.dataset.date).plus({ months: 1 });
    const focus = DateTime.fromISO("2030-06-11");
    const share = (focus - start) / (stop - start);
    const cells = first.getBoundingClientRect();
    const total = last.getBoundingClientRect().right - cells.left;
    // the point of the focus is the middle of the visible cells
    const linear = cells.left + total * share;
    expect(Math.abs(linear - visibleCentre())).toBeLessThan(1.5);
    // not the place of the focus inside its June column (10 days of 30)
    const june = queryOne(`.o_tl_col[data-date="2030-06-01"]`).getBoundingClientRect();
    const inside = june.left + june.width * (10 / 30);
    expect(Math.abs(inside - visibleCentre())).toBeGreaterThan(2.5);
});
