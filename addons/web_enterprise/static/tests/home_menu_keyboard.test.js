// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, mockTouch, test } from "@odoo/hoot";
import {
    animationFrame,
    click,
    edit,
    getFixture,
    press,
    queryAll,
    queryFirst,
    resize,
    runAllTimers,
} from "@odoo/hoot";
import { Component, proxy, xml } from "@odoo/owl";
import { getService, mountWithCleanup, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { user } from "@web/core/user";
import { session } from "@web/session";
import { Dialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { MainComponentsContainer } from "@web/core/main_components_container";

import { HomeMenu } from "@web_enterprise/home_menu/home_menu";
import { rowLengthForWidth } from "@web_enterprise/home_menu/home_menu_keyboard";

describe.current.tags("desktop");

const NAMES = [
    "Discuss",
    "Calendar",
    "To-do",
    "Contacts",
    "CRM",
    "Sales",
    "Dashboards",
    "Invoicing",
    "Project",
    "Apps",
    "Settings",
];

function makeApps(count = NAMES.length) {
    return NAMES.slice(0, count).map((name, index) => ({
        id: index + 1,
        xmlid: `cws_test.app_${name.toLowerCase().replace(/\W/g, "")}`,
        name,
        actionID: 100 + index,
        actionPath: false,
        webIcon: false,
        webIconData: "/web/static/img/default_icon_app.png",
    }));
}

async function mountHome({ apps = makeApps(), onOpenApp = () => {}, onEscape } = {}) {
    await mountWithCleanup(MainComponentsContainer);
    const props = { apps, onOpenApp };
    if (onEscape) {
        props.onEscape = onEscape;
    }
    const component = await mountWithCleanup(HomeMenu, { props });
    await animationFrame();
    return component;
}

const focusedIndexes = () =>
    queryAll(".o_app").flatMap((el, index) => (el.classList.contains("o_focused") ? [index] : []));

const columnCount = () =>
    getComputedStyle(queryFirst(".o_apps")).gridTemplateColumns.split(" ").length;

/** Namespace prefix and text of the palette search box, as typed: "/c". */
function paletteQuery() {
    const namespace = queryFirst(".o_command_palette_search .o_namespace");
    const input = queryFirst(".o_command_palette_search input");
    return input ? (namespace ? namespace.textContent.trim() : "") + input.value : null;
}

async function pressKeys(...keys) {
    for (const key of keys) {
        await press(key);
    }
    await animationFrame();
}

class OpenDropdown extends Component {
    static components = { Dropdown, DropdownItem };
    static template = xml`
        <Dropdown>
            <button class="o_cws_test_toggle">Menu</button>
            <t t-set-slot="content">
                <DropdownItem>Item A</DropdownItem>
            </t>
        </Dropdown>
    `;
}

class AppsHost extends Component {
    static components = { HomeMenu };
    static template = xml`<HomeMenu apps="this.state.apps" onOpenApp="() => {}"/>`;
    setup() {
        this.state = proxy({ apps: makeApps() });
    }
}

test("A19 the first arrow focuses the first tile", async () => {
    await resize({ width: 1600 });
    await mountHome();
    expect(focusedIndexes()).toEqual([]);
    await pressKeys("ArrowRight");
    expect(focusedIndexes()).toEqual([0]);
});

test("A20 arrows on a full grid", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await pressKeys("ArrowRight", "ArrowRight", "ArrowDown");
    expect(focusedIndexes()).toEqual([7]);
    expect(queryAll(".o_app")[7]).toHaveClass("o_focused");
    await pressKeys("ArrowDown");
    expect(focusedIndexes()).toEqual([1]);
    await pressKeys("ArrowUp");
    expect(focusedIndexes()).toEqual([7]);
    const seen = [];
    for (let i = 0; i < 4; i++) {
        await pressKeys("ArrowRight");
        seen.push(focusedIndexes()[0]);
    }
    expect(seen).toEqual([8, 9, 10, 6]);
    await pressKeys("ArrowLeft");
    expect(focusedIndexes()).toEqual([10]);
});

test("A23 Tab and Shift+Tab wrap at the ends", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await pressKeys("ArrowLeft"); // the first key focuses tile 0
    await pressKeys("ArrowLeft"); // wraps to the last tile of the first row
    await pressKeys("ArrowDown"); // 5 -> 10
    expect(focusedIndexes()).toEqual([10]);
    await pressKeys("Tab");
    expect(focusedIndexes()).toEqual([0]);
    await press(["shift", "Tab"]);
    await animationFrame();
    expect(focusedIndexes()).toEqual([10]);
});

test("A24 Enter opens the focused tile", async () => {
    await resize({ width: 1600 });
    const opened = [];
    await mountHome({ onOpenApp: (app) => opened.push(app.name) });
    await pressKeys("Enter");
    expect(opened).toEqual([]);
    await pressKeys("ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight");
    expect(focusedIndexes()).toEqual([4]);
    await pressKeys("Enter");
    expect(opened).toEqual(["CRM"]);
});

test("Escape calls onEscape", async () => {
    await resize({ width: 1600 });
    const calls = [];
    await mountHome({ onEscape: () => calls.push("escape") });
    await pressKeys("Escape");
    expect(calls).toEqual(["escape"]);
});

test("Escape without onEscape does nothing", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await pressKeys("Escape");
    expect(".o_home_menu").toHaveCount(1);
});

test("the focused index resets when the apps change", async () => {
    await resize({ width: 1600 });
    const host = await mountWithCleanup(AppsHost);
    await animationFrame();
    await pressKeys("ArrowRight");
    expect(focusedIndexes()).toEqual([0]);
    host.state.apps = makeApps(5);
    await animationFrame();
    expect(focusedIndexes()).toEqual([]);
});

test("A25 keys are left to an open dropdown", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await mountWithCleanup(OpenDropdown);
    await click(".o_cws_test_toggle");
    await animationFrame();
    expect(".o-dropdown--menu").toHaveCount(1);
    await pressKeys("ArrowDown");
    expect(".o_app.o_focused").toHaveCount(0);
});

test("A26 typing opens the palette with the footer", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await press("c");
    await animationFrame();
    await runAllTimers();
    expect(".o_command_palette").toHaveCount(1);
    expect(paletteQuery()).toBe("/c");
    expect(".o_cws_palette_footer").toHaveCount(1);
    expect(".o_cws_palette_footer").toHaveText("TIP — open me anywhere with CONTROL + K");
    expect(".o_home_menu_search_input").toHaveValue("");
});

test("A26b the footer names the Command key on Apple computers", async () => {
    patchWithCleanup(navigator, { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    await resize({ width: 1600 });
    await mountHome();
    await press("c");
    await animationFrame();
    expect(".o_cws_palette_footer").toHaveText("TIP — open me anywhere with COMMAND + K");
});

test("A27 focus returns after closing the palette", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await press("c");
    await animationFrame();
    expect(".o_command_palette").toHaveCount(1);
    await press("Escape");
    await animationFrame();
    expect(".o_command_palette").toHaveCount(0);
    expect(document.activeElement).toBe(queryFirst(".o_home_menu_search_input"));
    await press("s");
    await animationFrame();
    expect(paletteQuery()).toBe("/s");
});

test("A28 typing in a dialog field does not open the palette", async () => {
    await resize({ width: 1600 });
    class FieldDialog extends Component {
        static components = { Dialog };
        static template = xml`
            <Dialog title="'Title'"><input class="o_cws_test_field" type="text"/></Dialog>
        `;
    }
    await mountHome();
    getService("dialog").add(FieldDialog, {});
    await animationFrame();
    queryFirst(".o_cws_test_field").focus();
    await edit("hello");
    expect(".o_cws_test_field").toHaveValue("hello");
    expect(".o_command_palette").toHaveCount(0);
});

test("A29 clicking the empty background keeps type-to-search working", async () => {
    await resize({ width: 1600 });
    await mountHome();
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
    await click(".o_home_menu");
    await animationFrame();
    expect(document.activeElement).toBe(queryFirst(".o_home_menu_search_input"));
    await press("p");
    await animationFrame();
    expect(paletteQuery()).toBe("/p");
});

test("A30 composed input opens the palette with a bare slash", async () => {
    await resize({ width: 1600 });
    await mountHome();
    const field = queryFirst(".o_home_menu_search_input");
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    field.value = "に";
    field.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
    await animationFrame();
    expect(".o_command_palette").toHaveCount(1);
    expect(paletteQuery()).toBe("/");
});

test("A31 visible search field on touch", async () => {
    mockTouch(true);
    await resize({ width: 390 });
    await mountHome();
    const field = queryFirst(".o_home_menu_search_input");
    expect(field).toHaveClass("o_cws_touch_search");
    expect(field).toBeVisible();
    expect(document.activeElement).not.toBe(field);
    expect(queryFirst(".o_home_menu").scrollTop).toBe(46);
    await click(field);
    await animationFrame();
    expect(paletteQuery()).toBe("/");
    expect(".o_cws_palette_footer").toHaveCount(1);
});

test("A31 touch field fits the top bar height", async () => {
    mockTouch(true);
    await resize({ width: 390 });
    await mountHome();
    const field = queryFirst(".o_home_menu_search_input");
    const { height } = field.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(field).marginBottom);
    expect(height + margin).toBe(46);
    expect(parseFloat(getComputedStyle(field).paddingTop)).toBe(8);
    expect(margin).toBe(16);
    // the scrolled page starts right under the field: the field is just out of sight
    expect(field.getBoundingClientRect().bottom + margin).toBe(
        queryFirst(".o_home_menu").getBoundingClientRect().top
    );
});

test("A31 touch order is field, message, grid", async () => {
    mockTouch(true);
    patchWithCleanup(session, {
        sysadmin_message: { message: "<p><b>Maintenance:</b> tonight</p>", warning_type: "user" },
    });
    patchWithCleanup(user, { isSystem: false });
    await resize({ width: 390 });
    await mountHome();
    const children = [...queryFirst(".o_cws_column").children].map((el) => el.className);
    expect(children[0]).toInclude("o_cws_touch_search");
    expect(children[1]).toInclude("o_cws_admin_message");
    expect(children[2]).toInclude("o_apps");
    const message = queryFirst(".o_cws_admin_message").getBoundingClientRect();
    expect(message.top).not.toBeLessThan(queryFirst(".o_home_menu").getBoundingClientRect().top);
});

test("A31b wide touch device keeps keyboard handling", async () => {
    mockTouch(true);
    await resize({ width: 1024 });
    await mountHome();
    const field = queryFirst(".o_home_menu_search_input");
    expect(document.activeElement).not.toBe(field);
    await pressKeys("ArrowRight");
    expect(focusedIndexes()).toEqual([0]);
    await press("c");
    await animationFrame();
    expect(paletteQuery()).toBe("/c");
    await press("Escape");
    await animationFrame();
    expect(document.activeElement).toBe(field);
});

test("A32 no keyboard navigation on small screens", async () => {
    await resize({ width: 390 });
    await mountHome();
    expect(document.activeElement).not.toBe(queryFirst(".o_home_menu_search_input"));
    await pressKeys("ArrowRight", "ArrowDown");
    expect(".o_app.o_focused").toHaveCount(0);
});

test("A79 narrow window without touch", async () => {
    await resize({ width: 700 });
    await mountHome();
    const field = queryFirst(".o_home_menu_search_input");
    expect(field).toHaveClass("o_cws_search_hidden");
    expect(document.activeElement).not.toBe(field);
    await pressKeys("ArrowRight");
    expect(".o_app.o_focused").toHaveCount(0);
    await press("x");
    await animationFrame();
    expect(".o_command_palette").toHaveCount(0);
});

test("A72 row length by width", async () => {
    expect(rowLengthForWidth(1600)).toBe(6);
    expect(rowLengthForWidth(768)).toBe(6);
    expect(rowLengthForWidth(700)).toBe(4);
    expect(rowLengthForWidth(400)).toBe(4);
    await resize({ width: 1600 });
    await mountHome();
    // CSS media queries follow the real viewport (wide in the test browser), not Hoot's
    // mocked window size, so the 4-column grid is only checked through the key moves below.
    expect(columnCount()).toBe(6);
    await pressKeys("ArrowRight", "ArrowDown");
    expect(focusedIndexes()).toEqual([6]);
});

test("A72b narrowing to 700 px while open moves by 4", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await resize({ width: 700 });
    await animationFrame();
    await pressKeys("ArrowRight", "ArrowDown");
    expect(focusedIndexes()).toEqual([4]);
});

test("A72c narrowing to 400 px while open moves by 4", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await resize({ width: 400 });
    await animationFrame();
    await pressKeys("ArrowRight", "ArrowDown");
    expect(focusedIndexes()).toEqual([4]);
});

test("A84 row length re-checked on resize", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await resize({ width: 500 });
    await animationFrame();
    await pressKeys("ArrowRight", "ArrowDown");
    expect(focusedIndexes()).toEqual([4]);
    await resize({ width: 1600 });
    await animationFrame();
    await pressKeys("ArrowUp");
    expect(focusedIndexes()).toEqual([10]);
    await pressKeys("ArrowDown");
    expect(focusedIndexes()).toEqual([4]);
});

test("A85 typing with a dropdown open", async () => {
    await resize({ width: 1600 });
    await mountHome();
    await mountWithCleanup(OpenDropdown);
    await click(".o_cws_test_toggle");
    await animationFrame();
    const active = document.activeElement;
    await press("c");
    await animationFrame();
    expect(".o_command_palette").toHaveCount(0);
    expect(document.activeElement).toBe(active);
    expect(document.activeElement).not.toBe(queryFirst(".o_home_menu_search_input"));
});

test("A86 typing in a rich-text area", async () => {
    await resize({ width: 1600 });
    await mountHome();
    const area = document.createElement("div");
    area.setAttribute("contenteditable", "true");
    area.tabIndex = 0;
    getFixture().appendChild(area);
    area.focus();
    await press("c");
    await animationFrame();
    expect(".o_command_palette").toHaveCount(0);
    expect(document.activeElement).toBe(area);
});
