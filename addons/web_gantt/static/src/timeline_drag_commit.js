// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import {
    copyDefaults,
    dragStep,
    hasDateOnlyBound,
    moveWriteValues,
    movedBounds,
    resizedBound,
    resizeIsInvalid,
    serializeBound,
    undoValues,
} from "./timeline_drag_math";
import { rowValueChain } from "./timeline_editing";

/**
 * What a released pill gesture writes. Both functions take the renderer as `host` (its `props`,
 * `data`, `_zoneHit`, `_commitPanel` and `_resizeSteps`); the renderer's `_commitDrag` and
 * `_commitResize` delegate here.
 */

/**
 * The release (R4, R5, R7): a move writes the new dates and row values, a copy duplicates the
 * record with them; nothing happens without a target. The values come from the record read at
 * the press, not from what a reload brought since (R15). A refusal is the caller's: the
 * returned promise rejects with the server error.
 */
export function commitDrag(host, { mode, pill, rowId, target, line }) {
    const overZone = host._zoneHit;
    host._zoneHit = false;
    if (overZone && (mode === "move" || mode === "copy")) {
        // 002b3 R22: over the drop zone, with Ctrl too (D2): the record loses its dates
        return host.props.editor.unscheduleRecord({ resId: pill.record.resId });
    }
    if (!target) {
        return undefined;
    }
    if (mode === "panel") {
        return host._commitPanel({ target, line });
    }
    if (mode.startsWith("resize-")) {
        return commitResize(host, { mode, pill, target });
    }
    const { model, editor } = host.props;
    const data = host.data;
    const { placement } = data;
    const fields = model.fields;
    const record = pill.record;
    const n = target.n ?? target.part - record.span.from;
    const bounds = movedBounds(
        { start: record.start, stop: record.stop },
        n,
        dragStep(data, { dateOnly: hasDateOnlyBound(placement) }),
        placement
    );
    const targetChain = rowValueChain(data.rows, target.rowId, fields);
    let change;
    if (mode === "copy") {
        change = {
            kind: "copy",
            resId: record.resId,
            values: copyDefaults({ bounds, targetChain, fields, placement }),
        };
    } else {
        change = {
            kind: "move",
            resId: record.resId,
            values: moveWriteValues({ record, bounds, n, targetChain, fields, placement }),
            undo: {
                values: undoValues({
                    kind: "move",
                    record,
                    fromChain: rowValueChain(data.rows, rowId, fields),
                    fields,
                    placement,
                }),
            },
        };
    }
    // a closed group row that received the record opens once the server accepted (R5, R7, R15)
    return editor.applyChange(change).then((done) => {
        const row = done && model.data.visibleRows.find((item) => item.id === target.rowId);
        if (row?.isGroup && row.collapsed) {
            model.toggleRow(row.id);
        }
        return done;
    });
}

/**
 * The release of a handle (R8.2, R8.3, R12): the moved bound of the record, alone, moves by
 * the sub-columns the edge moved. Nothing happens when it did not move (D3); an impossible
 * result writes nothing and raises a warning. A refusal is the caller's, as for a move.
 */
export function commitResize(host, { mode, pill, target }) {
    const edge = mode.slice("resize-".length);
    const { model, editor } = host.props;
    const data = host.data;
    const { placement } = data;
    const record = pill.record;
    const n = host._resizeSteps(pill, edge, target.part);
    if (!n) {
        return undefined;
    }
    const value = resizedBound(
        record,
        edge,
        n,
        dragStep(data, { dateOnly: hasDateOnlyBound(placement) }),
        placement
    );
    if (resizeIsInvalid(record, edge, value, placement)) {
        editor.warn(
            edge === "start"
                ? _t("The start cannot come after the end.")
                : _t("The end cannot come before the start.")
        );
        return undefined;
    }
    const field = edge === "start" ? placement.startField : placement.stopField;
    const isDate = edge === "start" ? placement.startIsDate : placement.stopIsDate;
    return editor.applyChange({
        kind: "resize",
        resId: record.resId,
        values: { [field]: serializeBound(value, isDate ? "date" : "datetime") },
        undo: {
            values: undoValues({
                kind: "resize",
                record,
                fields: model.fields,
                placement,
            }),
        },
    });
}
