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

async function mountPhone({ arch = H2, ...rest } = {}) {
    await mountView({ type: "gantt", resModel: "pill", arch, ...rest });
}


test("A81: phone control bar and gear sheet", async () => {
    await mountPhone({ groupBy: ["parent_id"] });
    // first line: previous, next, range; separator; second line: Today and the gear at the right
    expect(".o_tl_controls").toHaveClass("o_tl_controls_phone");
    expect(".o_tl_controls .o_tl_display_mode").toHaveCount(0);
    expect(".o_tl_controls .o_tl_collapse_all").toHaveCount(0);
    const first = queryRect(".o_tl_line:first-child");
    const second = queryRect(".o_tl_line:last-child");
    expect(queryRect(".o_tl_previous").top).toBe(first.top);
    expect(queryRect(".o_tl_range_button").top).toBe(first.top);
    expect(queryRect(".o_tl_next").left).toBeGreaterThan(queryRect(".o_tl_previous").left);
    expect(queryRect(".o_tl_range_button").left).toBeGreaterThan(queryRect(".o_tl_next").left);
    expect(queryRect(".o_tl_today").top).toBe(second.top);
    expect(queryRect(".o_tl_today").height).toBe(33);
    expect(queryRect(".o_tl_today").width).toBeWithin(58.859, 59.859);
    expect(queryRect(".o_tl_gear").height).toBe(33);
    expect(second.height).toBe(33);
    expect(queryRect(".o_tl_gear").top).toBe(second.top);
    // the bar: 4 + 33 + separator + 33 + 16
    expect(queryRect(".o_tl_controls").height).toBe(101);
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
    expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    expect(label).toHaveStyle({ textOverflow: "ellipsis", paddingLeft: "1px", paddingRight: "1px" });
});

test("F1: the box fills the page on the phone and takes the view background (M65)", async () => {
    await mountPhone();
    expect(".o_tl_box").toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
    expect(".o_tl_box").toHaveStyle({ flexGrow: "1" });
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
    expect(queryRect(".o_tl_range_button").width).toBeWithin(84, 85);
    expect(queryRect(".o_tl_today").width).toBeWithin(66.9, 67.9);
    // 4 + 37 + separator (3 + 1 + 3) + 37 + 16: the bar keeps the height it has without touch
    expect(queryRect(".o_tl_controls").height).toBe(101);
});

test("F3: without touch the buttons keep the measured size (M41, M42, M69)", async () => {
    await mountPhone({ groupBy: ["parent_id"] });
    for (const selector of [".o_tl_previous", ".o_tl_next", ".o_tl_range_button", ".o_tl_today", ".o_tl_gear"]) {
        expect(selector).toHaveStyle({ paddingTop: "5px", paddingLeft: "10px" });
        expect(queryRect(selector).height).toBe(33);
    }
    expect(queryRect(".o_tl_controls").height).toBe(101);
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

test("P7: the dates of the range sheet are 26 px tall with touch (M73)", async () => {
    makeTouchDevice();
    await mountPhone();
    await contains(".o_tl_range_button").click();
    expect(queryRect(".o_tl_custom_start_button").height).toBe(26);
    expect(queryRect(".o_tl_custom_stop_button").height).toBe(26);
});
