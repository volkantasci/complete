// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { MultiSelectionButtons } from "@web/views/view_components/multi_selection_buttons";

/**
 * The count box, Add, Plan and Delete shown while cells are picked (002b3 R8). The Community
 * component does the rest (the box, the cross, the popover of Add, the confirmation of Delete);
 * this one adds Plan and hides Add and Delete when the view's permissions do not offer them
 * (decision D3): the controller's reactive object carries `canAdd`, `canPlan`, `canDelete` and
 * `onPlan` besides the Community keys.
 */
export class TimelineSelectionButtons extends MultiSelectionButtons {
    static template = "web_gantt.TimelineSelectionButtons";

    /** The template form is only loaded when Add is offered (no request for nothing). */
    async loadMultiCreateView() {
        if (this.props.reactive.canAdd) {
            await super.loadMultiCreateView();
        }
    }
}
