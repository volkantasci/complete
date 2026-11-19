// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { TimelineEditor } from "@web_gantt/timeline_editor";
import { attendanceDialogService } from "./attendance_form_dialog";

/**
 * The editor of the attendance variant (the editor slot of the Gantt view). The record dialog
 * shows the Community creation form with its own footer (Save & Close, Discard, Delete), so the
 * framework's Remove button, which asks for a confirmation, is not offered (R9 point 1): the
 * editor reads the view as one where the user may not delete from the dialog's frame, while the
 * form's own Delete removes the attendance at once (decision D2).
 */
export class AttendanceTimelineEditor extends TimelineEditor {
    constructor({ archInfo, services, ...params }) {
        super({
            ...params,
            archInfo: { ...archInfo, canDelete: false },
            // its form dialogs carry the class of the attendance views (the phone's edge line)
            services: { ...services, dialog: attendanceDialogService(services.dialog) },
        });
    }

    /** R10 point 4: a record dialog is waiting for a write, or is open. */
    get isRecordBusy() {
        return Boolean(this._recordOpen);
    }
}
