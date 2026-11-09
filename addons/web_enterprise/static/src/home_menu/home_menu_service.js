// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { proxy } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

const HOME_TAG = "menu";
const BACKGROUND_CLASS = "o_home_menu_background";

/**
 * D2 and D8 (R45): the Community tour step that opens the apps menu must leave the home menu
 * where it is, and must not wait for anything when a tour meets it there. The tour utilities
 * live in the back-end bundle of the optional `web_tour` module, which is not a dependency: the
 * step is adapted only if its module is loaded, right when it starts (a tour may compute its
 * steps before any service starts).
 *
 * The tour engines evaluate a step's `isActive` list on every visit, in automatic and in
 * interactive tours, and move on past a step for which a selector of that list finds nothing.
 * The step therefore gains the selector of "no home menu shown": while the home menu is shown
 * the step is not played at all, and an interactive tour never shows a pointer for it.
 * Inside an application the step is played as before: its target is the grid button.
 * The trigger keeps an alternative for one moment only, the step reached right after a click
 * that asked for the home menu, before the page has the marker class: the page itself, whose
 * click does nothing, then stands in for the grid button, which would close the menu again.
 */
export function adaptTourAppsMenuStep(stepUtils) {
    patch(stepUtils, {
        showAppsMenuItem() {
            const step = super.showAppsMenuItem(...arguments);
            return {
                ...step,
                isActive: [...(step.isActive || []), `body:not(.${BACKGROUND_CLASS})`],
                trigger: `${step.trigger}:not(.o_menu_toggle_back), body.${BACKGROUND_CLASS}`,
            };
        },
    });
}

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

export const cwsHomeMenuService = {
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

const serviceRegistry = registry.category("services");
serviceRegistry.add("home_menu", cwsHomeMenuService);

// Hook for D2: adapt the Community step helper as soon as the tour utilities exist.
const TOUR_UTILS = "@web_tour/tour_utils";
const loadedUtils = odoo.loader.modules.get(TOUR_UTILS);
if (loadedUtils?.stepUtils) {
    adaptTourAppsMenuStep(loadedUtils.stepUtils);
} else {
    odoo.loader.bus.addEventListener("module-started", function adaptWhenStarted({ detail }) {
        if (detail.moduleName === TOUR_UTILS) {
            odoo.loader.bus.removeEventListener("module-started", adaptWhenStarted);
            adaptTourAppsMenuStep(detail.module.stepUtils);
        }
    });
}
