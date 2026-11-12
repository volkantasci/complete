// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { after, beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryAll, queryAllTexts, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame, mockTouch } from "@odoo/hoot-mock";
import { contains, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

// The Hoot run uses the desktop preset: a test makes itself a touch phone with `mockTouch` and
// `resize` (the Community reads the touch feature and the window size, not the preset).
describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
    mockTouch(true);
    await resize({ width: 390, height: 844 });
});

const H2 = timelineArch(`string="Pills" default_range="week" color="x_color" total_row="1"`);

// Width of the content of an element (its children laid out), whatever the fonts of the bundle are.
function contentWidth(selector) {
    const range = document.createRange();
    range.selectNodeContents(queryOne(selector));
    return range.getBoundingClientRect().width;
}

// Horizontal paddings and borders of an element: what its box adds to its content.
function boxExtra(selector) {
    const style = getComputedStyle(queryOne(selector));
    return ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]
        .map((name) => parseFloat(style[name]))
        .reduce((total, value) => total + value, 0);
}

async function mountPhone({ arch = H2, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
}


test("A81: phone control bar and gear sheet", async () => {
    await mountPhone({ groupBy: ["parent_id"] });
    // first line: previous, next, range; separator; second line: Today and the gear at the right
    expect(".o_tl_controls").toHaveClass("o_tl_controls_phone");
    expect(".o_tl_controls .o_tl_display_mode").toHaveCount(0);
    expect(".o_tl_controls .o_tl_collapse_all").toHaveCount(0);
    // the buttons of each line (the lines carry their own space around the separator, P12)
    const first = queryRect(".o_tl_previous");
    const second = queryRect(".o_tl_today");
    expect(queryRect(".o_tl_previous").top).toBe(first.top);
    expect(queryRect(".o_tl_range_button").top).toBe(first.top);
    expect(queryRect(".o_tl_next").left).toBeGreaterThan(queryRect(".o_tl_previous").left);
    expect(queryRect(".o_tl_range_button").left).toBeGreaterThan(queryRect(".o_tl_next").left);
    expect(queryRect(".o_tl_today").top).toBe(second.top);
    expect(queryRect(".o_tl_today").height).toBe(33);
    // 10 + text + 10: the text width belongs to the bundle's fonts, the paddings do not
    expect(queryRect(".o_tl_today").width).toBeWithin(
        contentWidth(".o_tl_today") + boxExtra(".o_tl_today") - 0.5,
        contentWidth(".o_tl_today") + boxExtra(".o_tl_today") + 0.5
    );
    expect(queryRect(".o_tl_gear").height).toBe(33);
    expect(second.height).toBe(33);
    expect(queryRect(".o_tl_gear").top).toBe(second.top);
    // the bar: 4 + 33 + separator + 33 + 16 and the lines' own space (sub-pixel layout)
    expect(queryRect(".o_tl_controls").height).toBeWithin(100.9, 101.1);
    expect(second.top).toBeGreaterThan(first.bottom);
    expect(queryRect(".o_tl_gear").right).toBeGreaterThan(queryRect(".o_tl_today").right + 100);
    expect(".o_tl_separator").toHaveCount(1);
    expect(".o_tl_gear [data-icon='settings']").toHaveCount(1);
    expect(".o_tl_controls").toHaveStyle({
        paddingTop: "4px",
        paddingBottom: "16px",
        paddingLeft: "0px",
        columnGap: "4px",
    });
    expect(".o_tl_today").toHaveStyle({ paddingLeft: "10px", paddingTop: "5px" });

    await contains(".o_tl_gear").click();
    expect(".o_tl_gear_menu").toHaveCount(1);
    expect(".o_bottom_sheet .o_tl_gear_menu").toHaveCount(1);
    // one entry (dense mode), no group rows below a separator with one level
    expect(queryAllTexts(".o_tl_gear_menu .dropdown-item")).toEqual(["One row per record"]);
    expect(".o_tl_gear_display [data-icon='expand_content']").toHaveCount(1);
    expect(".o_tl_gear_menu .dropdown-divider").toHaveCount(0);
    await contains(".o_tl_gear_display").click();
    await animationFrame();
    expect(".o_tl_gear_menu").toHaveCount(0);
    await contains(".o_tl_gear").click();
    // the sparse mode makes group rows of the one level: the fold entry appears
    expect(queryAllTexts(".o_tl_gear_menu .dropdown-item")).toEqual([
        "Shared rows",
        "Fold every group",
    ]);
    expect(".o_tl_gear_display [data-icon='close_fullscreen']").toHaveCount(1);
});

test("A81: the sheet lists open and fold every group below a separator", async () => {
    await mountPhone({ groupBy: ["parent_id", "x_contact"] });
    await contains(".o_tl_gear").click();
    expect(queryAllTexts(".o_tl_gear_menu .dropdown-item")).toEqual([
        "One row per record",
        "Fold every group",
    ]);
    expect(".o_tl_gear_menu .dropdown-divider").toHaveCount(1);
    expect(".o_tl_gear_collapse_all [data-icon='arrow_drop_down']").toHaveCount(1);
    await contains(".o_tl_gear_collapse_all").click();
    await animationFrame();
    expect(".o_tl_controls .o_tl_collapse_all").toHaveCount(0);
    // every group is folded: the entry now opens them
    await contains(".o_tl_gear").click();
    expect(queryAllTexts(".o_tl_gear_menu .dropdown-item")).toEqual([
        "One row per record",
        "Open every group",
    ]);
    expect(".o_tl_gear_collapse_all [data-icon='arrow_right']").toHaveCount(1);
    await contains(".o_tl_gear_collapse_all").click();
    await animationFrame();
    await contains(".o_tl_gear").click();
    expect(queryAllTexts(".o_tl_gear_menu .dropdown-item")[1]).toBe("Fold every group");
});

test("the page scrolls: the view follows its content and does not scroll itself", async () => {
    await mountPhone({ groupBy: ["parent_id", "x_contact"] });
    expect(".o_timeline_view").toHaveClass("o_tl_phone");
    const renderer = queryOne(".o_tl_renderer");
    // no vertical scroll of its own: its height is that of the grid, its overflow is not scrolling
    expect(renderer.scrollHeight <= renderer.clientHeight).toBe(true);
    expect(queryRect(".o_tl_renderer").height >= queryRect(".o_tl_grid").height).toBe(true);
    expect(["visible", "hidden", "clip"].includes(getComputedStyle(renderer).overflowY)).toBe(true);
    expect(queryRect(".o_timeline_view").height >= queryRect(".o_tl_grid").height).toBe(true);
    expect(getComputedStyle(queryOne(".o_timeline_view")).overflowY).not.toMatch(/auto|scroll/);
});

test("A82: range sheet with the date dialog", async () => {
    await mountPhone();
    await contains(".o_tl_range_button").click();
    expect(".o_bottom_sheet .o_tl_range_menu").toHaveCount(1);
    // the current entry is framed in the action colour
    const selected = getComputedStyle(queryOne(".o_tl_range_item.selected"));
    expect(selected.borderTopWidth).toBe("1px");
    expect(selected.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(queryAllTexts(".o_tl_range_item")).toEqual(["Day", "Week", "Month", "Quarter", "Year"]);
    // the current entry is marked by the dropdown itself (a check mark of the theme)
    expect(".o_tl_range_item.selected").toHaveCount(1);
    const marked = ["::before", "::after"].some((pseudo) => {
        const content = getComputedStyle(queryOne(".o_tl_range_item.selected"), pseudo).content;
        return content !== "none" && content !== "normal" && content !== '""';
    });
    expect(marked).toBe(true);
    // the custom line shows the dates as buttons
    expect(".o_tl_custom_start input").toHaveCount(0);
    expect(queryOne(".o_tl_custom_start_button").textContent.trim()).toBe("11/01/2026");
    expect(queryOne(".o_tl_custom_stop_button").textContent.trim()).toBe("11/21/2026");

    await contains(".o_tl_custom_start_button").click();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Start date of the timeline");
    expect(".o_dialog .o_date_picker").toHaveCount(1);
    // pick November 3rd: the dialog closes, the menu stays open
    await contains(".o_dialog .o_date_item_cell:not(.o_out_of_range):contains(3)").click();
    await animationFrame();
    expect(".o_dialog").toHaveCount(0);
    expect(".o_tl_range_menu").toHaveCount(1);
    expect(queryOne(".o_tl_custom_start_button").textContent.trim()).toBe("11/03/2026");

    await contains(".o_tl_custom_stop_button").click();
    await animationFrame();
    expect(".o_dialog .modal-title").toHaveText("Stop date of the timeline");
    await contains(".o_dialog .o_date_item_cell:not(.o_out_of_range):contains(25)").click();
    await animationFrame();
    expect(".o_tl_range_menu").toHaveCount(1);
    // a click on the backdrop of a dialog does not close the menu and keeps the draft dates
    await contains(".o_tl_custom_stop_button").click();
    await animationFrame();
    await click(".o_dialog .modal");
    await animationFrame();
    expect(".o_tl_range_menu").toHaveCount(1);
    expect(queryOne(".o_tl_custom_start_button").textContent.trim()).toBe("11/03/2026");
    await contains(".o_tl_apply").click();
    await advanceTime(500);
    await animationFrame();
    expect(".o_tl_range_menu").toHaveCount(0);
    expect(queryOne(".o_tl_range_start").textContent.trim()).toBe("11/03/2026");
    expect(queryOne(".o_tl_range_stop").textContent.trim()).toBe("11/25/2026");
});

test("A82: the popover is a sheet on the phone", async () => {
    await mountPhone({ arch: HOST_ARCHS.H5 });
    await click(".o_tl_pill");
    await advanceTime(250);
    await animationFrame();
    const rect = queryRect(".o_popover:has(.o_tl_popover)");
    // M43: a 388 x 698 sheet at the bottom of the 390 x 844 screen
    expect(rect.width).toBe(388);
    expect(rect.height).toBe(698);
});

test("A122: P9, 'Undefined Contact' is cut with an ellipsis on the phone (M74)", async () => {
    await mountPhone({ groupBy: ["parent_id", "x_contact"] });
    const label = queryAll(".o_tl_row_label").find(
        (element) => element.textContent === "Undefined Contact"
    );
    expect(queryRect(queryAll(".o_tl_row_header")[0]).width).toBe(130);
    // the rules, not a pixel count of the text: ellipsis styles, and the text is wider than its box
    expect(label).toHaveStyle({
        overflowX: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        paddingLeft: "1px",
        paddingRight: "1px",
    });
    // whether the text of the data is wider than 117 px depends on the fonts: a longer one is cut
    label.textContent = "Undefined Contact, a label much longer than its column";
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
});

test("F10: on the phone the grid's scroll area fills the box and carries the view background (M65)", async () => {
    await mountPhone();
    // no outer box carries the background: the scroll area does, and fills the view
    expect(".o_tl_box").toHaveStyle({ backgroundColor: "rgba(0, 0, 0, 0)", flexGrow: "1" });
    expect(".o_tl_renderer").toHaveStyle({ backgroundColor: "rgb(255, 255, 255)", flexGrow: "1" });
    expect(queryRect(".o_tl_renderer").bottom).toBe(queryRect(".o_tl_box").bottom);
    expect(queryRect(".o_tl_renderer").height >= queryRect(".o_tl_grid").height).toBe(true);
    expect(queryRect(".o_tl_renderer").bottom >= queryRect(".o_tl_grid").bottom).toBe(true);
});

// The Community marks a touch device with two classes (`o_web_client` on the body is the
// client's; the touch class comes from the touch feature at start): the theme's touch size
// selects on them, so the tests set them as the client does.
function makeTouchDevice() {
    const classes = ["o_web_client", "o_touch_device"];
    const added = classes.filter((name) => !document.body.classList.contains(name));
    document.body.classList.add(...classes);
    after(() => document.body.classList.remove(...added));
}

test("F3: previous, next, range, Today and the gear take the touch size on a touch phone", async () => {
    makeTouchDevice();
    await mountPhone({ groupBy: ["parent_id"] });
    for (const selector of [".o_tl_previous", ".o_tl_next", ".o_tl_range_button", ".o_tl_today", ".o_tl_gear"]) {
        expect(selector).toHaveStyle({
            paddingTop: "7px",
            paddingBottom: "7px",
            paddingLeft: "14px",
            paddingRight: "14px",
        });
        expect(queryRect(selector).height).toBe(37);
    }
    expect(queryRect(".o_tl_previous").width).toBeWithin(43.9, 44.1);
    expect(queryRect(".o_tl_next").width).toBeWithin(43.9, 44.1);
    expect(queryRect(".o_tl_gear").width).toBeWithin(43.9, 44.1);
    // content + paddings (the text width depends on the bundle's fonts)
    const todayWidth = contentWidth(".o_tl_today") + boxExtra(".o_tl_today");
    expect(queryRect(".o_tl_today").width).toBeWithin(todayWidth - 0.5, todayWidth + 0.5);
    expect(boxExtra(".o_tl_today")).toBeGreaterThan(27.9);
    const rangeWidth = contentWidth(".o_tl_range_button") + boxExtra(".o_tl_range_button");
    expect(queryRect(".o_tl_range_button").width).toBeWithin(rangeWidth - 0.5, rangeWidth + 0.5);
    // 4 + 37 + separator + 37 + 16 with the lines' own space: the height without touch
    expect(queryRect(".o_tl_controls").height).toBeWithin(100.9, 101.1);
    // P12 (M77): the separator has no margin; 2 px lie between it and each line of buttons
    expect(".o_tl_separator").toHaveStyle({ marginTop: "0px", marginBottom: "0px" });
    const separator = queryRect(".o_tl_separator");
    expect(separator.top - queryRect(".o_tl_previous").bottom).toBeWithin(1.5, 2.5);
    expect(queryRect(".o_tl_today").top - separator.bottom).toBeWithin(1.5, 2.5);
});

test("F3: without touch the buttons keep the measured size (M41, M42, M69)", async () => {
    await mountPhone({ groupBy: ["parent_id"] });
    for (const selector of [".o_tl_previous", ".o_tl_next", ".o_tl_range_button", ".o_tl_today", ".o_tl_gear"]) {
        expect(selector).toHaveStyle({ paddingTop: "5px", paddingLeft: "10px" });
        expect(queryRect(selector).height).toBe(33);
    }
    expect(queryRect(".o_tl_controls").height).toBeWithin(100.9, 101.1);
    // P12 (M77 to M79): no margin on the separator, 4.7 px between it and each line of buttons
    expect(".o_tl_separator").toHaveStyle({ marginTop: "0px", marginBottom: "0px" });
    const separator = queryRect(".o_tl_separator");
    expect(separator.height).toBe(1);
    expect(separator.top - queryRect(".o_tl_previous").bottom).toBeWithin(4.6, 4.8);
    expect(queryRect(".o_tl_today").top - separator.bottom).toBeWithin(4.6, 4.8);
});

test("P5: the caret sits 5 px after the range name, 14 px glyph (M69, M70)", async () => {
    await mountPhone();
    expect(".o_tl_range_button").toHaveStyle({ display: "flex", columnGap: "5px" });
    expect(".o_tl_range_caret").toHaveStyle({ fontSize: "14px", marginLeft: "0px" });
    const name = document.createRange();
    const text = [...queryOne(".o_tl_range_button").childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    name.selectNodeContents(text);
    expect(queryRect(".o_tl_range_caret").left - name.getBoundingClientRect().right).toBeWithin(
        4.5,
        5.5
    );
});

test("P5: the arrow between custom dates is 14 x 14 px (M71, M72)", async () => {
    await mountPhone({ arch: HOST_ARCHS.H5 });
    expect(".o_tl_range_arrow").toHaveStyle({ fontSize: "14px" });
    expect(queryRect(".o_tl_range_arrow").height).toBe(14);
    expect(queryRect(".o_tl_range_arrow").width).toBeWithin(13.5, 14.5);
    await contains(".o_tl_range_button").click();
    expect(".o_tl_custom_arrow").toHaveStyle({ fontSize: "14px" });
    expect(queryRect(".o_tl_custom_arrow").height).toBe(14);
    expect(queryRect(".o_tl_custom_arrow").width).toBeWithin(13.5, 14.5);
});

test("P6: the gear button shows the filled gear icon", async () => {
    await mountPhone();
    expect(".o_tl_gear .oi").toHaveClass("oi-filled");
    expect(".o_tl_gear [data-icon='settings']").toHaveCount(1);
});

test("P7: the dates of the range sheet are plain fields, 24 px, 26 px with touch (M73)", async () => {
    await mountPhone();
    await contains(".o_tl_range_button").click();
    for (const selector of [".o_tl_custom_start_button", ".o_tl_custom_stop_button"]) {
        expect(selector).toHaveStyle({
            backgroundColor: "rgba(0, 0, 0, 0)",
            borderBottomWidth: "1px",
            borderTopWidth: "0px",
            paddingLeft: "4px",
            paddingRight: "4px",
            fontSize: "14px",
        });
        expect(queryRect(selector).height).toBe(24);
    }
});

test("P7: the dates of the range sheet are 26.1 px tall with touch (M73)", async () => {
    makeTouchDevice();
    await mountPhone();
    await contains(".o_tl_range_button").click();
    expect(queryRect(".o_tl_custom_start_button").height).toBeWithin(26, 26.2);
    expect(queryRect(".o_tl_custom_stop_button").height).toBeWithin(26, 26.2);
});

test("P10: the date fields of the range sheet are 83.9 px wide with 15.4 px text on touch, 77 px without (M73)", async () => {
    await mountPhone();
    await contains(".o_tl_range_button").click();
    for (const selector of [".o_tl_custom_start_button", ".o_tl_custom_stop_button"]) {
        expect(selector).toHaveStyle({ fontSize: "14px" });
        expect(queryRect(selector).width).toBeWithin(76.9, 77.2);
    }
});

test("P10: with touch the date fields are 83.9 x 26.1 px with 15.4 px text", async () => {
    makeTouchDevice();
    await mountPhone();
    await contains(".o_tl_range_button").click();
    for (const selector of [".o_tl_custom_start_button", ".o_tl_custom_stop_button"]) {
        expect(selector).toHaveStyle({ fontSize: "15.4px" });
        expect(queryRect(selector).width).toBeWithin(83.8, 84.1);
        expect(queryRect(selector).height).toBeWithin(26, 26.2);
    }
});

test("P11: on the phone the dates keep the body text colour, never the primary colour (M76)", async () => {
    await mountPhone();
    await contains(".o_tl_range_button").click();
    const body = getComputedStyle(document.body).color;
    for (const selector of [".o_tl_custom_start_button", ".o_tl_custom_stop_button"]) {
        expect(selector).toHaveStyle({ color: body });
    }
    await contains(".o_tl_custom_start_button").click();
    expect(".o_tl_custom_start_button").toHaveStyle({ color: body });
});
