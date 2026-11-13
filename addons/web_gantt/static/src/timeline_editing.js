// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

/**
 * Pure helpers of the editing features of the timeline view: periods proposed
 * when creating or planning, the context given to dialogs, the values written
 * when planning and the texts of the selection badges.
 *
 * Every date is a luxon DateTime in the local zone; a period is `{start, stop}`
 * with an exclusive stop.
 */

/**
 * R2: the period proposed by the New button, around the focus date.
 * @param {"day"|"week"|"month"|"year"} scaleId
 * @param {DateTime} focus
 * @param {number} weekStart luxon weekday number (1 Monday ... 7 Sunday)
 */
export function newButtonPeriod(scaleId, focus, weekStart) {
    const day = focus.startOf("day");
    switch (scaleId) {
        case "week": {
            const back = (day.weekday - weekStart + 7) % 7;
            const start = day.minus({ days: back });
            return { start, stop: start.plus({ days: 7 }) };
        }
        case "month":
            return { start: day.startOf("month"), stop: day.startOf("month").plus({ months: 1 }) };
        case "year":
            return { start: day.startOf("year"), stop: day.startOf("year").plus({ years: 1 }) };
        default:
            return { start: day, stop: day.plus({ days: 1 }) };
    }
}

/** The whole column `columnIndex` of the published data. */
export function columnPeriod(data, columnIndex) {
    const column = data.columns[columnIndex];
    return { start: column.start, stop: column.stop };
}

/**
 * The period covered by sub-columns `fromPart` to `toPart`, both included,
 * in either order. A part is numbered `column * data.parts + k`.
 */
export function partPeriod(data, fromPart, toPart) {
    const low = Math.min(fromPart, toPart);
    const high = Math.max(fromPart, toPart);
    const parts = data.parts;
    const boundary = (index, atEnd) => {
        const column = data.columns[Math.floor(index / parts)];
        const fraction = ((index % parts) + (atEnd ? 1 : 0)) / parts;
        const begin = column.start.toMillis();
        const length = column.stop.toMillis() - begin;
        return DateTime.fromMillis(Math.round(begin + length * fraction), {
            zone: column.start.zone,
        });
    };
    return { start: boundary(low, false), stop: boundary(high, true) };
}

/**
 * The values of the grouping fields along a row and its ancestors.
 * many2one gives the id, many2many a list with the id, other types the raw value.
 * @returns {Object} field name -> context value
 */
export function rowValueChain(rows, rowId, fields) {
    const path = [];
    const find = (list, trail) => {
        for (const row of list) {
            const next = [...trail, row];
            if (row.id === rowId) {
                path.push(...next);
                return true;
            }
            if (row.children?.length && find(row.children, next)) {
                return true;
            }
        }
        return false;
    };
    find(rows || [], []);
    const result = {};
    for (const row of path) {
        if (!row.fieldName) {
            continue;
        }
        result[row.fieldName] = row.isEmptyValueRow
            ? false
            : groupValue(fields, row.fieldName, row.value);
    }
    return result;
}

function groupValue(fields, name, value) {
    if (!fields) {
        throw new Error("timeline_editing: the model fields are required");
    }
    if (value === false || value === null || value === undefined) {
        return false;
    }
    const type = fields[name]?.type;
    if (type === "many2one" || type === "many2many") {
        const id = Array.isArray(value) ? value[0] : value;
        return type === "many2many" ? [id] : id;
    }
    return value;
}

/** Start and stop values of a period, by the typing rules of the fields (R6, D1). */
function periodValues(period, placement) {
    const { startField, stopField, startIsDate, stopIsDate } = placement;
    const values = {};
    values[startField] = startIsDate
        ? serializeDate(period.start)
        : serializeDateTime(period.start);
    if (stopField !== startField) {
        values[stopField] = stopIsDate
            ? serializeDate(period.stop.minus({ milliseconds: 1 }))
            : serializeDateTime(period.stop);
    }
    return values;
}

/**
 * R6: the context given to the create dialog, the create action and the plan dialog.
 * @param {Object} params
 * @param {Object} params.baseContext action context combined with the search context
 * @param {{start: DateTime, stop: DateTime}} params.period
 * @param {Object} params.placement
 * @param {Object} params.fields field definitions of the model
 * @param {Object} [params.rowValues] result of `rowValueChain`
 * (`fields` is not read here; callers pass it for symmetry with `planWriteValues`)
 */
export function creationContext({ baseContext, period, placement, fields, rowValues }) {
    const context = { ...baseContext };
    for (const [name, value] of Object.entries(periodValues(period, placement))) {
        context[name] = value;
        context[`default_${name}`] = value;
    }
    for (const [name, value] of Object.entries(rowValues || {})) {
        context[name] = value;
        context[`default_${name}`] = value;
        context[`search_default_${name}`] = value;
    }
    return context;
}

function heldValue(record, name, fields) {
    const raw = record?.raw?.[name];
    const type = fields[name]?.type;
    if (type === "many2many") {
        // the whole list of ids counts: it is replaced by the row's one record
        return Array.isArray(raw) && raw.length ? raw : false;
    }
    return groupValue(fields, name, raw);
}

function sameValue(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * R9.4: the values written to the checked records. A value is left out only
 * when every checked record is shown in the view and already holds it (O2b-1).
 * @param {Object} params
 * @param {Array<number|{id: number, resId?: number}>} params.records checked records
 * @param {Map<number, Object>} params.shownById the view's `recordsById`
 */
export function planWriteValues({ period, placement, fields, rowValues, records, shownById }) {
    const wanted = periodValues(period, placement);
    const planned = {};
    for (const [name, value] of Object.entries(rowValues || {})) {
        const isMany = fields[name]?.type === "many2many";
        wanted[name] = value;
        planned[name] = isMany ? (value ? [[6, 0, value]] : false) : value;
    }
    const ids = (records || []).map((r) => (typeof r === "object" ? (r.resId ?? r.id) : r));
    const everyHolds = (name, value) =>
        ids.length > 0 &&
        ids.every((id) => {
            const shown = shownById?.get(id);
            return shown && sameValue(heldValue(shown, name, fields), value);
        });
    const result = {};
    for (const name of Object.keys(wanted)) {
        if (everyHolds(name, wanted[name])) {
            continue;
        }
        result[name] = name in planned ? planned[name] : wanted[name];
    }
    return result;
}

/** A13: the text of a selection badge. */
export function badgeText(date, scaleId, partsPerColumn) {
    if (scaleId === "day") {
        return date.toLocaleString(DateTime.TIME_SIMPLE);
    }
    if ((scaleId === "week" || scaleId === "month") && partsPerColumn > 1) {
        return date.toLocaleString(DateTime.DATETIME_SHORT);
    }
    return date.toLocaleString(DateTime.DATE_SHORT);
}
