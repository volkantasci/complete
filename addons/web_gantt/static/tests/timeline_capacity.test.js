// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { hover, queryAll, queryOne, queryRect } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    mountView,
    patchWithCleanup,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { at, setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    // the week range shows three weeks from the Sunday before: 2026-11-01 to 2026-11-21
    patchWithCleanup(localization, { weekStart: 7 });
});

const H12 = timelineArch(
    `string="Pills" default_range="week" color="x_color" progress="x_progress"
     display_unavailability="1" progress_bar="x_contact" total_row="1"`,
    `<field name="x_flagged"/><field name="x_done"/>`
);
const SPARSE = timelineArch(
    `string="Pills" default_range="week" display_mode="sparse"
     display_unavailability="1" progress_bar="x_contact"`
);
const GROUP_BY = ["x_contact"];
// Design, Build (contact 1), Review (contact 2), Plan (no contact); none of them reaches D+3
const QUIET = [4, 5, 6, 9];
const QUIET_DOMAIN = [["id", "in", QUIET]];

async function mountTimeline({ arch = H12, groupBy = GROUP_BY, domain = QUIET_DOMAIN } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, groupBy, domain });
}

async function settle() {
    await advanceTime(500);
    await animationFrame();
}

const rows = () => queryAll(".o_tl_row:not(.o_tl_total_row)");
const rowOf = (name) =>
    rows().find((row) => row.querySelector(".o_tl_row_name")?.textContent.trim() === name);
const cellsOf = (row) => [...row.querySelectorAll(".o_tl_cell")];
const css = (element, property) => getComputedStyle(element)[property];
const near = (a, b, tolerance = 0.6) => Math.abs(a - b) < tolerance;
const headerOf = (date) => queryOne(`.o_tl_col[data-date="${date}"]`);
const D3 = "2026-11-15";
const D4 = "2026-11-16";
// the unavailable grey (M44), the border grey of a folded cell and of a bar track (M46, M47) and
// the light today fill (the highlight of the column of now)
const GREY = "rgb(233, 236, 239)";
const BORDER_GREY = "rgb(222, 226, 230)";
const TODAY_FILL = "rgb(255, 250, 235)";

/** Every contact is unavailable on D+3 and D+4 (from D+3 00:00 to D+5 00:00). */
function unavailableOnWeekend(contacts = [1, 2, 3], days = [3, 5]) {
    timelineMock.unavailability = {
        x_contact: Object.fromEntries(
            contacts.map((id) => [id, [{ start: at(days[0], "00:00"), stop: at(days[1], "00:00") }]])
        ),
    };
}

// ----------------------------------------------------------------------------
// Progress bars (R27)
// ----------------------------------------------------------------------------

test("A72: progress bar 24% with 91:00 and tooltip 29:00/120:00 (24%)", async () => {
    timelineMock.progress = { x_contact: { 1: { value: 29, max_value: 120 } } };
    await mountTimeline();
    expect(timelineMock.calls[0].progress_bar_fields).toEqual(["x_contact"]);

    const header = rowOf("Host Contact 1").querySelector(".o_tl_row_header");
    const track = header.querySelector(".o_tl_progress");
    const fill = header.querySelector(".o_tl_progress_fill");
    const label = header.querySelector(".o_tl_progress_label");
    expect(label).toHaveText("91:00");
    expect(track).toHaveAttribute("data-tooltip", "29:00/120:00 (24%)");
    expect(label).toHaveAttribute("data-tooltip", "29:00/120:00 (24%)");

    // M47: 5 px track, radius 3, right margin 8, no left margin, border grey, full header width
    expect(queryRect(track).height).toBe(5);
    expect(css(track, "borderTopLeftRadius")).toBe("3px");
    expect(css(track, "marginRight")).toBe("8px");
    expect(css(track, "marginLeft")).toBe("0px");
    expect(css(track, "backgroundColor")).toBe(BORDER_GREY);
    // 8 px padding at the left, 8 px margin at the right, 1 px border
    expect(near(queryRect(track).width, queryRect(header).width - 8 - 8 - 1)).toBe(true);
    // M48: filled to 24 % in the success colour at 75 % opacity
    expect(near(queryRect(fill).width / queryRect(track).width, 0.2417, 0.005)).toBe(true);
    expect(css(fill, "backgroundColor")).toMatch(/^rgba\(\d+, \d+, \d+, 0\.75\)$/);
    // M49: 13 px muted label, 4 px padding at its left and margin at its right
    expect(css(label, "fontSize")).toBe("13px");
    expect(css(label, "paddingLeft")).toBe("4px");
    expect(css(label, "marginRight")).toBe("4px");
    expect(css(label, "color")).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    // at the right of the name
    expect(queryRect(label).left >= queryRect(header.querySelector(".o_tl_row_name")).right - 1).toBe(
        true
    );
    // the second contact has no answer: no bar, no label
    expect(rowOf("Host Contact 2").querySelectorAll(".o_tl_progress, .o_tl_progress_label")).toHaveCount(
        0
    );
});

test("A73: over 100% shows the danger colours", async () => {
    timelineMock.progress = {
        x_contact: { 1: { value: 130, max_value: 120 }, 2: { value: 60, max_value: 120 } },
    };
    await mountTimeline();
    const over = rowOf("Host Contact 1").querySelector(".o_tl_row_header");
    const normal = rowOf("Host Contact 2").querySelector(".o_tl_row_header");
    // the bar is full and both it and the label are in the danger colour
    const overFill = over.querySelector(".o_tl_progress_fill");
    expect(near(queryRect(overFill).width, queryRect(over.querySelector(".o_tl_progress")).width)).toBe(
        true
    );
    expect(over.querySelector(".o_tl_progress_label")).toHaveText("-10:00");
    expect(over.querySelector(".o_tl_progress")).toHaveAttribute(
        "data-tooltip",
        "130:00/120:00 (108%)"
    );
    expect(css(overFill, "backgroundColor")).not.toBe(
        css(normal.querySelector(".o_tl_progress_fill"), "backgroundColor")
    );
    expect(css(over.querySelector(".o_tl_progress_label"), "color")).not.toBe(
        css(normal.querySelector(".o_tl_progress_label"), "color")
    );
    expect(normal.querySelector(".o_tl_progress_label")).toHaveText("60:00");

});

test("A73: a warning without maximum shows the quantity, an icon and no bar", async () => {
    timelineMock.progress = {
        x_contact: { 1: { value: 10, max_value: 0, warning: "No allocation is planned" } },
    };
    await mountTimeline();
    const header = rowOf("Host Contact 1").querySelector(".o_tl_row_header");
    expect(header.querySelector(".o_tl_progress_label")).toHaveText("-10:00");
    expect(header.querySelector(".o_tl_progress_label")).not.toHaveAttribute("data-tooltip");
    expect(header.querySelectorAll(".o_tl_progress")).toHaveCount(0);
    const icon = header.querySelector(".o_tl_progress_warning");
    expect(icon).toHaveClass("fa-exclamation-triangle");
    expect(icon).toHaveAttribute("data-tooltip", "No allocation is planned");
    expect(queryRect(icon).left >= queryRect(header.querySelector(".o_tl_progress_label")).right - 1).toBe(
        true
    );
});

test("A73: no progress asked when the field is not in the grouping", async () => {
    timelineMock.progress = { x_contact: { 1: { value: 29, max_value: 120 } } };
    await mountTimeline({ groupBy: ["parent_id"] });
    expect(timelineMock.calls[0].progress_bar_fields).toBe(undefined);
    expect(".o_tl_progress, .o_tl_progress_label").toHaveCount(0);
});

test("A105: sparse progress only on group rows", async () => {
    timelineMock.progress = { x_contact: { 1: { value: 29, max_value: 120 } } };
    await mountTimeline({ arch: SPARSE });
    const group = rowOf("Host Contact 1");
    expect(group).toHaveClass("o_tl_group_row");
    expect(group.querySelectorAll(".o_tl_progress")).toHaveCount(1);
    expect(group.querySelector(".o_tl_progress_label")).toHaveText("91:00");
    expect(".o_tl_row:not(.o_tl_group_row) .o_tl_progress").toHaveCount(0);
    expect(".o_tl_row:not(.o_tl_group_row) .o_tl_progress_label").toHaveCount(0);
    expect(".o_tl_progress").toHaveCount(1);
});

// ----------------------------------------------------------------------------
// Unavailable periods (R28)
// ----------------------------------------------------------------------------

test("A74: unavailable cells and today fill kept", async () => {
    timelineMock.unavailability = {
        x_contact: {
            1: [
                { start: at(0, "12:00"), stop: at(1, "00:00") },
                { start: at(1, "00:00"), stop: at(2, "12:00") },
            ],
        },
    };
    await mountTimeline();
    expect(timelineMock.calls[0].unavailability_fields).toEqual(["x_contact"]);
    const cells = cellsOf(rowOf("Host Contact 1"));
    expect(cells).toHaveCount(21);
    // D-1 and D+3 are not touched
    expect(css(cells[10], "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    // D+1 is grey, D+2 on its first half only (hard edge at 50 %)
    expect(css(cells[12], "backgroundColor")).toBe(GREY);
    expect(css(cells[13], "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    const image = css(cells[13], "backgroundImage");
    expect(image).toMatch(/^linear-gradient\(to right, /);
    expect(image).toInclude(`${GREY} 0%, ${GREY} 50%`);
    expect(image).toInclude("50%, rgba(0, 0, 0, 0) 100%");
    // today (D0): the second half is grey, the available half keeps the today fill
    expect(cells[11]).toHaveClass("o_tl_is_today");
    expect(css(cells[11], "backgroundColor")).toBe(TODAY_FILL);
    expect(css(cells[11], "backgroundImage")).toInclude(`rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 50%, ${GREY} 50%`);
    // another contact and the row without a value get nothing
    for (const name of ["Host Contact 2", "Undefined Contact"]) {
        for (const cell of cellsOf(rowOf(name))) {
            expect(css(cell, "backgroundImage")).toBe("none");
            expect(css(cell, "backgroundColor")).not.toBe(GREY);
        }
    }
});

test("A74: group rows are not greyed", async () => {
    timelineMock.unavailability = {
        x_contact: { 1: [{ start: at(1, "00:00"), stop: at(2, "00:00") }] },
    };
    await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
    const row = rowOf("Host Contact 1");
    expect(css(cellsOf(row)[12], "backgroundColor")).toBe(GREY);
    const group = queryAll(".o_tl_group_row")[0];
    expect(cellsOf(group).some((cell) => css(cell, "backgroundColor") === GREY)).toBe(false);
});

// ----------------------------------------------------------------------------
// Folded columns (R29)
// ----------------------------------------------------------------------------

test("A75: two days fold into 36 px and reopen", async () => {
    unavailableOnWeekend();
    await mountTimeline();
    // 21 days, two of them folded into one column
    expect(".o_tl_col").toHaveCount(20);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    const folded = queryOne(".o_tl_col.o_tl_folded");
    // M45
    expect(queryRect(folded).width).toBe(36);
    expect(queryRect(folded).height).toBe(25);
    expect(css(folded, "backgroundColor")).toBe("rgba(255, 255, 255, 0.75)");
    expect(folded.querySelectorAll("i.fa")).toHaveCount(2);
    expect(folded).toHaveAttribute("data-tooltip", "Show the folded days");
    // M46: the cells of every row, the group-less total row included
    expect(".o_tl_cell.o_tl_folded_cell").toHaveCount(4);
    for (const cell of queryAll(".o_tl_cell.o_tl_folded_cell")) {
        expect(queryRect(cell).width).toBe(36);
        expect(css(cell, "backgroundColor")).toBe(BORDER_GREY);
    }
    // the cells of the following columns stay aligned with their headers
    const last = queryAll(".o_tl_col").at(-1);
    expect(near(queryRect(cellsOf(rowOf("Host Contact 1")).at(-1)).left, queryRect(last).left)).toBe(
        true
    );
    // pills after the fold keep their column: Build ends on D+2, before the fold
    const build = queryOne(".o_tl_pill[data-pill-id='5']");
    expect(near(queryRect(build).left, queryRect(headerOf("2026-11-12")).left, 1.5)).toBe(true);

    // a click on the folded header opens the two days (S21)
    await contains(folded).click();
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_col.o_tl_folded, .o_tl_folded_cell").toHaveCount(0);
    expect(css(cellsOf(rowOf("Host Contact 1"))[14], "backgroundColor")).toBe(GREY);
    // a click on the header of one of them folds them back
    await contains(headerOf(D3)).click();
    expect(".o_tl_col").toHaveCount(20);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    // a click on a folded cell opens them too
    await contains(".o_tl_row .o_tl_folded_cell").click();
    expect(".o_tl_col").toHaveCount(21);
});

test("A75: a single day folds alone on Week but not on Month", async () => {
    unavailableOnWeekend([1, 2, 3], [3, 4]);
    await mountTimeline();
    // one header replaces the one day
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    expect(queryOne(".o_tl_col.o_tl_folded")).toHaveText("");
    // open it, then go to Month: a single day does not fold there
    await contains(".o_tl_col.o_tl_folded").click();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    await contains(".o_tl_range_button").click();
    const month = queryAll(".o_tl_range_item").find((el) => el.textContent.trim() === "Month");
    await contains(month).click();
    await settle();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
});

test("A76: a contact available on D+3 keeps D+3 open and D+4 folds alone", async () => {
    // contact 1 is unavailable on D+3 and D+4, contact 2 only on D+4
    timelineMock.unavailability = {
        x_contact: {
            1: [{ start: at(3, "00:00"), stop: at(5, "00:00") }],
            2: [{ start: at(4, "00:00"), stop: at(5, "00:00") }],
        },
    };
    await mountTimeline();
    // D+3 stays a normal column; D+4 is one folded column on its own (R29 on Week)
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    expect(`.o_tl_col[data-date="${D3}"]`).toHaveCount(1);
    expect(`.o_tl_col[data-date="${D3}"]`).not.toHaveClass("o_tl_folded");
    expect(`.o_tl_col[data-date="${D4}"]`).toHaveCount(0);
    // a folded cell in every row, the total row included, none at D+3
    expect(".o_tl_folded_cell").toHaveCount(4);
    expect(".o_tl_total_row .o_tl_folded_cell").toHaveCount(1);
    expect(queryRect(".o_tl_col.o_tl_folded").width).toBe(36);
    expect(queryRect(`.o_tl_col[data-date="${D3}"]`).width > 36).toBe(true);
});

test("A76: a contact available on both days stops the folding", async () => {
    unavailableOnWeekend([1]);
    await mountTimeline();
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    expect(".o_tl_folded_cell").toHaveCount(0);
    expect(css(cellsOf(rowOf("Host Contact 1"))[14], "backgroundColor")).toBe(GREY);
});

test("A76: a pill keeps its columns open", async () => {
    // Deploy (contact 3) runs from D+5 to D+6: only D+3 and D+4 fold
    unavailableOnWeekend([1, 2, 3], [3, 7]);
    await mountTimeline({ domain: [["id", "in", [...QUIET, 8]]] });
    expect(".o_tl_col").toHaveCount(20);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    for (const date of ["2026-11-17", "2026-11-18"]) {
        expect(`.o_tl_col[data-date="${date}"]`).toHaveCount(1);
    }
    expect(`.o_tl_col[data-date="${D3}"], .o_tl_col[data-date="${D4}"]`).toHaveCount(0);
});

test("A107: hover arrows and total-row folded cell click", async () => {
    unavailableOnWeekend();
    await mountTimeline();
    await contains(".o_tl_col.o_tl_folded").click();
    expect(".o_tl_col").toHaveCount(21);

    // the pointer rests on D+3: its run shows outward arrows, the other headers are dimmed
    await hover(headerOf(D3));
    for (const date of [D3, D4]) {
        const header = headerOf(date);
        expect(header).toHaveClass("o_tl_run_hover");
        expect(header.querySelectorAll("i.fa")).toHaveCount(2);
        expect(css(header.querySelector(".o_tl_col_arrows"), "display")).not.toBe("none");
        expect(css(header.querySelector(".o_tl_col_title"), "display")).toBe("none");
        expect(css(header, "opacity")).toBe("1");
    }
    for (const header of queryAll(".o_tl_col:not(.o_tl_run_hover)")) {
        expect(css(header, "opacity")).toBe("0.5");
    }
    // leaving restores everything
    await hover(".o_tl_title_cell");
    expect(".o_tl_run_hover").toHaveCount(0);
    expect(css(headerOf(D3).querySelector(".o_tl_col_title"), "display")).not.toBe("none");
    expect(css(headerOf("2026-11-11"), "opacity")).toBe("1");

    // fold again, then a click on the folded cell of the total row opens the run
    await contains(headerOf(D3)).click();
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    expect(".o_tl_total_row .o_tl_folded_cell").toHaveCount(1);
    await contains(".o_tl_total_row .o_tl_folded_cell").click();
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_folded_cell").toHaveCount(0);
});

test("A75: a click on a folded cell of a group row does not toggle the group", async () => {
    unavailableOnWeekend();
    await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    const group = queryAll(".o_tl_group_row")[0];
    expect(group.querySelectorAll(".o_tl_folded_cell")).toHaveCount(1);
    await contains(group.querySelector(".o_tl_folded_cell")).click();
    expect(".o_tl_col").toHaveCount(21);
    expect(group).not.toHaveClass("o_tl_collapsed");
});

test("A75: every column folded gives one full-width column", async () => {
    timelineMock.expandGroups = [1, 2];
    timelineMock.unavailability = {
        x_contact: {
            1: [{ start: at(-30, "00:00"), stop: at(30, "00:00") }],
            2: [{ start: at(-30, "00:00"), stop: at(30, "00:00") }],
        },
    };
    await mountTimeline({ domain: [["id", "in", []]] });
    expect(".o_tl_col").toHaveCount(1);
    expect(".o_tl_col").toHaveClass("o_tl_folded");
    const grid = queryRect(".o_tl_grid");
    const area = grid.width - queryRect(".o_tl_title_cell").width;
    expect(near(queryRect(".o_tl_col").width, area, 1.5)).toBe(true);
    expect(".o_tl_col_group").toHaveCount(1);
    // a click opens the columns again
    await contains(".o_tl_col").click();
    expect(".o_tl_col").toHaveCount(21);
});

test("R40: the pointer over a group row or a total bar leaves folded cells alone", async () => {
    unavailableOnWeekend();
    await mountTimeline({ groupBy: ["parent_id", "x_contact"] });
    const group = queryAll(".o_tl_group_row")[0];
    const folded = group.querySelector(".o_tl_folded_cell");
    const plain = group.querySelector(".o_tl_cell:not(.o_tl_folded_cell)");
    for (const hovered of [group, queryAll(".o_tl_total_bar")[0]]) {
        await hover(hovered);
        expect(css(folded, "backgroundColor")).toBe(BORDER_GREY);
        expect(css(folded, "backgroundImage")).toBe("none");
    }
    await hover(group);
    // the other cells of the row do take the highlight
    expect(css(plain, "backgroundImage")).toInclude("linear-gradient");
    // a collapsed group row too
    await contains(group.querySelector(".o_tl_row_header")).click();
    expect(group).toHaveClass("o_tl_collapsed");
    await hover(group);
    expect(css(group.querySelector(".o_tl_folded_cell"), "backgroundColor")).toBe(BORDER_GREY);
    expect(css(group.querySelector(".o_tl_folded_cell"), "backgroundImage")).toBe("none");
});

test("A75: folding is reset when the scale changes", async () => {
    unavailableOnWeekend();
    await mountTimeline();
    await contains(".o_tl_col.o_tl_folded").click();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    for (const label of ["Day", "Week"]) {
        await contains(".o_tl_range_button").click();
        const item = queryAll(".o_tl_range_item").find((el) => el.textContent.trim() === label);
        await contains(item).click();
        await settle();
    }
    expect(".o_tl_col").toHaveCount(20);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
});

test("A75: an open run is forgotten when a search removes it", async () => {
    unavailableOnWeekend([1, 2, 3], [3, 5]);
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: H12,
        groupBy: GROUP_BY,
        searchViewArch: `<search>
            <filter name="quiet" string="Quiet" domain="[['id', 'in', [4, 5, 6, 9]]]"/>
            <filter name="more" string="More" domain="[['id', '=', 7]]"/>
        </search>`,
        context: { search_default_quiet: 1 },
    });
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    await contains(".o_tl_col.o_tl_folded").click();
    expect(".o_tl_col.o_tl_folded").toHaveCount(0);
    // the Test pill (D+1 to D+4) touches both days: no run left
    await toggleSearchBarMenu();
    await toggleMenuItem("More");
    await settle();
    expect(".o_tl_col").toHaveCount(21);
    expect(".o_tl_col.o_tl_folded, .o_tl_col.o_tl_foldable").toHaveCount(0);
    // the run comes back folded, not open
    await toggleMenuItem("More");
    await settle();
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
});

test("A75: Saturday and Sunday across two weeks fold into one column", async () => {
    // D+2 (Saturday 11-14) and D+3 (Sunday 11-15) lie in two different weeks
    timelineMock.unavailability = {
        x_contact: { 1: [{ start: at(2, "00:00"), stop: at(4, "00:00") }] },
    };
    await mountTimeline({ domain: [["id", "in", [4]]] });
    expect(".o_tl_col").toHaveCount(20);
    expect(".o_tl_col.o_tl_folded").toHaveCount(1);
    const fold = queryRect(".o_tl_col.o_tl_folded");
    expect(fold.width).toBe(36);
    const groups = queryAll(".o_tl_col_group");
    expect(groups).toHaveCount(3);
    const rects = groups.map((el) => queryRect(el));
    // no overlap
    for (let i = 1; i < rects.length; i++) {
        expect(rects[i].left >= rects[i - 1].right - 1).toBe(true);
    }
    // the earlier week ends at the fold, the next one starts right after it
    expect(near(rects[1].right, fold.right, 1)).toBe(true);
    expect(near(rects[2].left, fold.right, 1)).toBe(true);
    // the full text stays in the tooltip
    expect(groups[1].title).toMatch(/Week 46/);
    expect(groups[2].title).toMatch(/Week 47/);
});
