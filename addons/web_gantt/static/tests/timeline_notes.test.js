// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { hover, pointerDown, pointerUp, queryAll, queryOne, queryRect } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { contains, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { TimelineModel } from "@web_gantt/timeline_model";

import { HOST_ARCHS, setupTimelineFixtures } from "./timeline_test_helpers";

/**
 * Notes on slices 002a and 002b that slice 002b2 corrects: the focus date after a change of range
 * (R18).
 */

describe.current.tags("desktop");

setupTimelineFixtures();

let lastModel;

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-12 06:00:00"); // D0, Thursday 12 Nov 2026 09:00 local
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineModel.prototype, {
        setup() {
            super.setup(...arguments);
            lastModel = this;
        },
    });
});

async function mountTimeline() {
    await mountView({ type: "gantt", resModel: "pill", arch: HOST_ARCHS.H1 });
    await animationFrame();
}

const renderer = () => queryOne(".o_tl_renderer");
const middle = () => lastModel.visibleMiddleDate();
const dayOf = (date) => date.toISODate();
const DAY = 86400000;

async function switchTo(kind) {
    await contains(".o_tl_range_button").click();
    await contains(`.o_tl_range_${kind}`).click();
    await animationFrame();
    await animationFrame();
}

async function clickNew() {
    await contains(".o_tl_button_add").click();
    await animationFrame();
}

const inputValue = (name) =>
    queryOne(`.o_dialog .o_field_widget[name='${name}'] button`).getAttribute("value");

test("A63 Week→Day→Month→Year→Week centres Thursday 12 each time and New proposes Sun Nov 8 – Sun Nov 15", async () => {
    await mountTimeline();
    expect(dayOf(middle())).toBe("2026-11-12");
    for (const kind of ["day", "month", "year", "week"]) {
        await switchTo(kind);
        const date = middle();
        if (kind === "year") {
            // inside the November column, about 40 % in: November 12 give or take a day
            expect(date.month).toBe(11);
            expect(Math.abs(date.day - 12) <= 1).toBe(true);
            expect(date.day).not.toBe(1);
        } else {
            expect(dayOf(date)).toBe("2026-11-12");
        }
    }
    expect(queryAll(".o_tl_col.o_tl_is_today")).toHaveLength(1);
    await clickNew();
    expect(inputValue("date_start")).toBe("11/08/2026 00:00:00");
    expect(inputValue("date_stop")).toBe("11/15/2026 00:00:00");
});

test("A64 Year scrolled 200 px right then Week opens on the week containing Mon Jan 11 2027; New proposes that week", async () => {
    await mountTimeline();
    await switchTo("year");
    const before = middle();
    const november = queryOne('.o_tl_col[data-date="2026-11-01"]').getBoundingClientRect();
    renderer().scrollLeft += 200;
    await animationFrame();
    const read = middle();
    // the middle moved by the share of a month column that 200 px stand for (a month column has
    // one width whatever its days)
    const place = (date) => date.year * 12 + date.month - 1 + (date.day - 1 + date.hour / 24) / date.daysInMonth;
    expect(Math.abs(place(read) - place(before) - 200 / november.width) < 0.05).toBe(true);
    // on the original scale (1 px is about 7 hours) that is Monday Jan 11, 2027
    await switchTo("week");
    expect(dayOf(middle())).toBe(dayOf(read));
    await clickNew();
    const start = read.startOf("day").minus({ days: read.weekday % 7 });
    expect(inputValue("date_start")).toBe(start.toFormat("MM/dd/yyyy 00:00:00"));
    expect(inputValue("date_stop")).toBe(start.plus({ days: 7 }).toFormat("MM/dd/yyyy 00:00:00"));
});

test("R18 focus is a linear share, not a column start", async () => {
    await mountTimeline();
    await switchTo("year");
    const date = middle();
    expect(date.toISODate()).not.toBe(date.startOf("month").toISODate());
    // the share inside the column gives the day: the middle lies inside November, past its start
    expect(date.diff(date.startOf("month"), "days").days).toBeGreaterThan(5);
    // scrolling further moves it inside the column, not by whole columns
    const before = date.toMillis();
    renderer().scrollLeft += 20;
    await animationFrame();
    const moved = middle().toMillis() - before;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(30 * DAY);
});

// -- 002b3 R1: no text can be selected in the view ------------------------------------------------

const BY_PARENT_CONTACT = ["parent_id", "x_contact"];

async function mountGrouped() {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1,
        groupBy: BY_PARENT_CONTACT,
    });
    await animationFrame();
}

const headerOf = (name) =>
    queryAll(".o_tl_row_header").find(
        (header) => header.querySelector(".o_tl_row_label")?.textContent === name
    );

test("002b3 A1: no text can be selected in the view", async () => {
    await mountGrouped();
    const none = (element) => getComputedStyle(element).userSelect;
    expect(none(queryOne(".o_tl_box"))).toBe("none");
    expect(none(queryOne(".o_tl_renderer"))).toBe("none");
    expect(none(headerOf("Alpha").querySelector(".o_tl_row_label"))).toBe("none");
    expect(none(queryAll(".o_tl_row:not(.o_tl_group_row) .o_tl_row_label")[0])).toBe("none");
    expect(none(queryAll(".o_tl_col")[0])).toBe("none");
    expect(".o_tl_total_row").toHaveCount(1);
    expect(none(queryOne(".o_tl_total_row .o_tl_row_header"))).toBe("none");
    expect(none(queryAll(".o_tl_pill")[0])).toBe("none");
});

test("002b3 A1: press, move, release in a group header toggles it each time", async () => {
    await mountGrouped();
    const before = queryAll(".o_tl_row:not(.o_tl_group_row)").length;
    const states = [];
    for (let i = 0; i < 3; i++) {
        const header = headerOf("Alpha");
        const rect = queryRect(header);
        const y = rect.top + rect.height / 2;
        await pointerDown(header, { position: { x: rect.left + 60, y } });
        for (let step = 1; step <= 8; step++) {
            await hover(header, { position: { x: rect.left + 60 + (140 * step) / 8, y } });
        }
        await pointerUp(header, { position: { x: rect.left + 200, y } });
        await animationFrame();
        await animationFrame();
        states.push(queryAll(".o_tl_row:not(.o_tl_group_row)").length);
    }
    expect(states[0]).toBeLessThan(before);
    expect(states[1]).toBe(before);
    expect(states[2]).toBe(states[0]);
});
