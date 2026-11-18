// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the pointer does on a pill, apart from the drag itself (`TimelinePillDrag`): the hover
 * key that shows the handles, what a pill may do (`pillState`), the handles drawn in it, and what
 * a press on it starts. `host` is the renderer: it owns the `state` (`hover`, `drag`), the
 * `_drag` gesture, `data`, `props`, `isMultiSelect` and the helpers named below.
 */
/** The strips above and below a pill's outer box (002c R11), in px. */
const STRIP = 11;

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

    /**
     * Whether a gesture is on (a drawing is shown, the drag is not idle, or a dependency is being
     * drawn: the highlight of the arrows is frozen, 002c R9). A press on a drawing handle is no
     * gesture until the pointer has moved by the threshold: until then the highlight still
     * follows the pointer (R9, A27's path crosses an arrow's band before it).
     */
    get isHeld() {
        return (
            Boolean(this.host.state.drag) ||
            this.host._drag.state !== "idle" ||
            this.host.connect.isActive
        );
    }

    /**
     * The pointer enters a pill: its handles show, unless a gesture is on (R8). With touch the
     * handles follow the pill last tapped, not where a finger goes (002d R3): the events a finger
     * leaves behind (the browser's mouse enter) change nothing; only `tap` sets them (`tapped`).
     */
    enter(pill, row, { lit = true, tapped = false } = {}) {
        if (this.host.arrows.isTouch && !tapped) {
            return;
        }
        if (!tapped) {
            // a mouse resting on a pill: the place of an earlier tap is forgotten
            this._tapPlace = null;
        }
        if (!this.isHeld) {
            this.host.state.hover = this.keyOf(pill, row);
            // R9: the arrows of a pill of a record row light up (not for a tap, R11)
            if (lit && row.kind === "pills") {
                this.host.arrows.focusPill(this.keyOf(pill, row));
            }
        }
    }

    /**
     * A tap on a pill (it also opens its popover) leaves it in the pointer-over state, as a mouse
     * resting on it would: its handles show until a finger touches elsewhere (R11, A91). Its
     * arrows stay at rest: a finger on a handle lights them. What lit while the finger was down
     * on the pill goes with the tap. The pill stays the last tapped one, by its key (the row and
     * the record), through the reloads that follow a write, until a finger touches elsewhere.
     */
    tap(ev, pill, row) {
        if (ev.pointerType === "touch") {
            this.enter(pill, row, { lit: false, tapped: true });
            this.host.arrows.unfocusPill(this.keyOf(pill, row));
            this._tapPlace = this._placeOf(ev);
        }
    }

    /** The place of a tap in grid coordinates (it scrolls with the grid), or null. */
    _placeOf(ev) {
        const grid = this.host.rendererRef()?.querySelector(".o_tl_grid");
        if (!grid || !Number.isFinite(ev.clientX)) {
            return null;
        }
        const box = grid.getBoundingClientRect();
        return { x: ev.clientX - box.left, y: ev.clientY - box.top };
    }

    /**
     * The grid was drawn again (a write moved pills, the view reloaded): the handles go with the
     * place of the last tap, not with the record (002d R3, A17). The pill last tapped keeps them
     * while it still covers the place; otherwise the pill that now covers it shows them (its body
     * first, then the strips of 11 px above and below its outer box that its handles bring), then
     * the pill that lies at the height of the tap in the lane the tapped pill left (ruling T16-1),
     * or none. Nothing changes while a gesture is on or no tap was made.
     */
    settle() {
        const place = this._tapPlace;
        if (!place || this.isHeld || !this.host.arrows.isTouch) {
            return;
        }
        const grid = this.host.rendererRef()?.querySelector(".o_tl_grid");
        if (!grid) {
            return;
        }
        const box = grid.getBoundingClientRect();
        const x = box.left + place.x;
        const y = box.top + place.y;
        const found = [];
        for (const pillEl of grid.querySelectorAll(".o_tl_row[data-row-id] .o_tl_pill[data-pill-id]")) {
            if (pillEl.classList.contains("o_tl_pill_moved")) {
                continue;
            }
            const rect = pillEl.getBoundingClientRect();
            const key = `${pillEl.closest(".o_tl_row[data-row-id]").dataset.rowId}|${pillEl.dataset.pillId}`;
            const dx = Math.max(rect.left - 1 - x, x - (rect.right + 1), 0);
            const inY = (extra) => y >= rect.top - 1 - extra && y < rect.bottom + 1 + extra;
            found.push({ key, dx, body: inY(0), strip: inY(STRIP) });
        }
        const current = this.host.state.hover;
        // where the finger was (the pill, its body, its strips), then the pill that lies at the
        // finger's height (the lane the tapped pill left), the nearest one along the lane
        const nearest = (list) => list.sort((a, b) => a.dx - b.dx)[0]?.key;
        const key =
            found.find((entry) => entry.key === current && entry.strip && !entry.dx)?.key ??
            found.find((entry) => entry.body && !entry.dx)?.key ??
            found.find((entry) => entry.strip && !entry.dx)?.key ??
            // the tapped pill itself, moved away, shows none (R3)
            nearest(found.filter((entry) => entry.body && entry.key !== current)) ??
            null;
        if (key !== current) {
            this.host.state.hover = key;
        }
    }

    /** A finger goes down on a pill's body: its arrows light as for a pointer arriving (R9, 002d R3). */
    touchDown(ev, pill, row) {
        if (ev.pointerType === "touch" && row.kind === "pills") {
            this.host.arrows.touchLit(this.keyOf(pill, row));
        }
    }

    /** A finger goes down away from every pill and handle: the pointer-over state ends. */
    touchAway(ev) {
        if (
            ev?.pointerType !== "touch" ||
            this.host.arrows.isMouseDown ||
            this.host.connect.isPressed ||
            this.isHeld
        ) {
            // a finger put down while a gesture is held is no tap away (002d R3, R4 point 3, A24)
            return;
        }
        if (ev.target?.closest?.(".o_tl_pill[data-pill-id], .o_tl_connect_handle, .o_tl_connect_strip")) {
            return;
        }
        this._tapPlace = null;
        if (!this.host.state.hover) {
            return;
        }
        this.host.state.hover = null;
        this.host.arrows.unfocusPill();
    }

    /**
     * The pointer leaves a pill, or one of its drawing handles or strips (which lie beside it):
     * not when it goes from one to the other, the pill is still the one it rests on.
     */
    leave(pill, row, ev) {
        if (this.host.arrows.isTouch) {
            // a finger leaves no pointer to leave: `touchAway` ends the pill's state (002d R3)
            return;
        }
        const key = pill && row ? this.keyOf(pill, row) : undefined;
        const into = ev?.relatedTarget?.closest?.(
            ".o_tl_pill[data-pill-id], .o_tl_connect_handle, .o_tl_connect_strip"
        );
        if (key !== undefined && into) {
            const rowEl = into.closest(".o_tl_row[data-row-id]");
            const intoKey = into.dataset.pillKey ?? `${rowEl?.dataset.rowId}|${into.dataset.pillId}`;
            if (intoKey === key) {
                return;
            }
        }
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
    press(ev, pill, row, { element: through = null, handle: edge = null } = {}) {
        const host = this.host;
        if (ev.button !== 0 || host.data.isSample) {
            return;
        }
        if (host.isMultiSelect && !host._holdsPill(ev, pill)) {
            // R5: a locked pill is no obstacle to a drawing, which starts at the cell under it
            host._pressDrawing(ev, ev.currentTarget.closest(".o_tl_row"), row);
            return;
        }
        // the press may come from a strip beside the pill (R11): the pill's own body gives the box
        const element = through
            ? through
            : ev.currentTarget.matches(".o_tl_pill")
            ? ev.currentTarget
            : ev.currentTarget
                  .closest(".o_tl_pills")
                  .querySelector(`:scope > .o_tl_pill[data-pill-id="${pill.id}"]`);
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
        const handle = edge || ev.target.closest?.(".o_tl_handle")?.dataset.edge || null;
        host._drag.press(ev, pill, { rowId: row.row.id, handle });
    }
}
