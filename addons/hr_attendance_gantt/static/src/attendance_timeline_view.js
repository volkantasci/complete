// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { employeeTimelineView } from "@hr_gantt/employee_timeline_view";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { AttendanceTimelineModel } from "./attendance_timeline_model";
import { AttendanceTimelineRenderer } from "./attendance_timeline_renderer";

export { AttendanceTimelineModel, AttendanceTimelineRenderer };

/**
 * R25, A59: a click on an empty cell opens the create dialog, not the plan dialog. The view
 * definition names no `plan` option (A5), so the variant reads an absent option as off; an
 * arch that names `plan` (a later module's inheritance) is read as the Gantt view reads it.
 */
export const attendanceArchParser = {
    parse(arch, fields) {
        const archInfo = parseTimelineArch(arch, fields);
        const root = arch.documentElement || arch;
        return root.hasAttribute("plan") ? archInfo : { ...archInfo, canPlan: false };
    },
};

/**
 * The attendance variant of the Gantt view, chosen by `js_class="attendance_gantt"` (R11).
 * 002d3 builds on it: it overrides the renderer's `onPillClick` and `onPillDoubleClick` and the
 * editor's `openRecord`, and reads the form of the creation from the arch.
 */
export const attendanceTimelineView = {
    ...employeeTimelineView,
    ArchParser: attendanceArchParser,
    Model: AttendanceTimelineModel,
    Renderer: AttendanceTimelineRenderer,
};

registry.category("views").add("attendance_gantt", attendanceTimelineView);
