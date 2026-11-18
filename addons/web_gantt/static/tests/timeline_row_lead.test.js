// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { xml } from "@odoo/owl";
import { mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { timelineView } from "@web_gantt/timeline_view";
import { TimelineRenderer } from "@web_gantt/timeline_renderer";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

test("row header slot: a variant draws its own lead before the name", async () => {
    const lead = xml`<span class="o_test_lead" t-out="'lead of ' + row.row.name"/>`;
    class LeadRenderer extends TimelineRenderer {
        get rowLeadTemplate() {
            return lead;
        }
    }
    registry.category("views").add("test_lead_gantt", { ...timelineView, Renderer: LeadRenderer });
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: timelineArch(
            `default_range="week" js_class="test_lead_gantt" thumbnails="{'x_contact': 'avatar_128'}"`
        ),
        groupBy: ["x_contact"],
    });
    await animationFrame();
    const leads = queryAll(".o_tl_row_header .o_test_lead");
    expect(leads.length).toBeGreaterThan(0);
    expect(leads[0].textContent).toBe("lead of Host Contact 1");
    // the variant replaced the thumbnail, the name follows the lead
    expect(".o_tl_thumbnail").toHaveCount(0);
    expect(".o_tl_row_header:first .o_tl_row_label").toHaveText("Host Contact 1");
});

test("row header slot: the plain view keeps the thumbnail of the row's value", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1,
        groupBy: ["x_contact"],
    });
    await animationFrame();
    expect(".o_tl_row_header .o_tl_thumbnail").toHaveCount(3);
    expect(".o_test_lead").toHaveCount(0);
});
