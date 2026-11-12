// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, dblclick, queryAll, queryAllTexts, queryOne } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { mountView, onRpc, patchWithCleanup, MockServer } from "@web/../tests/web_test_helpers";
import { formatDateTime } from "@web/core/l10n/dates";
import { localization } from "@web/core/l10n/localization";

import { setupTimelineFixtures, timelineArch, timelineMock } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00"); // 00:30 local on D0 = 2026-11-12
    patchWithCleanup(localization, { weekStart: 7 });
});

const BUILD = 5;
const PLAN = 9;

async function mountTimeline(arch) {
    await mountView({ type: "gantt", resModel: "pill", arch });
}

const pillOf = (id) => `.o_tl_pill[data-pill-id="${id}"]`;

/** Click a pill once and wait for the 200 ms delay of the popover. */
async function openPopover(id) {
    await click(pillOf(id));
    await advanceTime(250);
    await animationFrame();
}

const POPOVER = ".o_tl_popover";

function popoverArch(templates, attrs = "", fields = "") {
    return timelineArch(
        "",
        `<popover ${attrs}>${fields}${templates ? `<templates>${templates}</templates>` : ""}</popover>`
    );
}

test("A77: default popover", async () => {
    await mountTimeline(timelineArch());
    await click(pillOf(BUILD));
    await advanceTime(150);
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    await advanceTime(100);
    await animationFrame();
    expect(POPOVER).toHaveCount(1);
    expect(`${POPOVER} .o_popover_header`).toHaveText("Build");
    const lines = queryAllTexts(`${POPOVER} .o_popover_body .o_tl_popover_line`);
    const start = formatDateTime(luxon.DateTime.local(2026, 11, 12, 9, 0));
    const stop = formatDateTime(luxon.DateTime.local(2026, 11, 14, 18, 0));
    expect(lines).toEqual([`Start: ${start}`, `Stop: ${stop}`]);
    expect(`${POPOVER} .o_tl_popover_line b`).toHaveCount(2);
    expect(`${POPOVER} .o_popover_footer button`).toHaveCount(1);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveText("Edit");
    expect(`${POPOVER} .o_tl_popover_button`).toHaveClass("btn btn-primary btn-sm");
    expect(`${POPOVER} .o_card_popover_close`).toHaveCount(1);
    // the button does nothing yet
    await click(`${POPOVER} .o_tl_popover_button`);
    await animationFrame();
    expect(POPOVER).toHaveCount(1);
    await click(`${POPOVER} .o_card_popover_close`);
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    // a click outside closes it too
    await openPopover(BUILD);
    expect(POPOVER).toHaveCount(1);
    await click(".o_tl_title_cell, .o_tl_col");
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
});

test("A78: custom popover without header", async () => {
    await mountTimeline(
        popoverArch(
            `<t t-name="popover-body"><div class="o_custom_body"><field name="x_contact"/> <field name="x_progress"/></div></t>`,
            "",
            `<field name="x_contact"/><field name="x_progress"/>`
        )
    );
    await openPopover(BUILD);
    expect(`${POPOVER} .o_custom_body`).toHaveCount(1);
    expect(`${POPOVER} .o_custom_body`).toHaveText(/Host Contact 1/);
    expect(`${POPOVER} .o_popover_header`).toHaveCount(0);
    expect(`${POPOVER} .o_tl_popover_line`).toHaveCount(0);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveText("Edit");
});

test("A79: double click opens nothing", async () => {
    await mountTimeline(timelineArch());
    await dblclick(pillOf(BUILD));
    await advanceTime(500);
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
});

test("A80: View when edit is off", async () => {
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: `<gantt date_start="date_start" date_stop="date_stop" edit="0" create="0"/>`,
    });
    await openPopover(BUILD);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveText("View");
    expect(".o_tl_button_add").toHaveCount(0);
});

test("A108: header template", async () => {
    await mountTimeline(
        popoverArch(`<t t-name="popover-header"><span class="o_custom_header">Own head</span></t>`)
    );
    await openPopover(BUILD);
    expect(`${POPOVER} .o_popover_header`).toHaveText("Own head");
    expect(`${POPOVER} .o_tl_popover_line`).toHaveCount(2);
});

test("A108: footer replace and keep", async () => {
    const button = `<button class="btn btn-secondary o_custom_btn" type="object" name="action_done">Done</button>`;
    await mountTimeline(popoverArch(`<t t-name="popover-footer">${button}</t>`));
    await openPopover(BUILD);
    expect(`${POPOVER} .o_tl_popover_button`).toHaveCount(0);
    expect(queryAllTexts(`${POPOVER} .o_popover_footer button`)).toEqual(["Done"]);
});

test("A108: footer marked to keep the default button", async () => {
    const button = `<button class="btn btn-secondary o_custom_btn" type="object" name="action_done">Done</button>`;
    await mountTimeline(popoverArch(`<t t-name="popover-footer" replace="0">${button}</t>`));
    await openPopover(BUILD);
    expect(queryAllTexts(`${POPOVER} .o_popover_footer button`)).toEqual(["Edit", "Done"]);
});

test("A108: card_id supplies the body", async () => {
    await mountTimeline(popoverArch("", `card_id="1"`));
    await openPopover(BUILD);
    expect(`${POPOVER} .o_card_view_body`).toHaveText("Host Contact 1");
    expect(`${POPOVER} .o_popover_header`).toHaveCount(0);
});

test("A108: object button runs the method, closes and reloads", async () => {
    const button = `<button class="btn btn-secondary o_custom_btn" type="object" name="action_done">Done</button>`;
    onRpc("pill", "action_done", ({ args }) => {
        MockServer.current.env["pill"].write(args[0], { x_done: true });
        return true;
    });
    await mountTimeline(
        popoverArch(`<t t-name="popover-footer">${button}</t>`, "", `<field name="x_done"/>`)
    );
    await openPopover(BUILD);
    const loads = timelineMock.calls.length;
    await click(`${POPOVER} .o_custom_btn`);
    await advanceTime(500);
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    expect(timelineMock.calls.length).toBe(loads + 1);
    expect(MockServer.current.env["pill"].find((r) => r.id === BUILD).x_done).toBe(true);
});

test("A109: clicking another pill swaps popovers", async () => {
    await mountTimeline(timelineArch());
    await openPopover(BUILD);
    expect(`${POPOVER} .o_popover_header`).toHaveText("Build");
    await click(pillOf(PLAN));
    await animationFrame();
    expect(POPOVER).toHaveCount(0);
    await advanceTime(250);
    await animationFrame();
    expect(POPOVER).toHaveCount(1);
    expect(`${POPOVER} .o_popover_header`).toHaveText("Plan");
    expect(queryAll(".o_popover")).toHaveLength(1);
    expect(queryOne(POPOVER)).toBeVisible();
});
