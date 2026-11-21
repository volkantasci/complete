// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { EmployeeTimelineRenderer } from "@hr_gantt/employee_timeline_renderer";

/** The renderer of the leave view; the later parts add inputs, label and card here. */
export class TimeOffLeaveRenderer extends EmployeeTimelineRenderer {}

/** The renderer of the report view: as the leave view's. */
export class TimeOffReportRenderer extends TimeOffLeaveRenderer {}
