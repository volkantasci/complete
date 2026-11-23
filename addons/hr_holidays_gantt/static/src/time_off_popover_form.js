// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { FormController } from "@web/views/form/form_controller";
import { formView } from "@web/views/form/form_view";

/** The key of the popover's own form variant in the views registry (named by the `jsClass` prop). */
export const POPOVER_FORM_CLASS = "hhg_time_off_popover_form";

/**
 * The controller of the popover's body (R4, R5): the Community's form without a control panel, a
 * status bar, a button or a pager, handed to the popover as its body. It is chosen by the `jsClass`
 * prop of the `View` that the popover mounts, never by the arch, because the creation form of a
 * later part reuses the same arch.
 *
 * - It hands its model to the popover (`onModelReady`), which keeps the root record (`isDirty`,
 *   `data`, `save`, `discard`, `load`).
 * - The record is editable when its state is one of `editableStates` (R5), read-only otherwise;
 *   the rule runs after every load, so that a reload after Edit turns the form to edit mode.
 * - Nothing leaves the form by itself: closing the popover drops a pending change (R23, D4), so
 *   the page's hidden state, the page's unload and the web client's leave check save nothing.
 */
export class TimeOffPopoverFormController extends FormController {
    static template = "hr_holidays_gantt.TimeOffPopoverForm";

    setup() {
        super.setup();
        // the form's own `props` keep the keys the Community controller declares
        this.hhgProps = useProps({
            onModelReady: t.function().optional(),
            editableStates: t.array(t.string()).optional(),
        });
        onMounted(() => {
            this.hhgProps.onModelReady?.(this.model);
            this.focusType();
        });
    }

    get modelParams() {
        const params = super.modelParams;
        params.config.mode = "readonly";
        params.useSendBeaconToSaveUrgently = false;
        return params;
    }

    /** R5: edit mode for the states the popover names, as soon as the record is loaded. */
    async onRootLoaded(root) {
        const states = this.hhgProps.editableStates || [];
        const record = root || this.model.root;
        if (this.canEdit && !this.props.readonly && states.includes(record.data.state)) {
            record._switchMode("edit");
        }
    }

    onRootUpdated() {}

    async beforeVisibilityChange() {}

    async beforeUnload() {}

    async beforeLeave() {
        return true;
    }

    /** R23: the focus lies on the time type, its link (read-only) or its input (edit). */
    focusType() {
        const element = this.rootRef()?.querySelector(
            ".o_hhg_pop_type a, .o_hhg_pop_type input"
        );
        element?.focus();
    }
}

registry.category("views").add(POPOVER_FORM_CLASS, {
    ...formView,
    Controller: TimeOffPopoverFormController,
});
