// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryOne, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    getService,
    mountView,
    mountWithCleanup,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { WebClient } from "@web/webclient/webclient";

import {
    HOST_ARCHS,
    Pill,
    setupTimelineFixtures,
    timelineArch,
    timelineMock,
} from "./timeline_test_helpers";

const { DateTime } = luxon;

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
});

async function mountTimeline({ arch = HOST_ARCHS.H1, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
    await animationFrame();
}

const renderer = () => queryOne(".o_tl_renderer");
const headerOf = (date) => queryOne(`.o_tl_col[data-date="${date}"]`);
const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;
const centreOf = (element) => {
    const rect = element.getBoundingClientRect();
    return (rect.left + rect.right) / 2;
};
/** Where a day begins: the left edge of its column, the right edge in a mirrored grid. */
const startOf = (element) => {
    const rect = element.getBoundingClientRect();
    return getComputedStyle(element).direction === "rtl" ? rect.right : rect.left;
};

/** The middle of the visible part: the grid minus the title cell stuck at its start. */
function visibleCentre() {
    const box = renderer().getBoundingClientRect();
    const titleCell = queryAll(".o_tl_title_cell")[0];
    // without row headers nothing covers the grid
    const left = titleCell ? Math.max(box.left, titleCell.getBoundingClientRect().right) : box.left;
    return (left + box.left + renderer().clientWidth) / 2;
}

/** Scroll like a user would: set the position of the grid and let the layout settle. */
async function scrollTo(left) {
    renderer().scrollLeft = left;
    await animationFrame();
}

/** Scroll so that the middle of `element` is in the middle of the visible part. */
async function centre(element) {
    await scrollTo(renderer().scrollLeft + centreOf(element) - visibleCentre());
}

const rowOf = (name) =>
    queryAll(".o_tl_row").find((row) => row.querySelector(".o_tl_row_name")?.textContent === name);

async function settle() {
    await advanceTime(500);
    await animationFrame();
}

/** The host action in a web client, with a list view to leave for and come back from. */
async function mountAction() {
    Pill._views["gantt"] = HOST_ARCHS.H1;
    Pill._views["list"] = `<list><field name="name"/></list>`;
    Pill._views["search"] = `<search/>`;
    await mountWithCleanup(WebClient);
    await getService("action").doAction({
        type: "ir.actions.act_window",
        res_model: "pill",
        views: [
            [false, "gantt"],
            [false, "list"],
        ],
    });
    await animationFrame();
}

test("A20: the grid opens with the start of today in the middle of the visible part", async () => {
    await mountTimeline();
    expect(renderer().scrollWidth).toBeGreaterThan(renderer().clientWidth + 100);
    expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
});

test("A20: choosing a range centres the focus date again", async () => {
    await mountTimeline();
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_range_month").click();
    await animationFrame();
    expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
});

test("A29: Today inside the period scrolls without a request", async () => {
    await mountTimeline();
    await scrollTo(0);
    expect(startOf(headerOf("2026-11-12"))).toBeGreaterThan(visibleCentre() + 200);
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(timelineMock.calls).toHaveLength(1);
    expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
});

test("A29: Today scrolls again when today already is the focus date", async () => {
    await mountTimeline();
    await scrollTo(renderer().scrollWidth);
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(timelineMock.calls).toHaveLength(1);
    expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
});

test("A30: Today after a step reloads and centres today", async () => {
    await mountTimeline();
    await contains(".o_tl_next").click();
    await contains(".o_tl_next").click();
    await settle();
    expect(timelineMock.calls).toHaveLength(2);
    await contains(".o_tl_today").click();
    await animationFrame();
    expect(timelineMock.calls).toHaveLength(3);
    expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
});

test("A32: Month chosen after scrolling keeps the date in the middle", async () => {
    await resize({ width: 1600 });
    await mountTimeline({ arch: timelineArch(`default_range="week"`), groupBy: ["parent_id"] });
    // scrolled as far right as the grid goes, the middle of the visible part is Wednesday D+6
    // (F6; D+7 cannot reach it)
    await scrollTo(renderer().scrollWidth);
    const middle = queryAll(".o_tl_col[data-date]")
        .map((header) => ({ header, away: Math.abs(centreOf(header) - visibleCentre()) }))
        .sort((a, b) => a.away - b.away)[0].header;
    const middleDate = middle.dataset.date;
    expect(middleDate).toBe("2026-11-18");
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_range_month").click();
    await animationFrame();
    // three months centred on the month of D+6: October to December (local), sent as UTC
    const kwargs = timelineMock.calls.at(-1);
    expect(kwargs.start_date).toBe("2026-09-30 21:00:00");
    expect(kwargs.stop_date).toBe("2026-12-31 21:00:00");
    expect(near(startOf(headerOf(middleDate)), visibleCentre())).toBe(true);
});

test("A32: the range is rebuilt around the date in the middle, not around today", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="month"`) });
    // far right: the middle of the visible part is in December
    await scrollTo(renderer().scrollWidth);
    const middle = queryAll(".o_tl_col[data-date]")
        .map((header) => ({ header, away: Math.abs(centreOf(header) - visibleCentre()) }))
        .sort((a, b) => a.away - b.away)[0].header.dataset.date;
    expect(middle > "2026-12-01").toBe(true);
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_range_week").click();
    await animationFrame();
    const day = DateTime.fromISO(middle);
    const sunday = day.minus({ days: day.weekday % 7 });
    const start = sunday.minus({ days: 7 }).toUTC();
    expect(timelineMock.calls.at(-1).start_date).toBe(start.toFormat("yyyy-MM-dd HH:mm:ss"));
    expect(near(startOf(headerOf(day.toISODate())), visibleCentre())).toBe(true);
});

test("A32: a reload that keeps the range keeps the scroll position", async () => {
    await mountTimeline();
    await scrollTo(300);
    await contains(".o_tl_display_mode").click();
    await animationFrame();
    expect(renderer().scrollLeft).toBe(300);
});

test("A88: coming back from the list restores range, display mode and scroll", async () => {
    await mountAction();
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_range_month").click();
    await animationFrame();
    await contains(".o_tl_display_mode").click();
    await animationFrame();
    await scrollTo(777);
    const left = renderer().scrollLeft;
    expect(left).toBe(777);
    await contains(".o_switch_view.o_list").click();
    await animationFrame();
    expect(".o_list_view").toHaveCount(1);
    await contains(".o_switch_view.o_gantt").click();
    await animationFrame();
    expect(".o_tl_range_button").toHaveText("Month");
    expect(".o_tl_display_mode").toHaveAttribute("title", "Group records on shared rows");
    expect(renderer().scrollLeft).toBe(left);
});

test("A88: a restored view does not scroll to the focus date", async () => {
    await mountAction();
    await scrollTo(0);
    await contains(".o_switch_view.o_list").click();
    await animationFrame();
    await contains(".o_switch_view.o_gantt").click();
    await animationFrame();
    expect(renderer().scrollLeft).toBe(0);
});

test("A89: a click on a row header centres the start of the column of the first pill", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="quarter" color="x_color"`),
        groupBy: ["parent_id", "x_contact"],
    });
    await scrollTo(renderer().scrollWidth);
    // "Host Contact 2" holds "Review", which starts in the middle of its month column
    const pill = [...rowOf("Host Contact 2").querySelectorAll(".o_tl_pill")].reduce((best, element) =>
        element.getBoundingClientRect().left < best.getBoundingClientRect().left ? element : best
    );
    expect(centreOf(pill)).toBeLessThan(renderer().getBoundingClientRect().left);
    // the last column that does not begin after the pill
    const column = queryAll(".o_tl_col[data-index]")
        .filter((header) => header.getBoundingClientRect().left <= pill.getBoundingClientRect().left + 0.5)
        .at(-1);
    await contains(rowOf("Host Contact 2").querySelector(".o_tl_row_header")).click();
    await animationFrame();
    expect(near(startOf(column), visibleCentre())).toBe(true);
    // the pill starts inside its column on the quarter scale: its own start is not centred
    const pillStart = pill.getBoundingClientRect().left;
    expect(pillStart - startOf(column)).toBeGreaterThan(5);
    expect(near(pillStart, visibleCentre())).toBe(false);
});

test("A89: a click on a group row header only folds it", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="quarter"`),
        groupBy: ["parent_id", "x_contact"],
    });
    await scrollTo(0);
    await contains(rowOf("Alpha").querySelector(".o_tl_row_header")).click();
    await animationFrame();
    expect(rowOf("Alpha")).toHaveClass("o_tl_collapsed");
    expect(renderer().scrollLeft).toBe(0);
});

test("A90: the pointer over a group row swaps its gradient and releases it", async () => {
    await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
    const gradient = (row, part) => getComputedStyle(row.querySelector(part)).backgroundImage;
    const parts = [".o_tl_row_header", ".o_tl_cell:not(.o_tl_is_today)"];
    const beta = () => rowOf("Beta");
    const open = parts.map((part) => gradient(beta(), part));
    // a collapsed group row shows the gradient the pointer gives to an open one
    await contains(rowOf("Alpha").querySelector(".o_tl_row_header")).click();
    await contains(".o_tl_title_cell").hover();
    await animationFrame();
    const closed = parts.map((part) => gradient(rowOf("Alpha"), part));
    expect(open[0]).not.toBe(closed[0]);
    await contains(beta().querySelector(".o_tl_row_header")).hover();
    expect(beta()).toHaveClass("o_tl_hover");
    expect(parts.map((part) => gradient(beta(), part))).toEqual(closed);
    await contains(".o_tl_title_cell").hover();
    expect(beta()).not.toHaveClass("o_tl_hover");
    expect(parts.map((part) => gradient(beta(), part))).toEqual(open);
});

test("R39: in a right-to-left language the grid is mirrored and the focus is centred", async () => {
    // What the Community does for such a language: the direction of the localization and `dir`
    // on the document; its converter turns the `direction: ltr` of the page styles into rtl,
    // which the style below stands for (the test bundle is not converted)
    patchWithCleanup(localization, { direction: "rtl" });
    document.documentElement.setAttribute("dir", "rtl");
    const style = document.createElement("style");
    style.textContent = "* { direction: rtl !important; }";
    document.head.appendChild(style);
    try {
        await mountTimeline();
        expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
        // D-5: the padding and the sticky label follow the writing direction
        const group = queryAll(".o_tl_col_group")[1];
        expect(getComputedStyle(group).paddingRight).toBe("8px");
        expect(getComputedStyle(group).paddingLeft).toBe("0px");
        const label = getComputedStyle(group.querySelector(".o_tl_col_group_label"));
        expect(label.right).toBe("8px");
        expect(label.left).toBe("auto");
        // the first day is at the right
        expect(centreOf(headerOf("2026-11-01"))).toBeGreaterThan(centreOf(headerOf("2026-11-21")));
        await scrollTo(0);
        await contains(".o_tl_today").click();
        await animationFrame();
        expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
        await contains(".o_tl_range_button").click();
        await contains(".o_tl_range_month").click();
        await animationFrame();
        expect(near(startOf(headerOf("2026-11-12")), visibleCentre())).toBe(true);
    } finally {
        style.remove();
        document.documentElement.removeAttribute("dir");
    }
});

test("D-3: the title cell stays at the start of the view and covers what scrolls under it", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    await scrollTo(renderer().scrollWidth);
    const title = queryOne(".o_tl_title_cell");
    const box = renderer().getBoundingClientRect();
    expect(title).toHaveText("Pills");
    expect(Math.abs(title.getBoundingClientRect().left - (box.left + renderer().clientLeft))).toBeLessThan(2);
    const style = getComputedStyle(title);
    expect(style.fontWeight).toBe("700");
    expect(style.justifyContent).toBe("center");
    // the cell is above the headers and shows them through at 75 % of the view background
    expect(style.backgroundColor).toMatch(/, 0\.75\)$/);
    expect(Number(style.zIndex)).toBeGreaterThan(Number(getComputedStyle(queryAll(".o_tl_col")[0]).zIndex));
    // so are the row headers
    const header = queryAll(".o_tl_row_header")[0];
    expect(Math.abs(header.getBoundingClientRect().left - title.getBoundingClientRect().left)).toBeLessThan(2);
    expect(getComputedStyle(header).backgroundColor).toMatch(/, 0\.75\)$/);
});

test("D-5: the label of a group header stays at the left edge of the visible part", async () => {
    await mountTimeline({ groupBy: ["parent_id"] });
    const title = queryOne(".o_tl_title_cell");
    const groups = queryAll(".o_tl_col_group");
    expect(groups.length).toBeGreaterThan(2);
    // the second group starts 100 px under the title cell
    await scrollTo(
        renderer().scrollLeft + groups[1].getBoundingClientRect().left - (title.getBoundingClientRect().right - 100)
    );
    const rect = groups[0].getBoundingClientRect();
    const second = groups[1].getBoundingClientRect();
    expect(second.left).toBeLessThan(title.getBoundingClientRect().right);
    // the group before it ends under the cell: nothing to see; the second group is partly hidden
    const label = groups[1].querySelector(".o_tl_col_group_label");
    expect(label.textContent).not.toBe("");
    expect(near(label.getBoundingClientRect().left, title.getBoundingClientRect().right + 8, 1.5)).toBe(true);
    // the group is not a scroll container, so the label is not cut at the edge of its own box
    expect(getComputedStyle(groups[1]).overflowX).not.toBe("hidden");
    expect(rect.right).not.toBeGreaterThan(second.left + 1);
    // scrolled back, the label sits at the padding of its group
    await scrollTo(0);
    const back = groups[1].getBoundingClientRect();
    expect(near(groups[1].querySelector(".o_tl_col_group_label").getBoundingClientRect().left, back.left + 8, 1.5)).toBe(true);
});
