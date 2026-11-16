// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { proxy } from "@odoo/owl";
import { DRAG_THRESHOLD, HARMLESS_KEYS } from "./timeline_drag";
import { MOVE_EDGE, TimelineEdgeScroll } from "./timeline_edge_scroll";

/** Side of the press area of a drawing handle, in px (R11, M15, M17). */
export const HANDLE_SIZE = 16;
/**
 * Where the centre of a handle lies against the body of its pill (S2): the start handle 8 px in
 * from its end and 8 px above the body, the end handle 6 px in from its end and 8 px below it.
 */
const CENTRE = { start: { inward: 8, up: -8 }, stop: { inward: 6, up: 8 } };

/**
 * The drawing handles of a pill and the gesture that draws a dependency from one (002c R11, R12):
 * idle, `pending` (the left button is down on a handle, the pointer has not moved far enough),
 * `dragging` (a line follows the pointer).
 *
 * The renderer draws and writes; this class follows the pointer. The host gives:
 * - `canConnect()`: the view draws dependencies and edits (D2, R4);
 * - `hovered()`: the key (`rowId|pillId`) of the pill the pointer rests on;
 * - `blocked()`: another gesture (a move, a resize, a selection) is on, so no handle shows;
 * - `keyOf(rowId, pillId)`: the key of a pill;
 * - `targetAt(x, y)`: the pill of a record row under the viewport point, `{key, rowId, pillId}`,
 *   or null (the handles of a pill count as the pill);
 * - `anchorOf(rowId, pillId, edge)`: the viewport point of the centre of the handle (`edge` is
 *   "start" or "stop"), or null when the pill is not drawn;
 * - `route(from, to)`: the path of the line between two viewport points, or null;
 * - `edges()` and `scrollBy(dx, dy)`: the scrolling area and its scrolling (edge scrolling as a
 *   move, R12.2); `panelOpen()` (optional): the side panel is open, the grid does not scroll;
 * - `hold(on)`: the drawing is on (the view root takes the pointer shape, the selection and the
 *   popover go) or over;
 * - `rest(x, y)`: the drawing ended with the pointer at the viewport point (the pill under it, if
 *   any, shows its handles again, as the pointer entered it);
 * - `commit({source, target})`: the release over another pill; `source` is `{rowId, pillId}`.
 *
 * `drawing` is what the template reads: the key of the source pill, the key of the other pill
 * under the pointer and the path of the line.
 */
export class TimelineConnectDrag {
    constructor(host) {
        this.host = host;
        this.state = "idle";
        this.drawing = proxy({ source: null, target: null, d: null });
        this._press = null;
        this._listeners = [];
        this._edge = new TimelineEdgeScroll({
            edges: () => this.host.edges(),
            scrollBy: (dx, dy) => this.host.scrollBy(dx, dy),
            onScrolled: () => this.refresh(),
            axes: "xy",
        });
    }

    /** Whether the line is being drawn. */
    get isActive() {
        return this.state === "dragging";
    }

    /** Whether the button is down on a handle (the pointer may not have moved far enough yet). */
    get isPressed() {
        return this.state !== "idle";
    }

    /** Whether `key` is the pill the line starts from. */
    isSource(key) {
        // `drawing` is read first: a render that finds the drawing idle must still follow it
        const source = this.drawing.source;
        return this.isPressed && source === key;
    }

    /**
     * The handles drawn with a pill of a record row (R11, R24): none unless the view edits; the
     * pill the pointer rests on shows both, unless another gesture is on. While a line is drawn the
     * source pill keeps its handles and the pill under the pointer shows its own.
     */
    handlesOf(pill, row) {
        const host = this.host;
        // read first, so that a render that finds the drawing idle follows it when it starts
        const { source, target } = this.drawing;
        if (!host.canConnect()) {
            return [];
        }
        const key = host.keyOf(row.row.id, pill.id);
        const shown = this.isPressed
            ? key === source || key === target
            : host.hovered() === key && !host.blocked();
        return shown ? [{ edge: "start" }, { edge: "stop" }] : [];
    }

    /** The viewport point of the centre of a handle of the pill body `rect` (S2, M15, M17). */
    static centreOf(rect, edge, rtl) {
        const { inward, up } = CENTRE[edge];
        // the start handle stands at the leading end of the body, the end handle at the other
        const atLeft = (edge === "start") !== rtl;
        return {
            x: atLeft ? rect.left + inward : rect.right - inward,
            y: up < 0 ? rect.top + up : rect.bottom + up,
        };
    }

    /** The left button went down on the handle `edge` of `pill`, drawn in the row `rowId`. */
    press(ev, { pill, rowId, edge }) {
        if (this.state !== "idle" || ev.button !== 0 || ev.pointerType === "touch") {
            return;
        }
        if (!this.host.canConnect()) {
            return;
        }
        this._press = {
            id: ev.pointerId,
            x0: ev.clientX,
            y0: ev.clientY,
            x: ev.clientX,
            y: ev.clientY,
            pillId: pill.id,
            rowId,
            edge,
        };
        this.state = "pending";
        // from now on the pill under the pointer is the source's: handles and highlight stay
        this.drawing.source = this.host.keyOf(rowId, pill.id);
        const doc = ev.target.ownerDocument;
        this._listen(doc, "pointermove", (event) => this._onMove(event));
        this._listen(doc, "pointerup", (event) => this._onUp(event));
        this._listen(doc, "pointercancel", (event) => this._onCancel(event));
        // another finger on the screen: the gesture is no longer one pointer's
        this._listen(
            doc,
            "pointerdown",
            (event) => {
                if (event.pointerId !== this._press?.id) {
                    this._finish();
                }
            },
            { capture: true }
        );
        // no release will come when the window or the tab loses the focus
        this._listen(doc.defaultView, "blur", () => this._finish());
        this._listen(doc, "visibilitychange", () => {
            if (doc.visibilityState === "hidden") {
                this._finish();
            }
        });
        this._listen(doc, "keydown", (event) => this._onKeyDown(event), { capture: true });
    }

    /** The grid scrolled under the held pointer: the line and the target are worked out again. */
    refresh() {
        if (this.isActive) {
            this._update();
        }
    }

    destroy() {
        this._finish();
    }

    // ------------------------------------------------------------------------

    _listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this._listeners.push(() => target.removeEventListener(type, handler, options));
    }

    _own(ev) {
        return this._press && ev.pointerId === this._press.id;
    }

    _onMove(ev) {
        if (!this._own(ev)) {
            return;
        }
        const press = this._press;
        press.x = ev.clientX;
        press.y = ev.clientY;
        if (this.state === "pending") {
            if (Math.hypot(press.x - press.x0, press.y - press.y0) < DRAG_THRESHOLD) {
                return;
            }
            this.state = "dragging";
            this.host.hold(true);
        }
        this._update();
    }

    _onUp(ev) {
        if (!this._own(ev)) {
            return;
        }
        const press = this._press;
        const dragging = this.isActive;
        let target = null;
        if (dragging) {
            target = this.host.targetAt(ev.clientX, ev.clientY);
            if (target?.key === this.drawing.source) {
                target = null;
            }
        }
        const source = { rowId: press.rowId, pillId: press.pillId };
        this._finish();
        if (dragging) {
            this.host.rest(ev.clientX, ev.clientY);
        }
        if (target) {
            this.host.commit({ source, target });
        }
    }

    _onCancel(ev) {
        if (this._own(ev)) {
            this._finish();
        }
    }

    /** Any key but a modifier cancels, as it cancels a move (R12.4). */
    _onKeyDown(ev) {
        if (this.isActive && !HARMLESS_KEYS.includes(ev.key)) {
            ev.preventDefault();
            ev.stopPropagation();
            this._finish();
        }
    }

    _update() {
        const press = this._press;
        const { host, drawing } = this;
        const target = host.targetAt(press.x, press.y);
        const key = target?.key ?? null;
        drawing.target = key !== null && key !== drawing.source ? key : null;
        const from = host.anchorOf(press.rowId, press.pillId, press.edge);
        drawing.d = from ? host.route(from, { x: press.x, y: press.y }) : null;
        if (!host.panelOpen?.()) {
            this._edge.follow(press.x, press.y, MOVE_EDGE);
        }
    }

    _finish() {
        const wasActive = this.isActive;
        this.state = "idle";
        this._press = null;
        for (const remove of this._listeners) {
            remove();
        }
        this._listeners = [];
        this._edge.stop();
        Object.assign(this.drawing, { source: null, target: null, d: null });
        if (wasActive) {
            this.host.hold(false);
        }
    }
}
