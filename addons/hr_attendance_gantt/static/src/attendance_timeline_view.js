// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { employeeTimelineView } from "@hr_gantt/employee_timeline_view";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { TimelineSearchModel } from "@web_gantt/timeline_view";
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

/** R5: the groupings the attendance Gantt views do not offer, by the name the search view gives. */
export const HIDDEN_GROUPINGS = ["groupby_month", "groupby_week"];

/**
 * The search model of the attendance Gantt views: the date groupings of R5 are not offered by the
 * menu. The items stay in the model, which the other views of the same action take over when the
 * user switches (they keep "Date"); only this view's menus leave them out. A default or a
 * favourite that names one still finds its item, and the view drops the grouping (002a R19).
 * Another grouping on a date keeps its place.
 */
export class AttendanceSearchModel extends TimelineSearchModel {
    _enrichItem(searchItem) {
        if (
            ["groupBy", "dateGroupBy"].includes(searchItem.type) &&
            HIDDEN_GROUPINGS.includes(searchItem.name)
        ) {
            return null;
        }
        return super._enrichItem(searchItem);
    }
}

/**
 * The attendance variant of the Gantt view, chosen by `js_class="attendance_gantt"` (R11).
 * 002d3 builds on it: it overrides the renderer's `onPillClick` and `onPillDoubleClick` and the
 * editor's `openRecord`, and reads the form of the creation from the arch.
 */
export const attendanceTimelineView = {
    ...employeeTimelineView,
    ArchParser: attendanceArchParser,
    SearchModel: AttendanceSearchModel,
    Model: AttendanceTimelineModel,
    Renderer: AttendanceTimelineRenderer,
};

registry.category("views").add("attendance_gantt", attendanceTimelineView);
