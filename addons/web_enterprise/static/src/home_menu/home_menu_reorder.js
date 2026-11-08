// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onWillDestroy, proxy, useListener } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";

/** How long a tile must be held before it can be dragged (milliseconds). */
export const HOLD_DELAY = 500;
/** How far the pointer may move during the hold before the hold is given up (pixels). */
export const MOVE_TOLERANCE = 10;

/**
 * Where a dragged tile lands: right after the tile that precedes it in the new
 * order, or first. Positions are indexes in the tile list as it was before the drop.
 *
 * @param {number} from index of the dragged tile
 * @param {number} over index of the tile the pointer was released over
 * @returns {number|null} index of the tile that precedes the dropped one, or null for first
 */
export function precedingIndex(from, over) {
    if (over > from) {
        return over;
    }
    return over > 0 ? over - 1 : null;
}

/**
 * Identifier of the tile that precedes a dropped one: the nearest tile before the
 * drop position that has an identifier, or null for first.
 *
 * @param {(string|null)[]} xmlids identifiers in the list as it was before the drop
 * @param {number} from index of the dragged tile
 * @param {number} over index of the tile the pointer was released over
 * @returns {string|null}
 */
export function precedingXmlid(xmlids, from, over) {
    for (let index = precedingIndex(from, over); index !== null && index >= 0; index--) {
        if (index !== from && xmlids[index]) {
            return xmlids[index];
        }
    }
    return null;
}

/**
 * Press-and-hold drag reordering of the home menu tiles.
 *
 * A pointer pressed on a tile for HOLD_DELAY without moving more than
 * MOVE_TOLERANCE starts a drag: the tile follows the pointer and is flagged in
 * the returned state. Releasing it over another tile calls `onDrop` with the
 * dragged tile's identifier and the identifier of the tile that precedes it in
 * the new order (null for first). A shorter press, or one that moved too far
 * early, is an ordinary click. The click that ends a drag is swallowed.
 *
 * @param {Object} params
 * @param {() => (HTMLElement|null)} params.ref element holding the tiles
 * @param {(drop: { xmlid: string|null, previousXmlid: string|null }) => void} params.onDrop
 * @returns {{ dragged: string|null }} reactive state; `dragged` is the identifier of the tile being dragged
 */
export function useTileReorder({ ref, onDrop }) {
    const state = proxy({ dragged: null });
    let pending = null; // { tile, x, y, timer }
    let drag = null; // { tile, x, y, over }
    let swallowClick = false;

    const cells = () => [...(ref()?.querySelectorAll(".o_draggable") || [])];
    const xmlidOf = (cell) => cell?.querySelector(".o_app")?.dataset.menuXmlid ?? null;

    const clearPending = () => {
        if (pending) {
            browser.clearTimeout(pending.timer);
            pending = null;
        }
    };
    const endDrag = () => {
        if (drag) {
            drag.tile.style.removeProperty("--o_cws_drag_x");
            drag.tile.style.removeProperty("--o_cws_drag_y");
            drag = null;
        }
        state.dragged = null;
    };

    const startDrag = () => {
        drag = { tile: pending.tile, x: pending.x, y: pending.y, over: null };
        pending = null;
        state.dragged = drag.tile.dataset.menuXmlid;
    };

    useListener(ref, "pointerdown", (ev) => {
        clearPending();
        endDrag();
        swallowClick = false;
        const tile = ev.target.closest?.(".o_app");
        if (!tile?.dataset.menuXmlid || ev.button) {
            return;
        }
        // touch pointers are captured by the pressed tile: let the events reach what is under the finger
        if (ev.target.hasPointerCapture?.(ev.pointerId)) {
            ev.target.releasePointerCapture(ev.pointerId);
        }
        pending = {
            tile,
            x: ev.clientX,
            y: ev.clientY,
            timer: browser.setTimeout(startDrag, HOLD_DELAY),
        };
    });
    useListener(window, "pointermove", (ev) => {
        if (pending) {
            if (Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y) > MOVE_TOLERANCE) {
                clearPending();
            }
        } else if (drag) {
            drag.tile.style.setProperty("--o_cws_drag_x", `${ev.clientX - drag.x}px`);
            drag.tile.style.setProperty("--o_cws_drag_y", `${ev.clientY - drag.y}px`);
            const under = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
            const cell = under.closest?.(".o_draggable");
            if (cell && ref()?.contains(cell)) {
                drag.over = cell.contains(drag.tile) ? null : cell;
            }
        }
    });
    useListener(window, "pointerup", () => {
        clearPending();
        if (!drag) {
            return;
        }
        const { tile, over } = drag;
        endDrag();
        // the click that follows the release must not open the application
        swallowClick = true;
        browser.setTimeout(() => (swallowClick = false), 0);
        if (over) {
            const all = cells();
            const from = all.findIndex((cell) => cell.contains(tile));
            const to = all.indexOf(over);
            if (from >= 0 && to >= 0) {
                onDrop({
                    xmlid: xmlidOf(all[from]),
                    previousXmlid: precedingXmlid(all.map(xmlidOf), from, to),
                });
            }
        }
    });
    useListener(window, "pointercancel", () => {
        clearPending();
        endDrag();
    });
    useListener(
        ref,
        "click",
        (ev) => {
            if (swallowClick) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        },
        { capture: true }
    );
    // no native link drag, long-press menu or touch scrolling while a hold is under way
    const holding = () => pending || drag;
    for (const name of ["dragstart", "contextmenu"]) {
        useListener(ref, name, (ev) => holding() && ev.preventDefault());
    }
    // once dragging, the page must not scroll under the finger
    useListener(ref, "touchmove", (ev) => drag && ev.cancelable && ev.preventDefault(), {
        passive: false,
    });
    onWillDestroy(() => {
        clearPending();
        endDrag();
    });
    return state;
}
