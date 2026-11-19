// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { timelineView } from "@web_gantt/timeline_view";
import { EmployeeTimelineModel } from "./employee_timeline_model";
import { EmployeeTimelineRenderer } from "./employee_timeline_renderer";

export { EmployeeTimelineModel, EmployeeTimelineRenderer };

/** The employee variant of the Gantt view, chosen by `js_class="hr_gantt"` (R3). */
export const employeeTimelineView = {
    ...timelineView,
    Model: EmployeeTimelineModel,
    Renderer: EmployeeTimelineRenderer,
};

registry.category("views").add("hr_gantt", employeeTimelineView);
