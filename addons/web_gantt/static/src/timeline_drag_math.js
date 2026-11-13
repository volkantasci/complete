// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";
import { badgeText, heldValue } from "@web_gantt/timeline_editing";

const { DateTime } = luxon;

/**
 * Pure computations of moves, copies, resizes, time badges, written values, undo values and drop
 * acceptance of the timeline view (002b2 R4 to R8, R10, R12, R13, R17).
 *
 * Every date is a luxon DateTime in the user's zone. `placement` is the model's published
 * `placement` ({startField, stopField, startIsDate, stopIsDate}). A date-only stop is the stored
 * date itself, counted as the end of its day (002a D9).
 */

/**
 * R4, R17: the duration of one step of a move or a resize.
 * @param {{scaleId: string, parts: number}} data
 * @param {{dateOnly: boolean}} options a bound is date-only: whole days (months on the year scale)
 * @returns {{unit: "minutes"|"hours"|"days"|"months", amount: number}}
 */
export function dragStep(data, { dateOnly }) {
    if (data.scaleId === "year") {
        return { unit: "months", amount: 1 };
    }
    if (dateOnly) {
        return { unit: "days", amount: 1 };
    }
    if (data.scaleId === "day") {
        return { unit: "minutes", amount: 60 / data.parts };
    }
    return { unit: "hours", amount: 24 / data.parts };
}

/** `placement` has a date-only bound: moves and resizes go by whole days (R17). */
export function hasDateOnlyBound(placement) {
    return Boolean(placement?.startIsDate || placement?.stopIsDate);
}

/**
 * R4, R17.4: `date` moved by `n` steps. Minutes and hours are added to the local wall-clock
 * time, so the local time is kept across a change of daylight saving time; days and months are
 * calendar steps (a month keeps its day of the month, a short month gives its last day).
 * @param {DateTime} date
 * @param {number} n signed number of steps
 * @param {{unit: string, amount: number}} step
 * @param {{dateOnly?: boolean}} [options] the result is a date: it falls at midnight
 */
export function shiftBy(date, n, step, { dateOnly = false } = {}) {
    const total = n * step.amount;
    let result;
    if (step.unit === "minutes" || step.unit === "hours") {
        const zone = date.zone;
        result = date
            .setZone("utc", { keepLocalTime: true })
            .plus({ [step.unit]: total })
            .setZone(zone, { keepLocalTime: true });
    } else {
        result = date.plus({ [step.unit]: total });
    }
    return dateOnly ? result.startOf("day") : result;
}

/**
 * R4: both bounds of a record moved by `n` steps (not rounded to sub-columns).
 * @param {{start: DateTime, stop: DateTime}} record
 * @returns {{start: DateTime, stop: DateTime}}
 */
export function movedBounds(record, n, step, placement) {
    return {
        start: shiftBy(record.start, n, step, { dateOnly: Boolean(placement?.startIsDate) }),
        stop: shiftBy(record.stop, n, step, { dateOnly: Boolean(placement?.stopIsDate) }),
    };
}

/**
 * R8: the new value of one bound, moved by `n` steps; the other bound is not touched.
 * @param {"start"|"stop"} which
 * @returns {DateTime}
 */
export function resizedBound(record, which, n, step, placement) {
    const dateOnly = Boolean(which === "start" ? placement?.startIsDate : placement?.stopIsDate);
    return shiftBy(record[which], n, step, { dateOnly });
}

/**
 * R12: whether giving `value` to the bound `which` makes the record end before it starts. A
 * date-only stop counts as the end of its day, so it is not before a start inside that day.
 * @param {"start"|"stop"} which
 * @param {DateTime} value the new value of that bound
 */
export function resizeIsInvalid(record, which, value, placement) {
    const stopIsDate = Boolean(placement?.stopIsDate);
    const endOf = (stop) => (stopIsDate ? stop.plus({ days: 1 }) : stop);
    if (which === "start") {
        const end = endOf(record.stop);
        return stopIsDate ? value >= end : value > end;
    }
    const end = endOf(value);
    return stopIsDate ? end <= record.start : end < record.start;
}

function lengthUnit(data, dateOnly) {
    if (data.scaleId === "year") {
        return "months";
    }
    if (dateOnly) {
        return "days";
    }
    return data.scaleId === "day" ? "minutes" : "hours";
}

/** Signed difference `to - from` in `unit`, on the local wall-clock, rounded. */
function wallDifference(from, to, unit) {
    if (unit === "months") {
        return Math.round(to.diff(from, "months").months);
    }
    const asUtc = (date) => date.setZone("utc", { keepLocalTime: true });
    return Math.round(asUtc(to).diff(asUtc(from), unit).as(unit));
}

function unitText(unit) {
    switch (unit) {
        case "minutes":
            return _t("minutes");
        case "hours":
            return _t("hours");
        case "days":
            return _t("days");
        default:
            return _t("months");
    }
}

function roleOf(change) {
    return change > 0 ? "success" : change < 0 ? "danger" : "black";
}

/** R6 (R-C-7): a whole number written as the dates beside it are, in the user's locale. */
function localNumber(value, date) {
    const options = date.numberingSystem ? { numberingSystem: date.numberingSystem } : {};
    return new Intl.NumberFormat(date.locale || undefined, options).format(value);
}

/**
 * R6: texts and colour roles of the two badges while moving, copying or resizing.
 * @param {Object} params
 * @param {DateTime} params.start new start; @param {DateTime} params.stop new stop
 * @param {"start"|"stop"} [params.which] the moved bound of a resize
 * @param {"move"|"copy"|"resize"} params.kind
 * @param {number} params.n signed steps of a move or copy (sets the colour of both badges)
 * @param {DateTime} params.oldStart @param {DateTime} params.oldStop bounds before the gesture
 * @param {Object} params.data published data (`scaleId`, `parts`)
 * @param {boolean} params.dateOnlyStart @param {boolean} params.dateOnlyStop
 * @returns {{start: {text: string, role: string}, stop: {text: string, role: string}}}
 */
export function dragBadges({
    start,
    stop,
    which,
    kind,
    n,
    oldStart,
    oldStop,
    data,
    dateOnlyStart,
    dateOnlyStop,
}) {
    const textOf = (date, dateOnly) =>
        dateOnly
            ? date.toLocaleString(DateTime.DATE_SHORT)
            : badgeText(date, data.scaleId, data.parts);
    const badges = {
        start: { text: textOf(start, dateOnlyStart), role: "black" },
        stop: { text: textOf(stop, dateOnlyStop), role: "black" },
    };
    if (kind !== "resize") {
        const role = roleOf(n);
        badges.start.role = role;
        badges.stop.role = role;
        return badges;
    }
    // the sign is the change of the pill's length, not the direction in time (D4)
    const change =
        which === "start"
            ? wallDifference(start, oldStart, "minutes")
            : wallDifference(oldStop, stop, "minutes");
    const dateOnly = which === "start" ? dateOnlyStart : dateOnlyStop;
    const unit = lengthUnit(data, dateOnly);
    const count =
        which === "start"
            ? wallDifference(start, oldStart, unit)
            : wallDifference(oldStop, stop, unit);
    badges[which].role = roleOf(change);
    if (count) {
        badges[which].text += ` (${count > 0 ? "+" : "-"}${localNumber(Math.abs(count), start)} ${unitText(unit)})`;
    }
    return badges;
}

/**
 * Text of a bound written to the server: UTC `YYYY-MM-DD HH:mm:ss` for a date-and-time field,
 * `YYYY-MM-DD` for a date field (002b model.md).
 * @param {DateTime|null} value
 * @param {string} fieldType "date" or anything else for date and time
 * @returns {string|false}
 */
export function serializeBound(value, fieldType) {
    if (!value) {
        return false;
    }
    return fieldType === "date" ? serializeDate(value) : serializeDateTime(value);
}

function boundValues(bounds, placement) {
    const { startField, stopField, startIsDate, stopIsDate } = placement;
    return {
        [startField]: serializeBound(bounds.start, startIsDate ? "date" : "datetime"),
        [stopField]: serializeBound(bounds.stop, stopIsDate ? "date" : "datetime"),
    };
}

/** Value of a grouping field in the form `write` and `copy` accept. */
function ormValue(fields, name, value) {
    if (fields[name]?.type === "many2many") {
        return Array.isArray(value) && value.length ? [[6, 0, value]] : false;
    }
    return value;
}

/**
 * R5: the values of one move's write. Empty when nothing changes (D3). Start and stop are
 * left out when `n` is 0; a grouping value the record holds is left out too (for a relation to
 * many records: when its list already contains the row's record).
 * @param {Object} params
 * @param {Object} params.record the moved record (`raw` holds the values read at press)
 * @param {{start: DateTime, stop: DateTime}} params.bounds result of `movedBounds`
 * @param {number} params.n
 * @param {Object} params.targetChain `rowValueChain` of the target row
 * @param {Object} params.fields model fields
 * @param {Object} params.placement
 * @returns {Object} field name -> value to write
 */
export function moveWriteValues({ record, bounds, n, targetChain, fields, placement }) {
    const values = n ? boundValues(bounds, placement) : {};
    for (const [name, wanted] of Object.entries(targetChain || {})) {
        const held = heldValue(record, name, fields);
        if (fields[name]?.type === "many2many") {
            const keeps = wanted
                ? Array.isArray(held) && wanted.every((id) => held.includes(id))
                : !held;
            if (keeps) {
                continue;
            }
        } else if (JSON.stringify(held) === JSON.stringify(wanted)) {
            continue;
        }
        values[name] = ormValue(fields, name, wanted);
    }
    return values;
}

/**
 * R7: the defaults of a copy: start and stop always, and every grouping value of the target
 * row (also those the record already holds).
 */
export function copyDefaults({ bounds, targetChain, fields, placement }) {
    const defaults = boundValues(bounds, placement);
    for (const [name, value] of Object.entries(targetChain || {})) {
        defaults[name] = ormValue(fields, name, value);
    }
    return defaults;
}

/**
 * R10: the mapping sent to the undo method. A copy sends nothing; a resize the start and stop
 * before the change; a move also the grouping values of the starting row, where a relation to
 * many records gives the record's whole former list.
 * @param {"move"|"resize"|"copy"} params.kind
 * @param {Object} params.fromChain `rowValueChain` of the starting row
 */
export function undoValues({ kind, record, fromChain, fields, placement }) {
    if (kind === "copy") {
        return {};
    }
    const { startField, stopField } = placement;
    const values = {
        [startField]: record.raw?.[startField] || serializeBound(record.start, fields[startField]?.type),
        [stopField]: record.raw?.[stopField] || serializeBound(record.stop, fields[stopField]?.type),
    };
    if (kind === "move") {
        for (const [name, value] of Object.entries(fromChain || {})) {
            values[name] =
                fields[name]?.type === "many2many"
                    ? ormValue(fields, name, record.raw?.[name])
                    : value;
        }
    }
    return values;
}

function pathTo(rows, rowId) {
    const walk = (list, trail) => {
        for (const row of list || []) {
            const next = [...trail, row];
            if (row.id === rowId) {
                return next;
            }
            const found = row.children?.length && walk(row.children, next);
            if (found) {
                return found;
            }
        }
        return null;
    };
    return walk(rows, []);
}

/**
 * R13: whether the row `rowId` accepts a pill that started in the row `startRowId`. Rows of
 * the first read-only grouping level and of the levels below refuse, except the starting row
 * and the rows below the same row of the read-only level as the starting row.
 * @param {Object} params
 * @param {Array} params.rows the published row tree
 * @param {string} params.rowId
 * @param {string} params.startRowId
 * @param {string[]} params.groupBy
 * @param {Object} params.fields
 */
export function rowAcceptsDrop({ rows, rowId, startRowId, groupBy, fields }) {
    const readonlyLevel = (groupBy || []).findIndex((name) => fields[name]?.readonly);
    if (readonlyLevel < 0) {
        return true;
    }
    const target = pathTo(rows, rowId);
    if (!target) {
        return false;
    }
    if (target.length - 1 < readonlyLevel) {
        return true;
    }
    if (rowId === startRowId) {
        return true;
    }
    const start = pathTo(rows, startRowId);
    return Boolean(
        start &&
            target.length - 1 > readonlyLevel &&
            start.length > readonlyLevel &&
            start[readonlyLevel].id === target[readonlyLevel].id
    );
}
