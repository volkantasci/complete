// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {
    Component,
    onMounted,
    onWillStart,
    onWillUnmount,
    signal,
    t,
    untrack,
    useProps,
    useScope,
} from "@odoo/owl";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { useSubEnv } from "@web/owl2/utils";
import { _t } from "@web/core/l10n/translation";
import { BackButtonManager, useService } from "@web/core/utils/hooks";
import { View } from "@web/views/view";
import { POPOVER_FORM_CLASS } from "./time_off_popover_form";

/** The Community's form of a request that the popover shows by default (R4; 002e3 names it in the arch). */
export const POPOVER_FORM_REF = "hr_holidays_gantt.hr_leave_gantt_multi_create_view";

/** The management action whose form the expand icon opens (R9 point 1). */
export const MANAGEMENT_ACTION = "hr_holidays.hr_leave_action_action_approve_department";

/** The states in which the leave popover is editable (R5). */
export const EDITABLE_STATES = ["confirm"];

/** The model whose methods the footer calls (the report's lines carry the request's id, R9, D3). */
export const LEAVE_MODEL = "hr.leave";

/**
 * The leave popover of the time-off views (R2 to R5): a frame with a grey header (the title, the
 * expand and the close icons), the Community's form of the request as its body and a footer that
 * a later part fills with the buttons (R6). The variant `leave` shows the request's own form,
 * editable To Approve; the variant `report` the report's default form, read-only.
 *
 * It keeps the root record of its form (`leaveRecord`) for the footer: `dirty`, `data.state`,
 * the flags `data.can_*`, `save()`, `discard()`, `load()`. The footer's buttons (R6 to R10) call
 * the Community's methods of the request with the user's rights; a refusal is left to the error
 * service (its dialog shows over the popover, which stays open and unchanged).
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
        this.employeeName = signal("");
        this.employeeKey = null;
        onWillStart(() => this.readEmployeeName());
        // the footer follows the record (its state, its flags, a pending change): the form tells
        // when the record loads or changes (`onRecordState`), and the buttons are worked out then
        this.footerShown = signal([]);
        this.useSheetBack();
    }

    /**
     * R21 point 4: the device's Back closes the sheet and stays on the view. The framework's popover
     * does it by itself on a mobile operating system (its back-button hook); a small window of
     * another system gets the same trap of the history here (the framework's own manager).
     */
    useSheetBack() {
        if (!this.ui.isSmall || isMobileOS()) {
            return;
        }
        const manager = new BackButtonManager();
        const scope = useScope();
        onMounted(() => manager.addListener(scope, () => this.onSheetBack()));
        onWillUnmount(() => manager.removeListener(scope));
    }

    /** The record has loaded or changed: the footer's buttons follow it (R6). */
    onRecordState(record = this.leaveRecord) {
        // only a change of the buttons renders the popover again: its render gives the form its
        // props again, which loads the form, which tells the popover (a loop otherwise); the
        // first load comes before the popover is on the page, so the buttons are there at once
        const buttons = this.computeFooterButtons(record);
        const names = (list) => list.map((button) => button.name).join(" ");
        if (names(buttons) !== names(untrack(() => this.footerShown()))) {
            this.footerShown.set(buttons);
        }
    }

    /**
     * Back with a dialog open over the sheet closes the dialog only (the framework's dialogs take
     * Back only on a mobile OS, so here the topmost one is dismissed by its own close button).
     */
    onSheetBack() {
        const modal = [...document.querySelectorAll(".o_dialog .modal")].at(-1);
        const dismiss = modal?.querySelector(".btn-close");
        if (dismiss) {
            dismiss.click();
        } else if (!modal) {
            this.props.close();
        }
    }

    /** The employee's name, read from the request (the form's invisible field carries none). */
    async readEmployeeName() {
        const [row] = await this.orm.read(
            this.props.model.resModel,
            [this.props.record.resId],
            ["employee_id"]
        );
        this.employeeKey = row?.employee_id?.[0] || false;
        this.employeeName.set(row?.employee_id?.[1] || "");
    }

    /** The form's model is ready: the name is read again when a reload brings another employee. */
    onModelReady(model) {
        this.formModel.set(model);
        this.onRecordState();
        model.bus.addEventListener("update", () => {
            // the report's form carries no employee field: the name read at the start stays
            const data = model.root?.data;
            if (!data || !("employee_id" in data)) {
                return;
            }
            const id = data.employee_id?.id || false;
            if (id !== this.employeeKey) {
                this.readEmployeeName();
            }
        });
    }

    /**
     * R23, D4: Escape closes the popover in one press, also from a field whose own dropdown is
     * open (the autocomplete stops the key's propagation), and drops the pending change.
     */
    onKeydownCapture(ev) {
        if (ev.key === "Escape") {
            ev.stopPropagation();
            ev.preventDefault();
            this.props.close();
        }
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
        const name = this.employeeName() || _t("Employee");
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
        // one object for the popover's whole life: new props would load the form again at each
        // render of the popover
        this._viewProps ||= this.makeViewProps();
        return this._viewProps;
    }

    makeViewProps() {
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
            onModelReady: (model) => this.onModelReady(model),
            onRecordState: (record) => this.onRecordState(record),
        };
    }

    /** The form the body shows: the arch's `multi_create_view` when it names one (002e3), else ours. */
    get formRef() {
        return this.props.archInfo.multiCreateView || POPOVER_FORM_REF;
    }

    /** The model whose methods the buttons call: the request's own, also for the report's lines. */
    get leaveModel() {
        return this.isReport ? LEAVE_MODEL : this.props.model.resModel;
    }

    /**
     * R6: the footer's buttons, left to right, absent where not shown. The flags are the
     * Community's, read for the user with the record; the report's lines carry none (Delete alone,
     * R9 point 2).
     */
    get footerButtons() {
        return this.footerShown();
    }

    computeFooterButtons(record) {
        if (!record) {
            return [];
        }
        const buttons = {
            edit: { name: "edit", label: _t("Edit"), icon: "edit", style: "btn-primary" },
            save: { name: "save", label: _t("Save"), icon: "save", style: "btn-primary" },
            approve: {
                name: "approve",
                label: _t("Approve"),
                icon: "thumb_up",
                style: "btn-success",
            },
            refuse: { name: "refuse", label: _t("Refuse"), icon: "close", style: "btn-danger" },
            discard: {
                name: "discard",
                label: _t("Discard"),
                icon: "undo",
                style: "btn-secondary ms-auto",
            },
            delete: {
                name: "delete",
                label: _t("Delete"),
                icon: "delete",
                style: "btn-danger ms-auto",
            },
        };
        if (this.isReport) {
            return [buttons.delete];
        }
        const data = record.data;
        const waiting = data.state === "confirm";
        const approve = waiting && Boolean(data.can_approve || data.can_validate);
        const refuse = waiting && Boolean(data.can_refuse);
        const dirty = Boolean(record.dirty);
        const shown = [];
        if (data.can_back_to_approve && !waiting) {
            shown.push(buttons.edit);
        }
        if (dirty && !approve && !refuse) {
            shown.push(buttons.save);
        }
        if (approve) {
            shown.push(buttons.approve);
        }
        if (refuse) {
            shown.push(buttons.refuse);
        }
        shown.push(dirty ? buttons.discard : buttons.delete);
        return shown;
    }

    /** A button of the footer: one write at a time, whatever the number of presses. */
    async onFooterButton(name) {
        if (this.busy) {
            return;
        }
        this.busy = true;
        try {
            await this[`${name}Request`]();
        } finally {
            this.busy = false;
        }
    }

    /** The view loads again after a write; the popover stays open (R2 point 3, R-C-6). */
    reloadView() {
        return this.props.onChanged ? this.props.onChanged() : this.props.model.reload();
    }

    /** The Community's method `method` on the request, with the user's rights. */
    callRequest(method) {
        return this.orm.call(this.leaveModel, method, [[this.props.record.resId]]);
    }

    /** R7: back to approval; the request loads again in edit mode (R5) and the view reloads. */
    async editRequest() {
        await this.callRequest("action_back_to_approval");
        await Promise.all([this.leaveRecord.load(), this.reloadView()]);
        this.onRecordState();
    }

    /** R8 point 1: the pending change is written, then the request and the view load again. */
    async saveRequest() {
        if (!(await this.leaveRecord.save())) {
            return;
        }
        this.onRecordState();
        await this.reloadView();
    }

    /** R8 point 2: the stored values come back, and the view reloads. */
    async discardRequest() {
        await this.leaveRecord.discard();
        this.onRecordState();
        await this.reloadView();
    }

    /**
     * R8 points 3 and 4: a pending change is saved first (a refused save ends it here), then the
     * Community's approval or refusal; the request loads again, read-only, with the view.
     */
    async decide(method) {
        const record = this.leaveRecord;
        let saved = false;
        if (await record.isDirty()) {
            if (!(await record.save())) {
                return;
            }
            saved = true;
        }
        try {
            await this.callRequest(method);
        } catch (error) {
            if (saved) {
                // the change was written: the view shows it, the Community's error shows too
                await this.reloadView();
                this.onRecordState();
            }
            throw error;
        }
        await Promise.all([record.load(), this.reloadView()]);
        this.onRecordState();
    }

    approveRequest() {
        return this.decide("action_approve");
    }

    refuseRequest() {
        return this.decide("action_refuse");
    }

    /** R10: the request is deleted; accepted, the popover closes and the view reloads. */
    async deleteRequest() {
        const model = this.props.model;
        await this.orm.unlink(this.leaveModel, [this.props.record.resId]);
        this.props.close();
        await model.reload();
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
