// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { Component, t, useProps, xml } from "@odoo/owl";
import { describe, expect, test } from "@odoo/hoot";
import { click } from "@odoo/hoot-dom";
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

    name = fields.Char();
    is_timer_running = fields.Boolean();

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
