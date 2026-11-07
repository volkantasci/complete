// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { TimerToggleButton } from "@timer/timer_toggle_button/timer_toggle_button";

/** Test-only list widget that embeds the timer toggle button. */
export class TimerTestToggle extends Component {
    static template = "test_timer.TimerTestToggle";
    static components = { TimerToggleButton };
    props = useProps({ ...standardFieldProps });
}

registry.category("fields").add("timer_test_toggle", {
    component: TimerTestToggle,
    displayName: _t("Timer toggle"),
    supportedTypes: ["boolean"],
});
