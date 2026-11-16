// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { _t } from "@web/core/l10n/translation";
import { writeShowConnectors } from "./timeline_dependency_prefs";

export const METHOD_LABELS = {
    manual: _t("Manual Reschedule"),
    consumeBuffer: _t("Auto-Reschedule (Use Buffer)"),
    maintainBuffer: _t("Auto-Reschedule (Keep Buffer)"),
};

/**
 * The method button of the control bar and its menu (002c R13, R14): the three rescheduling
 * methods, then the switch "Show dependencies". Shown where arrows are (a dependency field, no
 * sample data, no phone), edit permission or not. The method goes through the model (stored at
 * once, the data reloaded half a second later); the switch is the controller's `dependencies`
 * object, stored per view and action.
 */
export class TimelineRescheduleMenu extends Component {
    static template = "web_gantt.TimelineRescheduleMenu";
    static components = { Dropdown, DropdownItem };
    props = useProps({
        model: t.object(),
        dependencies: t.object(),
    });

    setup() {
        this.state = useDropdownState();
        this.methods = Object.keys(METHOD_LABELS).map((method) => ({
            method,
            label: METHOD_LABELS[method],
        }));
    }

    get chosenLabel() {
        return METHOD_LABELS[this.props.model.chosenMethod];
    }

    chooseMethod(method) {
        this.props.model.chooseRescheduleMethod(method);
    }

    toggleDependencies() {
        const { viewId, actionId } = this.env.config;
        const shown = !this.props.dependencies.shown;
        this.props.dependencies.shown = shown;
        writeShowConnectors(viewId, actionId, shown);
    }
}
