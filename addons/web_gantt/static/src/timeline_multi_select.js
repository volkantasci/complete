// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the selection of several cells of the timeline view (002b3 R2 to R8, R11, R12).
 *
 * A cell is a row id and a part: the global sub-column index of the displayed range.
 * Nothing here touches the DOM; the view feeds it booleans, row orders and callbacks.
 */

const MULTI_SELECT_SCALES = ["week", "month"];

/** @returns {boolean} whether the multi-selection mode is on (R2). */
export function isMultiSelectMode({ multiCreateView, isSmall, displayMode, scale }) {
    return Boolean(
        multiCreateView &&
            !isSmall &&
            displayMode === "dense" &&
            MULTI_SELECT_SCALES.includes(scale)
    );
}

const keyOf = (rowId, part) => `${rowId}|${part}`;
const cellOf = (key) => {
    const at = key.lastIndexOf("|");
    return { rowId: key.slice(0, at), part: Number(key.slice(at + 1)) };
};
const range = (from, to) => {
    const parts = [];
    for (let part = Math.min(from, to); part <= Math.max(from, to); part++) {
        parts.push(part);
    }
    return parts;
};

export class TimelinePickedCells {
    /**
     * @param {{isFolded?: (part: number) => boolean}} [options] folded parts are never picked (R3)
     */
    constructor({ isFolded } = {}) {
        this.isFolded = isFolded || (() => false);
        this._keys = new Set();
        this._rowAnchor = null;
        this._columnAnchor = null;
        this._drawing = null;
    }

    get size() {
        return this._keys.size;
    }

    get isEmpty() {
        return this._keys.size === 0;
    }

    get isDrawing() {
        return this._drawing !== null;
    }

    get rowAnchor() {
        return this._rowAnchor;
    }

    get columnAnchor() {
        return this._columnAnchor;
    }

    has(rowId, part) {
        return this._keys.has(keyOf(rowId, part));
    }

    cells() {
        return [...this._keys].map(cellOf);
    }

    clear() {
        this._keys.clear();
        this._rowAnchor = null;
        this._columnAnchor = null;
        this._drawing = null;
    }

    // Cell click (R4)

    clickColumnOfRow(rowId, parts, { ctrl } = {}) {
        const keys = this._keysOf([rowId], parts);
        this._rowAnchor = null;
        this._columnAnchor = null;
        if (!keys.length) {
            return;
        }
        this._applyKeys(keys, ctrl);
    }

    // Drawing (R5)

    startDrawing(rowId, part, { ctrl } = {}) {
        this._drawing = {
            rowId,
            part,
            base: ctrl ? new Set(this._keys) : new Set(),
            rectangle: null,
        };
    }

    drawTo(rowId, part, rowOrder) {
        if (!this._drawing) {
            return [];
        }
        const { rowId: startRow, part: startPart } = this._drawing;
        this._drawing.rectangle = this._keysOf(
            this._rowsBetween(startRow, rowId, rowOrder),
            range(startPart, part)
        );
        return this.drawnCells();
    }

    drawnCells() {
        if (!this._drawing) {
            return [];
        }
        const keys = new Set(this._drawing.base);
        for (const key of this._drawing.rectangle || []) {
            keys.add(key);
        }
        return [...keys].map(cellOf);
    }

    /** Commits the drawing; a drawing that never moved changes nothing (R5.5: it is a click). */
    endDrawing() {
        const drawing = this._drawing;
        this._drawing = null;
        if (!drawing || !drawing.rectangle) {
            return;
        }
        this._keys = new Set(drawing.base);
        for (const key of drawing.rectangle) {
            this._keys.add(key);
        }
        this._rowAnchor = null;
        this._columnAnchor = null;
    }

    /** Escape during a drawing: the whole selection goes (R5.3). */
    cancelDrawing() {
        this.clear();
    }

    // Headers (R6, R7)

    clickColumnHeader(columnParts, columnIndex, { ctrl, shift } = {}, rowOrder, partsOfColumn) {
        if (this._rowAnchor !== null && !shift) {
            this._keys.clear();
        }
        this._rowAnchor = null;
        const useShift = shift && this._columnAnchor !== null;
        if (useShift) {
            const parts = [];
            for (const index of range(this._columnAnchor, columnIndex)) {
                parts.push(...partsOfColumn(index));
            }
            this._keys = new Set(this._keysOf(rowOrder, parts));
            return;
        }
        this._applyKeys(this._keysOf(rowOrder, columnParts), ctrl);
        this._columnAnchor = columnIndex;
    }

    clickRowHeader(rowId, { ctrl, shift } = {}, rowOrder, allParts) {
        if (this._columnAnchor !== null && !shift) {
            this._keys.clear();
        }
        this._columnAnchor = null;
        const useShift = shift && this._rowAnchor !== null;
        if (useShift) {
            this._keys = new Set(
                this._keysOf(this._rowsBetween(this._rowAnchor, rowId, rowOrder), allParts)
            );
            return;
        }
        this._applyKeys(this._keysOf([rowId], allParts), ctrl);
        this._rowAnchor = rowId;
    }

    // Internals

    _keysOf(rowIds, parts) {
        const kept = parts.filter((part) => !this.isFolded(part));
        const keys = [];
        for (const rowId of rowIds) {
            for (const part of kept) {
                keys.push(keyOf(rowId, part));
            }
        }
        return keys;
    }

    _rowsBetween(fromRow, toRow, rowOrder) {
        const from = rowOrder.indexOf(fromRow);
        const to = rowOrder.indexOf(toRow);
        if (from < 0 || to < 0) {
            return [toRow];
        }
        return rowOrder.slice(Math.min(from, to), Math.max(from, to) + 1);
    }

    /** Replaces the cells by `keys`, or toggles each of them with Ctrl. */
    _applyKeys(keys, toggle) {
        if (!toggle) {
            this._keys = new Set(keys);
            return;
        }
        for (const key of keys) {
            if (this._keys.has(key)) {
                this._keys.delete(key);
            } else {
                this._keys.add(key);
            }
        }
    }
}

/**
 * R8.1: ids of the records whose pill covers at least one picked cell of a record row.
 * @param {Array<{rowId, part}>} cells
 * @param {Object} rowsById rows, each with `isGroup`
 * @param {(rowId: string) => Array<{resId: number, from: number, to: number}>} pillPartsOfRow
 * @returns {Set<number>}
 */
export function countPickedRecords(cells, rowsById, pillPartsOfRow) {
    const partsByRow = new Map();
    for (const { rowId, part } of cells) {
        if (!rowsById[rowId] || rowsById[rowId].isGroup) {
            continue;
        }
        if (!partsByRow.has(rowId)) {
            partsByRow.set(rowId, []);
        }
        partsByRow.get(rowId).push(part);
    }
    const ids = new Set();
    for (const [rowId, parts] of partsByRow) {
        for (const { resId, from, to } of pillPartsOfRow(rowId)) {
            if (parts.some((part) => part >= from && part <= to)) {
                ids.add(resId);
            }
        }
    }
    return ids;
}

/**
 * R11: one entry per record row and day with a picked part. Rows come in the iteration order
 * of `rowsById` (the display order), days by their first part.
 * @returns {Array<{rowId: string, day: string, firstPart: number, lastPart: number}>}
 */
export function pickedDaysByRow(cells, rowsById, dayOfPart) {
    const partsByRow = new Map();
    for (const { rowId, part } of cells) {
        if (!rowsById[rowId] || rowsById[rowId].isGroup) {
            continue;
        }
        if (!partsByRow.has(rowId)) {
            partsByRow.set(rowId, []);
        }
        partsByRow.get(rowId).push(part);
    }
    const entries = [];
    for (const rowId of Object.keys(rowsById)) {
        const parts = partsByRow.get(rowId);
        if (!parts) {
            continue;
        }
        const days = new Map();
        for (const part of [...parts].sort((a, b) => a - b)) {
            const day = dayOfPart(part);
            const entry = days.get(day);
            if (entry) {
                entry.lastPart = part;
            } else {
                days.set(day, { rowId, day, firstPart: part, lastPart: part });
            }
        }
        entries.push(...days.values());
    }
    return entries;
}

/**
 * R12: the first picked cell by row order then part, extended to the right by the picked
 * cells that follow it without a gap. `rowOrder` lists the rows that may give a block.
 * @returns {{rowId: string, fromPart: number, toPart: number} | null}
 */
export function firstPickedBlock(cells, rowOrder) {
    for (const rowId of rowOrder) {
        const parts = new Set(cells.filter((cell) => cell.rowId === rowId).map((c) => c.part));
        if (!parts.size) {
            continue;
        }
        const fromPart = Math.min(...parts);
        let toPart = fromPart;
        while (parts.has(toPart + 1)) {
            toPart++;
        }
        return { rowId, fromPart, toPart };
    }
    return null;
}
