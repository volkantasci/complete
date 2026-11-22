// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";
import { router } from "@web/core/browser/router";
import { useBus } from "@web/core/utils/hooks";
import { TimelineController } from "@web_gantt/timeline_controller";

/**
 * R3 point 1: the Overview returns the management action reduced to Gantt and marks it with
 * this key of its own. The web client keeps the action it opened in the session and restores it
 * when the page is reloaded; a marked one is dropped from there, so that a reload loads the
 * management action from the server with its own defaults and its view switcher.
 */
export const HHG_OVERVIEW_MARKER = "hhg_overview";

/** Removes the stored action when it carries the marker; any other action stays. */
export function hhgForgetOverviewAction() {
    const stored = browser.sessionStorage.getItem("current_action");
    if (!stored) {
        return;
    }
    try {
        if (JSON.parse(stored)?.[HHG_OVERVIEW_MARKER]) {
            browser.sessionStorage.removeItem("current_action");
            // the management action opens on its List view by default: the address names the
            // Gantt view the user is looking at, so the reload shows it
            router.pushState({ view_type: "gantt" });
        }
    } catch {
        // not a stored action: nothing to forget
    }
}

/** R6: the controller of both time-off views: no New button (the arch keeps `create` on). */
export class TimeOffController extends TimelineController {
    setup() {
        super.setup();
        // the action plugin stores the action once its controller is mounted, then announces it
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", () => hhgForgetOverviewAction());
    }

    get canCreate() {
        return false;
    }
}
