// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { Component, t, useProps, xml } from "@odoo/owl";
import { describe, expect, test } from "@odoo/hoot";
import { click, queryOne } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    onRpc,
} from "@web/../tests/web_test_helpers";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { TimerToggleButton } from "@timer/timer_toggle_button/timer_toggle_button";

describe.current.tags("desktop");

class TimerTest extends models.Model {
    _name = "timer.test";

    name = fields.Char({ required: true });
    is_timer_running = fields.Boolean({ string: "Active" });

    _records = [
        { id: 1, name: "idle", is_timer_running: false },
        { id: 2, name: "busy", is_timer_running: true },
    ];

    action_timer_start(ids) {
        expect.step("action_timer_start");
        this.write(ids, { is_timer_running: true });
        return true;
    }

    action_timer_stop(ids) {
        expect.step("action_timer_stop");
        this.write(ids, { is_timer_running: false });
        return 5;
    }
}

defineMailModels();
defineModels([TimerTest]);

// test-only list widget embedding the exported button
class ToggleHost extends Component {
    static template = xml`<TimerToggleButton name="this.props.name" record="this.props.record" context="{ foo: 'bar' }"/>`;
    static components = { TimerToggleButton };
    props = useProps({ ...standardFieldProps });
}
registry.category("fields").add("test_timer_toggle", {
    component: ToggleHost,
    supportedTypes: ["boolean"],
});

const LIST = `<list><field name="name"/><field name="is_timer_running" widget="test_timer_toggle"/></list>`;
const BUTTON = (row) => `.o_data_row:eq(${row}) .o_timer_toggle_button`;

test("U8: toggle calls start then stop and reloads", async () => {
    onRpc("timer.test", "action_timer_start", ({ kwargs }) => {
        expect.step(`context:${kwargs.context.foo}`);
    });
    let loads = 0;
    onRpc("web_search_read", () => {
        loads++;
    });
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    expect(loads).toBe(1);
    await contains(BUTTON(0)).click();
    expect.verifySteps(["context:bar", "action_timer_start"]);
    expect(loads).toBe(2);
    // the button follows the reloaded value, it never flips on its own
    expect(BUTTON(0)).toHaveClass("btn-danger");
    await contains(BUTTON(0)).click();
    expect.verifySteps(["action_timer_stop"]);
    expect(loads).toBe(3);
    expect(BUTTON(0)).toHaveClass("btn-primary");
});

test("U8: the button never flips its own state", async () => {
    onRpc("timer.test", "action_timer_start", () => {
        // the server does not change anything
        return true;
    });
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    await contains(BUTTON(0)).click();
    expect(BUTTON(0)).toHaveClass("btn-primary");
});

test("U9: toggle tooltips and labels", async () => {
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    expect(BUTTON(0)).toHaveClass("btn-primary");
    expect(BUTTON(0)).toHaveAttribute("title", "Start");
    expect(BUTTON(0)).toHaveAttribute("aria-label", "Start");
    expect(`${BUTTON(0)} i`).toHaveAttribute("data-icon", "play_circle");
    expect(BUTTON(1)).toHaveClass("btn-danger");
    expect(BUTTON(1)).toHaveAttribute("title", "Stop");
    expect(BUTTON(1)).toHaveAttribute("aria-label", "Stop");
    expect(`${BUTTON(1)} i`).toHaveAttribute("data-icon", "stop_circle");
});

test("U8: click does not open the row", async () => {
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    let reached = 0;
    const listener = () => reached++;
    document.addEventListener("click", listener);
    try {
        await click(BUTTON(0));
        await animationFrame();
    } finally {
        document.removeEventListener("click", listener);
    }
    expect(reached).toBe(0);
    expect(".o_list_renderer").toHaveCount(1);
    expect(".o_data_row.o_selected_row").toHaveCount(0);
    expect.verifySteps(["action_timer_start"]);
});

test("U8: a second click while the call runs is ignored", async () => {
    const pending = Promise.withResolvers();
    onRpc("timer.test", "action_timer_start", async () => {
        expect.step("start-call");
        await pending.promise;
        return true;
    });
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    await click(BUTTON(0));
    await click(BUTTON(0));
    await animationFrame();
    pending.resolve();
    await animationFrame();
    expect.verifySteps(["start-call"]);
});

test("V1: the button has a visible background in both states", async () => {
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    for (const row of [0, 1]) {
        const el = queryOne(BUTTON(row));
        expect(getComputedStyle(el).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
        expect(getComputedStyle(el).backgroundColor).not.toBe("transparent");
    }
});

const FORM = `<form><field name="name"/><field name="is_timer_running" widget="test_timer_toggle"/></form>`;
const FORM_BUTTON = ".o_form_view .o_timer_toggle_button";

test("RW3: unsaved form edits are saved before the timer action", async () => {
    onRpc("web_save", ({ args }) => {
        expect.step(`web_save:${args[1].name}`);
    });
    await mountView({ type: "form", resModel: "timer.test", resId: 1, arch: FORM });
    await contains(".o_field_widget[name=name] input").edit("renamed", { confirm: false });
    await contains(FORM_BUTTON).click();
    expect.verifySteps(["web_save:renamed", "action_timer_start"]);
    expect(".o_field_widget[name=name] input").toHaveValue("renamed");
    expect(FORM_BUTTON).toHaveClass("btn-danger");
});

test("RW3: no save when nothing changed", async () => {
    onRpc("web_save", () => {
        expect.step("web_save");
    });
    await mountView({ type: "form", resModel: "timer.test", resId: 1, arch: FORM });
    await contains(FORM_BUTTON).click();
    expect.verifySteps(["action_timer_start"]);
    await mountView({ type: "list", resModel: "timer.test", arch: LIST });
    await contains(BUTTON(1)).click();
    expect.verifySteps(["action_timer_stop"]);
});

test("RW3: an invalid record is not acted on", async () => {
    onRpc("web_save", () => {
        expect.step("web_save");
    });
    await mountView({ type: "form", resModel: "timer.test", resId: 1, arch: FORM });
    await contains(".o_field_widget[name=name] input").edit("", { confirm: false });
    await contains(FORM_BUTTON).click();
    expect.verifySteps([]);
    expect(".o_field_invalid").toHaveCount(1);
    expect(FORM_BUTTON).toHaveClass("btn-primary");
});
