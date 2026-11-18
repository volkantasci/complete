// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";
import { MOVE_EDGE, SELECT_EDGE, TimelineEdgeScroll } from "./timeline_edge_scroll";
import { LONG_PRESS, MOVE_THRESHOLD } from "./timeline_selection";

/** Movement in pixels that starts a move with a mouse, or abandons a touch press (R2). */
export const DRAG_THRESHOLD = MOVE_THRESHOLD;
export { LONG_PRESS };

/** Milliseconds after a gesture during which a double click is not counted (R9). */
const DOUBLE_CLICK_GUARD = 500;

/** Keys that do not cancel a gesture in progress (R2); Ctrl only decides copy or move (R7). */
/** How long after its lift the tap click of a cancelling finger is still waited for, in ms. */
const FINGER_CLICK_WAIT = 600;

/**
 * The finger that cancelled a gesture (002d R4 point 3) does nothing else: its put-down was
 * stopped by the caller, and here its lift and the click that follows it go no further, so that
 * no cell dialog, popover or selection comes of them. A mouse click (the release of the gesture's
 * own button) is not the finger's and is left to the gesture.
 */
export function swallowFinger(doc, id) {
    let timer = null;
    const stopClick = () => {
        doc.removeEventListener("click", onClick, true);
        browser.clearTimeout(timer);
    };
    const onClick = (event) => {
        if (event.pointerType === "mouse") {
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        stopClick();
    };
    const stopEnd = () => {
        doc.removeEventListener("pointerup", onUp, true);
        doc.removeEventListener("pointercancel", onCancel, true);
    };
    const onUp = (event) => {
        if (event.pointerId !== id) {
            return;
        }
        event.stopPropagation();
        stopEnd();
        doc.addEventListener("click", onClick, true);
        timer = browser.setTimeout(stopClick, FINGER_CLICK_WAIT);
    };
    const onCancel = (event) => {
        if (event.pointerId === id) {
            event.stopPropagation();
            stopEnd();
        }
    };
    doc.addEventListener("pointerup", onUp, true);
    doc.addEventListener("pointercancel", onCancel, true);
}

export const HARMLESS_KEYS = ["Alt", "Control", "Meta", "Shift"];

/**
 * The gestures of this class, by `mode`. A mode is what the pointer does while the button is
 * held; each one is a row of this table. Later tasks add theirs here (resize handles, the press of
 * a locked pill) together with the `host` methods they need.
 * - `move`, `copy`: the pill follows the pointer; the target is a sub-column of a row (R3).
 * `copy` is `move` with Ctrl held (R7): the mode switches while the gesture runs.
 * - `resize-start`, `resize-stop`: a handle of the pill is held; the moved edge goes to the
 * sub-column border nearest to the pointer (R8). Only a mouse holds a handle (D5, R16).
 * - `lock`: a pill that cannot be moved (R1) is held; it follows nothing and has no target (R11).
 * - `panel`: a line of the side panel is held (002b3 R21); its target is a span of one column over a
 * row, the grid never scrolls (no edge scrolling).
 */
const MODES = {
    move: { follows: true },
    copy: { follows: true },
    "resize-start": { edge: "start" },
    "resize-stop": { edge: "stop" },
    lock: {},
    panel: { follows: true, fixed: true },
};

/**
 * The pointer state machine of a gesture that starts on a pill (R2, R9): idle, `pending` (pressed,
 * not yet a gesture), `dragging`.
 *
 * The renderer draws and writes; this class only follows the pointer. The host gives:
 * - `pillState(pill)`: `{movable, resizable: {start, stop}}` for the pill descriptor `pill`
 *   (R1, R8);
 * - `targetAt(x, y, grab)`: the target under the viewport point. `{rowId, part}` (`part`: the
 *   sub-column where the pill would start, the grab offset taken off and the pill kept inside the
 *   grid), `null` when nothing accepts a drop there (headers, control panel, a refusing row), or
 *   `undefined` to keep the previous target (a folded column). With `grab` `null` it answers the
 *   plain cell under the point (the press: where the pill was grabbed);
 * - `edges()` and `scrollBy(dx, dy)`: the scrolling area and its scrolling, for edge scrolling
 *   (R14; not used yet);
 * - `change(drawing)`: what to draw now, `{mode, pill, rowId, target, offset: {x, y}}` (`offset`:
 *   how far the pointer is from where it was pressed, in pixels), or `null` for nothing;
 * - `commit(result)`: the release, `{mode, pill, rowId, target}` (`target` may be `null`);
 * - `changesNothing({mode, pill, rowId, target})` (optional): whether the release would change
 *   nothing and call nothing (a move or a resize in its starting sub-column, 002d R1a); a move
 *   that an automatic method still sends to the server (002c R16 point 4) is not that case;
 * - `released(x, y)` (optional): a held gesture is released where nothing is written (no target, or
 *   `changesNothing`), the viewport point of the release (002d R1)
 * - `cancelled({lost, finger})` (optional): a held gesture was cancelled (a key, the system taking
 *   the pointer away: `lost`, a second finger: `finger`, the page hidden), no `commit` follows;
 * - `insideGrid(event)` (optional): whether the event's target lies in the view's grid (a second
 *   finger elsewhere does not cancel, 002d R4);
 * - `borderAt(x, pill, edge)`: for a resize, the sub-column border nearest to the viewport
 *   abscissa `x` for the edge `edge` of `pill` (kept one sub-column from the other edge), or
 *   `undefined` to keep the previous one (a folded column); the drawing's `target` is then
 *   `{part: border}`, or `null` while the pointer has not given one;
 * - `panelOpen()` (optional): the side panel is open, a pill move does not scroll the grid
 *   (002b3 R23);
 * - `hold(mode)`: the gesture in `mode` is held (the view root takes the pointer shape), or `null`
 *   when it is over.
 *
 * `press(ev, pill, {handle, rowId})` starts it: `handle` ("start" or "stop") is the resize
 * handle that was pressed, `rowId` the row of the pill. A finger on a handle moves the pill (D5).
 * `pressLine(ev, line)` starts the drag of a line of the side panel (002b3 R21): `targetAt(x, y,
 * {panel: true})` answers its target (`{rowId, part, length}` or `null`) and `change` gets `{mode:
 * "panel", line, x, y, target}`.
 */
export class TimelinePillDrag {
    constructor(host) {
        this.host = host;
        this.state = "idle";
        this._listeners = [];
        this._timer = null;
        this._press = null;
        this._suppressClick = false;
        this._release = null;
        this._held = null;
        this._recent = false;
        this._recentTimer = null;
        this._pairSwallowed = false;
        // the click of a cancelled gesture's release was swallowed (`detail` `_pairBase`): a
        // browser counts the next click as its second; it does not pair (002d R2 point 1, A13)
        this._cancelledRelease = false;
        this._pairBase = 0;
        this._pairTimer = null;
        // the grid scrolled under the held pointer: the target is worked out again (R14)
        this._edge = new TimelineEdgeScroll({
            edges: () => this.host.edges(),
            scrollBy: (dx, dy) => this.host.scrollBy(dx, dy),
            onScrolled: () => this.refresh(),
            axes: "xy",
        });
    }

    get isActive() {
        return this.state === "dragging";
    }

    /**
     * A gesture ended a moment ago and the first click of the current click pair was the swallowed
     * click of its release: the pair is no double click (R9). A pair that began with a click on
     * another pill is one.
     */
    get justReleased() {
        return this._recent && this._pairSwallowed;
    }

    /** The grid scrolled under a held pointer: work the target out again. */
    refresh() {
        if (this.state === "dragging") {
            this._update();
        }
    }

    /** A new press: the click of the previous release has had its chance. */
    resetClick() {
        this._suppressClick = false;
        this._forgetRelease();
    }

    /** R9: the click that follows the release of a gesture is not a click on a pill or a cell. */
    consumeClick(detail = 1) {
        const suppressed = this._suppressClick;
        this._suppressClick = false;
        if (suppressed) {
            this._pairSwallowed = true;
            if (this._cancelledRelease) {
                this.noteCancelledClick(detail);
            }
        } else if (detail <= 1) {
            this._pairSwallowed = false;
        }
        return suppressed;
    }

    /**
     * The click of the release of a cancelled gesture was swallowed, with the click count `detail`:
     * the clicks that follow it in the same series are counted again from one (`clickDetail`).
     */
    noteCancelledClick(detail = 1) {
        this._cancelledRelease = false;
        this._pairBase = detail || 1;
        this._armPair();
    }

    /** The click count of a click, the swallowed click of a cancelled release not counted. */
    clickDetail(detail) {
        if (!this._pairBase) {
            return detail;
        }
        if (detail <= this._pairBase) {
            // a new series of clicks
            this._dropPair();
            return detail;
        }
        this._armPair();
        return detail - this._pairBase;
    }

    /** Whether the current series of clicks began with the release of a cancelled gesture. */
    get isPaired() {
        return this._pairBase > 0;
    }

    _armPair() {
        browser.clearTimeout(this._pairTimer);
        this._pairTimer = browser.setTimeout(() => this._dropPair(), DOUBLE_CLICK_GUARD);
    }

    _dropPair() {
        browser.clearTimeout(this._pairTimer);
        this._pairBase = 0;
        this._pairTimer = null;
    }

    /**
     * A press on a pill. Nothing starts before the pointer has moved (R2); a release before is a
     * plain click. A handle that cannot resize is ignored.
     * @param {PointerEvent} ev
     * @param {Object} pill pill descriptor
     * @param {{handle?: string|null, rowId?: string|null}} [options]
     */
    press(ev, pill, { handle = null, rowId = null } = {}) {
        if (this.state !== "idle") {
            return;
        }
        this._suppressClick = false;
        this._forgetRelease();
        const mode = this._baseMode(pill, handle, ev.pointerType);
        if (!mode) {
            return;
        }
        // where the pill was grabbed: the sub-column under the pointer, in the pill
        const pressed = MODES[mode].follows
            ? this.host.targetAt(ev.clientX, ev.clientY, null)
            : null;
        const offset = pressed ? pressed.part - pill.record.span.from : 0;
        this._arm(ev, {
            pill,
            rowId,
            mode,
            grab: {
                offset,
                length: pill.record.span.to - pill.record.span.from,
                rowId,
                // where it was grabbed and which pill: date-only steps count from there (R17)
                press: pressed ? pressed.part : null,
                pill,
            },
        });
    }

    /**
     * A press on a line of the side panel (002b3 R21). The drag starts with the first move of 10
     * px; a release before is a click. `line` is passed back to the host as it is.
     */
    pressLine(ev, line) {
        if (this.state !== "idle") {
            return;
        }
        this._suppressClick = false;
        this._forgetRelease();
        this._arm(ev, { pill: null, rowId: null, mode: "panel", line, grab: { panel: true } });
    }

    _arm(ev, { pill, rowId, mode, grab, line = null }) {
        this._press = {
            id: ev.pointerId,
            type: ev.pointerType,
            x0: ev.clientX,
            y0: ev.clientY,
            x: ev.clientX,
            y: ev.clientY,
            pill,
            rowId,
            mode,
            line,
            copy: ev.ctrlKey === true,
            grab,
            target: null,
        };
        this.state = "pending";
        const doc = ev.target.ownerDocument;
        // The events of a finger go to the element it went down on, even once that element left
        // the page: a resize handle under the finger is drawn away as the press begins (nothing
        // shows handles during a gesture), and its events then no longer reach the document
        // (002d R2, D2). The element is listened to as well; one event is handled once.
        const handled = new WeakSet();
        const once = (handler) => (event) => {
            if (!handled.has(event)) {
                handled.add(event);
                handler(event);
            }
        };
        const both = ev.pointerType === "touch" ? [doc, ev.target] : [doc];
        for (const target of both) {
            this._listen(target, "pointermove", once((event) => this._onMove(event)));
            this._listen(target, "pointerup", once((event) => this._onUp(event)));
            this._listen(target, "pointercancel", once((event) => this._onCancel(event)));
        }
        // a finger put down inside the grid ends a gesture, a mouse gesture too, as Escape does
        // (002d R4 point 3, T4-1); one outside the grid (below the last row, on the control panel) does not.
        // A lost window focus does not cancel (point 5): no `blur` listener.
        this._listen(
            doc,
            "pointerdown",
            (event) => {
                const press = this._press;
                if (
                    !press ||
                    event.pointerId === press.id ||
                    event.pointerType !== "touch" ||
                    this.host.insideGrid?.(event) === false
                ) {
                    return;
                }
                const { id } = press;
                const dragging = this.state === "dragging";
                // the finger that ends the gesture starts and lights nothing itself: its event
                // goes no further (002d R4 point 3)
                event.stopPropagation();
                swallowFinger(doc, event.pointerId);
                this._cancel({ finger: true });
                if (dragging) {
                    this._awaitRelease(doc, id);
                }
            },
            { capture: true }
        );
        // the page hidden: no release will come
        this._listen(doc, "visibilitychange", () => {
            if (doc.visibilityState === "hidden") {
                this._cancel();
            }
        });
        this._listen(doc, "keydown", (event) => this._onKeyDown(event), { capture: true });
        this._listen(doc, "keyup", (event) => this._onKeyUp(event), { capture: true });
        if (ev.pointerType === "touch") {
            // a held finger would scroll the grid and open the context menu otherwise
            for (const target of both) {
                this._listen(target, "touchmove", once((event) => this._onTouchMove(event)), {
                    passive: false,
                });
            }
            this._listen(doc, "contextmenu", (event) => event.preventDefault());
            this._timer = browser.setTimeout(() => {
                this._timer = null;
                if (this.state === "pending") {
                    // the gesture starts with the first move: a release without one is a tap
                    this._press.armed = true;
                    if (this._press.mode === "lock") {
                        // a pill that cannot move shows its locked state at once (R11, R16)
                        this._begin();
                    }
                }
            }, LONG_PRESS);
        }
    }

    destroy() {
        browser.clearTimeout(this._recentTimer);
        browser.clearTimeout(this._pairTimer);
        this._finish();
        this._forgetRelease();
    }

    // ------------------------------------------------------------------------

    /** The mode a press starts with, or null when this press starts nothing (yet). */
    _baseMode(pill, handle, pointerType) {
        const state = this.host.pillState(pill);
        if (handle && pointerType !== "touch") {
            return state.resizable[handle] ? `resize-${handle}` : null;
        }
        // a finger on a handle holds the pill itself (D5)
        return state.movable ? "move" : "lock";
    }

    _listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this._listeners.push(() => target.removeEventListener(type, handler, options));
    }

    _own(ev) {
        return this._press && ev.pointerId === this._press.id;
    }

    /** The mode now: Ctrl turns a move into a copy and back (R7). */
    get _mode() {
        const press = this._press;
        return press.mode === "move" && press.copy ? "copy" : press.mode;
    }

    _begin() {
        this.state = "dragging";
        this._setHeld(this._mode);
        this._update();
    }

    _setHeld(mode) {
        if (mode !== this._held) {
            this._held = mode;
            this.host.hold(mode);
        }
    }

    _onMove(ev) {
        if (!this._own(ev)) {
            return;
        }
        const press = this._press;
        press.x = ev.clientX;
        press.y = ev.clientY;
        if (this.state === "pending") {
            const far = Math.hypot(press.x - press.x0, press.y - press.y0) >= DRAG_THRESHOLD;
            if (!far) {
                return;
            }
            if (press.type === "touch" && !press.armed) {
                // the finger moved before the press was long: the grid scrolls on its own
                this._finish();
                return;
            }
            this._begin();
        } else if (this.state !== "dragging") {
            return;
        }
        this._update();
    }

    _onTouchMove(ev) {
        if ((this.state === "dragging" || this._press?.armed) && ev.cancelable) {
            ev.preventDefault();
        }
    }

    _onUp(ev) {
        if (!this._own(ev)) {
            return;
        }
        const dragging = this.state === "dragging";
        const { pill, rowId, target, line, x, y } = this._press;
        const mode = dragging ? this._mode : null;
        // a release where nothing is written: no target, or a move or a resize that changes
        // nothing (n = 0 sub-columns and, for a move, the row's values already held; 002d R1a):
        // the arrows lit at the start stay lit (R1)
        const nothing =
            dragging &&
            mode !== "panel" &&
            (!target || this.host.changesNothing?.({ mode, pill, rowId, target }) === true);
        if (nothing) {
            this.host.released?.(x, y);
        }
        this._finish();
        if (dragging) {
            this.host.change(null);
            // the click that follows is the end of the gesture, not a click on a pill or a cell
            this._expectClick();
            if (!nothing || !target) {
                this.host.commit({ mode, pill, rowId, target, line });
            }
        }
    }

    _onCancel(ev) {
        if (this._own(ev)) {
            // the system took the pointer away: unlike Escape, no arrow stays lit (002d R4 point 2)
            this._cancel({ lost: true });
        }
    }

    _onKeyDown(ev) {
        if (!this._press) {
            return;
        }
        if (ev.key === "Control") {
            this._press.copy = true;
            this._modeChanged();
        } else if (this.state === "dragging" && !HARMLESS_KEYS.includes(ev.key)) {
            // any other key cancels; the button is still down, so its release is swallowed
            // together with its click
            ev.preventDefault();
            ev.stopPropagation();
            const { id } = this._press;
            const doc = ev.target.ownerDocument || document;
            this._cancel();
            this._awaitRelease(doc, id);
        }
    }

    _onKeyUp(ev) {
        if (this._press && ev.key === "Control") {
            this._press.copy = false;
            this._modeChanged();
        }
    }

    _modeChanged() {
        if (this.state === "dragging") {
            this._setHeld(this._mode);
            this._update();
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
            // the click of this release is swallowed and pairs with no later click: the next click
            // is a click at once, a double click after it a double click (002d R2 point 1, A13)
            this._expectClick({ guard: false, cancelled: true });
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

    /**
     * Swallow the click of this release, and forget it once the click had its chance. With
     * `guard`, a double click that begins with it is no click and no double click (R9) for
     * `DOUBLE_CLICK_GUARD`.
     */
    _expectClick({ guard = true, cancelled = false } = {}) {
        this._suppressClick = true;
        this._cancelledRelease = cancelled;
        browser.setTimeout(() => {
            this._suppressClick = false;
        }, 0);
        if (!guard) {
            return;
        }
        this._recent = true;
        browser.clearTimeout(this._recentTimer);
        this._recentTimer = browser.setTimeout(() => {
            this._recent = false;
            this._pairSwallowed = false;
        }, DOUBLE_CLICK_GUARD);
    }

    /** `lost`: the pointer was cancelled by the system; `finger`: another finger went down. */
    _cancel({ lost = false, finger = false } = {}) {
        if (this.state === "dragging") {
            this.host.change(null);
            this.host.cancelled?.({
                lost,
                finger,
                touch: this._press?.type === "touch",
                inZone: this._edge.inZone,
            });
        }
        this._finish();
    }

    _update() {
        const press = this._press;
        const mode = MODES[this._mode];
        if (mode.follows) {
            const target = this.host.targetAt(press.x, press.y, press.grab);
            if (target !== undefined) {
                press.target = target;
            }
        } else if (mode.edge) {
            const border = this.host.borderAt(press.x, press.pill, mode.edge);
            if (border !== undefined) {
                press.target = border === null ? null : { part: border };
            }
        }
        this.host.change({
            mode: this._mode,
            pill: press.pill,
            rowId: press.rowId,
            target: press.target,
            line: press.line,
            x: press.x,
            y: press.y,
            offset: { x: press.x - press.x0, y: press.y - press.y0 },
            touch: press.type === "touch",
        });
        if ((mode.follows && !mode.fixed && !this.host.panelOpen?.()) || mode.edge) {
            // R14: a move scrolls on both axes near an edge; a resize like a selection, on x;
            // with the side panel open a move does not scroll (002b3 R23)
            this._edge.axes = mode.edge ? "x" : "xy";
            this._edge.follow(press.x, press.y, mode.edge ? SELECT_EDGE : MOVE_EDGE);
        }
    }

    _finish() {
        this.state = "idle";
        this._press = null;
        browser.clearTimeout(this._timer);
        this._timer = null;
        for (const remove of this._listeners) {
            remove();
        }
        this._listeners = [];
        this._edge.stop();
        this._setHeld(null);
    }
}
