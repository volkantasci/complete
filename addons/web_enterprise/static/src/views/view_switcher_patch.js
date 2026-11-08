// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { ControlPanel } from "@web/search/control_panel/control_panel";

/**
 * Memory of the last view switch: `{ actionJsId, actionId, index }`, where `index` is the
 * position of the view the user left. It lives only while a switch is in flight.
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
            memory.actionId === this.env.config.actionId;
        this.cwsFromIndex = sameAction && memory.index < entries.length ? memory.index : this.cwsActiveIndex;
        onMounted(() => {
            switchMemory = null;
        });
    },

    switchView(viewType, newWindow) {
        if (newWindow) {
            // a new tab leaves this window as it is: nothing to remember
            return super.switchView(...arguments);
        }
        const action = this.actionService.currentController?.action;
        const memory = {
            actionJsId: action?.jsId,
            actionId: this.env.config.actionId,
            index: this.cwsActiveIndex,
        };
        switchMemory = memory;
        const clear = () => {
            // a switch that did not happen (unsaved record, error) must not slide a later panel
            if (switchMemory === memory) {
                switchMemory = null;
            }
        };
        const promise = this.actionService.switchView(viewType, {}, {});
        promise.then(clear, clear);
        return promise;
    },
});
