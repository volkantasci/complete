// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onPatched, onWillUnmount, signal } from "@odoo/owl";
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
/**
 * R20 (M54, M55): the helper's box is the free space under the grid (the window's bottom less the
 * grid's bottom, which is the bottom of its one row) grown upward by this share of that space.
 * The measured boxes give 26 px of 652 px on the desktop (y 222) and 21.4 px of 548 px on the
 * phone (y 274.625): 4 % of the free space in both, within 0.3 px, so no second value is needed.
 */
const HELPER_OVERLAP = 0.0395;

export class AttendanceTimelineRenderer extends EmployeeTimelineRenderer {
    static template = "hr_attendance_gantt.AttendanceTimelineRenderer";
    static components = { ...EmployeeTimelineRenderer.components, AttendanceActionHelper };

    helperRef = signal.ref();

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
            this.placeHelper();
            browser.clearTimeout(timer);
            timer = browser.setTimeout(settle, RESIZE_DELAY);
        };
        onPatched(() => this.placeHelper());
        // the control panel above can change its height (the phone's search bar opens and shuts)
        let observer = null;
        onMounted(() => {
            this.placeHelper();
            const panel = document.querySelector(".o_control_panel");
            if (panel && typeof ResizeObserver !== "undefined") {
                observer = new ResizeObserver(() => this.placeHelper());
                observer.observe(panel);
            }
            browser.addEventListener("resize", onResize);
            // a resize between setup and mount is not lost
            settle();
        });
        onWillUnmount(() => {
            observer?.disconnect();
            browser.removeEventListener("resize", onResize);
            browser.clearTimeout(timer);
            timer = null;
        });
    }

    /**
     * R21: this view has no multi-selection, so a click on a folded header unfolds its run, with
     * Ctrl as without; with Shift it does nothing (002b3: Shift never folds or unfolds).
     */
    onColumnClick(column, ev) {
        if (column.folded && ev?.shiftKey) {
            return;
        }
        return super.onColumnClick(column, ev);
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
        const view = progressView(entry, { wide: this._wide && !this.ui.isSmall });
        // the info of the tooltip's template (M23)
        view.tipInfo = view.tooltip ? JSON.stringify({ text: view.tooltip }) : null;
        return view;
    }

    /** R19: whether the row header's name is drawn in the danger colour. */
    isWithoutContract(descriptor) {
        const row = descriptor.row;
        return Boolean(row.resId && this.data.withoutContract?.has(row.resId));
    }

    /**
     * R20 (M54, M55): the helper is a layer over the view's content: its box runs from a little
     * above the end of the grid (HELPER_OVERLAP of the free space) to the bottom of the window, so
     * the page is never taller than the window because of it, and its content is centred in the
     * free space under the row (the box's padding is the part above the grid's end).
     */
    placeHelper() {
        const helper = this.helperRef();
        const grid = this.rendererRef();
        const box = helper?.offsetParent;
        if (!box || !grid) {
            return;
        }
        const gridBottom = grid.getBoundingClientRect().bottom;
        const overlap = Math.max(0, browser.innerHeight - gridBottom) * HELPER_OVERLAP;
        const top = gridBottom - overlap;
        // `top` is read from the padding box: a border of the box (a panel frame) is not in it
        const frame = parseFloat(getComputedStyle(box).borderTopWidth) || 0;
        helper.style.top = `${top - box.getBoundingClientRect().top - frame}px`;
        helper.style.bottom = "auto";
        helper.style.height = `${Math.max(0, browser.innerHeight - top)}px`;
        helper.style.paddingTop = `${overlap}px`;
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
