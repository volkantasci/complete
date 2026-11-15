// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    drag,
    hover,
    press,
    queryAll,
    queryAllTexts,
    queryFirst,
    queryOne,
    queryRect,
    resize,
    waitFor,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    toggleMenuItem,
    toggleSearchBarMenu,
    MockServer,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { browser } from "@web/core/browser/browser";
import { localization } from "@web/core/l10n/localization";
import { TimelineController } from "@web_gantt/timeline_controller";

import { at, HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

setupTimelineFixtures();
defineWebModels();

let controller;

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineController.prototype, {
        setup() {
            super.setup(...arguments);
            controller = this;
        },
    });
    await resize({ width: 1600, height: 900 });
});

// the test page may sit left of the window's edge: measure from the view
const leftOfBox = () => queryRect(".o_tl_box").left - queryRect(".o_timeline_view").left;

const KEY = "timelinePanelOpen-view-5-action-7";

async function mountPanel(arch = HOST_ARCHS.H36, { groupBy = ["parent_id"], ...rest } = {}) {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch,
        viewId: 5,
        config: { actionId: 7 },
        groupBy,
        ...rest,
    });
    await animationFrame();
}

test.tags("desktop");
test("002b3 A43: the panel and its button show on H36 and H37", async () => {
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(1);
    expect(".o_tl_panel_strip").toHaveCount(1);
    expect(".o_tl_panel_toggle").toHaveCount(1);
    expect(".o_tl_panel_toggle").toHaveClass("active");
    expect(".o_tl_panel_toggle").toHaveAttribute("title", "Show or hide the panel");
    expect(".o_tl_panel").toHaveClass("d-print-none");
    expect(".o_tl_panel_toggle").toHaveClass("d-print-none");
    expect(queryRect(".o_tl_panel").width).toBe(262);
    expect(queryRect(".o_tl_panel_strip").width).toBe(18);
    expect(leftOfBox()).toBe(16);
    expect(queryRect(".o_tl_box").width).toBe(1288);
    expect(queryRect(".o_tl_box").right + 18 + 262 + 16).toBe(queryRect(".o_timeline_view").right);
    expect(".o_tl_box").toHaveStyle({
        borderTopWidth: "1px",
        borderLeftWidth: "1px",
        borderRightWidth: "1px",
        borderBottomWidth: "0px",
        borderTopLeftRadius: "12px",
        marginLeft: "16px",
    });
    // H36 without grouping shows it as well
    expect(controller.hasPanel).toBe(true);
});

test.tags("desktop");
test("002b3 A43: no panel without the option, with edit off, in the sample state", async () => {
    await mountPanel(HOST_ARCHS.H5);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(leftOfBox()).toBe(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("desktop");
test("002b3 A43: no panel with edit off", async () => {
    await mountPanel(HOST_ARCHS.H39);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("desktop");
test("002b3 A43: no panel in the sample state", async () => {
    await mountPanel(
        `<gantt date_start="date_start" date_stop="date_stop" string="Pills" default_range="week" schedule="1" sample="1"/>`,
        { domain: [["id", "=", -1]], groupBy: [] }
    );
    expect(".o_tl_box_sample").toHaveCount(1);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(queryRect(".o_tl_box").width).toBe(1600);
});

test.tags("mobile");
test("002b3 A43: no panel on the phone", async () => {
    await resize({ width: 390, height: 844 });
    await mountPanel();
    expect(".o_tl_phone").toHaveCount(1);
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(leftOfBox()).toBe(0);
    expect(queryRect(".o_tl_box").width).toBe(390);
});

test.tags("desktop");
test("002b3 A54: the button closes and opens; the state is stored per view and action", async () => {
    await mountPanel();
    expect(browser.localStorage.getItem(KEY)).toBe(null);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_strip").toHaveCount(0);
    expect(".o_tl_panel_toggle").not.toHaveClass("active");
    expect(browser.localStorage.getItem(KEY)).toBe("false");
    // closed: the grid box reaches the screen's right edge, its margin and border stay
    expect(leftOfBox()).toBe(16);
    expect(queryRect(".o_tl_box").width).toBe(1584);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(1);
    expect(browser.localStorage.getItem(KEY)).toBe("true");
    expect(queryRect(".o_tl_box").width).toBe(1288);
});

test.tags("desktop");
test("002b3 A54: a second mount reads the stored state of its own view and action", async () => {
    browser.localStorage.setItem(KEY, "false");
    // another action of the same view keeps its own state: still open
    browser.localStorage.setItem("timelinePanelOpen-view-5-action-8", "true");
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_toggle").toHaveCount(1);
    expect(".o_tl_panel_toggle").not.toHaveClass("active");
});

test.tags("desktop");
test("002b3 A54: closed shows the count text before the button", async () => {
    await mountPanel();
    controller.model.panel.count = 4;
    await animationFrame();
    // open: the count is in the panel title, not before the button
    expect(".o_tl_panel_count").toHaveCount(0);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 4");
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel_count").toHaveText("Unscheduled: 4");
    expect(".o_tl_panel_count").toHaveClass("d-print-none");
    expect(queryRect(".o_tl_panel_count").right).toBeLessThan(queryRect(".o_tl_panel_toggle").left);
    controller.model.panel.count = 0;
    await animationFrame();
    expect(".o_tl_panel_count").toHaveText("All records are scheduled");
});

test.tags("desktop");
test("002b3 A54: growing from a phone with the panel remembered closed reads the count", async () => {
    browser.localStorage.setItem(KEY, "false");
    await resize({ width: 390, height: 844 });
    await mountPanel();
    expect(".o_tl_panel_toggle").toHaveCount(0);
    expect(".o_tl_panel_count").toHaveCount(0);
    await resize({ width: 1600, height: 900 });
    await animationFrame();
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(0);
    expect(".o_tl_panel_count").toHaveText("Unscheduled: 4");
});

test.tags("desktop");
test("002b3 R18: the grid's columns follow the panel", async () => {
    // a wide screen and the year range (36 months) without row headers (they take a part of the
    // width): the months share the width of the box
    await resize({ width: 4000, height: 900 });
    await mountPanel(timelineArch(`string="Pills" default_range="year" schedule="1"`), {
        groupBy: [],
    });
    const header = () => queryRect(queryFirst(".o_tl_col[data-index]"));
    const open = header().width;
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(open).toBeLessThan(header().width);
});

// the row header and the first scroll (R18 points 1 to 5; A65)
const fromView = (element) => queryRect(element).left - queryRect(".o_timeline_view").left;
const thursday = () => fromView(".o_tl_col[data-date='2026-11-12']");
const headerWidths = () => [
    queryRect(".o_tl_title_cell").width,
    ...queryAll(".o_tl_row_header").map((el) => queryRect(el).width),
];

test.tags("desktop");
test("002b3 R18: the row header is a sixth of the whole view, the panel open, closed or resized", async () => {
    await mountPanel();
    expect(headerWidths().every((width) => width === 267)).toBe(true);
    expect(fromView(".o_tl_title_cell")).toBe(17);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(headerWidths().every((width) => width === 267)).toBe(true);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    controller.model.panel.width = 562;
    await animationFrame();
    expect(headerWidths().every((width) => width === 267)).toBe(true);
    // the columns come from the width left (the hosts' week columns stay at their 192 px)
    expect(queryRect(queryFirst(".o_tl_col[data-index]")).width).toBeGreaterThan(191.9);
});

test.tags("desktop");
test("002b3 R18: the first scroll puts Thursday 12 at half of the width left of the row header and the open panel", async () => {
    await mountPanel();
    // (1600 - 267 - 262) / 2 = 535.5 from the cells' left edge (17 + 267)
    expect(Math.abs(thursday() - (284 + 535.5))).toBeLessThan(1);
    expect(controller.model.visibleMiddleDate().toISODate()).toBe("2026-11-12");
});

test.tags("desktop");
test("002b3 R18: a panel remembered as closed gives half of the width left of the row header", async () => {
    browser.localStorage.setItem(KEY, "false");
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(0);
    // (1600 - 267) / 2 = 666.5
    expect(Math.abs(thursday() - (284 + 666.5))).toBeLessThan(1);
});

test.tags("desktop");
test("002b3 R18: opening, closing and resizing the panel move neither the row header nor the columns", async () => {
    await mountPanel();
    const place = thursday();
    const left = fromView(".o_tl_title_cell");
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(thursday()).toBe(place);
    expect(fromView(".o_tl_title_cell")).toBe(left);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(thursday()).toBe(place);
    controller.model.panel.width = 562;
    await animationFrame();
    expect(thursday()).toBe(place);
    expect(fromView(".o_tl_title_cell")).toBe(left);
});

test.tags("desktop");
test("002b3 R18: without a panel the focus day starts at the middle of the visible cells", async () => {
    // narrow enough for the grid to overflow, so that the day can reach the middle
    await resize({ width: 1000, height: 900 });
    await mountPanel(HOST_ARCHS.H5);
    const title = queryRect(".o_tl_title_cell");
    const grid = queryRect(".o_tl_renderer");
    const renderer = queryOne(".o_tl_renderer");
    const middle = (title.right + grid.left + renderer.clientLeft + renderer.clientWidth) / 2;
    expect(Math.abs(queryRect(".o_tl_col.o_tl_is_today").left - middle)).toBeLessThan(1);
});

// ----------------------------------------------------------------------------
// The list (R19)
// ----------------------------------------------------------------------------

const names = () => queryAllTexts(".o_tl_panel_name");
const pill = (name) => MockServer.current.env.pill.find((record) => record.name === name);

/** Watches the reads of the list: the domains and limits sent. */
function watchLists() {
    const reads = [];
    onRpc("pill", "web_search_read", ({ kwargs }) => {
        reads.push({ domain: kwargs.domain, limit: kwargs.limit, kwargs });
    });
    return reads;
}

async function addQueue(count) {
    for (let i = 1; i <= count; i++) {
        MockServer.current.env.pill.create({
            name: `Queue ${String(i).padStart(2, "0")}`,
            active: true,
        });
    }
    await controller.model.reload();
    await animationFrame();
}

test.tags("desktop");
test("002b3 A44: the title says 4 and lists Alpha, Beta, Gamma, Unscheduled", async () => {
    const reads = watchLists();
    await mountPanel();
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 4");
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    expect(".o_tl_panel_line").toHaveCount(4);
    expect(".o_tl_panel_handle").toHaveCount(4);
    expect(".o_tl_panel_more").toHaveCount(0);
    // one read, the first twenty, only the display name, the model's own order
    expect(reads).toHaveLength(1);
    expect(reads[0].limit).toBe(20);
    expect(reads[0].kwargs.specification).toEqual({ display_name: {} });
    expect(reads[0].kwargs.order).toBe(undefined);
    expect(reads[0].domain).toEqual(["&", ["date_start", "=", false], ["date_stop", "=", false]]);
    expect(queryRect(queryFirst(".o_tl_panel_line")).height).toBe(29);
    expect(".o_tl_panel_line").toHaveStyle({ cursor: "grab", paddingTop: "4px" });
    expect(".o_tl_panel_name").toHaveStyle({ cursor: "pointer", paddingLeft: "4px" });
});

test.tags("desktop");
test("002b3 A44: a name search narrows the list", async () => {
    await mountPanel(HOST_ARCHS.H36, {
        searchViewArch: `<search>
            <field name="name" filter_domain="[('name', 'ilike', self)]"/>
            <filter name="gamma" string="Gamma only" domain="[('name', '=', 'Gamma')]"/>
        </search>`,
    });
    await toggleSearchBarMenu();
    await toggleMenuItem("Gamma only");
    await advanceTime(600);
    await animationFrame();
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 1");
    expect(names()).toEqual(["Gamma"]);
});

test.tags("desktop");
test("002b3 A44: R19.1 strips the date conditions of the search, not those of the action's domain", async () => {
    const reads = watchLists();
    await mountPanel(HOST_ARCHS.H36, {
        domain: [["date_stop", "!=", "1999-01-01"]],
        searchViewArch: `<search>
            <filter name="late" string="Late" domain="[('date_start', '&gt;', '2000-01-01')]"/>
        </search>`,
    });
    const listRead = () => reads.filter(({ kwargs }) => kwargs.limit === 20).at(-1).domain;
    expect(JSON.stringify(listRead()).includes("1999-01-01")).toBe(true);
    await toggleSearchBarMenu();
    await toggleMenuItem("Late");
    await advanceTime(600);
    await animationFrame();
    // the action's condition on the stop stays, the search's condition on the start is gone
    expect(JSON.stringify(listRead()).includes("1999-01-01")).toBe(true);
    expect(JSON.stringify(listRead()).includes("2000-01-01")).toBe(false);
});

test.tags("desktop");
test("002b3 A44: a record with only a start is not listed", async () => {
    await mountPanel();
    pill("Unscheduled").date_start = at(0, "09:00");
    await controller.model.reload();
    await animationFrame();
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 3");
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);
    pill("Unscheduled").date_start = false;
    pill("Unscheduled").date_stop = at(1, "09:00");
    await controller.model.reload();
    await animationFrame();
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);
});

test.tags("desktop");
test("002b3 A45: date conditions of the search are left out", async () => {
    const reads = watchLists();
    await mountPanel(HOST_ARCHS.H36, {
        searchViewArch: `<search>
            <filter name="dated" string="Dated" domain="[('date_start', '!=', False)]"/>
            <separator/>
            <filter name="named" string="Named" domain="[('name', 'ilike', 'a')]"/>
        </search>`,
        context: { search_default_dated: 1, search_default_named: 1 },
    });
    // the conditions on the start stay in the grid's own read but not in the list's
    expect(reads.at(-1).domain).toEqual([
        "&",
        ["name", "ilike", "a"],
        "&",
        ["date_start", "=", false],
        ["date_stop", "=", false],
    ]);
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);
});

test.tags("desktop");
test("002b3 A45: a negated or alternative date condition is left out as well", async () => {
    const reads = watchLists();
    await mountPanel(HOST_ARCHS.H36, {
        searchViewArch: `<search>
            <filter name="either" string="Either" domain="['|', ('date_stop', '!=', False), ('name', '=', 'Beta')]"/>
            <separator/>
            <filter name="never" string="Never" domain="['!', ('date_start', '=', False)]"/>
        </search>`,
        context: { search_default_either: 1 },
    });
    expect(reads.at(-1).domain).toEqual([
        "&",
        ["name", "=", "Beta"],
        "&",
        ["date_start", "=", false],
        ["date_stop", "=", false],
    ]);
    expect(names()).toEqual(["Beta"]);
    await toggleSearchBarMenu();
    await toggleMenuItem("Either");
    await toggleMenuItem("Never");
    await advanceTime(600);
    await animationFrame();
    // "!" of a left-out condition is left out: the list is not emptied
    expect(reads.at(-1).domain).toEqual(["&", ["date_start", "=", false], ["date_stop", "=", false]]);
});

test.tags("desktop");
test("002b3 A45: no read in the sample state", async () => {
    const reads = watchLists();
    await mountPanel(
        `<gantt date_start="date_start" date_stop="date_stop" string="Pills" default_range="week" schedule="1" sample="1"/>`,
        { domain: [["id", "=", -1]], groupBy: [] }
    );
    expect(reads).toHaveLength(0);
});

test.tags("desktop");
test("002b3 A45: no read without the option", async () => {
    const reads = watchLists();
    await mountPanel(HOST_ARCHS.H5);
    expect(reads).toHaveLength(0);
});

test.tags("desktop");
test("002b3 A45: no read with edit off", async () => {
    const reads = watchLists();
    await mountPanel(HOST_ARCHS.H39);
    expect(reads).toHaveLength(0);
});

test.tags("mobile");
test("002b3 A43: no read on the phone", async () => {
    const reads = watchLists();
    await resize({ width: 390, height: 844 });
    await mountPanel();
    expect(".o_tl_panel").toHaveCount(0);
    expect(reads).toHaveLength(0);
});

test.tags("desktop");
test("002b3 A44: a stale answer is dropped", async () => {
    const first = Promise.withResolvers();
    let calls = 0;
    onRpc("pill", "web_search_read", async () => {
        calls++;
        if (calls === 2) {
            // the second read of the list (the first came with the mount) is slow and stale
            await first.promise;
            return { length: 1, records: [{ id: 99, display_name: "Stale" }] };
        }
    });
    await mountPanel();
    expect(names()).toHaveLength(4);
    controller.model.loadPanel();
    await animationFrame();
    await controller.model.loadPanel();
    await animationFrame();
    first.resolve();
    await animationFrame();
    await animationFrame();
    expect(calls).toBe(3);
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 4");
});

test.tags("desktop");
test("002b3 A44: a failing read keeps the old list and raises nothing", async () => {
    let fail = false;
    onRpc("pill", "web_search_read", () => {
        if (fail) {
            throw new Error("the read failed");
        }
    });
    await mountPanel();
    expect(names()).toHaveLength(4);
    fail = true;
    await controller.model.reload();
    await animationFrame();
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Unscheduled"]);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 4");
});

test.tags("desktop");
test("002b3 A54: a view and an action without ids store the state under a key without undefined", async () => {
    await mountView({ type: "gantt", resModel: "pill", arch: HOST_ARCHS.H36 });
    await animationFrame();
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(controller.model._panelKey).not.toInclude("undefined");
    expect(browser.localStorage.getItem(controller.model._panelKey)).toBe("false");
});

test.tags("desktop");
test("002b3 A46: a line opens the record dialog; closing reloads", async () => {
    const methods = [];
    onRpc("*", ({ method }) => {
        methods.push(method);
    });
    const reloadCount = () => methods.filter((method) => method === "get_gantt_data").length;
    await mountPanel();
    const before = reloadCount();
    await contains(".o_tl_panel_line[data-record-id='2'] .o_tl_panel_name").click();
    await waitFor(".modal-body .o_form_view");
    expect(queryAllTexts(".o_dialog .modal-title")).toEqual(["Open"]);
    expect(".o_dialog .o_field_widget[name='name'] input").toHaveValue("Beta");
    expect(reloadCount()).toBe(before);
    await contains(".o_dialog .o_form_button_cancel").click();
    await animationFrame();
    await advanceTime(100);
    expect(".o_dialog").toHaveCount(0);
    expect(reloadCount()).toBeGreaterThan(before);
});

test.tags("desktop");
test("002b3 A53: twenty lines then Load more reads twenty more", async () => {
    const reads = watchLists();
    await mountPanel();
    await addQueue(22);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 26");
    expect(".o_tl_panel_line").toHaveCount(20);
    expect(".o_tl_panel_more").toHaveCount(1);
    expect(".o_tl_panel_more").toHaveText("Load more");
    expect(".o_tl_panel_more").toHaveClass("btn-link");
    expect(reads.at(-1).limit).toBe(20);
    await contains(".o_tl_panel_more").click();
    await animationFrame();
    expect(reads.at(-1).limit).toBe(40);
    expect(".o_tl_panel_line").toHaveCount(26);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 26");
    expect(".o_tl_panel_more").toHaveCount(0);
});

test.tags("desktop");
test("002b3 A53: no Load more without more records", async () => {
    await mountPanel();
    expect(".o_tl_panel_line").toHaveCount(4);
    expect(".o_tl_panel_more").toHaveCount(0);
    await addQueue(16);
    // exactly twenty: nothing more to load
    expect(".o_tl_panel_line").toHaveCount(20);
    expect(".o_tl_panel_more").toHaveCount(0);
});

test.tags("desktop");
test("002b3 A53: a reload reads the first twenty again", async () => {
    const reads = watchLists();
    await mountPanel();
    await addQueue(22);
    await contains(".o_tl_panel_more").click();
    await animationFrame();
    expect(".o_tl_panel_line").toHaveCount(26);
    // a drop elsewhere: the view reloads, the title takes the new total
    MockServer.current.env.pill.create({ name: "Queue 23", active: true });
    await controller.model.reload();
    await animationFrame();
    expect(reads.at(-1).limit).toBe(20);
    expect(".o_tl_panel_line").toHaveCount(20);
    expect(".o_tl_panel_title").toHaveText("Unscheduled: 27");
    expect(".o_tl_panel_more").toHaveCount(1);
});

test.tags("desktop");
test("002b3 A25: Load more clears the selection", async () => {
    await mountPanel(HOST_ARCHS.H40);
    await addQueue(22);
    const cell = queryAll(".o_tl_row[data-row-id]:not(.o_tl_group_row) .o_tl_cell")[8];
    await click(cell);
    await animationFrame();
    expect(controller.selection.state.cellCount).toBeGreaterThan(0);
    expect(".o_tl_cell_picked").not.toHaveCount(0);
    await contains(".o_tl_panel_more").click();
    await animationFrame();
    expect(controller.selection.state.cellCount).toBe(0);
    expect(".o_tl_cell_picked").toHaveCount(0);
    expect(".o_tl_panel_line").toHaveCount(26);
});

test.tags("desktop");
test("002b3 A58: the handle darkens under the pointer", async () => {
    await mountPanel();
    const handle = () => queryAll(".o_tl_panel_handle")[2];
    expect(handle()).toHaveStyle({ color: "rgb(173, 181, 189)", fontSize: "14px" });
    // the page does not apply :hover to a mocked pointer: read the rules of the style sheets
    const rules = [...document.styleSheets].flatMap((sheet) => {
        try {
            return [...sheet.cssRules];
        } catch {
            return [];
        }
    });
    const hoverRule = rules.find(
        (rule) => rule.selectorText?.includes(".o_tl_panel_handle:hover")
    );
    expect(hoverRule.style.color).toBe("rgb(102, 102, 102)");
    // while the line is dragged the handle is as dark
    handle().closest(".o_tl_panel_line").classList.add("o_tl_panel_dragged");
    expect(handle()).toHaveStyle({ color: "rgb(102, 102, 102)" });
});

test.tags("desktop");
test("002b3 R19: lines cut long names with an ellipsis and keep the full name as tooltip", async () => {
    await mountPanel();
    const long = "A very long name of a record that cannot fit into the narrow panel of the view";
    const record = pill("Unscheduled");
    record.name = long;
    record.display_name = long;
    await controller.model.reload();
    await animationFrame();
    const name = queryAll(".o_tl_panel_name")[3];
    expect(name).toHaveText(long);
    expect(name).toHaveAttribute("title", long);
    expect(name).toHaveStyle({ textOverflow: "ellipsis", overflowX: "hidden", whiteSpace: "nowrap" });
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(queryRect(queryAll(".o_tl_panel_line")[3]).height).toBe(29);
});

// -- resizing by the strip (R20, A55) ---------------------------------------------------------

const stripPoint = () => {
    const rect = queryRect(".o_tl_panel_strip");
    return { x: rect.left + rect.width / 2, y: rect.top + 200 };
};

/** Press on the strip and move the pointer `dx` pixels; the button stays down. */
async function dragStrip(dx) {
    const start = stripPoint();
    const helpers = await drag(".o_tl_panel_strip", { position: start });
    await helpers.moveTo(".o_tl_panel_strip", { position: { x: start.x + dx, y: start.y } });
    await animationFrame();
    return helpers;
}

const panelWidth = () => queryRect(".o_tl_panel").width;

test.tags("desktop");
test("002b3 A55: dragging the strip 300 px left gives 562 px", async () => {
    await mountPanel();
    const boxBefore = queryRect(".o_tl_box").width;
    const helpers = await dragStrip(-300);
    expect(".o_tl_panel_strip").toHaveClass("o_tl_panel_resizing");
    expect(panelWidth()).toBe(562);
    // the grid box gives way, its columns follow
    expect(queryRect(".o_tl_box").width).toBe(boxBefore - 300);
    await helpers.drop();
    await animationFrame();
    expect(".o_tl_panel_strip").not.toHaveClass("o_tl_panel_resizing");
    expect(panelWidth()).toBe(562);
    expect(controller.model.panel.width).toBe(562);
    // after the release the pointer moves nothing
    await hover(".o_tl_box", { position: { x: 100, y: 100 } });
    await animationFrame();
    expect(panelWidth()).toBe(562);
});

test.tags("desktop");
test("002b3 A55: dragging the strip far right stops at 150, far left at 800", async () => {
    await mountPanel();
    const right = await dragStrip(1000);
    expect(panelWidth()).toBe(150);
    await right.drop();
    await animationFrame();
    const left = await dragStrip(-1500);
    expect(panelWidth()).toBe(800);
    await left.drop();
    await animationFrame();
    expect(controller.model.panel.width).toBe(800);
});

test.tags("desktop");
test("002b3 A55: a key press ends the resize", async () => {
    await mountPanel();
    const helpers = await dragStrip(-100);
    expect(panelWidth()).toBe(362);
    await press("a");
    await animationFrame();
    expect(".o_tl_panel_strip").not.toHaveClass("o_tl_panel_resizing");
    const start = stripPoint();
    await helpers.moveTo(".o_tl_panel_strip", { position: { x: start.x - 200, y: start.y } });
    await animationFrame();
    expect(panelWidth()).toBe(362);
    await helpers.drop();
});

test.tags("desktop");
test("002b3 A55: the window losing the focus does not end the resize (R20)", async () => {
    await mountPanel();
    const helpers = await dragStrip(-100);
    expect(panelWidth()).toBe(362);
    window.dispatchEvent(new Event("blur"));
    await animationFrame();
    expect(".o_tl_panel_strip").toHaveClass("o_tl_panel_resizing");
    const start = stripPoint();
    await helpers.moveTo(".o_tl_panel_strip", { position: { x: start.x - 200, y: start.y } });
    await animationFrame();
    // the strip had moved 100 px left with the first move: 200 px more is 300 px from the press
    expect(panelWidth()).toBe(562);
    await helpers.drop();
    await animationFrame();
    expect(".o_tl_panel_strip").not.toHaveClass("o_tl_panel_resizing");
});

test.tags("desktop");
test("002b3 A55: a reload keeps the width, closing and opening the panel as well", async () => {
    await mountPanel();
    const helpers = await dragStrip(-300);
    await helpers.drop();
    await animationFrame();
    await controller.model.reload();
    await animationFrame();
    expect(panelWidth()).toBe(562);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(".o_tl_panel").toHaveCount(0);
    await click(".o_tl_panel_toggle");
    await animationFrame();
    expect(panelWidth()).toBe(562);
});

test.tags("desktop");
test("002b3 A55: a view that opens anew has 262 px again", async () => {
    await mountPanel();
    const helpers = await dragStrip(-300);
    await helpers.drop();
    await animationFrame();
    expect(controller.model.panel.width).toBe(562);
    await mountPanel();
    expect(controller.model.panel.width).toBe(262);
    // the second view is drawn next to the first one: its panel is the last one
    expect(queryRect(queryAll(".o_tl_panel").at(-1)).width).toBe(262);
});

test.tags("desktop");
test("002b3 A55: the strip shows on hover", async () => {
    await mountPanel();
    expect(".o_tl_panel_strip").toHaveStyle({ opacity: "0", cursor: "col-resize" });
    const rules = [...document.styleSheets].flatMap((sheet) => {
        try {
            return [...sheet.cssRules];
        } catch {
            return [];
        }
    });
    const hoverRule = rules.find((rule) => rule.selectorText?.includes(".o_tl_panel_strip:hover"));
    expect(hoverRule.style.opacity).toBe("1");
    expect(".o_tl_panel_strip_line").toHaveStyle({ borderLeftWidth: "2px" });
    // while resizing it shows as well
    const helpers = await dragStrip(-10);
    expect(".o_tl_panel_strip").toHaveStyle({ opacity: "1" });
    await helpers.drop();
});
