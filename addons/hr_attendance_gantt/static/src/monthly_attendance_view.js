// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { serializeDateTime } from "@web/core/l10n/dates";
import { AttendanceCalendarOverview } from "@hr_attendance/components/attendance_calendar/attendance_calendar_overview";
import { TimelineController } from "@web_gantt/timeline_controller";
import { AttendanceTimelineEditor, attendanceTimelineView } from "./attendance_timeline_view";

/**
 * R4 point 2: the controller of the monthly variant lays the Community attendance overview
 * between the control bar and the grid, in the view's flow. The overview reads the employee in
 * the action's context (`active_id`) and the displayed period from the prop it is given.
 */
export class MonthlyAttendanceController extends TimelineController {
    static template = "hr_attendance_gantt.MonthlyAttendanceController";
    static components = { ...TimelineController.components, AttendanceCalendarOverview };

    /**
     * The displayed period in the browser's days, as the Community overview takes it: from 0:00
     * of the first day to the end of the last day, as server text (UTC). The object is the same
     * as long as the period and the data are the same, and a new one after every load, so that
     * the cards follow the period (Previous, Next, Today, the range menu) and the changes of
     * the attendances.
     */
    get overviewRange() {
        const { range, loadSerial } = this.data;
        const dateRange = {
            start: serializeDateTime(range.start.startOf("day")),
            end: serializeDateTime(range.stop.endOf("day")),
        };
        const last = this._overviewRange;
        if (
            last &&
            last.loadSerial === loadSerial &&
            last.dateRange.start === dateRange.start &&
            last.dateRange.end === dateRange.end
        ) {
            return last.dateRange;
        }
        this._overviewRange = { loadSerial, dateRange };
        return dateRange;
    }
}

/**
 * R4 point 4 (decision D5): every way of creating in the monthly view proposes the employee
 * whose form opened the action, the `active_id` of its context, not the user's own employee.
 * The action carries none when it is opened another way: the Community's default then stands.
 */
export class MonthlyAttendanceEditor extends AttendanceTimelineEditor {
    creationContextFor(params) {
        const context = super.creationContextFor(params);
        const employeeId = this.model.context.active_id;
        return employeeId ? { ...context, default_employee_id: employeeId } : context;
    }
}

/** The monthly variant of the attendance Gantt view, chosen by `js_class="monthly_attendance_gantt"`. */
export const monthlyAttendanceView = {
    ...attendanceTimelineView,
    Controller: MonthlyAttendanceController,
    Editor: MonthlyAttendanceEditor,
};

registry.category("views").add("monthly_attendance_gantt", monthlyAttendanceView);
