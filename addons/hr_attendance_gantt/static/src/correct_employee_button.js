// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * R8: the link that ends the contract warning, on the employee field of an attendance form. It
 * writes nothing itself and opens the employee's form in the main window, as a new step of the
 * breadcrumb.
 *
 * - In a dialog (the creation or record dialog of the Gantt view) the record is discarded and the
 *   dialog closed first, so nothing is saved.
 * - On a full-page form the action service leaves the form as it leaves any form: it saves the
 *   form's valid changes first (the Community's rule).
 */
export class EmployeeCorrectionLink extends Component {
    static template = "hr_attendance_gantt.EmployeeCorrectionLink";
    props = useProps({ ...standardFieldProps });

    setup() {
        this.action = useService("action");
    }

    get employeeId() {
        return this.props.record.data[this.props.name]?.id || false;
    }

    async onClick() {
        const resId = this.employeeId;
        if (!resId) {
            return;
        }
        if (this.env.inDialog) {
            await this.props.record.discard();
            await this.env.dialogData.close();
        }
        await this.action.doAction({
            type: "ir.actions.act_window",
            name: _t("Employee"),
            res_model: "hr.employee",
            res_id: resId,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

export const employeeCorrectionLink = {
    displayName: _t("Correct employee"),
    supportedTypes: ["many2one"],
    component: EmployeeCorrectionLink,
};

const WIDGET_KEY = "correct_employee_button";
registry.category("fields").add(WIDGET_KEY, employeeCorrectionLink);
