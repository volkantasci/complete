// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { deserializeDate, deserializeDateTime } from "@web/core/l10n/dates";

/**
 * Arrow maths of the timeline (002c R5 to R7). Pure functions, no DOM.
 */

/** R7: the three colours of an arrow, as [r, g, b]; the alpha is the caller's. */
export const ARROW_COLOURS = {
    none: [143, 143, 143],
    warning: [236, 151, 31],
    error: [211, 65, 59],
};

const MAX_RADIUS = 8;
const MIN_FORWARD = 8;
const LEG = 30;

// ----------------------------------------------------------------------------
// R5: which arrows
// ----------------------------------------------------------------------------

/**
 * Pairs that get an arrow (R5).
 *
 * @param {Array} rows rows as built by the renderer (`{kind, key, row: {id, recordIds}}`)
 *   or plain `{kind, id, recordIds}`; only rows of kind "pills" count.
 * @param {Map} recordsById loaded records (a record that is not loaded has no pill)
 * @param {string} dependencyField field of the target listing its sources; the value is
 *   an array of ids, read from `record.raw[field]` or `record[field]`
 * @returns {Array<{key, sourceId, targetId, sourceRowId, targetRowId}>}
 */
export function dependencyPairs(rows, recordsById, dependencyField) {
    const rowsOf = new Map(); // record id -> ids of the record rows holding its pill
    const holds = new Map(); // row id -> Set of record ids
    for (const entry of rows) {
        if (entry.kind !== "pills") {
            continue;
        }
        const rowId = entry.row ? entry.row.id : (entry.id ?? entry.key);
        const recordIds = (entry.row ? entry.row.recordIds : entry.recordIds) || [];
        const held = new Set();
        for (const id of recordIds) {
            if (!recordsById.has(id)) {
                continue;
            }
            held.add(id);
            if (!rowsOf.has(id)) {
                rowsOf.set(id, []);
            }
            rowsOf.get(id).push(rowId);
        }
        holds.set(rowId, held);
    }
    const pairs = [];
    for (const [targetId, targetRows] of rowsOf) {
        const record = recordsById.get(targetId);
        const sources = record?.raw?.[dependencyField] ?? record?.[dependencyField];
        if (!Array.isArray(sources)) {
            continue;
        }
        for (const sourceId of new Set(sources)) {
            const sourceRows = rowsOf.get(sourceId);
            if (!sourceRows) {
                continue;
            }
            for (const sourceRowId of sourceRows) {
                for (const targetRowId of targetRows) {
                    const sourceHoldsTarget = holds.get(sourceRowId).has(targetId);
                    const targetHoldsSource = holds.get(targetRowId).has(sourceId);
                    const allow =
                        sourceRowId === targetRowId ||
                        (!sourceHoldsTarget && !targetHoldsSource) ||
                        targetRows.every((id) => id !== sourceRowId && holds.get(id).has(sourceId)) ||
                        sourceRows.every((id) => id !== targetRowId && holds.get(id).has(targetId));
                    if (allow) {
                        pairs.push({
                            key: `${sourceRowId}|${sourceId}>${targetRowId}|${targetId}`,
                            sourceId,
                            targetId,
                            sourceRowId,
                            targetRowId,
                        });
                    }
                }
            }
        }
    }
    return pairs;
}

// ----------------------------------------------------------------------------
// R6: route
// ----------------------------------------------------------------------------

/**
 * Route of an arrow (R6) from the source anchor to the target anchor.
 * Anchors are `{x, y}` in px (the middle of the body edges). In a right-to-left language
 * the caller passes the source's left edge and the target's right edge and sets `rtl`,
 * which flips the horizontal direction of the route (the maths runs on mirrored x).
 *
 * @returns {{d: string, box: {x, y, width, height}, mid: {x, y}}} `box` is the box of
 *   the route's points (its rounded corners stay inside), `mid` the midpoint of the anchors.
 */
export function arrowRoute(from, to, { rtl = false } = {}) {
    const sign = rtl ? -1 : 1;
    const x0 = from.x * sign;
    const x1 = to.x * sign;
    const dx = x1 - x0;
    const dy = to.y - from.y;
    const r = Math.min(MAX_RADIUS, Math.abs(dx) / 2);
    const rv = Math.min(MAX_RADIUS, Math.abs(dy) / 2);
    let points;
    let trims; // [along a horizontal leg, along a vertical leg]
    if (dx >= MIN_FORWARD) {
        const mx = x0 + dx / 2;
        points = [
            [x0, from.y],
            [mx, from.y],
            [mx, to.y],
            [x1, to.y],
        ];
        trims = [r, rv];
    } else {
        const my = from.y + dy / 2;
        points = [
            [x0, from.y],
            [x0 + LEG, from.y],
            [x0 + LEG, my],
            [x1 - LEG, my],
            [x1 - LEG, to.y],
            [x1, to.y],
        ];
        trims = [rv, rv];
    }
    points = simplify(points);
    const d = roundedPath(points, trims, sign);
    const xs = points.map((p) => p[0] * sign);
    const ys = points.map((p) => p[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
        d,
        box: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
        mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    };
}

/** Drops repeated points and points on a straight continuation. */
function simplify(points) {
    const out = [];
    for (const point of points) {
        const last = out[out.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) {
            continue;
        }
        out.push(point);
    }
    return out.filter((point, i) => {
        if (i === 0 || i === out.length - 1) {
            return true;
        }
        const a = out[i - 1];
        const b = out[i + 1];
        const cross = (point[0] - a[0]) * (b[1] - point[1]) - (point[1] - a[1]) * (b[0] - point[0]);
        const dot = (point[0] - a[0]) * (b[0] - point[0]) + (point[1] - a[1]) * (b[1] - point[1]);
        // a straight continuation goes; a turn back on the same line (dy = 0) stays
        return cross !== 0 || dot < 0;
    });
}

const fmt = (n) => String(Math.round(n * 1000) / 1000);

/** Polyline with elliptical rounded corners; x is mirrored back by `sign`. */
function roundedPath(points, [trimH, trimV], sign) {
    const out = [];
    const put = (command, ...coords) => out.push(command + coords.map(fmt).join(" "));
    const mx = (x) => x * sign;
    put("M", mx(points[0][0]), points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i];
        if (i === points.length - 1) {
            put("L", mx(px), py);
            break;
        }
        const [ax, ay] = points[i - 1];
        const [nx, ny] = points[i + 1];
        const inDir = [Math.sign(px - ax), Math.sign(py - ay)];
        const outDir = [Math.sign(nx - px), Math.sign(ny - py)];
        const horizontalIn = inDir[1] === 0;
        const tIn = horizontalIn ? trimH : trimV;
        const tOut = horizontalIn ? trimV : trimH;
        if (tIn === 0 || tOut === 0) {
            put("L", mx(px), py);
            continue;
        }
        put("L", mx(px - inDir[0] * tIn), py - inDir[1] * tIn);
        const clockwise = inDir[0] * outDir[1] - inDir[1] * outDir[0] > 0;
        // mirroring x flips the turning sense on screen
        const sweep = clockwise !== sign < 0 ? 1 : 0;
        const rx = horizontalIn ? tIn : tOut;
        const ry = horizontalIn ? tOut : tIn;
        put("A", rx, ry, 0, 0, sweep, mx(px + outDir[0] * tOut), py + outDir[1] * tOut);
    }
    return out.join(" ");
}

// ----------------------------------------------------------------------------
// R7: colour
// ----------------------------------------------------------------------------

/**
 * Conflict of an arrow (R7): "error" when the target starts before the source starts,
 * otherwise "warning" when it starts before the source stops, otherwise "none".
 * Records hold their dates as luxon DateTime (as the model deserializes them) or as
 * serialized strings; a date-only model (`dateOnly`) counts the source's stop as the
 * end of its day (002a D9, decision D4). A missing date gives "none".
 */
export function arrowConflict(source, target, { startField, stopField, dateOnly = false }) {
    const sourceStart = dateTime(source[startField] ?? source.raw?.[startField], dateOnly);
    let sourceStop = dateTime(source[stopField] ?? source.raw?.[stopField], dateOnly);
    const targetStart = dateTime(target[startField] ?? target.raw?.[startField], dateOnly);
    if (!sourceStart || !sourceStop || !targetStart) {
        return "none";
    }
    if (dateOnly) {
        sourceStop = sourceStop.endOf("day");
    }
    if (targetStart.toMillis() < sourceStart.toMillis()) {
        return "error";
    }
    return targetStart.toMillis() < sourceStop.toMillis() ? "warning" : "none";
}

function dateTime(value, dateOnly) {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return dateOnly || value.length <= 10 ? deserializeDate(value) : deserializeDateTime(value);
    }
    return value;
}
