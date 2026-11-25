// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";

/**
 * R4 point 2: the small question mark beside the clock icon of an hour request. Its tooltip is the
 * Community's help of the field the arch names (`<widget name="hhg_field_help" field="..."/>`).
 */
export class TimeOffFieldHelp extends Component {
    static template = "hr_holidays_gantt.TimeOffFieldHelp";

    props = useProps({
        record: t.object(),
        fieldName: t.string(),
        readonly: t.boolean().optional(),
    });

    get help() {
        return this.props.record.fields[this.props.fieldName]?.help || "";
    }
}

registry.category("view_widgets").add("hhg_field_help", {
    component: TimeOffFieldHelp,
    extractProps: ({ attrs }) => ({ fieldName: attrs.field }),
});
