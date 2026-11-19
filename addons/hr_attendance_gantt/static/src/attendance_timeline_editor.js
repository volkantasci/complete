// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { serializeDateTime } from "@web/core/l10n/dates";
import { dragStep, shiftBy } from "@web_gantt/timeline_drag_math";
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

    /**
     * R18: what a move or a resize writes for an open attendance (no check-out). `steps` is the
     * number of sub-columns of the gesture, negative to the left. A move writes the check-in
     * (and the employee) only, so the attendance stays open; dragging the start writes the
     * check-in as for any record; dragging the end writes the check-out measured from the
     * "now" of the load, with its seconds, and not from the drawn end. A closed attendance and
     * a copy keep the framework's values (002b2).
     */
    writeValuesFor({ kind, record, values, steps }) {
        if (!record?.isOpen) {
            return values;
        }
        if (kind === "move") {
            const { check_out, ...kept } = values;
            return kept;
        }
        if (kind === "resize-stop") {
            const step = dragStep(this.model.data, { dateOnly: false });
            return { check_out: serializeDateTime(shiftBy(this.model.loadNow, steps, step)) };
        }
        return values;
    }

    /**
     * R18 point 4: Undo after a move or an end drag gives the earlier check-in back and empties
     * the check-out (the attendance is open again); after a start drag it gives the earlier
     * check-in back alone. The values come from the record as the server sent it, never from the
     * drawn one (whose end is "now" and whose start may be cut by the displayed period).
     */
    undoValuesFor({ kind, record, values }) {
        if (!record?.isOpen) {
            return values;
        }
        if (kind === "resize-start") {
            return { check_in: record.raw.check_in };
        }
        return { ...values, check_out: false };
    }

    /** R10 point 4: a record dialog is waiting for a write, or is open. */
    get isRecordBusy() {
        return Boolean(this._recordOpen);
    }
}
