// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { employeeTimelineView } from "@hr_gantt/employee_timeline_view";
import { AttendanceTimelineModel } from "./attendance_timeline_model";
import { AttendanceTimelineRenderer } from "./attendance_timeline_renderer";

export { AttendanceTimelineModel, AttendanceTimelineRenderer };

/**
 * The attendance variant of the Gantt view, chosen by `js_class="attendance_gantt"` (R11).
 * 002d3 builds on it: it overrides the renderer's `onPillClick` and `onPillDoubleClick` and the
 * editor's `openRecord`, and reads the form of the creation from the arch.
 */
export const attendanceTimelineView = {
    ...employeeTimelineView,
    Model: AttendanceTimelineModel,
    Renderer: AttendanceTimelineRenderer,
};

registry.category("views").add("attendance_gantt", attendanceTimelineView);
