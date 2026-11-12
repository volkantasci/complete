// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { after, beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { hover, queryAll, queryAllTexts, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    mountView,
    patchWithCleanup,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
});

const H1 = HOST_ARCHS.H1;
const H2 = timelineArch(
    `string="Pills" default_range="week" color="x_color" total_row="1"`
);
const GROUP_BY = ["parent_id", "x_contact"];

async function mountTimeline({ arch = H1, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
}

async function settle() {
    await advanceTime(500);
    await animationFrame();
}

async function chooseRange(label) {
    await contains(".o_tl_range_button").click();
    const item = queryAll(".o_tl_range_item").find((el) => el.textContent.trim() === label);
    await contains(item).click();
    await settle();
}

async function applyCustom(startText, stopText) {
    await contains(".o_tl_range_button").click();
    await contains(".o_tl_custom_start input").edit(startText, { confirm: "enter" });
    await contains(".o_tl_custom_stop input").edit(stopText, { confirm: "enter" });
    await contains(".o_tl_apply").click();
    await settle();
}

const rows = () => queryAll(".o_tl_row:not(.o_tl_total_row)");
const nameOf = (row) => row.querySelector(".o_tl_row_name")?.textContent ?? "";
const rowNames = () => rows().map(nameOf);
const rowOf = (name) => rows().find((row) => nameOf(row) === name);
const header = (row) => row.querySelector(".o_tl_row_header");
const cellOfToday = (row) => row.querySelectorAll(".o_tl_cell")[11];
const counts = (row) => queryAllTexts(row.querySelectorAll(".o_tl_group_count"));
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) < tolerance;
const css = (element, property, pseudo) => getComputedStyle(element, pseudo)[property];
const bars = () => queryAll(".o_tl_total_bar");
const barCount = (bar) => Number(bar.textContent);

const OPEN_GRADIENT = "linear-gradient(rgb(248, 249, 250), rgb(233, 236, 239))";
const CLOSED_GRADIENT = "linear-gradient(rgb(233, 236, 239), rgb(248, 249, 250))";

// ----------------------------------------------------------------------------
// Row headers
// ----------------------------------------------------------------------------

test("A52: ungrouped dense has no row headers", async () => {
    await mountTimeline();
    expect(".o_tl_row_header").toHaveCount(0);
    expect(".o_tl_title_cell").toHaveCount(0);
    expect(".o_tl_total_row").toHaveCount(1);
    expect(".o_tl_total_row").not.toHaveText("Total");
    // the pills fill one row across the full width
    expect(rows()).toHaveCount(1);
    const grid = queryRect(".o_tl_grid");
    const cells = queryAll(".o_tl_row .o_tl_cell");
    expect(near(cells[0].getBoundingClientRect().left, grid.left)).toBe(true);
    expect(".o_tl_pill").toHaveCount(12);
});

test("A59: row header width 267 / 130 / one third at 700", async () => {
    // the test browser draws classic scrollbars, a phone overlays them: hide them to pin the rule
    const style = document.createElement("style");
    style.textContent = "* { scrollbar-width: none !important; } *::-webkit-scrollbar { width: 0; height: 0; }";
    document.head.appendChild(style);
    after(() => style.remove());
    await mountTimeline({ groupBy: GROUP_BY });
    await resize({ width: 1600 });
    await animationFrame();
    expect(queryRect(".o_tl_box").width).toBe(1600);
    expect(queryRect(".o_tl_title_cell").width).toBe(267);
    expect(queryRect(".o_tl_title_cell").height).toBe(50);
    expect(queryAll(".o_tl_row_header").every((el) => queryRect(el).width === 267)).toBe(true);

    await resize({ width: 390 });
    await animationFrame();
    expect(queryRect(".o_tl_box").width).toBe(390);
    expect(queryRect(".o_tl_title_cell").width).toBe(130);
    expect(queryAll(".o_tl_row_header").every((el) => queryRect(el).width === 130)).toBe(true);

    // above 768 px of content: a sixth; otherwise a third; whole pixels
    for (const width of [700, 768, 769, 900]) {
        await resize({ width });
        await animationFrame();
        expect(queryRect(".o_tl_box").width).toBe(width);
        expect(queryRect(".o_tl_title_cell").width).toBe(
            Math.round(width > 768 ? width / 6 : width / 3)
        );
    }
});

test("A59: the title cell is bold, sticky, on the translucent view background", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const title = queryOne(".o_tl_title_cell");
    expect(title).toHaveText("Pills");
    expect(css(title, "fontWeight")).toBe("700");
    expect(css(title, "position")).toBe("sticky");
    expect(css(title, "backgroundColor")).toBe("rgba(255, 255, 255, 0.75)");
    expect(css(title, "borderRightWidth")).toBe("1px");
});

test("A60: thumbnails", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const contactRows = rows().filter((row) => nameOf(row).includes("Contact"));
    expect(contactRows.map(nameOf)).toEqual([
        "Undefined Contact",
        "Host Contact 1",
        "Host Contact 2",
        "Undefined Contact",
        "Host Contact 2",
        "Host Contact 3",
        "Undefined Contact",
        "Host Contact 3",
    ]);
    for (const row of contactRows) {
        const images = row.querySelectorAll("img.o_tl_thumbnail");
        if (nameOf(row).startsWith("Undefined")) {
            expect(images).toHaveCount(0);
        } else {
            expect(images).toHaveCount(1);
        }
    }
    const image = rowOf("Host Contact 1").querySelector("img");
    // (the test environment answers an image request with its own data)
    expect(image.getAttribute("src")).not.toBe("");
    expect(queryRect(image).width).toBe(16);
    expect(queryRect(image).height).toBe(16);
    expect(css(image, "borderTopLeftRadius")).toBe("6px");
    expect(css(image, "marginRight")).toBe("0px");
    // group rows and rows of another field carry none
    expect(header(rowOf("Alpha")).querySelectorAll("img")).toHaveCount(0);
    // a leaf row: 0 4px 0 0 around the name, 41 px tall
    const name = rowOf("Host Contact 1").querySelector(".o_tl_row_name");
    expect(css(name, "paddingLeft")).toBe("0px");
    expect(css(name, "paddingRight")).toBe("4px");
    expect(queryRect(header(rowOf("Host Contact 1"))).height).toBe(41);
    expect(css(header(rowOf("Host Contact 1")), "fontWeight")).toBe("400");
});

// ----------------------------------------------------------------------------
// Group rows
// ----------------------------------------------------------------------------

test("A61: Alpha consolidated pills 1 1 2 1", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const alpha = rowOf("Alpha");
    expect(alpha).toHaveClass("o_tl_group_row");
    expect(queryRect(alpha).height).toBe(40);
    expect(queryRect(header(alpha)).height).toBe(40);
    const caret = alpha.querySelector(".o_tl_caret");
    expect(caret).toHaveClass("fa-caret-down");
    expect(queryRect(caret).width).toBe(18);
    expect(queryRect(caret).height).toBe(14);
    expect(css(caret, "marginRight")).toBe("4px");
    expect(css(header(alpha), "fontWeight")).toBe("400");
    expect(counts(alpha)).toEqual(["1", "1", "2", "1"]);

    const line = alpha.querySelector(".o_tl_group_pill");
    expect(queryRect(line).height).toBe(2);
    expect(css(line, "backgroundColor")).toMatch(/^rgb\(/);
    const label = alpha.querySelector(".o_tl_group_count");
    expect(css(label, "paddingLeft")).toBe("4px");
    expect(css(label, "paddingRight")).toBe("4px");
    expect(css(label, "backgroundColor")).toBe("rgb(255, 255, 255)");
    expect(css(label, "fontSize")).toBe("14px");
    // each line ends with a small tick
    for (const line of alpha.querySelectorAll(".o_tl_group_pill")) {
        const tick = getComputedStyle(line, "::after");
        expect(tick.content).toBe('""');
        expect(tick.width).toBe("1px");
        expect(tick.height).toBe("6px");
        expect(tick.right).toBe("0px");
        expect(tick.backgroundColor).toBe(css(line, "backgroundColor"));
    }
    // the group row shows no pill of its own
    expect(alpha.querySelectorAll(".o_tl_pill")).toHaveCount(0);
    // the line of the first segment ends with the half day that holds the end of Design (D-1)
    const design = alpha.querySelectorAll(".o_tl_group_pill")[0].getBoundingClientRect();
    const day = queryAll(".o_tl_col")[10].getBoundingClientRect();
    expect(near(design.right, day.right)).toBe(true);
});

test("A61: group row names and their count", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    expect(rowNames().filter((name) => !name.includes("Contact"))).toEqual([
        "Undefined Parent",
        "Alpha",
        "Beta",
        "Gamma",
    ]);
    expect(rows().filter((row) => row.matches(".o_tl_group_row"))).toHaveCount(4);
});

test("A62: collapse and reopen Alpha", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const before = rows().length;
    await contains(header(rowOf("Alpha"))).click();
    const alpha = rowOf("Alpha");
    expect(rows()).toHaveCount(before - 2);
    expect(alpha).toHaveClass("o_tl_collapsed");
    expect(alpha.querySelector(".o_tl_caret")).toHaveClass("fa-caret-right");
    expect(counts(alpha)).toEqual(["1", "1", "2", "1"]);
    expect(rowNames()).not.toInclude("Host Contact 1");
    await contains(alpha.querySelectorAll(".o_tl_cell")[3]).click();
    expect(rows()).toHaveCount(before);
    expect(rowOf("Alpha")).not.toHaveClass("o_tl_collapsed");
    expect(rowOf("Alpha").querySelector(".o_tl_caret")).toHaveClass("fa-caret-down");
});

test("A62: a click on the row of a plain row changes nothing", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const before = rows().length;
    await contains(header(rowOf("Host Contact 1"))).click();
    expect(rows()).toHaveCount(before);
});

test("A63: collapse all / expand all", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    await contains(".o_tl_collapse_all").click();
    expect(rows().every((row) => row.matches(".o_tl_group_row.o_tl_collapsed"))).toBe(true);
    expect(rowNames()).toEqual(["Undefined Parent", "Alpha", "Beta", "Gamma"]);
    expect(".o_tl_collapse_all").toHaveAttribute("title", "Open every group");
    await contains(".o_tl_collapse_all").click();
    expect(queryAll(".o_tl_group_row.o_tl_collapsed")).toHaveCount(0);
    expect(rows()).toHaveCount(12);
});

test("A64: changing the grouping reopens rows", async () => {
    await mountTimeline({
        searchViewArch: `<search>
            <filter name="parent" string="Parent" context="{'group_by': 'parent_id'}"/>
            <filter name="contact" string="Contact" context="{'group_by': 'x_contact'}"/>
        </search>`,
        context: { search_default_parent: 1, search_default_contact: 1 },
    });
    expect(rows()).toHaveCount(12);
    await contains(header(rowOf("Alpha"))).click();
    expect(rows()).toHaveCount(10);
    await toggleSearchBarMenu();
    await toggleMenuItem("Contact");
    await settle();
    expect(queryAllTexts(".o_searchview_facet")).toEqual(["Parent"]);
    expect(rows()).toHaveCount(4);
    expect(queryAll(".o_tl_collapsed")).toHaveCount(0);
    await toggleMenuItem("Contact");
    await settle();
    expect(rows()).toHaveCount(12);
    expect(queryAll(".o_tl_collapsed")).toHaveCount(0);
});

// ----------------------------------------------------------------------------
// Sparse mode
// ----------------------------------------------------------------------------

test("A65: sparse rows and switch back", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H6, groupBy: ["parent_id"] });
    expect(".o_tl_display_mode .fa-compress").toHaveCount(1);
    const names = rowNames();
    const alphaAt = names.indexOf("Alpha");
    expect(names.slice(alphaAt, alphaAt + 4)).toEqual(["Alpha", "Design", "Build", "Review"]);
    expect(rowOf("Alpha")).toHaveClass("o_tl_group_row");
    expect(rowOf("Alpha").querySelector(".o_tl_caret")).toHaveClass("fa-caret-down");
    expect(counts(rowOf("Alpha"))).toEqual(["1", "1", "2", "1"]);
    expect(rowOf("Design").querySelectorAll(".o_tl_pill")).toHaveCount(1);
    expect(rowOf("Design")).not.toHaveClass("o_tl_group_row");
    expect(queryRect(header(rowOf("Design"))).height).toBe(41);
    expect(css(header(rowOf("Design")), "fontWeight")).toBe("400");

    await contains(".o_tl_display_mode").click();
    expect(".o_tl_display_mode .fa-expand").toHaveCount(1);
    const alpha = rowOf("Alpha");
    expect(alpha).not.toHaveClass("o_tl_group_row");
    expect(alpha.querySelectorAll(".o_tl_pill")).toHaveCount(3);
    expect(rowNames()).not.toInclude("Design");
});

test("A66: sparse without grouping", async () => {
    await mountTimeline();
    expect(".o_tl_title_cell").toHaveCount(0);
    await contains(".o_tl_display_mode").click();
    expect(".o_tl_title_cell").toHaveCount(1);
    expect(".o_tl_title_cell").toHaveText("Pills");
    const names = rowNames();
    for (const name of ["Design", "Build", "Review", "Test", "Plan", "Long task"]) {
        expect(names).toInclude(name);
    }
    expect(rowOf("Build").querySelectorAll(".o_tl_pill")).toHaveCount(1);
    expect(".o_tl_group_row").toHaveCount(0);
    expect(".o_tl_total_row .o_tl_row_name").toHaveText("Total");
});

test("A104: display mode twice reopens rows", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    await contains(header(rowOf("Alpha"))).click();
    expect(".o_tl_collapsed").toHaveCount(1);
    await contains(".o_tl_display_mode").click();
    await contains(".o_tl_display_mode").click();
    expect(".o_tl_collapsed").toHaveCount(0);
    expect(".o_tl_group_row").toHaveCount(4);
    expect(rowNames()).toInclude("Host Contact 1");
});

// ----------------------------------------------------------------------------
// Today and the pointer in group rows
// ----------------------------------------------------------------------------

test("A69: today in group rows", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    let alpha = rowOf("Alpha");
    const cell = () => cellOfToday(rowOf("Alpha"));
    expect(cell()).toHaveClass("o_tl_is_today");
    // open: the gradient, no shade
    expect(css(cell(), "backgroundColor")).toBe("rgba(0, 0, 0, 0)");
    expect(css(cell(), "backgroundImage")).toBe(OPEN_GRADIENT);
    expect(css(alpha.querySelectorAll(".o_tl_cell")[3], "backgroundColor")).toBe(
        "rgba(0, 0, 0, 0)"
    );
    expect(css(alpha.querySelectorAll(".o_tl_cell")[3], "backgroundImage")).toBe(OPEN_GRADIENT);
    expect(css(header(alpha), "backgroundImage")).toBe(OPEN_GRADIENT);
    // a leaf row keeps the today shade
    expect(css(cellOfToday(rowOf("Host Contact 1")), "backgroundColor")).not.toBe(
        "rgba(0, 0, 0, 0)"
    );

    await contains(header(alpha)).click();
    await hover(queryOne(".o_tl_title_cell"));
    alpha = rowOf("Alpha");
    expect(css(cell(), "backgroundColor")).toBe("rgb(252, 250, 243)");
    expect(css(cell(), "backgroundImage")).toBe("none");
    expect(css(alpha.querySelectorAll(".o_tl_cell")[3], "backgroundColor")).toBe(
        "rgba(0, 0, 0, 0)"
    );
    expect(css(alpha.querySelectorAll(".o_tl_cell")[3], "backgroundImage")).toBe(
        CLOSED_GRADIENT
    );
    expect(css(header(alpha), "backgroundImage")).toBe(CLOSED_GRADIENT);
});

test("A69: the pointer over a group row swaps its gradient", async () => {
    await mountTimeline({ groupBy: GROUP_BY });
    const beta = rowOf("Beta");
    expect(css(header(beta), "backgroundImage")).toBe(OPEN_GRADIENT);
    expect(css(header(beta), "backgroundColor")).toBe("rgba(255, 255, 255, 0.75)");
    await hover(beta.querySelectorAll(".o_tl_cell")[3]);
    expect(css(header(beta), "backgroundImage")).toBe(CLOSED_GRADIENT);
    expect(css(beta.querySelectorAll(".o_tl_cell")[2], "backgroundImage")).toBe(CLOSED_GRADIENT);
    expect(css(beta.querySelectorAll(".o_tl_cell")[2], "backgroundColor")).toBe(
        "rgba(0, 0, 0, 0)"
    );
    await hover(queryOne(".o_tl_title_cell"));
    expect(css(header(beta), "backgroundImage")).toBe(OPEN_GRADIENT);
    // a collapsed row under the pointer takes the open gradient
    await contains(header(beta)).click();
    await hover(header(rowOf("Beta")));
    expect(css(header(rowOf("Beta")), "backgroundImage")).toBe(OPEN_GRADIENT);
    await hover(queryOne(".o_tl_title_cell"));
    expect(css(header(rowOf("Beta")), "backgroundImage")).toBe(CLOSED_GRADIENT);
});

// ----------------------------------------------------------------------------
// Total row
// ----------------------------------------------------------------------------

test("A70: total bars heights", async () => {
    await mountTimeline({ arch: H2 });
    const row = queryRect(".o_tl_total_row");
    expect(row.height).toBe(41);
    expect(row.height).toBeGreaterThan(39.99);
    const all = bars();
    expect(all.length).toBeGreaterThan(5);
    const maxCount = Math.max(...all.map(barCount));
    expect(maxCount).toBe(6);
    for (const bar of all) {
        const rect = bar.getBoundingClientRect();
        expect(near(rect.height, (0.9 * row.height * barCount(bar)) / maxCount, 0.05)).toBe(true);
        // the bars stand on the bottom of the row, the count at the bottom of the bar
        expect(near(rect.bottom, row.bottom)).toBe(true);
        const label = bar.querySelector(".o_tl_total_count").getBoundingClientRect();
        expect(near(label.bottom, rect.bottom - 4, 2.5)).toBe(true);
    }
    const label = css(all[0].querySelector(".o_tl_total_count"), "fontSize");
    expect(label).toBe("9.8px");
    expect(css(all[0].querySelector(".o_tl_total_count"), "marginBottom")).toBe("4px");
    expect(css(all[0], "backgroundColor")).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
    // ungrouped: no title
    expect(".o_tl_total_row .o_tl_row_header").toHaveCount(0);
    // the bar of D0 afternoon: Long task, Overlap A (ends 12:00) is over, Overlap B and C, Build, Review
    const afternoon = queryAll(".o_tl_col")[11].getBoundingClientRect();
    const middle = all.find((bar) => {
        const rect = bar.getBoundingClientRect();
        return rect.left <= afternoon.left + afternoon.width * 0.75 && rect.right >= afternoon.right - 1;
    });
    expect(barCount(middle)).toBe(6);
});

test("A70: the total row has the title only with row headers", async () => {
    await mountTimeline({ arch: H2, groupBy: ["parent_id"] });
    expect(".o_tl_total_row .o_tl_row_name").toHaveText("Total");
    expect(css(queryOne(".o_tl_total_row .o_tl_row_header"), "fontWeight")).toBe("400");
    expect(queryRect(".o_tl_total_row .o_tl_row_header").height).toBe(41);
});

test("no total row without the option", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week"`) });
    expect(".o_tl_total_row").toHaveCount(0);
});

test("A71: total bar hover band", async () => {
    await mountTimeline({ arch: H2 });
    const bar = bars()[0];
    const resting = css(bar, "backgroundColor");
    expect(css(bar, "backgroundColor", "::before")).not.toBe("rgba(113, 75, 103, 0.1)");
    await hover(bar);
    const hovered = css(bar, "backgroundColor");
    expect(hovered).not.toBe(resting);
    const alpha = (color) => Number(color.match(/, ([\d.]+)\)$/)[1]);
    expect(alpha(hovered)).toBeGreaterThan(alpha(resting));
    // the band: brand colour at 10 %, from the bar up to the top of the grid
    expect(css(bar, "content", "::before")).toBe('""');
    expect(alpha(css(bar, "backgroundColor", "::before"))).toBe(0.1);
    expect(css(bar, "bottom", "::before")).not.toBe("auto");
    expect(parseFloat(css(bar, "height", "::before"))).toBeGreaterThan(
        queryRect(".o_tl_grid").height
    );
    await hover(queryAll(".o_tl_col")[0]);
    expect(css(bar, "backgroundColor")).toBe(resting);
});

test("A106: narrow total bar small count", async () => {
    await mountTimeline({ arch: H2 });
    await chooseRange("Quarter");
    const all = bars();
    const narrow = all.filter((bar) => bar.getBoundingClientRect().width < 30);
    const wide = all.filter((bar) => bar.getBoundingClientRect().width >= 30);
    expect(narrow.length).toBeGreaterThan(0);
    expect(wide.length).toBeGreaterThan(0);
    for (const bar of narrow) {
        expect(css(bar.querySelector(".o_tl_total_count"), "fontSize")).toBe("7px");
    }
    for (const bar of wide) {
        expect(css(bar.querySelector(".o_tl_total_count"), "fontSize")).toBe("9.8px");
    }
    // one sub-column (half a day on the month scale) is narrow
    const column = queryAll(".o_tl_col")[0].getBoundingClientRect();
    expect(narrow.some((bar) => near(bar.getBoundingClientRect().width, column.width / 2))).toBe(
        true
    );
});

// ----------------------------------------------------------------------------
// A117: the total bars of the year grid
// ----------------------------------------------------------------------------

for (const step of ["quarter", "month", "day", "custom"]) {
    test(`A117: total bars on the year grid after ${step}`, async () => {
        await mountTimeline({ arch: H2 });
        if (step === "custom") {
            await applyCustom("11/10/2026", "11/20/2026");
        } else {
            await chooseRange(step[0].toUpperCase() + step.slice(1));
        }
        await chooseRange("Year");
        expect(queryAllTexts(".o_tl_col_group")).toEqual(["2025", "2026", "2027"]);
        // Long task covers October to December, the other eleven records lie in November:
        // three bars with the counts 1, 12 and 1 (S24)
        const all = bars();
        expect(all.map(barCount)).toEqual([1, 12, 1]);
        const row = queryRect(".o_tl_total_row");
        expect(near(all[1].getBoundingClientRect().height, 0.9 * row.height, 0.05)).toBe(true);
        expect(near(all[0].getBoundingClientRect().height, (0.9 * row.height) / 12, 0.05)).toBe(
            true
        );
        // the middle bar covers exactly November 2026
        const november = queryAll(".o_tl_col")[22].getBoundingClientRect();
        const middle = all[1].getBoundingClientRect();
        expect(near(middle.left, november.left)).toBe(true);
        expect(near(middle.right, november.right)).toBe(true);
    });
}
