// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { usePopover } from "@web/core/popover/popover_hook";
import { EmployeeTimelineRenderer } from "@hr_gantt/employee_timeline_renderer";
import { TimeOffAvatarCard } from "./time_off_avatar_card";
import { hoursLabel } from "./time_off_layout";

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
 *   `pillClick`, `pillDoubleClick`, `pillHover` and `pillPress` set to `true`.
 * - 002e3 (selection of cells, creation form): it adds `multi_create_view` to the arch and
 *   overrides `hhgInputs` with `cellPress` and `multiSelect` set to `true`. `multiSelect` also
 *   lets the header clicks and Escape select and clear, as the framework does.
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
            pillClick: false,
            pillDoubleClick: false,
            pillHover: false,
            pillPress: false,
            cellPress: false,
            multiSelect: false,
        };
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

    /** No selection of cells (and so no selection through a header) while `multiSelect` is off. */
    get isMultiSelect() {
        return this.hhgInputs.multiSelect && super.isMultiSelect;
    }

    /**
     * Off: no popover. The click of a cancelled gesture stays consumed, so that it does not leak
     * to the next click (the guards are those of the framework's click, minus its popover).
     */
    onPillClick(ev, pill, row, element = null) {
        if (this.hhgInputs.pillClick) {
            return super.onPillClick(ev, pill, row, element);
        }
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
        }
    }

    onPillDoubleClick(ev, pill) {
        if (this.hhgInputs.pillDoubleClick) {
            return super.onPillDoubleClick(ev, pill);
        }
    }

    onPillEnter(pill, row) {
        if (this.hhgInputs.pillHover) {
            return super.onPillEnter(pill, row);
        }
    }

    onPillLeave(pill, row, ev) {
        if (this.hhgInputs.pillHover) {
            return super.onPillLeave(pill, row, ev);
        }
    }

    handlesOf(pill, row) {
        return this.hhgInputs.pillHover ? super.handlesOf(pill, row) : [];
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
export class TimeOffReportRenderer extends TimeOffLeaveRenderer {}
