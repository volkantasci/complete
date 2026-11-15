// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the pointer does on a pill, apart from the drag itself (`TimelinePillDrag`): the hover
 * key that shows the handles, what a pill may do (`pillState`), the handles drawn in it, and what
 * a press on it starts. `host` is the renderer: it owns the `state` (`hover`, `drag`), the
 * `_drag` gesture, `data`, `props`, `isMultiSelect` and the helpers named below.
 */
export class TimelinePillPointer {
    constructor(host) {
        this.host = host;
    }

    /** The key of the pill the pointer rests on, `rowId|pillId`. */
    keyOf(pill, row) {
        return `${row.row.id}|${pill.id}`;
    }

    /** R1: a pill moves when the view edits, drag and drop is on, and it is not cut. */
    pillState(pill) {
        const { archInfo, editor } = this.host.props;
        const { cutStart, cutStop } = pill.record.span;
        const editable = Boolean(editor) && !this.host.data.isSample && archInfo.canEdit;
        const movable = editable && !archInfo.disableDragDrop && !cutStart && !cutStop;
        // R8: an end is resizable when it lies inside the range; the drag-and-drop option does
        // not matter
        return { movable, resizable: { start: editable && !cutStart, stop: editable && !cutStop } };
    }

    /** Whether a gesture is on (a drawing is shown or the drag is not idle). */
    get isHeld() {
        return Boolean(this.host.state.drag) || this.host._drag.state !== "idle";
    }

    /** The pointer enters a pill: its handles show, unless a gesture is on (R8). */
    enter(pill, row) {
        if (!this.isHeld) {
            this.host.state.hover = this.keyOf(pill, row);
            // R9: the arrows of a pill of a record row light up
            if (row.kind === "pills") {
                this.host.arrows.focusPill(this.keyOf(pill, row));
            }
        }
    }

    leave(pill, row) {
        this.host.state.hover = null;
        this.host.arrows.unfocusPill(pill && row ? this.keyOf(pill, row) : undefined);
    }

    /**
     * The resize handles drawn in `pill` (R8, S4): none unless the pointer rests on the pill and
     * nothing is held. Each handle sits at one end; the pointer shape is the west or east one
     * (in a mirrored grid the start is on the right).
     */
    handlesOf(pill, row) {
        if (this.host.state.hover !== this.keyOf(pill, row) || this.isHeld) {
            return [];
        }
        const { resizable } = this.pillState(pill);
        const rtl = this.host._isRtl();
        return ["start", "stop"]
            .filter((edge) => resizable[edge])
            .map((edge) => ({ edge, side: (edge === "start") !== rtl ? "west" : "east" }));
    }

    /** The press on a pill (R2): a move may follow. `row` is the row descriptor of the pill. */
    press(ev, pill, row) {
        const host = this.host;
        if (ev.button !== 0 || host.data.isSample) {
            return;
        }
        if (host.isMultiSelect && !host._holdsPill(ev, pill)) {
            // R5: a locked pill is no obstacle to a drawing, which starts at the cell under it
            host._pressDrawing(ev, ev.currentTarget.closest(".o_tl_row"), row);
            return;
        }
        const element = ev.currentTarget;
        const grid = element.closest(".o_tl_grid").getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const renderer = host.rendererRef();
        host._pressed = {
            scroll: { left: renderer.scrollLeft, top: host._verticalScroller().scrollTop },
            ghost: {
                label: pill.label,
                className: pill.className,
                progress: pill.progress,
                mark: pill.mark,
                left: rect.left - grid.left,
                top: rect.top - grid.top,
                width: rect.width,
                height: rect.height,
            },
        };
        const handle = ev.target.closest?.(".o_tl_handle")?.dataset.edge || null;
        host._drag.press(ev, pill, { rowId: row.row.id, handle });
    }
}
