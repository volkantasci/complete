// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { serializeDate, serializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

/**
 * The grouping value of a row in the format a create call takes (002b3 R11 point 3, 002b R6
 * point 2). `value` is the row's value as `rowValueChain` gives it: false for an "Undefined" row,
 * the id for a many2one, a list holding the id for a many2many. A many2many gets the command that
 * replaces the whole list, so that an "Undefined" row empties the template form's tags too.
 */
function createGroupValue(field, value) {
    if (field?.type === "many2many") {
        const ids = Array.isArray(value) ? value : value ? [value] : [];
        return [[6, 0, ids]];
    }
    return value === undefined || value === null ? false : value;
}

/**
 * The start and stop values of one day of one row, by the types of the two fields (R11 point 2,
 * 002b D1): both date-and-time give the day at the template's start and end time in the user's
 * zone, sent in UTC; date-only bounds give the day; in a mixed model the date-only bound takes
 * the day and the date-and-time bound takes the start of the day's first picked sub-column (start
 * field) or the end of its last one (stop field).
 */
function dayValues({ entry, fields, startField, stopField, timeRange, partBounds, tz }) {
    const startIsDate = fields[startField]?.type === "date";
    const stopIsDate = fields[stopField]?.type === "date";
    const values = {};
    const withTimes = !startIsDate && !stopIsDate && Boolean(timeRange);
    const zone = tz || partBounds(entry.firstPart).start.zone;
    const atTime = (time) =>
        DateTime.fromISO(entry.day, { zone }).set({
            hour: time.hour,
            minute: time.minute,
            second: time.second || 0,
            millisecond: 0,
        });
    if (startIsDate) {
        values[startField] = serializeDate(DateTime.fromISO(entry.day, { zone }));
    } else {
        values[startField] = serializeDateTime(
            withTimes ? atTime(timeRange.start) : partBounds(entry.firstPart).start
        );
    }
    if (stopIsDate) {
        values[stopField] = serializeDate(DateTime.fromISO(entry.day, { zone }));
    } else {
        values[stopField] = serializeDateTime(
            withTimes ? atTime(timeRange.end) : partBounds(entry.lastPart).stop
        );
    }
    return values;
}

/**
 * R11: the value sets of one create call, one per day and record row of `entries`.
 * Precedence (decision D4): the row's grouping values and the cell's dates replace the template
 * form's values for the same fields; every other form value is sent as the form has it.
 * @param {Object} params
 * @param {Object} params.formValues values of the template form in server format
 * @param {Array<{rowId: string, day: string, firstPart: number, lastPart: number}>} params.entries
 *  the picked days (`pickedDays()`): record rows only
 * @param {Object<string, Object>} params.rows the grouping values of each row, by row id (`rowOf`)
 * @param {Object} params.fields field definitions of the model
 * @param {string} params.startField
 * @param {string} params.stopField
 * @param {{start: {hour: number, minute: number}, end: {hour: number, minute: number}}|null}
 *  params.timeRange the popover's times, null when a bound is date-only
 * @param {(part: number) => {start: DateTime, stop: DateTime}} params.partBounds
 * @param {string|import("luxon").Zone} [params.tz] user zone; the zone of the part when absent
 * @returns {Array<Object>}
 */
export function buildMultiCreateValues({
    formValues,
    entries,
    rows,
    fields,
    startField,
    stopField,
    timeRange,
    partBounds,
    tz,
}) {
    return entries.map((entry) => {
        const values = { ...formValues };
        for (const [name, value] of Object.entries(rows[entry.rowId] || {})) {
            values[name] = createGroupValue(fields[name], value);
        }
        Object.assign(
            values,
            dayValues({ entry, fields, startField, stopField, timeRange, partBounds, tz })
        );
        return values;
    });
}
