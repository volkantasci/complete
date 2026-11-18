// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onWillUnmount } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { AttendanceActionHelper } from "@hr_attendance/views/attendance_helper_view";
import { EmployeeTimelineRenderer } from "@hr_gantt/employee_timeline_renderer";
import { progressView, WIDE_LABEL_WIDTH } from "./attendance_layout";

/** Longest wait between the end of a window resize and the redraw of the labels (R17, D3). */
export const RESIZE_DELAY = 250;

/**
 * The renderer of the attendance variant: the hours-worked label and bar (R17, R18), the red
 * names (R19) and the empty-view helper (R20).
 *
 * For slice 002d3, which changes what a click, a double click and the creation do: until then
 * the framework's behaviour stands (R25), and these are the places 002d3 overrides. The renderer
 * has `onPillClick(ev, pill, row)` and `onPillDoubleClick(ev, pill)` (the popover and the record
 * dialog of 002a and 002b); the editor given to it as `props.editor` has `openRecord(resId)` and
 * the create path, with the form of the dialog read from the view's arch by the controller.
 * Nothing here changes them.
 */
export class AttendanceTimelineRenderer extends EmployeeTimelineRenderer {
    static template = "hr_attendance_gantt.AttendanceTimelineRenderer";
    static components = { ...EmployeeTimelineRenderer.components, AttendanceActionHelper };

    setup() {
        super.setup();
        // D3: the form of the label follows the width of the window, without a reload
        this._wide = browser.innerWidth >= WIDE_LABEL_WIDTH;
        let timer = null;
        const settle = () => {
            timer = null;
            const wide = browser.innerWidth >= WIDE_LABEL_WIDTH;
            if (wide !== this._wide) {
                this._wide = wide;
                // draw the rows again; the data is not read again
                this.state.version++;
            }
        };
        const onResize = () => {
            browser.clearTimeout(timer);
            timer = browser.setTimeout(settle, RESIZE_DELAY);
        };
        onMounted(() => {
            browser.addEventListener("resize", onResize);
            // a resize between setup and mount is not lost
            settle();
        });
        onWillUnmount(() => {
            browser.removeEventListener("resize", onResize);
            browser.clearTimeout(timer);
            timer = null;
        });
    }

    /** R17, R18: the label, the bar and the tooltip of an employee row. */
    _progressOf(row, data) {
        const entry =
            row.fieldName && row.resId !== null && row.resId !== undefined
                ? data.progress[row.fieldName]?.[row.resId]
                : null;
        if (!entry) {
            return null;
        }
        // the phone is always narrower than 1400 px: the short form
        return progressView(entry, { wide: this._wide && !this.ui.isSmall });
    }

    /** R19: whether the row header's name is drawn in the danger colour. */
    isWithoutContract(descriptor) {
        const row = descriptor.row;
        return Boolean(row.resId && this.data.withoutContract?.has(row.resId));
    }

    /** R20: at most one row, and that row has no attendance. */
    get showsHelper() {
        const { rows, isSample } = this.layout;
        if (isSample || rows.length > 1) {
            return false;
        }
        return !rows.length || rows[0].row.recordIds.length === 0;
    }
}
