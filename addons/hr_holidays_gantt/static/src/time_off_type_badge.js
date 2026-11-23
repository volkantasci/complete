// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { patch } from "@web/core/utils/patch";
import { Many2OneWorkEntryTypeField } from "@hr_work_entry/components/work_entry_type_field/work_entry_type_field";

/**
 * R4 point 1: in the leave popover, the badge of a type without a code holds the type's name (the
 * badge's own style cuts it at 10 characters). Elsewhere the Community's badge stays as it is:
 * the popover marks its environment (`hhgPopover`).
 */
patch(Many2OneWorkEntryTypeField.prototype, {
    get workEntryTypeData() {
        const data = super.workEntryTypeData;
        if (this.env.hhgPopover && data && !data.display_code && data.display_name) {
            return { ...data, display_code: data.display_name };
        }
        return data;
    },
});
