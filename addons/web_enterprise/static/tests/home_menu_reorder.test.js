// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, mockTouch, test } from "@odoo/hoot";
import { advanceTime, animationFrame, drag, queryAll, queryAllTexts, queryOne, queryRect } from "@odoo/hoot";
import { EventBus } from "@odoo/owl";
import {
    mockService,
    mountWithCleanup,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { user } from "@web/core/user";

import { CwsHomeMenu } from "@web_enterprise/home_menu/home_menu";
import { precedingIndex, precedingXmlid } from "@web_enterprise/home_menu/home_menu_reorder";

const FOCUSED_TILE = ".o_app.o_focused";

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
const XMLIDS = NAMES.map((name) => `cws_test.app_${name.toLowerCase().replace(/\W/g, "")}`);

function makeApps() {
    return NAMES.map((name, index) => ({
        id: index + 1,
        xmlid: XMLIDS[index],
        name,
        actionID: 100 + index,
        actionPath: false,
        webIcon: false,
        webIconData: "/web/static/img/default_icon_app.png",
    }));
}

/** Mount the home menu; record the saves, the bus events and the opened apps. */
async function mountHome({ homemenuConfig = false } = {}) {
    const saved = [];
    const busEvents = [];
    const opened = [];
    patchWithCleanup(user, { settings: { id: 7, homemenu_config: homemenuConfig } });
    patchWithCleanup(EventBus.prototype, {
        trigger(name, detail) {
            if (name === "HOME-MENU:APPS-UPDATED") {
                busEvents.push(detail.map((app) => app.name));
            }
            return super.trigger(...arguments);
        },
    });
    onRpc("res.users.settings", "set_res_users_settings", ({ kwargs }) => {
        saved.push(kwargs.new_settings);
        return kwargs.new_settings;
    });
    const component = await mountWithCleanup(CwsHomeMenu, {
        props: { apps: makeApps(), onOpenApp: (app) => opened.push(app.name) },
    });
    await animationFrame();
    return { component, saved, busEvents, opened };
}

/** Options for moveTo that put the pointer `dx`, `dy` pixels from the centre of the target. */
function offsetFromCentre(selector, dx, dy = 0) {
    const { x, y, width, height } = queryRect(selector);
    return { position: { x: Math.round(x + width / 2) + dx, y: Math.round(y + height / 2) + dy } };
}

const captions = () => queryAllTexts(".o_app .o_caption");

test("A33 drag saves the order", async () => {
    const { saved, busEvents } = await mountHome();
    expect(busEvents).toEqual([NAMES]);
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(500);
    await animationFrame();
    // the hold alone does not start the drag
    expect(".o_dragged_app").toHaveCount(0);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 12));
    await animationFrame();
    expect(".o_app.o_dragged_app").toHaveCount(1);
    expect(".o_app:eq(3)").toHaveClass("o_dragged_app");
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()[0]).toBe("Contacts");
    expect(captions()).toEqual([
        "Contacts",
        "Discuss",
        "Calendar",
        "To-do",
        "CRM",
        "Sales",
        "Dashboards",
        "Invoicing",
        "Project",
        "Apps",
        "Settings",
    ]);
    expect(".o_dragged_app").toHaveCount(0);
    expect(saved).toHaveLength(1);
    const order = JSON.parse(saved[0].homemenu_config);
    expect(typeof saved[0].homemenu_config).toBe("string");
    expect(order).toHaveLength(11);
    expect(order[0]).toBe("cws_test.app_contacts");
    expect([...order].sort()).toEqual([...XMLIDS].sort());
    expect(busEvents).toHaveLength(2);
    expect(busEvents[1]).toEqual(captions());
});

test("A33b a tile dropped further on goes right after the preceding tile", async () => {
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(0)");
    await advanceTime(500);
    await moveTo(".o_app:eq(2)");
    await drop();
    await animationFrame();
    expect(captions().slice(0, 4)).toEqual(["Calendar", "To-do", "Discuss", "Contacts"]);
    expect(JSON.parse(saved[0].homemenu_config).slice(0, 3)).toEqual([
        "cws_test.app_calendar",
        "cws_test.app_todo",
        "cws_test.app_discuss",
    ]);
});

test("A33c the order shows before the server answers and resets the keyboard focus", async () => {
    const { component } = await mountHome();
    onRpc("res.users.settings", "set_res_users_settings", () => new Promise(() => {}));
    component.state.cursor = 5;
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(500);
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()[0]).toBe("Contacts");
    expect(component.state.cursor).toBe(null);
    expect(FOCUSED_TILE).toHaveCount(0);
});

test("A33d the saved order survives a new mount and the click ending a drag is swallowed", async () => {
    const { opened } = await mountHome({
        homemenuConfig: JSON.stringify(["cws_test.app_contacts"]),
    });
    expect(captions().at(-1)).toBe("Contacts");
    // released over its own tile: nothing moves and the click does not open the app
    const { moveTo, drop } = await drag(".o_app:eq(0)");
    await advanceTime(500);
    await moveTo(".o_app:eq(0)", offsetFromCentre(".o_app:eq(0)", 12));
    await drop();
    await animationFrame();
    expect(opened).toEqual([]);
    expect(captions().at(-1)).toBe("Contacts");
    // the next plain click works again
    const { drop: drop2 } = await drag(".o_app:eq(0)");
    await drop2();
    await animationFrame();
    expect(opened).toEqual(["Discuss"]);
});

test("A34 short press does not drag", async () => {
    const { saved, opened } = await mountHome();
    const { drop } = await drag(".o_app:eq(3)");
    await advanceTime(300);
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    await drop();
    await advanceTime(500);
    expect(".o_dragged_app").toHaveCount(0);
    expect(saved).toHaveLength(0);
    // the click ending the short press reaches the app
    expect(opened).toEqual(["Contacts"]);
});

test("A34b moving more than 10 px before 500 ms cancels the drag", async () => {
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(200);
    const { x, y, width, height } = queryRect(".o_app:eq(3)");
    await moveTo(".o_app:eq(3)", { position: { x: x + width / 2 + 15, y: y + height / 2 } });
    await advanceTime(400);
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()).toEqual(NAMES);
    expect(saved).toHaveLength(0);
});

test("A34c a hold followed by a move under 10 px does not drag yet", async () => {
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(200);
    // a small move before the hold is over keeps the press alive
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 5));
    await advanceTime(400);
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    // 9 px from the pointer position at the end of the hold: still no drag
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 14));
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    // 10 px from that position: the drag starts
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 15));
    await animationFrame();
    expect(".o_app:eq(3)").toHaveClass("o_dragged_app");
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()[0]).toBe("Contacts");
    expect(saved).toHaveLength(1);
});

test("A34d an early move of exactly 10 px cancels, 9 px does not", async () => {
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(200);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 9));
    await advanceTime(400);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 20));
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(1);
    await drop();
    await animationFrame();

    const second = await drag(".o_app:eq(3)");
    await advanceTime(200);
    await second.moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 10));
    await advanceTime(600);
    await second.moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 40));
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    await second.drop();
    await animationFrame();
    expect(saved).toHaveLength(0);
});

test("A34f touch scrolling is cancelled once the hold is over, not before", async () => {
    await mountHome();
    const { drop } = await drag(".o_app:eq(3)");
    const touchmove = () => {
        const ev = new Event("touchmove", { bubbles: true, cancelable: true });
        queryOne(".o_app:eq(3)").dispatchEvent(ev);
        return ev.defaultPrevented;
    };
    await advanceTime(200);
    expect(touchmove()).toBe(false);
    await advanceTime(400);
    expect(touchmove()).toBe(true);
    await drop();
    await animationFrame();
    expect(touchmove()).toBe(false);
});

test("A34e an early move, then a hold and another move, does not drag", async () => {
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(100);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 30));
    await advanceTime(600);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 50));
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()).toEqual(NAMES);
    expect(saved).toHaveLength(0);
});

test("A40 file drop opens the share dialog when there are share targets", async () => {
    const displayed = [];
    mockService("share_target", {
        hasShareTargetItems: 1,
        display: (files) => displayed.push(files),
    });
    await mountHome();
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const { moveTo, drop } = await drag(".o_home_menu", { files: [file] });
    await moveTo(".o_home_menu");
    await drop();
    expect(displayed).toHaveLength(1);
    expect([...displayed[0]]).toEqual([file]);
});

test("A40b file drop does nothing without share targets", async () => {
    const displayed = [];
    mockService("share_target", {
        hasShareTargetItems: 0,
        display: (files) => displayed.push(files),
    });
    await mountHome();
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const { moveTo, drop } = await drag(".o_home_menu", { files: [file] });
    await moveTo(".o_home_menu");
    await drop();
    expect(displayed).toHaveLength(0);
    expect(queryAll(".modal")).toHaveLength(0);
});

test("precedingIndex puts the tile after the one that precedes it", () => {
    expect(precedingIndex(3, 0)).toBe(null);
    expect(precedingIndex(3, 1)).toBe(0);
    expect(precedingIndex(0, 2)).toBe(2);
});

test("precedingXmlid skips tiles without an identifier", () => {
    const ids = ["a", null, "c", null, "e"];
    expect(precedingXmlid(ids, 4, 3)).toBe("c");
    expect(precedingXmlid(ids, 4, 1)).toBe("a");
    expect(precedingXmlid(ids, 0, 3)).toBe("c");
    expect(precedingXmlid(ids, 2, 1)).toBe("a");
    expect(precedingXmlid(ids, 4, 0)).toBe(null);
});

test("A33t touch drag reorders", async () => {
    mockTouch(true);
    const { saved } = await mountHome();
    const { moveTo, drop } = await drag(".o_app:eq(3)");
    await advanceTime(500);
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    await moveTo(".o_app:eq(3)", offsetFromCentre(".o_app:eq(3)", 12));
    await animationFrame();
    expect(".o_app:eq(3)").toHaveClass("o_dragged_app");
    await moveTo(".o_app:eq(0)");
    await drop();
    await animationFrame();
    expect(captions()[0]).toBe("Contacts");
    expect(JSON.parse(saved[0].homemenu_config)[0]).toBe("cws_test.app_contacts");
});

test("A34t touch scroll during the hold cancels", async () => {
    mockTouch(true);
    const { saved } = await mountHome();
    const { cancel } = await drag(".o_app:eq(3)");
    await advanceTime(200);
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "touch" }));
    await advanceTime(400);
    await animationFrame();
    expect(".o_dragged_app").toHaveCount(0);
    expect(saved).toHaveLength(0);
    await cancel();
});
