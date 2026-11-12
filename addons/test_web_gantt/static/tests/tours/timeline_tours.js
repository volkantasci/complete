// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Tours of the scrolling behaviours of the timeline view in a real browser. They read the date
 * from the browser and compare positions with each other, so they do not depend on the day or
 * on the time zone.
 */

const tours = registry.category("web_tour.tours");

const renderer = () => document.querySelector(".o_tl_renderer");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const middleOf = (element) => {
    const rect = element.getBoundingClientRect();
    return (rect.left + rect.right) / 2;
};

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

/** The middle of the visible part of the grid: what the sticky title cell leaves free. */
function visibleMiddle() {
    const box = renderer().getBoundingClientRect();
    const title = document.querySelector(".o_tl_title_cell");
    const left = title ? Math.max(box.left, title.getBoundingClientRect().right) : box.left;
    return (left + box.left + renderer().clientWidth) / 2;
}

function assertCentred(element, what) {
    const away = Math.abs(middleOf(element) - visibleMiddle());
    assert(away <= 2, `${what} is ${away}px away from the middle of the visible part`);
}

const todayColumn = () => document.querySelector(".o_tl_col.o_tl_is_today");
const rangeButtonText = () => document.querySelector(".o_tl_range_button").textContent.trim();
const rowNamed = (name) =>
    [...document.querySelectorAll(".o_tl_row")].find(
        (row) => row.querySelector(".o_tl_row_name")?.textContent.trim() === name
    );
const storedKinds = () =>
    Object.entries(window.localStorage)
        .filter(([key]) => key.startsWith("rangeOf-viewId-"))
        .map(([, value]) => value);

tours.add("timeline_week_scroll_centres_today", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        {
            trigger: ".o_tl_range_button",
            run() {
                assert(rangeButtonText() === "Week", `range is ${rangeButtonText()}`);
                assert(
                    renderer().scrollWidth > renderer().clientWidth,
                    "the week grid does not scroll"
                );
                assertCentred(todayColumn(), "today");
            },
        },
    ],
});

tours.add("timeline_today_scrolls", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        {
            trigger: ".o_tl_today",
            run() {
                // count the requests for data from now on
                window.__tlRequests = 0;
                const open = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                    if (String(url).includes("get_gantt_data")) {
                        window.__tlRequests++;
                    }
                    return open.call(this, method, url, ...rest);
                };
                renderer().scrollLeft = 0;
                assert(
                    Math.abs(middleOf(todayColumn()) - visibleMiddle()) > 100,
                    "the grid did not scroll away from today"
                );
            },
        },
        {
            trigger: ".o_tl_today",
            async run(helpers) {
                await helpers.click();
                await wait(500);
                assert(window.__tlRequests === 0, `${window.__tlRequests} request(s) for data`);
                assertCentred(todayColumn(), "today");
            },
        },
    ],
});

tours.add("timeline_remembered_range", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        {
            trigger: ".o_tl_range_button",
            run() {
                assert(
                    JSON.stringify(storedKinds()) === '["week"]',
                    `stored ${JSON.stringify(storedKinds())}`
                );
            },
        },
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_menu .o_tl_range_month", run: "click" },
        {
            trigger: ".o_tl_renderer[data-scale=month]",
            run() {
                assert(
                    JSON.stringify(storedKinds()) === '["month"]',
                    `stored ${JSON.stringify(storedKinds())}`
                );
            },
        },
        {
            // another view of the action and back, without reloading the page, the way the
            // browser's own navigation does
            trigger: ".o_tl_range_button",
            async run() {
                const open = (host) => {
                    window.history.pushState({}, "", `/odoo/action-test_web_gantt.host_action_${host}`);
                    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
                };
                open("h5");
                await wait(1500);
                open("h1");
                await wait(1500);
            },
        },
        {
            trigger: ".o_tl_renderer[data-scale=month]",
            run() {
                assert(rangeButtonText() === "Month", `range is ${rangeButtonText()}`);
            },
        },
    ],
});

tours.add("timeline_restore_after_list", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_menu .o_tl_range_month", run: "click" },
        { trigger: ".o_tl_renderer[data-scale=month]", run: "click" },
        { trigger: ".o_tl_display_mode", run: "click" },
        {
            trigger: ".o_tl_display_mode[title='Group records on shared rows']",
            run() {
                renderer().scrollLeft = 777;
                assert(renderer().scrollLeft === 777, `scrolled to ${renderer().scrollLeft}`);
            },
        },
        { trigger: ".o_switch_view.o_list", run: "click" },
        { trigger: ".o_list_view" },
        { trigger: ".o_switch_view.o_gantt", run: "click" },
        {
            trigger: ".o_tl_renderer[data-scale=month]",
            async run() {
                await wait(300);
                assert(rangeButtonText() === "Month", `range is ${rangeButtonText()}`);
                assert(
                    document.querySelector(".o_tl_display_mode").title ===
                        "Group records on shared rows",
                    "the display mode was not restored"
                );
                assert(
                    Math.abs(renderer().scrollLeft - 777) <= 1,
                    `scrolled to ${renderer().scrollLeft}`
                );
            },
        },
    ],
});

tours.add("timeline_row_header_scroll", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        { trigger: ".o_tl_range_button", run: "click" },
        { trigger: ".o_tl_range_menu .o_tl_range_quarter", run: "click" },
        {
            trigger: ".o_tl_renderer[data-scale=month]",
            run() {
                renderer().scrollLeft = renderer().scrollWidth;
            },
        },
        {
            trigger: ".o_tl_row_header:contains(Host Contact 1)",
            async run(helpers) {
                const row = rowNamed("Host Contact 1");
                const pills = [...row.querySelectorAll(".o_tl_pill")];
                assert(pills.length > 0, "the row has no pill");
                const first = pills.reduce((best, pill) =>
                    pill.getBoundingClientRect().left < best.getBoundingClientRect().left
                        ? pill
                        : best
                );
                assert(
                    Math.abs(middleOf(first) - visibleMiddle()) > 100,
                    "the first pill is already in the middle"
                );
                await helpers.click();
                await wait(300);
                assertCentred(first, "the first pill");
            },
        },
    ],
});

tours.add("timeline_group_row_hover", {
    steps: () => [
        { trigger: ".o_tl_renderer .o_tl_col.o_tl_is_today" },
        {
            trigger: ".o_tl_group_row .o_tl_row_header:contains(Beta)",
            run() {
                const row = rowNamed("Beta");
                window.__tlOpen = [".o_tl_row_header", ".o_tl_cell"].map(
                    (part) => getComputedStyle(row.querySelector(part)).backgroundImage
                );
                assert(window.__tlOpen[0].includes("linear-gradient"), "no gradient at rest");
            },
        },
        { trigger: ".o_tl_group_row .o_tl_row_header:contains(Beta)", run: "hover" },
        {
            trigger: ".o_tl_group_row .o_tl_row_header:contains(Beta)",
            run() {
                const row = rowNamed("Beta");
                const parts = [".o_tl_row_header", ".o_tl_cell"];
                const swapped = (image) => {
                    const colours = image.match(/rgba?\([^)]*\)/g);
                    return `linear-gradient(${colours.reverse().join(", ")})`;
                };
                parts.forEach((part, index) => {
                    const image = getComputedStyle(row.querySelector(part)).backgroundImage;
                    assert(
                        image === swapped(window.__tlOpen[index]),
                        `${part} under the pointer: ${image}`
                    );
                });
            },
        },
        { trigger: ".o_tl_title_cell", run: "hover" },
        {
            trigger: ".o_tl_title_cell",
            async run() {
                await wait(100);
                const row = rowNamed("Beta");
                [".o_tl_row_header", ".o_tl_cell"].forEach((part, index) => {
                    const image = getComputedStyle(row.querySelector(part)).backgroundImage;
                    assert(image === window.__tlOpen[index], `${part} after the pointer left`);
                });
            },
        },
    ],
});
