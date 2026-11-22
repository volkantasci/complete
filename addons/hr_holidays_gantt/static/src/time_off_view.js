// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { employeeTimelineView } from "@hr_gantt/employee_timeline_view";
import { TimeOffController } from "./time_off_controller";
import { TimeOffLeaveModel, TimeOffReportModel } from "./time_off_model";
import { TimeOffLeaveRenderer, TimeOffReportRenderer } from "./time_off_renderer";
import { TimeOffLeaveSearchModel, TimeOffReportSearchModel } from "./time_off_search_model";

export {
    TimeOffController,
    TimeOffLeaveModel,
    TimeOffLeaveRenderer,
    TimeOffLeaveSearchModel,
    TimeOffReportModel,
    TimeOffReportRenderer,
    TimeOffReportSearchModel,
};

/**
 * The class of the leave variant's root: the stylesheet gives the control bar of the leave views
 * the original's spacing, which the report variant does not have.
 */
export const HHG_LEAVE_CLASS = "o_hhg_leave_view";

/** The leave variant of the Gantt view, chosen by `js_class="hr_holidays_gantt_manager_hr_leave"`. */
export const timeOffLeaveView = {
    ...employeeTimelineView,
    props: (genericProps, view) => {
        const props = employeeTimelineView.props(genericProps, view);
        return { ...props, className: [props.className, HHG_LEAVE_CLASS].filter(Boolean).join(" ") };
    },
    Controller: TimeOffController,
    SearchModel: TimeOffLeaveSearchModel,
    Model: TimeOffLeaveModel,
    Renderer: TimeOffLeaveRenderer,
};

/** The class of the report variant's root: its row header has no label to leave room for. */
export const HHG_REPORT_CLASS = "o_hhg_report_view";

/** The report variant, chosen by `js_class="hr_holidays_report_gantt"` (R7). */
export const timeOffReportView = {
    ...employeeTimelineView,
    props: (genericProps, view) => {
        const props = employeeTimelineView.props(genericProps, view);
        return { ...props, className: [props.className, HHG_REPORT_CLASS].filter(Boolean).join(" ") };
    },
    Controller: TimeOffController,
    SearchModel: TimeOffReportSearchModel,
    Model: TimeOffReportModel,
    Renderer: TimeOffReportRenderer,
};

registry.category("views").add("hr_holidays_gantt_manager_hr_leave", timeOffLeaveView);
registry.category("views").add("hr_holidays_report_gantt", timeOffReportView);
