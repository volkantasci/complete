// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, proxy, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { arrowConflict, arrowRoute, ARROW_COLOURS, dependencyPairs } from "./timeline_arrow_math";

let layerCount = 0;

/** Alpha of a line at rest and when it is lit (R8, R9). */
const ALPHA_REST = 0.5;
const ALPHA_LIT = 1;

/** A pill's outer box reaches this far outside its body, in pixels (002a M1). */
const OUTER_INSET = 1;

/**
 * The arrows between dependent pills (002c R4 to R10). `host` is the renderer: it owns the rows
 * of the layout, the pills in the DOM, the pill pointer (`_pillPointer.isHeld` freezes the
 * highlight) and the props (`archInfo`, `editor`, `dependencies`).
 *
 * The anchors are read from the DOM after every render (`refresh`): the pill bodies against the
 * area of the cells, so folded columns and a mirrored grid need no special case. The result is
 * `state.items`, drawn by `TimelineArrowLayer`. The highlight is `focus`: the pill the pointer
 * rests on (`pillKey`, `${rowId}|${pillId}`) and the arrow it rests on (`arrowKey`).
 */
export class TimelineArrows {
    constructor(host) {
        this.host = host;
        this.uid = `o_tl_arrow_${layerCount++}`;
        this.state = proxy({ items: [], box: null });
        this.focus = proxy({ pillKey: null, arrowKey: null });
        this._signature = "";
    }

    /** R4: a dependency field, real data, not a phone. */
    get enabled() {
        const { archInfo } = this.host.props;
        return Boolean(archInfo.dependencyField) && !this.host.data.isSample && !this.host.ui.isSmall;
    }

    /** The switch "Show dependencies" (R13); on when the controller gives none. */
    get shown() {
        return this.host.props.dependencies?.shown ?? true;
    }

    get canRemove() {
        return Boolean(this.host.props.archInfo.canEdit && this.host.props.editor);
    }

    /** Whether `item` is drawn highlighted (R9). */
    isLit(item) {
        const { pillKey, arrowKey } = this.focus;
        // R23: the arrows of a pill held for a move, a copy or a resize are lit
        const held = this.heldKey;
        return (
            arrowKey === item.key ||
            (held !== null && (held === item.sourcePillKey || held === item.targetPillKey)) ||
            (pillKey !== null && (pillKey === item.sourcePillKey || pillKey === item.targetPillKey))
        );
    }

    /**
     * The key of the pill a gesture moves or copies, or null (R23). A pill dragged from the side
     * panel, or locked, is not one of the drawn pills and has no arrows to move. A resized pill is
     * none either: its arrows stay where they were (`isResizing`).
     */
    get heldKey() {
        const drag = this.host.state.drag;
        const mode = drag?.mode;
        if (!drag || !(mode === "move" || mode === "copy")) {
            return null;
        }
        return `${drag.startRowId}|${drag.pillId}`;
    }

    /** R23: while a pill is resized its arrows do not follow the moving end. */
    get isResizing() {
        return Boolean(this.host.state.drag?.mode?.startsWith("resize-"));
    }

    // ------------------------------------------------------------------------
    // Geometry
    // ------------------------------------------------------------------------

    /** Reads the pills of the DOM again and replaces the arrows when something moved. */
    refresh() {
        // R13, R9: switching the arrows off or on is no pointer move: nothing lights until one
        if (this._wasShown !== undefined && this._wasShown !== this.shown) {
            this.reset();
        }
        this._wasShown = this.shown;
        if (this._recheck && !this.isHeld) {
            // the view is drawn again after a cancelled gesture: the pill under the pointer now
            this._recheck = false;
            this._showHandlesUnderPointer();
        }
        if (this.isResizing) {
            // R23: the arrows stay on the pill's stored box, as lit when the resize began
            return;
        }
        let items = [];
        let box = null;
        const grid = this.host.rendererRef()?.querySelector(".o_tl_grid");
        if (grid && this.enabled) {
            ({ items, box } = this._measure(grid));
        }
        const signature = JSON.stringify([items, box]);
        if (signature !== this._signature) {
            this._signature = signature;
            this.state.items = items;
            this.state.box = box;
        }
        // a highlight key that matches no drawn arrow or pill is stale (view reloaded)
        const { arrowKey, pillKey } = this.focus;
        if (arrowKey !== null && !items.some((item) => item.key === arrowKey)) {
            this.focus.arrowKey = null;
        }
        if (pillKey !== null && !this._hasPill(pillKey)) {
            this.focus.pillKey = null;
        }
    }

    _hasPill(key) {
        const root = this.host.rendererRef();
        return [...(root?.querySelectorAll(".o_tl_row[data-row-id] .o_tl_pill[data-pill-id]") ?? [])].some(
            (pill) => `${pill.closest(".o_tl_row[data-row-id]").dataset.rowId}|${pill.dataset.pillId}` === key
        );
    }

    /** R7: the stored type of each field decides how its value is read. */
    _fieldTypes() {
        const { model } = this.host.props;
        const { startField, stopField } = model.config;
        return {
            startIsDate: model.fields?.[startField]?.type === "date",
            stopIsDate: model.fields?.[stopField]?.type === "date",
        };
    }

    _measure(grid) {
        const host = this.host;
        const { archInfo, model } = host.props;
        const rowEls = [...grid.querySelectorAll(".o_tl_row[data-row-id]")];
        if (!rowEls.length) {
            return { items: [], box: null };
        }
        // the layers are placed against their wrapper, whichever side of the grid it stands on
        const origin = (grid.querySelector(":scope > .o_tl_arrows") || grid).getBoundingClientRect();
        // the area of the cells: from the first row to the last, right of the row headers
        const cells = rowEls[0].querySelector(":scope > .o_tl_pills")?.getBoundingClientRect();
        const last = rowEls.at(-1).getBoundingClientRect();
        if (!cells) {
            return { items: [], box: null };
        }
        const top = rowEls[0].getBoundingClientRect().top;
        const layer = { left: cells.left, top, width: cells.width, height: last.bottom - top };
        const bodies = new Map(); // `${rowId}|${pillId}` -> rect of the body
        for (const rowEl of rowEls) {
            for (const pillEl of rowEl.querySelectorAll(":scope > .o_tl_pills > .o_tl_pill[data-pill-id]")) {
                const key = `${rowEl.dataset.rowId}|${pillEl.dataset.pillId}`;
                bodies.set(key, pillEl.getBoundingClientRect());
            }
        }
        // R23: a moved or copied pill's arrows are drawn to its moving image, the box that
        // surrounds its body by one pixel (M41)
        const held = this.heldKey;
        const image = held && grid.querySelector(".o_tl_pill_moved");
        if (image && bodies.has(held)) {
            bodies.set(held, image.getBoundingClientRect());
        }
        const rtl = host._isRtl();
        const { startField, stopField } = model.config;
        const { startIsDate, stopIsDate } = this._fieldTypes();
        const recordsById = host.data.recordsById;
        const pairs = dependencyPairs(host.layout.rows, recordsById, archInfo.dependencyField);
        const items = [];
        for (const pair of pairs) {
            const sourcePillKey = `${pair.sourceRowId}|${pair.sourceId}`;
            const targetPillKey = `${pair.targetRowId}|${pair.targetId}`;
            const source = bodies.get(sourcePillKey);
            const target = bodies.get(targetPillKey);
            if (!source || !target) {
                continue;
            }
            const from = { x: (rtl ? source.left : source.right) - layer.left, y: (source.top + source.bottom) / 2 - layer.top };
            const to = { x: (rtl ? target.right : target.left) - layer.left, y: (target.top + target.bottom) / 2 - layer.top };
            const { d, mid } = arrowRoute(from, to, { rtl });
            const conflict = arrowConflict(
                recordsById.get(pair.sourceId).raw,
                recordsById.get(pair.targetId).raw,
                { startField, stopField, startIsDate, stopIsDate }
            );
            items.push({
                key: pair.key,
                sourceId: pair.sourceId,
                targetId: pair.targetId,
                sourcePillKey,
                targetPillKey,
                d,
                mid,
                conflict,
            });
        }
        return {
            items,
            box: {
                left: layer.left - origin.left,
                top: layer.top - origin.top,
                width: layer.width,
                height: layer.height,
            },
        };
    }

    /**
     * The path of the line drawn from the viewport point `from` to `to` (R12.2, routed as an arrow,
     * the point `to` standing for the target's edge), in the coordinates of the layers; null when
     * no layer is drawn.
     */
    drawRoute(from, to) {
        const wrapper = this.host.rendererRef()?.querySelector(".o_tl_grid > .o_tl_arrows");
        const { box } = this.state;
        if (!wrapper || !box) {
            return null;
        }
        const rect = wrapper.getBoundingClientRect();
        const origin = { x: rect.left + box.left, y: rect.top + box.top };
        const local = (point) => ({ x: point.x - origin.x, y: point.y - origin.y });
        return arrowRoute(local(from), local(to), { rtl: this.host._isRtl() }).d;
    }

    // ------------------------------------------------------------------------
    // Highlight (R9)
    // ------------------------------------------------------------------------

    get isHeld() {
        return this.host._pillPointer.isHeld;
    }

    /**
     * The pointer enters a pill of a record row. The compatibility mouse events that follow a touch
     * (a tap) light nothing: a finger rests on no pill (R11, A91); `touchLit` is the finger's way.
     */
    focusPill(key) {
        if (!this.isHeld && !this.isQuiet && !this.isTouch) {
            this.focus.pillKey = key;
        }
    }

    /** Whether the last pointer event of the page came from a finger (R11, A91). */
    get isTouch() {
        return this._pointerType === "touch";
    }

    /** Whether a mouse button is down: a finger put down beside it is no tap away (002d R4). */
    get isMouseDown() {
        return Boolean(this._mouseDown);
    }

    /** Every pointer press and move over the page (capture): the kind of pointer that is in use. */
    pointerSeen(ev) {
        this._pointerType = ev.pointerType;
        if (ev.pointerType === "touch") {
            (this._touches ||= new Set()).add(ev.pointerId);
        } else {
            this._mouseDown = true;
        }
    }

    /**
     * A finger lifts, or the system takes it away (capture, every pointer end of the page). A
     * finger taken away leaves no arrow lit, even when it only began a scroll (002d R4 point 2),
     * unless another finger still holds a gesture. After a touch gesture was cancelled (a key, a
     * second finger) the arrows lit at its start go as soon as one finger lifts (point 1, 3); after
     * a mouse gesture a finger cancelled they go with the release of the mouse button (point 3).
     */
    pointerEnded(ev) {
        if (ev.pointerType !== "touch") {
            this._mouseDown = false;
            if (this._unlitAtRelease) {
                this._unlight();
            }
            return;
        }
        this._touches?.delete(ev.pointerId);
        const alone = !this._touches?.size;
        if ((ev.type === "pointercancel" && (alone || !this.isHeld)) || this._unlitAtLift) {
            this._unlight();
        }
    }

    /** Nothing lit and nothing kept (the handles belong to the last tapped pill, 002d R3). */
    _unlight() {
        this._unlitAtLift = false;
        this._unlitAtRelease = false;
        this._kept = false;
        this._holdOutside = false;
        this.focus.arrowKey = null;
        this.focus.pillKey = null;
    }

    /**
     * A finger goes down on a drawing handle of the pill `key`: its arrows light with their remove
     * buttons, as a pointer arriving on the pill does (R11, A91).
     */
    touchLit(key) {
        this._quietAt = null;
        this._kept = false;
        this._unlitAtLift = false;
        this._unlitAtRelease = false;
        this.focus.arrowKey = null;
        this.focus.pillKey = key;
    }

    /** The pointer leaves `key`; nothing changes when another pill was entered first. */
    unfocusPill(key) {
        // a gesture that ended without a write keeps what was lit until the pointer moves: the
        // browser's own leave of a pill that a lit arrow's band now covers does not count (R1)
        if (this._kept) {
            return;
        }
        if (!this.isHeld && (key === undefined || this.focus.pillKey === key)) {
            this.focus.pillKey = null;
        }
    }

    /**
     * The pointer is on an arrow's band: that arrow alone is lit, also where the band crosses a
     * pill's box; the pill under the band does not count as under the pointer, so its handles
     * and its own arrows go (R9, R11, A75).
     */
    focusArrow(key, ev) {
        if (this.isHeld || this.isQuiet || this.isTouch) {
            return;
        }
        // a pill's outer box is one pixel wider than its body, over the arrows' bands: the pointer
        // on that ring lights the pill's arrows, with no handles; the band begins outside the box
        // (002d R1a, M41 to M43)
        const ring = ev ? this._ringPillKey(key, ev.clientX, ev.clientY) : null;
        this.focus.arrowKey = ring ? null : key;
        this.focus.pillKey = ring;
        this.host.state.hover = null;
    }

    /**
     * The key of the end pill of the arrow `key` whose outer box (its body and one pixel around)
     * holds the point but whose body does not, or null.
     */
    _ringPillKey(key, x, y) {
        const root = this.host.rendererRef();
        const ends = key.split(">");
        for (const pillEl of root?.querySelectorAll(".o_tl_row[data-row-id] .o_tl_pill[data-pill-id]") ?? []) {
            const pillKey = `${pillEl.closest(".o_tl_row[data-row-id]").dataset.rowId}|${pillEl.dataset.pillId}`;
            if (!ends.includes(pillKey)) {
                continue;
            }
            const box = pillEl.getBoundingClientRect();
            const inside = (inset) =>
                x >= box.left - inset && x < box.right + inset && y >= box.top - inset && y < box.bottom + inset;
            if (inside(OUTER_INSET) && !inside(0)) {
                return pillKey;
            }
        }
        return null;
    }

    /**
     * The pointer leaves an arrow. A pill under the pointer is entered by the browser's own
     * events (the pill's mouse enter), as the pointer comes off the band.
     */
    unfocusArrow(key) {
        if (this.isHeld || this.isQuiet || this.focus.arrowKey !== key) {
            return;
        }
        this.focus.arrowKey = null;
    }

    /**
     * A gesture ended: the pointer may be anywhere, nothing is lit until it moves again (R9, A90).
     * The browser sends a mouse move of its own to the pill under a still pointer after the view
     * reloads, with the pointer's coordinates: it does not count (`pointerMoved`).
     */
    reset() {
        // a gesture cancelled with Escape writes nothing, so nothing reloads: the arrows lit when
        // it started stay lit, and the pill under the pointer shows its handles again, until the
        // pointer moves (R9, A69, A95)
        this._kept = this._cancelling;
        this._cancelling = false;
        // 002d R1: a release over the row headers lights nothing; one over the page outside the
        // view keeps the arrows lit until the pointer moves over the view
        const released = this._releasedAt;
        this._releasedAt = null;
        this._holdOutside = false;
        if (this._kept && released) {
            const stack = document.elementsFromPoint(released.x, released.y);
            if (stack.some((element) => element.closest?.(".o_tl_row_header"))) {
                this._kept = false;
            } else {
                this._holdOutside = true;
            }
        }
        if (!this._kept) {
            this.focus.arrowKey = null;
            this.focus.pillKey = null;
        }
        this._quietAt = this._pointer ? { ...this._pointer } : { x: NaN, y: NaN };
        if (this._kept) {
            this._recheck = true;
            // a mouse gesture a finger cancelled: the finger is no pointer of the handles
            this._showHandlesUnderPointer({ mouse: this._mouseGesture });
        }
        this._mouseGesture = false;
    }

    /**
     * The gesture that ends next was cancelled (a key, a second finger, the page hidden; with
     * `lost`, the pointer taken away): see `reset`. Called by the
     * gesture right before it lets go.
     */
    cancelGesture({ lost = false, finger = false, touch = false } = {}) {
        // the system took the pointer away (002d R4 point 2): unlike Escape, nothing stays lit
        this._cancelling = !lost;
        // a touch gesture cancelled by a key or a second finger: the lit arrows stay only while a
        // finger is down (they go when one lifts); a mouse gesture a finger cancelled: until the
        // mouse button is released (002d R4 point 1, 3)
        this._unlitAtLift = !lost && touch;
        this._unlitAtRelease = !lost && !touch && finger;
        this._mouseGesture = !touch;
    }

    /**
     * The gesture that ends next is released at the viewport point (x, y) where nothing is written
     * (002d R1): it follows the rule of a cancelled gesture, see `reset`. Called by the gesture
     * right before it lets go.
     */
    releaseWithoutWrite(x, y) {
        this._cancelling = true;
        this._releasedAt = { x, y };
    }

    /** The pill under the pointer shows its handles (none on an empty cell). */
    _showHandlesUnderPointer({ mouse = false } = {}) {
        if (this.isTouch && !mouse) {
            // with touch the handles stay with the pill last tapped (002d R3)
            return;
        }
        const at = this._pointer;
        this.host.state.hover = at ? this._pillKeyAtPoint(at.x, at.y) : null;
    }

    /** Every pointer move over the page (capture): the pointer's place, and the end of the quiet. */
    pointerMoved(ev) {
        this._pointer = { x: ev.clientX, y: ev.clientY };
        this._pointerType = ev.pointerType;
        if (this._kept && this._holdOutside && !this.host.rendererRef()?.contains(ev.target)) {
            // 002d R1: moves outside the view do not work the highlight out again
            return;
        }
        if (ev.pointerType === "touch" && this.host.connect.isPressed && !this.host.connect.isActive) {
            // a finger on a handle crosses an arrow's band before the threshold: that arrow alone is
            // lit when the drawing starts, as for a mouse (R9, A91); no mouse event tells it
            const band = document
                .elementsFromPoint(ev.clientX, ev.clientY)
                .map((element) => element.closest?.(".o_tl_arrow"))
                .find(Boolean);
            if (band) {
                this.focus.arrowKey = band.dataset.arrow;
                this.focus.pillKey = null;
            }
        }
        const quiet = this._quietAt;
        if (quiet && (ev.clientX !== quiet.x || ev.clientY !== quiet.y)) {
            this._quietAt = null;
            this._recheck = false;
            if (!this.isHeld && ev.pointerType !== "touch") {
                const key = this._pillKeyAt(ev);
                this.focus.pillKey = key;
                if (this._kept) {
                    // after a cancelled gesture the highlight follows the pointer again (the
                    // handles do, by the pill's own mouse enter and leave)
                    this.focus.arrowKey = null;
                }
            }
            this._kept = false;
            this._holdOutside = false;
        }
    }

    get isQuiet() {
        return Boolean(this._quietAt);
    }

    _pillKeyAt(ev) {
        return this._pillKeyAtPoint(ev.clientX, ev.clientY);
    }

    _pillKeyAtPoint(x, y) {
        for (const element of document.elementsFromPoint(x, y)) {
            if (element.closest?.(".o_tl_col, .o_tl_col_group, .o_tl_row_header, .o_tl_title_cell")) {
                return null;
            }
            // a lit arrow's band hides the pill under it (R9)
            if (element.closest?.(".o_tl_arrow")) {
                return null;
            }
            const strip = element.closest?.(".o_tl_connect_strip, .o_tl_connect_handle");
            if (strip && this.host.rendererRef()?.contains(strip)) {
                return strip.dataset.pillKey;
            }
            const pill = element.closest?.(".o_tl_pill[data-pill-id]");
            const row = pill?.closest(".o_tl_row[data-row-id]");
            if (pill && row && this.host.rendererRef()?.contains(pill)) {
                return `${row.dataset.rowId}|${pill.dataset.pillId}`;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // Removal (R10)
    // ------------------------------------------------------------------------

    /** Click on the remove button: one write on the target, then the view reloads. */
    remove(item) {
        const { editor } = this.host.props;
        return editor.removeDependency({ targetId: item.targetId, sourceId: item.sourceId });
    }
}

/**
 * The layer of the arrows, inside the grid: one `svg.o_tl_arrow` per arrow, as large as the area
 * of the cells. A line at rest is half transparent; a lit arrow is drawn over the pills with its
 * remove button.
 */
export class TimelineArrowLayer extends Component {
    static template = "web_gantt.TimelineArrows";
    props = useProps({ arrows: t.object() });

    get arrows() {
        return this.props.arrows;
    }

    get removeLabel() {
        return _t("Remove this dependency");
    }

    /** The line being drawn from a handle (R12): `{source, target, d}`. */
    get drawing() {
        return this.arrows.host.connect.drawing;
    }

    lit(item) {
        return this.arrows.isLit(item);
    }

    classOf(item) {
        const lit = this.lit(item);
        return {
            o_tl_arrow_lit: lit,
            o_tl_arrow_hidden: !lit && !this.arrows.shown,
            [`o_tl_arrow_${item.conflict}`]: true,
        };
    }

    colourOf(item) {
        const [r, g, b] = ARROW_COLOURS[item.conflict];
        return `rgba(${r}, ${g}, ${b}, ${this.lit(item) ? ALPHA_LIT : ALPHA_REST})`;
    }

    layerStyle() {
        const { box } = this.arrows.state;
        return `left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; height: ${box.height}px`;
    }

    markerId(index) {
        return `${this.arrows.uid}_${index}`;
    }

    async onRemove(item) {
        // awaited: a refusal is raised again here and reaches the Community error handler
        await this.arrows.remove(item);
    }
}
