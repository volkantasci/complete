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

    /**
     * R15: the creation dialog's context carries `scale`, the id of the displayed scale (`day`,
     * `week`, `month`, `year`; the Quarter range is on the month scale, a Custom range on the
     * scale of its length), which the server's change handler of the check-in reads. Every way
     * of creating goes through here; the record dialog (R9) opens with the view's own context.
     */
    creationContextFor(params) {
        return { ...super.creationContextFor(params), scale: this.model.scaleId };
    }

    /** R10 point 4: a record dialog is waiting for a write, or is open. */
    get isRecordBusy() {
        return Boolean(this._recordOpen);
    }
}
