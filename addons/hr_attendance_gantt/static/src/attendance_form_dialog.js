// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { TimelineRecordDialog } from "@web_gantt/timeline_editor";

/**
 * The form dialog the attendance Gantt views open (the record dialog of R9 and the creation
 * dialog of R14): the Community dialog, with a class of its own on its content box, so that a
 * style can reach these dialogs and no other.
 */
export class AttendanceFormDialog extends TimelineRecordDialog {
    static template = "hr_attendance_gantt.AttendanceFormDialog";
}

/** The `dialog` service as the editor of the attendance views sees it. */
export function attendanceDialogService(dialog) {
    return {
        ...dialog,
        add(Component, props, options) {
            const own = Component === FormViewDialog || Component === TimelineRecordDialog;
            return dialog.add(own ? AttendanceFormDialog : Component, props, options);
        },
    };
}
