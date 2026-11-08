// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { proxy } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

const HOME_TAG = "menu";

/** @returns {boolean} the request designates the home menu client action */
function isHomeRequest(request) {
    return request === HOME_TAG || (request?.type === "ir.actions.client" && request.tag === HOME_TAG);
}

// R2 (ruling R-O11): showing the home menu while it is the current screen changes
// nothing. The action plugin binds `doAction` on the instance in `setup`, so the
// wrapper is installed right after it.
patch(ActionPlugin.prototype, {
    setup() {
        super.setup(...arguments);
        const doAction = this.doAction;
        this.doAction = (request, ...rest) => {
            if (isHomeRequest(request) && this.currentController?.action?.tag === HOME_TAG) {
                return Promise.resolve();
            }
            return doAction(request, ...rest);
        };
    },
});

export const homeMenuService = {
    dependencies: ["action", "menu"],
    start(env, { action }) {
        const state = proxy({ hasHomeMenu: false, hasBackgroundAction: false });
        // requests run one after the other
        let queue = Promise.resolve();

        async function run(show) {
            show ??= !state.hasHomeMenu;
            if (show && !state.hasHomeMenu) {
                await action.doAction(HOME_TAG);
            } else if (!show && state.hasHomeMenu && state.hasBackgroundAction) {
                await action.restore();
            } else {
                return;
            }
            // one tick, so that the address is up to date
            await new Promise((resolve) => browser.setTimeout(resolve));
        }

        return {
            get hasHomeMenu() {
                return state.hasHomeMenu;
            },
            get hasBackgroundAction() {
                return state.hasBackgroundAction;
            },
            /**
             * @param {boolean} [show] default: the opposite of the current state
             */
            toggle(show) {
                const result = queue.then(() => run(show));
                queue = result.catch(() => {});
                return result;
            },
            /** Called by the `menu` client action when it is shown or hidden. */
            setShown(hasHomeMenu, hasBackgroundAction) {
                state.hasHomeMenu = hasHomeMenu;
                state.hasBackgroundAction = hasHomeMenu && hasBackgroundAction;
                env.bus.trigger("HOME-MENU:TOGGLED", hasHomeMenu);
            },
        };
    },
};

registry.category("services").add("home_menu", homeMenuService);
