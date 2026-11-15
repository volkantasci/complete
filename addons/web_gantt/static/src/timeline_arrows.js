// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, proxy, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { arrowConflict, arrowRoute, ARROW_COLOURS, dependencyPairs } from "./timeline_arrow_math";

let layerCount = 0;

/** Alpha of a line at rest and when it is lit (R8, R9). */
const ALPHA_REST = 0.5;
const ALPHA_LIT = 1;

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
        return (
            arrowKey === item.key ||
            (pillKey !== null && (pillKey === item.sourcePillKey || pillKey === item.targetPillKey))
        );
    }

    // ------------------------------------------------------------------------
    // Geometry
    // ------------------------------------------------------------------------

    /** Reads the pills of the DOM again and replaces the arrows when something moved. */
    refresh() {
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
    }

    _measure(grid) {
        const host = this.host;
        const { archInfo, model } = host.props;
        const rowEls = [...grid.querySelectorAll(".o_tl_row[data-row-id]")];
        if (!rowEls.length) {
            return { items: [], box: null };
        }
        const gridRect = grid.getBoundingClientRect();
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
        const rtl = host._isRtl();
        const { startField, stopField } = model.config;
        const dateOnly = host._dateOnly;
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
                { startField, stopField, dateOnly }
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
                left: layer.left - gridRect.left,
                top: layer.top - gridRect.top,
                width: layer.width,
                height: layer.height,
            },
        };
    }

    // ------------------------------------------------------------------------
    // Highlight (R9)
    // ------------------------------------------------------------------------

    get isHeld() {
        return this.host._pillPointer.isHeld;
    }

    /** The pointer enters a pill of a record row. */
    focusPill(key) {
        if (!this.isHeld) {
            this.focus.pillKey = key;
        }
    }

    /** The pointer leaves `key`; nothing changes when another pill was entered first. */
    unfocusPill(key) {
        if (!this.isHeld && (key === undefined || this.focus.pillKey === key)) {
            this.focus.pillKey = null;
        }
    }

    /**
     * The pointer is over an arrow: it is lit, and so are the arrows of the pill under the
     * pointer, if any (A75: a lit arrow may pass over a pill).
     */
    focusArrow(key, ev) {
        if (this.isHeld) {
            return;
        }
        this.focus.arrowKey = key;
        this.focus.pillKey = this._pillKeyAt(ev);
    }

    /** The pointer leaves an arrow: the pill under it, if any, keeps its arrows lit. */
    unfocusArrow(key, ev) {
        if (this.isHeld || this.focus.arrowKey !== key) {
            return;
        }
        this.focus.arrowKey = null;
        this.focus.pillKey = this._pillKeyAt(ev);
    }

    /** A gesture ended: the pointer may be anywhere, nothing is lit until it moves again. */
    reset() {
        this.focus.arrowKey = null;
        this.focus.pillKey = null;
    }

    _pillKeyAt(ev) {
        for (const element of document.elementsFromPoint(ev.clientX, ev.clientY)) {
            const pill = element.closest?.(".o_tl_pill[data-pill-id]");
            const row = pill?.closest(".o_tl_row[data-row-id]");
            if (pill && row) {
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

    /** The outline is white, half transparent at rest. */
    haloOf(item) {
        return `rgba(255, 255, 255, ${this.lit(item) ? ALPHA_LIT : ALPHA_REST})`;
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
