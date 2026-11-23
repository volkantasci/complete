// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onWillStart, signal, t, useProps } from "@odoo/owl";
import { useSubEnv } from "@web/owl2/utils";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { View } from "@web/views/view";
import { POPOVER_FORM_CLASS } from "./time_off_popover_form";

/** The Community's form of a request that the popover shows by default (R4; 002e3 names it in the arch). */
export const POPOVER_FORM_REF = "hr_holidays_gantt.hr_leave_gantt_multi_create_view";

/** The management action whose form the expand icon opens (R9 point 1). */
export const MANAGEMENT_ACTION = "hr_holidays.hr_leave_action_action_approve_department";

/** The states in which the leave popover is editable (R5). */
export const EDITABLE_STATES = ["confirm"];

/**
 * The leave popover of the time-off views (R2 to R5): a frame with a grey header (the title, the
 * expand and the close icons), the Community's form of the request as its body and a footer that
 * a later part fills with the buttons (R6). The variant `leave` shows the request's own form,
 * editable To Approve; the variant `report` the report's default form, read-only.
 *
 * It keeps the root record of its form (`leaveRecord`) for the footer: `isDirty`, `data.state`,
 * the flags `data.can_*`, `save()`, `discard()`, `load()`.
 */
export class TimeOffLeavePopover extends Component {
    static template = "hr_holidays_gantt.TimeOffLeavePopover";
    static components = { View };

    props = useProps({
        close: t.function(),
        record: t.object(),
        model: t.object(),
        archInfo: t.object(),
        editor: t.object().optional(),
        variant: t.string().optional("leave"),
        onChanged: t.function().optional(),
    });

    /** The model of the body's form, once it has loaded (a signal: the title follows its record). */
    formModel = signal(null);

    setup() {
        this.ui = useService("ui");
        // the form's widgets know they stand in the popover (the type badge, R4 point 1)
        useSubEnv({ hhgPopover: true });
        this.hhgAction = useService("action");
        this.orm = useService("orm");
        // the employee's name: the form holds the field invisible, which carries no name
        this.employeeName = "";
        onWillStart(async () => {
            const [row] = await this.orm.read(
                this.props.model.resModel,
                [this.props.record.resId],
                ["employee_id"]
            );
            this.employeeName = row?.employee_id?.[1] || "";
        });
    }

    get isReport() {
        return this.props.variant === "report";
    }

    /** The root record of the body's form (`undefined` until it has loaded). */
    get leaveRecord() {
        return this.formModel()?.root;
    }

    /** For the footer's part: the same record under the name of its other readers. */
    get hhgPopoverRecord() {
        return this.leaveRecord;
    }

    /** R3: the employee's name, a hyphen, the Community's duration text; "Employee" without one. */
    get title() {
        const record = this.leaveRecord;
        if (!record) {
            return "";
        }
        const name = this.employeeName || _t("Employee");
        return `${name} - ${record.data.duration_display || ""}`;
    }

    /** The frame's classes: ours, and 002a's sheet on the phone (R21). */
    get rootClass() {
        const classes = ["o_hhg_pop"];
        if (this.ui.isSmall) {
            // 002a's sheet: its frame, its dimmed page behind and its place (Task 7 finishes it)
            classes.push("o_tl_popover", "o_tl_popover_sheet", "o_hhg_pop_sheet");
        }
        if (this.isReport) {
            classes.push("o_hhg_pop_report");
        }
        return classes.join(" ");
    }

    /** The props of the `View` of the body: the popover's own controller by its `jsClass`. */
    get viewProps() {
        const report = this.isReport;
        return {
            type: "form",
            jsClass: POPOVER_FORM_CLASS,
            resModel: this.props.model.resModel,
            resId: this.props.record.resId,
            // the leave view's request shows the named form; the report's own default form stays
            context: report ? {} : { form_view_ref: this.formRef },
            display: { controlPanel: false },
            readonly: report,
            editableStates: report ? [] : EDITABLE_STATES,
            onModelReady: (model) => this.formModel.set(model),
        };
    }

    /** The form the body shows: the arch's `multi_create_view` when it names one (002e3), else ours. */
    get formRef() {
        return this.props.archInfo.multiCreateView || POPOVER_FORM_REF;
    }

    /** R9 point 1: the request's Community form in the current window; the popover closes. */
    async onExpand() {
        const resId = this.props.record.resId;
        this.props.close();
        await this.hhgAction.doAction(MANAGEMENT_ACTION, {
            viewType: "form",
            props: { resId },
        });
    }
}
