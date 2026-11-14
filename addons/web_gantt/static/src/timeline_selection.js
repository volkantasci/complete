// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";
import { SELECT_EDGE, TimelineEdgeScroll } from "./timeline_edge_scroll";

/** Movement in pixels that starts a selection with a mouse, or abandons a touch press (R4). */
export const MOVE_THRESHOLD = 10;
/** Milliseconds a finger stays still before a selection starts (R4). */
export const LONG_PRESS = 300;

/**
 * The pointer state machine of the selection of cells (R4): idle, `pending` (pressed, not yet
 * a selection), `selecting`.
 *
 * The renderer draws; this class only follows the pointer. The host gives:
 * - `partAt(x, anchor)`: the sub-column under the viewport coordinate `x` of the row being
 *   selected (folded columns skipped in the direction away from `anchor`, the part where the
 *   selection started);
 * - `edges()`: `{left, right}`, the viewport bounds of the grid area without the row header;
 * - `scrollBy(dx, dy)`: scroll the grid (positive: its content moves to the left) and return the
 *   `{dx, dy}` really scrolled; the selection scrolls horizontally, by speed (R20), and also
 *   vertically when the host's `axes()` answers "xy" (the drawing of several rows, 002b3 R5.4);
 * - `change(selection)`: the selection `{row, from, to}` (inclusive, ordered) drawn now, or null.
 *   It also carries `startPart` (where it began), `part` (the sub-column under the pointer, not
 *   ordered) and `rowId` (the row under the pointer: always the pressed one unless the host gives
 *   `rowAt`, which a drawing over several rows does);
 * - `rowAt(y, rowId)` (optional): the id of the row under the viewport coordinate `y`, `rowId`
 *   (the row last given) when there is none;
 * - `axes()` (optional): "x" (default) or "xy", for the edge scrolling;
 * - `commit(selection)`: the release of a selection;
 * - `hold(on)`: a selection is (no longer) held.
 */
export class TimelineSelection {
    constructor(host) {
        this.host = host;
        this.state = "idle";
        this._listeners = [];
        this._timer = null;
        this._edge = new TimelineEdgeScroll({
            edges: () => this.host.edges(),
            scrollBy: (dx, dy) => this.host.scrollBy(dx, dy),
            onScrolled: () => this._update(),
            axes: "x",
        });
        this._press = null;
        this._suppressClick = false;
        this._release = null;
    }

    get isSelecting() {
        return this.state === "selecting";
    }

    /** A new press: the click of the previous release has had its chance. */
    resetClick() {
        this._suppressClick = false;
        this._forgetRelease();
    }

    /** Swallow the click of this release, and forget it once the click had its chance. */
    _expectClick() {
        this._suppressClick = true;
        browser.setTimeout(() => {
            this._suppressClick = false;
        }, 0);
    }

    /** The click that follows a release that ended a selection is not a click on a cell (R7). */
    consumeClick() {
        const suppressed = this._suppressClick;
        this._suppressClick = false;
        return suppressed;
    }

    /**
     * A press on a cell that may start a selection: the renderer has checked the conditions.
     * @param {PointerEvent} ev
     * @param {Object} row row descriptor
     */
    press(ev, row) {
        if (this.state !== "idle") {
            return;
        }
        this._suppressClick = false;
        this._forgetRelease();
        const startPart = this.host.partAt(ev.clientX, null);
        if (startPart === null) {
            return;
        }
        this._press = {
            id: ev.pointerId,
            type: ev.pointerType,
            x0: ev.clientX,
            y0: ev.clientY,
            x: ev.clientX,
            y: ev.clientY,
            row,
            startPart,
            part: startPart,
            rowId: row.row.id,
        };
        this.state = "pending";
        const doc = ev.target.ownerDocument;
        this._listen(doc, "pointermove", (event) => this._onMove(event));
        this._listen(doc, "pointerup", (event) => this._onUp(event));
        this._listen(doc, "pointercancel", (event) => this._onCancel(event));
        // the window loses the focus while the button is down: no release will come
        this._listen(doc.defaultView, "blur", () => this._cancel());
        this._listen(doc, "keydown", (event) => this._onKey(event), { capture: true });
        if (ev.pointerType === "touch") {
            // a held finger would scroll the grid and open the context menu otherwise
            this._listen(doc, "touchmove", (event) => this._onTouchMove(event), {
                passive: false,
            });
            this._listen(doc, "contextmenu", (event) => this._onContextMenu(event));
            this._timer = browser.setTimeout(() => {
                this._timer = null;
                if (this.state === "pending") {
                    // the selection starts with the first move: a release without one is a tap
                    this._press.armed = true;
                }
            }, LONG_PRESS);
        }
    }

    destroy() {
        this._finish();
        this._forgetRelease();
    }

    // ------------------------------------------------------------------------

    _listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this._listeners.push(() => target.removeEventListener(type, handler, options));
    }

    _begin() {
        this.state = "selecting";
        this._edge.axes = this.host.axes ? this.host.axes() : "x";
        this.host.hold(true);
        this._update();
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
            const far = Math.hypot(press.x - press.x0, press.y - press.y0) >= MOVE_THRESHOLD;
            if (!far) {
                return;
            }
            if (press.type === "touch" && !press.armed) {
                // the finger moved before the press was long: the grid scrolls on its own
                this._finish();
                return;
            }
            this._begin();
        } else if (this.state !== "selecting") {
            return;
        }
        this._update();
    }

    _onTouchMove(ev) {
        if ((this.state === "selecting" || this._press?.armed) && ev.cancelable) {
            ev.preventDefault();
        }
    }

    _onContextMenu(ev) {
        ev.preventDefault();
    }

    _onUp(ev) {
        if (!this._own(ev)) {
            return;
        }
        const selecting = this.state === "selecting";
        const selection = selecting ? this._selection() : null;
        this._finish();
        if (selecting) {
            // the click that follows is the end of the drawing, not a click on a cell
            this._expectClick();
            this.host.commit(selection);
        }
    }

    _onCancel(ev) {
        if (!this._own(ev)) {
            return;
        }
        this._cancel();
    }

    _onKey(ev) {
        if (ev.key === "Escape" && this.state === "selecting") {
            ev.preventDefault();
            ev.stopPropagation();
            const { id } = this._press;
            const doc = ev.target.ownerDocument || document;
            this._cancel();
            // the button is still down: its release is no click on a cell either, so the click
            // is swallowed at the real release, not now
            this._awaitRelease(doc, id);
        }
    }

    /** One-shot: the release of pointer `id` after a cancel swallows the click that follows. */
    _awaitRelease(doc, id) {
        this._forgetRelease();
        const onUp = (event) => {
            if (event.pointerId !== id) {
                return;
            }
            this._forgetRelease();
            this._expectClick();
        };
        const onCancel = (event) => {
            if (event.pointerId === id) {
                this._forgetRelease();
            }
        };
        doc.addEventListener("pointerup", onUp, true);
        doc.addEventListener("pointercancel", onCancel, true);
        this._release = () => {
            doc.removeEventListener("pointerup", onUp, true);
            doc.removeEventListener("pointercancel", onCancel, true);
        };
    }

    _forgetRelease() {
        this._release?.();
        this._release = null;
    }

    _cancel() {
        if (this.state === "selecting") {
            this.host.change(null);
        }
        this._finish();
    }

    _selection() {
        const { startPart, part, row, rowId } = this._press;
        return {
            row,
            from: Math.min(startPart, part),
            to: Math.max(startPart, part),
            startPart,
            part,
            rowId,
        };
    }

    _update() {
        const press = this._press;
        const part = this.host.partAt(press.x, press.startPart);
        if (part !== null) {
            press.part = part;
        }
        if (this.host.rowAt) {
            press.rowId = this.host.rowAt(press.y, press.rowId) ?? press.rowId;
        }
        this.host.change(this._selection());
        this._edge.follow(press.x, press.y, SELECT_EDGE);
    }

    _finish() {
        const wasHeld = this.state === "selecting";
        this.state = "idle";
        this._press = null;
        browser.clearTimeout(this._timer);
        this._timer = null;
        this._edge.stop();
        for (const remove of this._listeners) {
            remove();
        }
        this._listeners = [];
        if (wasHeld) {
            this.host.hold(false);
        }
    }
}
