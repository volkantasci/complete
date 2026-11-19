// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onPatched, onWillUnmount, signal } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { AttendanceActionHelper } from "@hr_attendance/views/attendance_helper_view";
import { EmployeeTimelineRenderer } from "@hr_gantt/employee_timeline_renderer";
import { helperOffset, progressView, WIDE_LABEL_WIDTH } from "./attendance_layout";

/** Longest wait between the end of a window resize and the redraw of the labels (R17, D3). */
export const RESIZE_DELAY = 250;

/** The lock a first click on a pill puts on its record (R10, decision D1), in milliseconds. */
export const CLICK_LOCK = 200;

/**
 * The renderer of the attendance variant: the hours-worked label and bar (R17, R18), the red
 * names (R19), the empty-view helper (R20), and what a click, a tap and a double click on a pill
 * do (R9 to R12): the record dialog opens at once, never twice, and there is no popover.
 */
export class AttendanceTimelineRenderer extends EmployeeTimelineRenderer {
    static template = "hr_attendance_gantt.AttendanceTimelineRenderer";
    static components = { ...EmployeeTimelineRenderer.components, AttendanceActionHelper };

    helperRef = signal.ref();

    setup() {
        super.setup();
        // the 200 ms locks of R10 point 1: the timer of each record that was clicked, by id
        this._pillLocks = new Map();
        onWillUnmount(() => {
            for (const timer of this._pillLocks.values()) {
                browser.clearTimeout(timer);
            }
            this._pillLocks.clear();
        });
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

    /**
     * R9, R11, R12: a click or a tap on a pill (its body, its text, or an end pressed and released
     * without moving) opens the record dialog of its attendance at once. The guards of the
     * framework's click stay: the release of a drag, of a drawing or of a selection is no click.
     */
    onPillClick(ev, pill, row) {
        // a tap leaves the pill in the pointer-over state: its handles show (002c R11)
        this._pillPointer.tap(ev, pill, row);
        if (this.connect.consumeClick()) {
            if (this.connect.cancelledClick) {
                this._drag.noteCancelledClick(ev.detail);
            }
            ev.stopPropagation();
            return;
        }
        if (this._selecting.consumeClick()) {
            ev.stopPropagation();
            return;
        }
        if (this._drag.consumeClick(ev.detail) || (this._drag.justReleased && ev.detail > 1)) {
            ev.stopPropagation();
            return;
        }
        this._openRecordOnce(pill.record.resId);
    }

    /**
     * R10: the double click event opens nothing; its first click has opened the dialog (a second
     * click within 200 ms did nothing).
     */
    onPillDoubleClick() {}

    /**
     * R10 (decision D1). The first click on a record opens its dialog and locks that record for
     * 200 ms, counted from that click; a click in the lock does nothing and does not restart it,
     * and the lock runs on when the dialog closes sooner. While a record dialog is opening or
     * open, no click opens another. A click on another record, with no dialog opening or open,
     * opens at once.
     */
    _openRecordOnce(resId) {
        const editor = this.props.editor;
        if (!editor || editor.isRecordBusy || this._pillLocks.has(resId)) {
            return;
        }
        this._pillLocks.set(
            resId,
            browser.setTimeout(() => this._pillLocks.delete(resId), CLICK_LOCK)
        );
        editor.openRecord(resId);
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

    /** R19: the name of an employee without a contract is in the danger colour. */
    nameClass(descriptor) {
        return this.isWithoutContract(descriptor) ? "o_hag_no_contract text-danger" : "";
    }

    /** R19: whether the row header's name is drawn in the danger colour. */
    isWithoutContract(descriptor) {
        const row = descriptor.row;
        return Boolean(row.resId && this.data.withoutContract?.has(row.resId));
    }

    /**
     * R20 ("Where it is placed"). Desktop: the helper is a layer whose top is `helperOffset` (115 px
     * with one row) below the top of the view's content area, measured from that top, the control
     * bar's height not added; it runs to the bottom of the window whatever the window's height, its
     * content centred in it. Phone: not a layer; the helper takes the grid's place, from the
     * grid's top to the bottom of the window.
     */
    placeHelper() {
        const helper = this.helperRef();
        const grid = this.rendererRef();
        const box = helper?.offsetParent;
        if (!box || !grid) {
            return;
        }
        let top;
        if (this.ui.isSmall) {
            top = grid.getBoundingClientRect().top;
        } else {
            const content = grid.closest(".o_content") || grid.closest(".o_timeline_view");
            top = content.getBoundingClientRect().top + helperOffset(this.layout.rows.length);
        }
        // `top` is read from the padding box: a border of the box (a panel frame) is not in it
        const frame = parseFloat(getComputedStyle(box).borderTopWidth) || 0;
        helper.style.top = `${top - box.getBoundingClientRect().top - frame}px`;
        helper.style.bottom = "auto";
        helper.style.height = `${Math.max(0, browser.innerHeight - top)}px`;
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
