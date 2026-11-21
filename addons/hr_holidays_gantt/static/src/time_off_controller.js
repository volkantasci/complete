// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { TimelineController } from "@web_gantt/timeline_controller";

/** R6: the controller of both time-off views: no New button (the arch keeps `create` on). */
export class TimeOffController extends TimelineController {
    get canCreate() {
        return false;
    }
}
