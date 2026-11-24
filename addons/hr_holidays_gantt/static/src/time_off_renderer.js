// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onPatched, onWillStart, proxy } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { user } from "@web/core/user";
import { usePopover } from "@web/core/popover/popover_hook";
import { EmployeeTimelineRenderer } from "@hr_gantt/employee_timeline_renderer";
import { POPOVER_CLOSE_LOCK } from "@web_gantt/timeline_renderer";
import { POPOVER_DELAY } from "@web_gantt/timeline_popover";
import { TimeOffAvatarCard } from "./time_off_avatar_card";
import { hoursLabel } from "./time_off_layout";
import { TimeOffLeavePopover } from "./time_off_popover";
import { hhgSplitBorderAt } from "./time_off_split_tool";

/** The lane of a pill starts one pixel above its body (002b2 M5): the popover's gap counts from the body. */
const PILL_INSET = 1;

/** R16: the Time Off group that may split a request (the server's two methods refuse any other). */
const OFFICER_GROUP = "hr_holidays.group_hr_holidays_user";

/** R16, M59: the pill's outer box is one pixel taller than its body on each side. */
const SPLIT_BOX_HEIGHT = 25;

/** D7: the states in which a request cannot be moved or resized in the view. */
const LOCKED_STATES = ["validate1", "validate"];

/**
 * The renderer of the leave view; the later parts add inputs, label and card here.
 *
 * Inputs (R6, R22). The pointer and key inputs that belong to the later parts do nothing here,
 * each behind one entry of `hhgInputs`; an entry that is `true` hands the input back to the
 * framework (`super`). Folding by a header click (002a R29), the scroll of a row header to the
 * row's first pill (002a R39), the avatar card and the view's controls are not listed: they stay.
 *
 * A subclass flips entries by spreading the parent's, so that an entry it does not name keeps its
 * value: `get hhgInputs() { return { ...super.hhgInputs, pillClick: true }; }`.
 *
 * Contract for the later parts:
 * - 002e2 (leave popover, dialog, moves, resizes, split tool): after `super.setup()` it assigns
 *   its own popover (`this.popover = usePopover(...)`), then overrides `hhgInputs` with
 *   `pillClick`, `pillDoubleClick`, `pillHover` and `pillPress` set to `true`. The popover and
 *   the double click come first (`pillClick`, `pillDoubleClick`); the pointer's hover and press
 *   (handles, moves, resizes) are on from 002e2's gestures; the split tool follows.
 * - 002e3 (selection of cells, creation form): it adds `multi_create_view` to the arch and
 *   overrides `hhgInputs` with `cellPress` and `multiSelect` set to `true`. `multiSelect` also
 *   lets the header clicks and Escape select and clear, as the framework does. The controller
 *   keeps `canCreate` as the framework computes it, so the selection bar's add button works
 *   from the arch and `hhgInputs` alone; the New button stays hidden (the controller's template).
 *
 * Escape, Enter and Delete need no entry: the framework acts on them only for a selection or a
 * gesture in progress, and neither can start while these entries are `false`.
 */
export class TimeOffLeaveRenderer extends EmployeeTimelineRenderer {
    static template = "hr_holidays_gantt.TimeOffRenderer";

    setup() {
        super.setup();
        // R18: the card of the time-off views, the same in the leave and the report views
        this.avatarCard = usePopover(TimeOffAvatarCard);
        // R2: the leave popover replaces the framework's popover (002a R30); the framework's own
        // options are kept, except that a click on the pill of the open popover leaves it open
        const popover = usePopover(TimeOffLeavePopover, {
            position: "bottom",
            onPositioned: (element, { direction }) => {
                const shift = { bottom: PILL_INSET, top: -PILL_INSET }[direction];
                if (shift) {
                    element.style.top = `${parseFloat(element.style.top) + shift}px`;
                }
            },
            // the framework reports the browser's Back as a click on the page: with a dialog open
            // over the popover, Back belongs to the dialog (R21 point 4)
            closeOnClickAway: (target) =>
                !this._isPopoverAnchor(target) &&
                !(
                    this.ui.isSmall &&
                    target === document.documentElement &&
                    document.querySelector(".o_dialog .modal")
                ),
            onClose: () => {
                if (this._popoverFor !== null) {
                    this._lockClicks(POPOVER_CLOSE_LOCK, false);
                }
                this._popoverFor = null;
                this._hhgKeep = null;
                this._hhgGhost?.remove();
                this._hhgGhost = null;
            },
        });
        // R2 point 3, R-C-6: the framework closes its popover when new data arrives (`close`, from
        // its `onWillRender`); the reload that the popover itself asks for leaves it open
        this.popover = {
            open: (...args) => popover.open(...args),
            close: () => {
                const keep = this._hhgKeep;
                if (keep && popover.isOpen && this.data !== keep.data) {
                    this._hhgKeep = null;
                    return;
                }
                popover.close();
            },
            get isOpen() {
                return popover.isOpen;
            },
        };
        // the render that took the awaited reload's data has consumed the keep
        onPatched(() => {
            if (this._hhgKeep && this.data !== this._hhgKeep.data) {
                this._hhgKeep = null;
            }
        });
        this._hhgKeep = null;
        this._hhgGhost = null;
        this._hhgClickPill = null;
        this._hhgClickTimer = null;
        // R16: the split tool follows the pointer's rest on a pill; `busy` is the time of the
        // split call (R17 point 6)
        this.hhgSplit = proxy({ key: null, day: null, borderX: null, styles: null });
        this._hhgSplitBusy = false;
        this._hhgOfficer = false;
        onWillStart(async () => {
            this._hhgOfficer = await user.hasGroup(OFFICER_GROUP);
        });
    }

    /**
     * R16: the leave view, an Officer or above, the desktop, no sample, nothing held. The report
     * view never splits (its own server methods are the leave's).
     */
    get hhgSplitAllowed() {
        return (
            this.hhgPopoverVariant === "leave" &&
            this._hhgOfficer &&
            !this.ui.isSmall &&
            !this.data?.isSample &&
            Boolean(this.props.editor) &&
            !this._hhgSplitBusy
        );
    }

    /** The unfolded day columns as boxes in the viewport (R16), one per visible header. */
    _hhgDayColumns() {
        const { columns } = this.data;
        const result = [];
        for (const header of this._headers()) {
            const column = columns[Number(header.dataset.index)];
            if (!column || header.classList.contains("o_tl_folded")) {
                continue;
            }
            const { left, right } = header.getBoundingClientRect();
            result.push({ left, right, start: column.start });
        }
        return result;
    }

    _hhgHideSplit() {
        if (this.hhgSplit.key !== null) {
            this.hhgSplit.key = null;
            this.hhgSplit.day = null;
            this.hhgSplit.styles = null;
        }
    }

    /** The pointer moves over a pill: where it rests decides whether the split tool shows (R16). */
    hhgOnPillMove(ev, pill, row) {
        if (ev.pointerType === "touch") {
            return;
        }
        if (!this.hhgSplitAllowed) {
            return this._hhgHideSplit();
        }
        if (this.state.drag || this.connect.isActive || this._drag.state === "dragging") {
            return this._hhgHideSplit();
        }
        if (this._drag.state !== "idle") {
            // a press that has not moved yet: the click that follows decides (R17)
            return;
        }
        const pillEl = ev.currentTarget;
        const rtl = this._isRtl();
        const found = hhgSplitBorderAt({
            x: ev.clientX,
            y: ev.clientY,
            pillRect: pillEl.getBoundingClientRect(),
            columns: this._hhgDayColumns(),
            rtl,
        });
        if (!found) {
            return this._hhgHideSplit();
        }
        const key = this._pillPointer.keyOf(pill, row);
        if (this.hhgSplit.key === key && this.hhgSplit.day === found.day && this.hhgSplit.borderX === found.borderX) {
            return;
        }
        const layer = pillEl.parentElement.getBoundingClientRect();
        const pillBox = pillEl.getBoundingClientRect();
        const width = found.box.right - found.box.left;
        // the border lies at the box's left edge, or at its right edge in a mirrored grid (D11)
        const at = rtl ? width : 0;
        const left = found.box.left - layer.left;
        const top = pillBox.top - PILL_INSET - layer.top;
        const styles = {
            box: `left: ${left}px; top: ${top}px; width: ${width}px; height: ${SPLIT_BOX_HEIGHT}px`,
            // left to right the line element spans the box with 1.5 px of negative margin at each side
            // (M58); mirrored it stands at the border as a bare edge
            line: rtl ? `left: ${at - 0.5}px` : "left: 0; right: 0; width: auto; margin-inline: -1.5px",
            scissors: `left: ${at + (rtl ? 1.3 : -1.3) - 8.75}px`,
        };
        this.hhgSplit.borderX = found.borderX;
        this.hhgSplit.day = found.day;
        this.hhgSplit.styles = styles;
        this.hhgSplit.key = key;
    }

    /** The styles of the split tool when it shows on this pill, else null. */
    hhgSplitOf(pill, row) {
        return this.hhgSplit.key === this._pillPointer.keyOf(pill, row) ? this.hhgSplit.styles : null;
    }

    /** R17: the click took the tool: split the pill's request at the tool's border. */
    async _hhgSplitNow(pill) {
        const day = this.hhgSplit.day;
        this._cancelPopover();
        this._hhgEndClickWindow();
        this.popover.close();
        this._hhgHideSplit();
        // R17 point 6: the tool is off while the call runs; on again after it, whatever the answer
        this._hhgSplitBusy = true;
        try {
            await this.props.editor.hhgSplit({ resId: pill.record.resId, day });
        } finally {
            this._hhgSplitBusy = false;
        }
    }

    /**
     * The view loads again for a write of the popover, which stays open on its place (R2 point 3,
     * R8 point 4): the new data does not close it.
     */
    async hhgReloadKeepingPopover() {
        this._hhgKeep = { data: this.data };
        try {
            await this.props.model.reload();
        } catch (error) {
            this._hhgKeep = null;
            throw error;
        }
    }

    /**
     * The popover hangs from a stand-in for the pill, not from the pill: the pill goes when the
     * request leaves the view (the Overview shows no refused request, R8 point 4), and the popover
     * would close with it. The stand-in is a hidden element beside the pill whose box is the
     * pill's, live while the pill is in the grid and the last one it had after.
     */
    _hhgAnchorOf(pill) {
        const anchor = document.createElement("div");
        anchor.className = "o_hhg_pop_anchor";
        anchor.style.display = "none";
        let last = pill.getBoundingClientRect();
        anchor.getBoundingClientRect = () => {
            if (pill.isConnected) {
                last = pill.getBoundingClientRect();
            }
            return last;
        };
        pill.after(anchor);
        return anchor;
    }

    /** The variant of the popover this view opens (R9): the request's own, or the report's. */
    get hhgPopoverVariant() {
        return "leave";
    }

    /** R18: as the framework's (nothing on the phone), with the kind of the range for the card. */
    onAvatarClick(ev, employee) {
        if (this.ui.isSmall || this.avatarCard.isOpen) {
            return;
        }
        this.avatarCard.open(ev.currentTarget, {
            id: employee.id,
            model: "hr.employee.public",
            rangeKind: this.data?.range?.kind,
        });
    }

    get hhgInputs() {
        return {
            pillClick: true,
            pillDoubleClick: true,
            pillHover: true,
            pillPress: true,
            cellPress: false,
            multiSelect: false,
        };
    }

    /**
     * D7, R12, R13: a request at Second Approval or Approved is locked for every user: it neither
     * moves nor resizes, and a press on it shows 002b2's locked lift (the framework's reply to a
     * pill that is not movable). The report view has no `state` and its arch is read-only, so the
     * framework already makes its pills fixed.
     */
    _pillState(pill) {
        const state = super._pillState(pill);
        if (!LOCKED_STATES.includes(pill.record.raw?.state)) {
            return state;
        }
        return { movable: false, resizable: { start: false, stop: false } };
    }

    /** D4, R22: the same for an empty cell, while no press and no selection start there. */
    get hhgNoCellCursor() {
        const { cellPress, multiSelect } = this.hhgInputs;
        return !cellPress && !multiSelect;
    }

    /**
     * R16 points 3 and 4: the hours label alone, muted at every value: no bar, no tooltip, no
     * warning. The server's progress value is `{value: hours}`.
     */
    _progressOf(row, data) {
        const entry =
            row.fieldName && row.resId !== null && row.resId !== undefined
                ? data.progress[row.fieldName]?.[row.resId]
                : null;
        if (!entry) {
            return null;
        }
        return {
            label: hoursLabel(entry.value),
            hasBar: false,
            tooltip: null,
            warning: null,
            over: false,
        };
    }

    /**
     * R23 point 2, on the phone: the focus place is the middle of the visible part, which runs from
     * the right edge of the row headers (x 130) to the screen's right edge (x 390): x 260. The row
     * header column is a third of the page's width, and a page that opens with a scrollbar is
     * narrower than the one the scrollbar leaves (375 px, headers 125 px, then 390 and 130): the
     * place is counted on the full screen, from the headers' present edge, so that the day lies
     * at x 260 once the page has its full width.
     */
    _focusX() {
        if (!this.ui.isSmall) {
            return super._focusX();
        }
        const element = this.rendererRef();
        const title = element.querySelector(".o_tl_title_cell");
        const header = title ? title.getBoundingClientRect().width : 0;
        const full = window.innerWidth;
        const share = (full - Math.round(full / 3)) / 2;
        const box = element.getBoundingClientRect();
        return this._isRtl() ? box.left + share : box.left + header + share;
    }

    /**
     * R23 point 2, on the phone: the focus day lies at the focus place as a linear share of the
     * whole period, folded weekends included (the Month range of November opens scrolled 322 px,
     * the Week range 312 px), where the framework puts the day's own column there when a run is
     * folded.
     */
    _centreDate(date) {
        this._hhgLinear = this.ui.isSmall;
        try {
            return super._centreDate(date);
        } finally {
            this._hhgLinear = false;
        }
    }

    /** The cells as one linear scale, folded runs counted by their drawn width, while centring. */
    _linearSpan() {
        if (!this._hhgLinear) {
            return super._linearSpan();
        }
        const { columns } = this.data;
        const headers = this._headers();
        if (!columns.length || !headers.length) {
            return null;
        }
        const first = headers[0].getBoundingClientRect();
        const last = headers.at(-1).getBoundingClientRect();
        return {
            start: columns[0].start,
            stop: columns.at(-1).stop,
            left: Math.min(first.left, last.left),
            right: Math.max(first.right, last.right),
        };
    }

    /** No selection of cells (and so no selection through a header) while `multiSelect` is off. */
    get isMultiSelect() {
        return this.hhgInputs.multiSelect && super.isMultiSelect;
    }

    /**
     * R2, R11. Off: no popover (the click of a cancelled gesture stays consumed, so that it does
     * not leak to the next click; the guards are those of the framework's click, minus its
     * popover). On: the framework's guards, then
     * - a second click on the same pill within 200 ms closes the popover and opens the record
     *   dialog (R11: the time between two clicks on one pill, not the browser's double click);
     * - otherwise the popover opens after 200 ms; a click on the pill whose popover is open leaves
     *   it open (R2 point 2), where the framework closes it.
     */
    onPillClick(ev, pill, row, element = null) {
        if (this.hhgInputs.pillHover) {
            this._pillPointer.tap(ev, pill, row);
        }
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
        if (!this.hhgInputs.pillClick) {
            return;
        }
        // R17: a click while the split tool shows on this pill splits, where the popover would open
        if (this.hhgSplitOf(pill, row) && this.hhgSplitAllowed) {
            ev.stopPropagation();
            return this._hhgSplitNow(pill);
        }
        if (this._drag.isPaired && this._drag.clickDetail(ev.detail) > 1) {
            this._hhgOpenDialog(pill);
            return;
        }
        if (this._hhgClickPill === pill.id) {
            this._hhgOpenDialog(pill);
            return;
        }
        this._hhgClickPill = pill.id;
        browser.clearTimeout(this._hhgClickTimer);
        this._hhgClickTimer = browser.setTimeout(() => this._hhgEndClickWindow(), POPOVER_DELAY);
        const target = element ?? ev.currentTarget;
        browser.clearTimeout(this._popoverTimer);
        if (this.popover.isOpen && this._popoverFor === pill.id) {
            this._popoverTimer = null;
            return;
        }
        this._popoverTimer = browser.setTimeout(() => {
            this._popoverTimer = null;
            const anchor = this._hhgAnchorOf(target);
            this.popover.open(anchor, {
                model: this.props.model,
                archInfo: this.props.archInfo,
                record: pill.record,
                editor: this.props.editor,
                variant: this.hhgPopoverVariant,
                onChanged: () => this.hhgReloadKeepingPopover(),
            });
            // after `open`, which first closes (and so forgets) the previous popover
            this._popoverFor = pill.id;
            this._hhgGhost = anchor;
        }, POPOVER_DELAY);
    }

    _hhgEndClickWindow() {
        browser.clearTimeout(this._hhgClickTimer);
        this._hhgClickTimer = null;
        this._hhgClickPill = null;
    }

    /** R11: the second click (or tap) of a pair: no popover, one record dialog. */
    _hhgOpenDialog(pill) {
        this._hhgEndClickWindow();
        this._cancelPopover();
        this.popover.close();
        this.props.editor?.openRecord(pill.record.resId);
    }

    /**
     * The browser's double click does nothing of its own: the pair of clicks has opened the dialog
     * (R11), and a second click after 200 ms is a new click.
     */
    onPillDoubleClick(ev, pill) {}

    onPillEnter(pill, row) {
        if (this.hhgInputs.pillHover) {
            return super.onPillEnter(pill, row);
        }
    }

    onPillLeave(pill, row, ev) {
        this._hhgHideSplit();
        if (this.hhgInputs.pillHover) {
            return super.onPillLeave(pill, row, ev);
        }
    }

    /**
     * The framework's handles of the pill (`web_gantt/static/src/timeline_pill_pointer.js`, which
     * shows them for the pill under the pointer while nothing is held), less those of an end the
     * pill may not resize (D7).
     */
    handlesOf(pill, row) {
        if (!this.hhgInputs.pillHover) {
            return [];
        }
        const { resizable } = this._pillState(pill);
        return super.handlesOf(pill, row).filter((handle) => resizable[handle.edge]);
    }

    onPillPointerDown(ev, pill, row) {
        if (this.hhgInputs.pillPress) {
            return super.onPillPointerDown(ev, pill, row);
        }
    }

    pressThrough(ev) {
        if (this.hhgInputs.pillPress) {
            return super.pressThrough(ev);
        }
    }

    /**
     * Off: a click on a cell creates, plans and picks nothing; only a folded cell still opens its
     * run (002a R29), which the framework does in its single-selection path.
     */
    onCellClick(ev, cell, descriptor = null) {
        if (this.hhgInputs.cellPress) {
            return super.onCellClick(ev, cell, descriptor);
        }
        if (this._selecting.consumeClick() || this._drag.consumeClick() || this.connect.consumeClick()) {
            ev.stopPropagation();
            return;
        }
        if (cell.run !== undefined) {
            return super.onCellClick(ev, cell, descriptor);
        }
    }

    onCellPointerDown(ev, cell, descriptor) {
        if (this.hhgInputs.cellPress) {
            return super.onCellPointerDown(ev, cell, descriptor);
        }
        this._selecting.resetClick();
    }
}

/** The renderer of the report view: as the leave view's; its arch asks for no progress, so no label. */
export class TimeOffReportRenderer extends TimeOffLeaveRenderer {
    get hhgPopoverVariant() {
        return "report";
    }
}
