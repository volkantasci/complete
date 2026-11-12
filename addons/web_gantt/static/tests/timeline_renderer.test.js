// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAll, queryAllTexts, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineParams,
    mountView,
    makeMockServer,
    MockServer,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import {
    dayAt,
    HOST_ARCHS,
    setupTimelineFixtures,
    timelineArch,
} from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
});

/** The mock records of `pill`, to edit before the view is mounted. */
async function serverRecords() {
    await makeMockServer();
    return MockServer.current.env["pill"];
}

async function mountTimeline({ arch = HOST_ARCHS.H1, resModel = "pill", ...rest } = {}) {
    await mountView({ type: "gantt", resModel, arch, ...rest });
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

async function settle() {
    await advanceTime(500);
    await animationFrame();
}

const columns = () => queryAll(".o_tl_col");
const groups = () => queryAll(".o_tl_col_group");
const pills = () => queryAll(".o_tl_pill");
const titleOf = (pill) => pill.querySelector(".o_tl_pill_title").textContent;
const pillOf = (name) => pills().find((pill) => titleOf(pill) === name);
const pillNames = () => pills().map(titleOf);
const style = (element, ...names) => {
    const computed = getComputedStyle(element);
    return names.map((name) => computed[name]);
};
/**
 * Computed colours of the decoration roles in the light bundle of this run: the theme values
 * when web_enterprise is installed (it publishes the `--o-cws-*` role properties), the
 * Community values otherwise.
 */
function roleColors() {
    const themed = getComputedStyle(document.documentElement).getPropertyValue("--o-cws-danger");
    return themed.trim()
        ? {
              danger: "rgb(239, 68, 68)", // M16 light
              info: "rgb(23, 162, 184)", // M17 light
              warning: "rgb(245, 158, 11)",
              success: "rgb(0, 169, 69)",
              secondary: "rgb(222, 226, 230)", // grey 300
          }
        : {
              danger: "rgb(220, 53, 69)",
              info: "rgb(23, 162, 184)",
              warning: "rgb(255, 172, 0)",
              success: "rgb(40, 167, 69)",
              secondary: "rgb(222, 226, 230)",
          };
}
const markColor = (pill) =>
    getComputedStyle(pill.querySelector(".o_tl_pill_mark")).backgroundColor;
// the total row has a today cell of its own
const BODY_TODAY_CELL = ".o_tl_row:not(.o_tl_total_row) .o_tl_cell.o_tl_is_today";
const near = (a, b) => Math.abs(a - b) < 1.5;

// ----------------------------------------------------------------------------
// Headers
// ----------------------------------------------------------------------------

test("A36: column headers per scale", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week"`) });
    // week: weekday and day number under the week range
    expect(groups().map((el) => el.textContent)).toEqual([
        "Week 45, Nov 1 - Nov 7",
        "Week 46, Nov 8 - Nov 14",
        "Week 47, Nov 15 - Nov 21",
    ]);
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual([
        "Sunday 1",
        "Monday 2",
        "Tuesday 3",
    ]);
    expect(columns()).toHaveLength(21);
    expect(columns()[11]).toHaveAttribute("title", "November 12, 2026");
    expect(groups()[1]).toHaveAttribute("title", "Week 46, Nov 8 - Nov 14");

    await chooseRange("Day");
    expect(groups().map((el) => el.textContent)).toEqual([
        "Wednesday, November 11, 2026",
        "Thursday, November 12, 2026",
        "Friday, November 13, 2026",
    ]);
    expect(columns()).toHaveLength(72);
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual(["0", "1", "2"]);
    expect(queryAllTexts(".o_tl_col").slice(21, 24)).toEqual(["21", "22", "23"]);
    expect(columns()[21].getAttribute("title")).toMatch(/^November 11, 2026.*21:00$/);

    await chooseRange("Month");
    expect(groups().map((el) => el.textContent)).toEqual([
        "October 2026",
        "November 2026",
        "December 2026",
    ]);
    expect(columns()).toHaveLength(92);
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual(["01", "02", "03"]);

    await chooseRange("Quarter");
    expect(groups()).toHaveLength(9);
    expect(groups()[0]).toHaveText("July 2026");
    expect(groups()[8]).toHaveText("March 2027");
    expect(queryAllTexts(".o_tl_col").slice(0, 2)).toEqual(["01", "02"]);

    await chooseRange("Year");
    expect(groups().map((el) => el.textContent)).toEqual(["2025", "2026", "2027"]);
    expect(columns()).toHaveLength(36);
    expect(queryAllTexts(".o_tl_col").slice(0, 2)).toEqual(["January", "February"]);
    expect(columns()[22]).toHaveText("November");
    expect(columns()[22]).toHaveAttribute("title", "November 2026");
});

test("A36: the year is added to a week of another year", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week"`) });
    await applyCustom("12/28/2026", "01/10/2027");
    expect(groups().map((el) => el.textContent)).toEqual([
        "Week 53, Dec 27 - Jan 2",
        "Week 1, Jan 3, 2027 - Jan 9, 2027",
        "Week 2, Jan 10, 2027 - Jan 16, 2027",
    ]);
});

test("A36: hours of a 24-hour language", async () => {
    defineParams({ lang_parameters: { time_format: "%H:%M:%S" } });
    await mountTimeline({ arch: timelineArch(`default_range="day"`) });
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual(["0", "1", "2"]);
    expect(queryAllTexts(".o_tl_col").slice(21, 24)).toEqual(["21", "22", "23"]);
    expect(".o_tl_col small").toHaveCount(0);
});

test("A36: hours with am and pm", async () => {
    defineParams({ lang_parameters: { time_format: "%I:%M:%S %p" } });
    await mountTimeline({ arch: timelineArch(`default_range="day"`) });
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual(["12am", "1am", "2am"]);
    expect(queryAllTexts(".o_tl_col").slice(21, 24)).toEqual(["9pm", "10pm", "11pm"]);
    expect(".o_tl_col small").toHaveCount(72);
    expect(columns()[21].getAttribute("title")).toMatch(/^November 11, 2026.*9:00 PM$/);
});

test("A36: month names are abbreviated on a small screen", async () => {
    await resize({ width: 400 });
    await mountTimeline({ arch: timelineArch(`default_range="year"`) });
    expect(queryAllTexts(".o_tl_col").slice(0, 3)).toEqual(["Jan", "Feb", "Mar"]);
    await chooseRange("Month");
    expect(groups().map((el) => el.textContent)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026"]);
    expect(queryAllTexts(".o_tl_col").slice(0, 2)).toEqual(["01", "02"]);
});

test("A36: the header row sizes", async () => {
    await mountTimeline();
    expect(queryRect(columns()[0]).height).toBe(25);
    expect(queryRect(groups()[0]).height).toBe(25);
    expect(style(groups()[0], "paddingLeft")).toEqual(["8px"]);
});

// ----------------------------------------------------------------------------
// Widths
// ----------------------------------------------------------------------------

test("A37: columns at the minimum width scroll", async () => {
    await resize({ width: 1600 });
    await mountTimeline();
    const renderer = queryOne(".o_tl_renderer");
    expect(columns()[0].getBoundingClientRect().width).toBeGreaterThan(191.9);
    expect(near(columns()[0].getBoundingClientRect().width, 192)).toBe(true);
    expect(renderer.scrollWidth).toBeGreaterThan(renderer.clientWidth);

    // two days at the day scale: 48 columns of 40 px
    await applyCustom("11/12/2026", "11/13/2026");
    expect(columns()).toHaveLength(48);
    expect(near(columns()[0].getBoundingClientRect().width, 40)).toBe(true);
    expect(queryOne(".o_tl_renderer").scrollWidth).toBeGreaterThan(
        queryOne(".o_tl_renderer").clientWidth
    );

    // seven days after the start: 8 week columns share the width
    await applyCustom("11/12/2026", "11/19/2026");
    expect(columns()).toHaveLength(8);
    const rendererNow = queryOne(".o_tl_renderer");
    expect(near(columns()[0].getBoundingClientRect().width, rendererNow.clientWidth / 8)).toBe(true);
    expect(rendererNow.scrollWidth).toBeLessThan(rendererNow.clientWidth + 1.5);
});

// ----------------------------------------------------------------------------
// Pills: position
// ----------------------------------------------------------------------------

test("A38: Review covers the afternoon half", async () => {
    await mountTimeline();
    const day = columns()[columnOfDayIndex(0)];
    const rect = day.getBoundingClientRect();
    const review = pillOf("Review").getBoundingClientRect();
    expect(near(review.left, rect.left + rect.width / 2)).toBe(true);
    expect(near(review.right, rect.right)).toBe(true);
    // Build covers D0 .. D+2 whole columns
    const build = pillOf("Build").getBoundingClientRect();
    expect(near(build.left, rect.left)).toBe(true);
    expect(near(build.right, columns()[columnOfDayIndex(2)].getBoundingClientRect().right)).toBe(
        true
    );
});

/** Index of D+offset among the week columns (the range starts on Sunday 2026-11-01). */
function columnOfDayIndex(offset) {
    return 11 + offset;
}

test("A38: whole days and quarter days", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="week" precision="{'week': 'day:full'}"`),
    });
    const day = columns()[11].getBoundingClientRect();
    const review = pillOf("Review").getBoundingClientRect();
    expect(near(review.left, day.left)).toBe(true);
    expect(near(review.right, day.right)).toBe(true);
});

test("A38: quarter precision covers 12:00 to 18:00", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="week" precision="{'week': 'day:quarter'}"`),
    });
    const day = columns()[11].getBoundingClientRect();
    const review = pillOf("Review").getBoundingClientRect();
    expect(near(review.left, day.left + day.width / 2)).toBe(true);
    expect(near(review.right, day.left + (day.width * 3) / 4)).toBe(true);
});

test("A38: whole days on date-only fields at the month scale", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H10, resModel: "pill2" });
    const days = columns();
    const first = days.findIndex((el) => el.dataset.date === dayAt(-1));
    const three = pillOf("Three days").getBoundingClientRect();
    expect(near(three.left, days[first].getBoundingClientRect().left)).toBe(true);
    expect(near(three.right, days[first + 2].getBoundingClientRect().right)).toBe(true);
    const one = pillOf("Day one").getBoundingClientRect();
    expect(near(one.left, days[first + 1].getBoundingClientRect().left)).toBe(true);
    expect(near(one.width, days[first + 1].getBoundingClientRect().width)).toBe(true);
});

test("A41: no resize handle and no lock icon at rest, cut pills carry classes", async () => {
    await mountTimeline();
    const long = pillOf("Long task");
    expect(long).toHaveClass("o_tl_pill_cut_start");
    expect(long).toHaveClass("o_tl_pill_cut_stop");
    const first = columns()[0].getBoundingClientRect();
    const last = columns()[20].getBoundingClientRect();
    const rect = long.getBoundingClientRect();
    expect(near(rect.left, first.left)).toBe(true);
    expect(near(rect.right, last.right)).toBe(true);
    expect(pillOf("Build")).not.toHaveClass("o_tl_pill_cut_start");
    expect(pillOf("Build")).not.toHaveClass("o_tl_pill_cut_stop");
    expect(".o_tl_pill_handle").toHaveCount(0);
    expect(".o_tl_pill_lock, .fa-lock").toHaveCount(0);
});

test("A42: year scale fills the month and stacks one per line", async () => {
    await mountTimeline();
    await chooseRange("Year");
    const november = columns()[22].getBoundingClientRect();
    const inside = pills().filter((pill) => titleOf(pill) !== "Long task");
    expect(inside.length).toBe(11);
    for (const pill of inside) {
        const rect = pill.getBoundingClientRect();
        expect(near(rect.left, november.left)).toBe(true);
        expect(near(rect.right, november.right)).toBe(true);
    }
    // every record is on its own line: 25 px apart, 12 lines in all
    const tops = pills().map((pill) => Math.round(pill.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(12);
    expect(Math.round(queryAll(".o_tl_cell")[0].getBoundingClientRect().height)).toBe(25 * 12 + 16);
});

test("A43: label truncated without ellipsis", async () => {
    await resize({ width: 1600 });
    await mountTimeline();
    await chooseRange("Month");
    const title = pillOf("Review").querySelector(".o_tl_pill_title");
    expect(title).toHaveText("Review");
    expect(style(title, "textOverflow", "overflow", "whiteSpace")).toEqual([
        "clip",
        "hidden",
        "nowrap",
    ]);
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
});

test("A41/M13: pill box: height, radius, font, margins", async () => {
    await mountTimeline();
    const pill = pillOf("Build");
    expect(queryRect(pill).height).toBe(23);
    expect(
        style(
            pill,
            "paddingLeft",
            "paddingTop",
            "borderTopWidth",
            "borderTopLeftRadius",
            "borderBottomRightRadius",
            "fontSize",
            "fontWeight",
            "lineHeight"
        )
    ).toEqual(["0px", "0px", "0px", "6px", "6px", "14px", "400", "21px"]);
    const title = pill.querySelector(".o_tl_pill_title");
    expect(style(title, "marginLeft", "marginRight", "fontSize", "color")).toEqual([
        "4px",
        "4px",
        "14px",
        "rgb(0, 0, 0)",
    ]);
});

// ----------------------------------------------------------------------------
// Pills: colour, decorations, progress
// ----------------------------------------------------------------------------

test("A45: colour classes", async () => {
    const records = (await serverRecords());
    records.find((record) => record.name === "Design").x_color = 14;
    records.find((record) => record.name === "Review").x_color = -1;
    await mountTimeline();
    const colorOf = (name) =>
        [...pillOf(name).classList].find((cls) => /^o_tl_color_\d+$/.test(cls));
    expect(colorOf("Plan")).toBe("o_tl_color_0");
    expect(colorOf("Design")).toBe("o_tl_color_2"); // 14 modulo 12
    expect(colorOf("Build")).toBe("o_tl_color_2");
    expect(colorOf("Review")).toBe("o_tl_color_0"); // negative: default look
    expect(colorOf("Test")).toBe("o_tl_color_4");
    expect(colorOf("Deploy")).toBe("o_tl_color_5");
    expect(colorOf("Long task")).toBe("o_tl_color_6");
    expect(colorOf("Overlap A")).toBe("o_tl_color_7");
    expect(colorOf("Overlap C")).toBe("o_tl_color_9");
    expect(colorOf("Color ten")).toBe("o_tl_color_10");
    expect(colorOf("Color eleven")).toBe("o_tl_color_11");
    // backgrounds of the first indexes (the same palette in Community and in the theme)
    expect(style(pillOf("Plan"), "backgroundColor", "color")).toEqual([
        "rgb(199, 199, 199)",
        "rgb(0, 0, 0)",
    ]);
    expect(style(pillOf("Build"), "backgroundColor")).toEqual(["rgb(234, 182, 133)"]);
    expect(style(pillOf("Test"), "backgroundColor")).toEqual(["rgb(154, 191, 235)"]);
    expect(style(pillOf("Long task"), "backgroundColor")).toEqual(["rgb(233, 184, 163)"]);
});

test("A45: a relational colour value takes its identifier", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="week" color="x_contact"`),
    });
    const colorOf = (name) =>
        [...pillOf(name).classList].find((cls) => /^o_tl_color_\d+$/.test(cls));
    expect(colorOf("Design")).toBe("o_tl_color_1");
    expect(colorOf("Review")).toBe("o_tl_color_2");
    expect(colorOf("Deploy")).toBe("o_tl_color_3");
    expect(colorOf("Plan")).toBe("o_tl_color_0");
});

test("A46: no colour field gives the index 0 look", async () => {
    await mountTimeline({ arch: HOST_ARCHS.H5 });
    expect(pills().length).toBeGreaterThan(5);
    for (const pill of pills()) {
        expect(pill).toHaveClass("o_tl_color_0");
    }
});

test("A47: danger mark only on Test", async () => {
    await mountTimeline();
    // the info mark of Deploy is the only other one
    expect(".o_tl_pill_mark").toHaveCount(2);
    expect(".o_tl_mark_danger").toHaveCount(1);
    const mark = pillOf("Test").querySelector(".o_tl_pill_mark");
    expect(mark).toHaveClass("o_tl_mark_danger");
    expect(markColor(pillOf("Test"))).toBe(roleColors().danger);
    expect(style(mark, "width", "height", "top", "left", "transform", "boxShadow")).toEqual([
        "20px",
        "16px",
        "-11px",
        "-13px",
        "matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)",
        "rgb(255, 255, 255) 1px 1px 0px 0px",
    ]);
});

test("A48: info stripes and mark", async () => {
    await mountTimeline();
    const deploy = pillOf("Deploy");
    expect(deploy).toHaveClass("o_tl_striped");
    expect(deploy.querySelector(".o_tl_mark_info")).not.toBe(null);
    expect(markColor(deploy)).toBe(roleColors().info);
    expect(style(deploy, "backgroundColor", "backgroundImage")).toEqual([
        "rgb(197, 161, 188)",
        "repeating-linear-gradient(-45deg, rgb(197, 161, 188) 0px, rgb(197, 161, 188) 10px, rgb(209, 180, 201) 10px, rgb(209, 180, 201) 20px)",
    ]);
    expect(pillOf("Build")).not.toHaveClass("o_tl_striped");
});

test("A48: info and danger together give one mark and the stripes", async () => {
    (await serverRecords()).find((record) => record.name === "Deploy").x_flagged = true;
    await mountTimeline();
    const deploy = pillOf("Deploy");
    expect(deploy).toHaveClass("o_tl_striped");
    expect(deploy.querySelectorAll(".o_tl_pill_mark")).toHaveLength(1);
    expect(deploy.querySelector(".o_tl_mark_danger")).not.toBe(null);
});

test("A49: a warning decoration compares dates as text and sees the context", async () => {
    await mountTimeline({
        arch: timelineArch(
            `default_range="week" decoration-warning="date_stop &gt; '2026-11-14 00:00:00'"`
        ),
    });
    const marked = pills()
        .filter((pill) => pill.querySelector(".o_tl_mark_warning"))
        .map(titleOf)
        .sort();
    expect(marked).toEqual(
        ["Build", "Color ten", "Deploy", "Long task", "Overlap C", "Test"].sort()
    );
    expect(markColor(pillOf("Build"))).toBe(roleColors().warning);
});

test("A49: a success decoration mark has the success colour", async () => {
    await mountTimeline({ arch: timelineArch(`default_range="week" decoration-success="x_done"`) });
    expect(".o_tl_mark_success").toHaveCount(1);
    expect(markColor(pillOf("Deploy"))).toBe(roleColors().success);
});

test("A49: the user context is available to a condition", async () => {
    await mountTimeline({
        arch: timelineArch(`default_range="week" decoration-secondary="context.get('lang') != 'zz'"`),
    });
    expect(".o_tl_pill").toHaveCount(12);
    expect(".o_tl_mark_secondary").toHaveCount(12);
    expect(markColor(pillOf("Build"))).toBe(roleColors().secondary);
});

test("A50: progress band widths 40% and 75%", async () => {
    await mountTimeline();
    const share = (name) => {
        const pill = pillOf(name);
        const band = pill.querySelector(".o_tl_pill_progress");
        return band ? band.getBoundingClientRect().width / pill.getBoundingClientRect().width : null;
    };
    expect(near(share("Design") * 100, 40)).toBe(true);
    expect(near(share("Build") * 100, 75)).toBe(true);
    expect(share("Review")).toBe(null);
    const band = pillOf("Build").querySelector(".o_tl_pill_progress");
    expect(style(band, "backgroundColor", "opacity")).toEqual(["rgb(102, 58, 18)", "0.2"]);
    expect(near(band.getBoundingClientRect().height, 23)).toBe(true);
});

// ----------------------------------------------------------------------------
// Today, clock changes
// ----------------------------------------------------------------------------

test("A68: today column on week and day", async () => {
    await mountTimeline();
    const today = queryAll(`.o_tl_col.o_tl_is_today, ${BODY_TODAY_CELL}`);
    // one header and one cell
    expect(queryAll(".o_tl_col.o_tl_is_today")).toHaveLength(1);
    expect(queryAll(BODY_TODAY_CELL)).toHaveLength(1);
    expect(columns()[11]).toHaveClass("o_tl_is_today");
    expect(columns()[11]).toHaveText("Thursday 12");
    expect(today.length).toBe(2);
    const header = columns()[11];
    expect(
        style(
            header,
            "backgroundColor",
            "borderLeftColor",
            "borderTopColor",
            "borderRightColor",
            "borderBottomColor",
            "borderLeftWidth",
            "borderTopWidth"
        )
    ).toEqual([
        "rgb(255, 250, 235)",
        "rgb(220, 166, 101)",
        "rgb(220, 166, 101)",
        "rgb(222, 226, 230)",
        "rgb(222, 226, 230)",
        "1px",
        "1px",
    ]);
    const cell = queryOne(BODY_TODAY_CELL);
    expect(style(cell, "backgroundColor", "borderLeftColor", "borderLeftWidth")).toEqual([
        "rgb(255, 250, 235)",
        "rgb(220, 166, 101)",
        "0px",
    ]);
    // another day
    const other = columns()[0];
    expect(style(other, "backgroundColor", "borderLeftColor", "borderBottomColor")).toEqual([
        "rgba(255, 255, 255, 0.75)",
        "rgba(0, 0, 0, 0)",
        "rgb(222, 226, 230)",
    ]);
    const otherCell = queryAll(".o_tl_cell:not(.o_tl_is_today)")[0];
    expect(style(otherCell, "backgroundColor", "borderBottomWidth", "borderLeftWidth")).toEqual([
        "rgba(0, 0, 0, 0)",
        "1px",
        "0px",
    ]);

    await chooseRange("Day");
    expect(queryAll(".o_tl_col.o_tl_is_today")).toHaveLength(1);
    expect(columns().indexOf(queryOne(".o_tl_col.o_tl_is_today"))).toBe(24);
    expect(queryOne(".o_tl_col.o_tl_is_today")).toHaveText("0");
});

test("A99: spring change date has 23 hour columns", async () => {
    mockTimeZone("Europe/Brussels");
    mockDate("2026-03-29 12:00:00");
    await mountTimeline({
        arch: timelineArch(`default_range="day"`),
        context: { initialDate: "2026-03-29" },
    });
    expect(groups()).toHaveLength(3);
    expect(groups()[1].style.gridColumn).toMatch(/span 23$/);
    expect(columns()).toHaveLength(24 + 23 + 24);
    const labels = queryAllTexts(".o_tl_col");
    expect(labels.slice(24 + 1, 24 + 5)).toEqual(["1", "3", "4", "5"]);
});

test("A99: autumn change date has 25 hour columns and a record covers four", async () => {
    mockTimeZone("Europe/Brussels");
    mockDate("2026-10-25 12:00:00");
    // "Plan" runs from 01:00 summer time to 04:00 winter time on the change date
    Object.assign((await serverRecords()).find((record) => record.name === "Plan"), {
        date_start: "2026-10-24 23:00:00",
        date_stop: "2026-10-25 03:00:00",
    });
    await mountTimeline({
        arch: timelineArch(`default_range="day"`),
        context: { initialDate: "2026-10-25" },
    });
    expect(groups()[1].style.gridColumn).toMatch(/span 25$/);
    expect(columns()).toHaveLength(24 + 25 + 24);
    expect(queryAllTexts(".o_tl_col").slice(24 + 1, 24 + 6)).toEqual([
        "1",
        "2",
        "2",
        "3",
        "4",
    ]);
    const clock = pillOf("Plan").getBoundingClientRect();
    const first = columns()[24 + 1].getBoundingClientRect();
    const fourth = columns()[24 + 4].getBoundingClientRect();
    expect(near(clock.left, first.left)).toBe(true);
    expect(near(clock.right, fourth.right)).toBe(true);
});

// ----------------------------------------------------------------------------
// A117
// ----------------------------------------------------------------------------

const H2_ARCH = timelineArch(
    `string="Pills" default_range="week" default_group_by="parent_id" color="x_color"`
);

for (const step of ["quarter", "month", "day", "custom"]) {
    test(`A117: Year after ${step} draws the full grid`, async () => {
        await mountTimeline({ arch: H2_ARCH });
        if (step === "custom") {
            await applyCustom("11/10/2026", "11/20/2026");
        } else {
            await chooseRange(step[0].toUpperCase() + step.slice(1));
        }
        await chooseRange("Year");
        expect(groups().map((el) => el.textContent)).toEqual(["2025", "2026", "2027"]);
        expect(columns().length).toBeGreaterThan(11);
        expect(queryAllTexts(".o_tl_col").slice(0, 2)).toEqual(["January", "February"]);
        expect(pills().length).toBeGreaterThan(5);
        expect(pillNames().includes("Build")).toBe(true);
        // the total bars of the year grid are asserted in timeline_rows.test.js
    });
}
