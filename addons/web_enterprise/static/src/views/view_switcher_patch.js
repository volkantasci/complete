// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { ControlPanel } from "@web/search/control_panel/control_panel";

/**
 * Memory of the last view switch: `{ actionJsId, actionId, viewType, index }`, where `viewType` is the
 * view asked for and `index` the position of the view the user left.
 */
let switchMemory = null;

/** Test hook: the memory as it is now. */
export function getSwitchMemory() {
    return switchMemory;
}

const controlPanelProto = ControlPanel.prototype;
patch(controlPanelProto, {
    setup() {
        super.setup(...arguments);
        const entries = this.env.config.viewSwitcherEntries || [];
        this.cwsViewCount = entries.length;
        this.cwsActiveIndex = Math.max(
            entries.findIndex((view) => view.active),
            0
        );
        // The controller on top of the stack is still the one the user switches from:
        // the new one only takes its place once it is mounted.
        const fromAction = this.actionService.currentController?.action;
        const memory = switchMemory;
        const sameAction =
            memory &&
            fromAction &&
            memory.actionJsId === fromAction.jsId &&
            memory.actionId === this.env.config.actionId &&
            memory.viewType === this.env.config.viewType;
        this.cwsFromIndex = sameAction && memory.index < entries.length ? memory.index : this.cwsActiveIndex;
        onMounted(() => {
            switchMemory = null;
        });
    },

    switchView(viewType, newWindow) {
        if (!newWindow) {
            // a new tab leaves this window as it is: nothing to remember
            const action = this.actionService.currentController?.action;
            switchMemory = {
                actionJsId: action?.jsId,
                actionId: this.env.config.actionId,
                viewType,
                index: this.cwsActiveIndex,
            };
        }
        // A switch that never happens (unsaved record, error) leaves the memory behind:
        // the next panel only uses it when it shows the view that was asked for.
        return super.switchView(...arguments);
    },
});
