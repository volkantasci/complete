// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { TimelineController } from "@web_gantt/timeline_controller";

/**
 * R6: the controller of both time-off views. It has no New button: its template leaves the
 * button slot of the control panel empty. `canCreate` stays what the framework computes (the
 * arch's `create` action, not inside a dialog), because the selection bar's add button reads it:
 * 002e3 turns that button on through `hhgInputs` and the arch; the New button stays hidden.
 */
export class TimeOffController extends TimelineController {
    static template = "hr_holidays_gantt.TimeOffController";
}
