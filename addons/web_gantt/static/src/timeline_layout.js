// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
const { DateTime } = luxon;

/**
 * Pure layout engine of the timeline view: pill placement, stacking, counts, labels,
 * unavailable parts and foldable runs.
 *
 * Positions are sub-column indexes over the displayed period: `columnIndex * parts + part`.
 * A pill occupies `[from, to)`. Lines are numbered from 1.
 */

const LINE_HEIGHT = 25;
const ROW_PADDING = 16;
const BAR_SHARE = 0.9;

/** @returns {number} 0..11, the palette index of a colour field value (R14). */
export function colorIndexOf(value) {
    let number;
    if (typeof value === "number") {
        number = Math.round(value);
    } else if (Array.isArray(value)) {
        number = value[0];
    } else {
        number = value?.id;
    }
    if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) {
        return 0;
    }
    return number % 12 || 0; // never -0
}

/** Sub-column position of an instant; `ceil` rounds up to the end of the sub-column. */
function positionOf(time, columns, parts, ceil) {
    const millis = time.toMillis();
    if (millis <= columns[0].start.toMillis()) {
        return 0;
    }
    if (millis >= columns[columns.length - 1].stop.toMillis()) {
        return columns.length * parts;
    }
    let low = 0;
    let high = columns.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (columns[middle].start.toMillis() <= millis) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    const column = columns[low];
    const begin = column.start.toMillis();
    const fraction = ((millis - begin) * parts) / (column.stop.toMillis() - begin);
    return low * parts + (ceil ? Math.ceil(fraction) : Math.floor(fraction));
}

/**
 * Place a record on the sub-columns (R12). A date-only stop includes its day.
 * @returns {{from: number, to: number, cutStart: boolean, cutStop: boolean}|null}
 */
export function pillSpan(
    record,
    { startField, stopField, startIsDate, stopIsDate },
    columns,
    parts
) {
    let start = record[startField];
    let stop = record[stopField];
    if (!start || !stop || !columns.length) {
        return null;
    }
    if (startIsDate) {
        start = start.startOf("day");
    }
    if (stopIsDate) {
        stop = stop.startOf("day").plus({ days: 1 });
    }
    if (stop < start) {
        return null;
    }
    const periodStart = columns[0].start;
    const periodStop = columns[columns.length - 1].stop;
    if ((stop <= periodStart && start < periodStart) || start >= periodStop) {
        return null; // wholly outside the displayed period
    }
    return {
        from: positionOf(start, columns, parts, false),
        to: positionOf(stop, columns, parts, true),
        cutStart: start < periodStart,
        cutStop: stop > periodStop,
    };
}

const instant = (value) => (value ? value.valueOf() : 0);

/** R18: by first sub-column, then by start. Returns a new array. */
export function orderPills(pills) {
    return [...pills].sort((a, b) => a.from - b.from || instant(a.start) - instant(b.start));
}

/**
 * R17: first fit against the last pill of each line. Orders the pills (R18), sets `line`
 * (from 1) on each and returns them in that order.
 */
export function stackPills(pills) {
    const ordered = orderPills(pills);
    const lastOfLine = [];
    for (const pill of ordered) {
        let index = lastOfLine.findIndex((last) => last.to <= pill.from);
        if (index < 0) {
            index = lastOfLine.length;
        }
        lastOfLine[index] = pill;
        pill.line = index + 1;
    }
    return ordered;
}

/** Height of a row holding `lines` lines of pills. */
export function rowHeightFor(lines) {
    return LINE_HEIGHT * Math.max(lines, 1) + ROW_PADDING;
}

/** R22: cut at every start and end; keep the segments where at least one pill runs. */
export function segmentCounts(pills) {
    const points = [...new Set(pills.flatMap((pill) => [pill.from, pill.to]))].sort(
        (a, b) => a - b
    );
    const segments = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const from = points[i];
        const to = points[i + 1];
        const count = pills.filter((pill) => pill.from <= from && pill.to >= to).length;
        if (count > 0) {
            segments.push({ from, to, count });
        }
    }
    return segments;
}

/** R26: bar height is 90 % of the row height times count over the largest count. */
export function totalBars(segments, rowHeight) {
    const maxCount = Math.max(0, ...segments.map((segment) => segment.count));
    return segments.map((segment) => ({
        ...segment,
        heightPx: (BAR_SHARE * rowHeight * segment.count) / maxCount,
        narrow: segment.to - segment.from <= 1,
    }));
}

/** Hours as `H:MM`, the float-time look (`4:00`, `91:00`). */
export function formatHours(value) {
    const minutes = Math.round(Math.abs(value) * 60);
    const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    return value < 0 ? `-${text}` : text;
}

const shortDate = (date) => date.toLocaleString({ month: "short", day: "numeric" });
const shortTime = (date) => date.toLocaleString(DateTime.TIME_SIMPLE);

/**
 * R13 label. `record` carries `start` and `stop` (DateTime) and, when
 * `hasAllocatedHours`, `allocatedHours`.
 */
export function pillLabel(record, name, { scaleId, range, computed, hasAllocatedHours }) {
    const { start, stop } = record;
    if (!computed || !start || !stop) {
        return name;
    }
    const startDay = start.startOf("day");
    const stopDay = stop.startOf("day");
    const severalDays = startDay < stopDay;
    const dates = () => `${shortDate(start)} - ${shortDate(stop)}`;
    if (scaleId === "year") {
        return `${severalDays ? dates() : shortDate(start)} ${name}`;
    }
    if (!severalDays && hasAllocatedHours && (scaleId === "week" || scaleId === "month")) {
        const times = `${shortTime(start)} - ${shortTime(stop)} (${formatHours(
            record.allocatedHours || 0
        )})`;
        return scaleId === "month" ? times : `${times} ${name}`;
    }
    if (severalDays && (startDay < range.start || stopDay > range.stop)) {
        return `${dates()} ${name}`;
    }
    return name;
}

/**
 * R28: parts of the columns completely covered by an unavailable period.
 * @param {{start: DateTime, stop: DateTime}[]} periods
 * @returns {Map<number, boolean[]>} only columns with at least one covered part
 */
export function unavailableParts(periods, columns, parts) {
    const merged = [];
    const sorted = periods
        .map((period) => [period.start.toMillis(), period.stop.toMillis()])
        .sort((a, b) => a[0] - b[0]);
    for (const [start, stop] of sorted) {
        const last = merged[merged.length - 1];
        if (last && start <= last[1]) {
            last[1] = Math.max(last[1], stop);
        } else {
            merged.push([start, stop]);
        }
    }
    const result = new Map();
    columns.forEach((column, index) => {
        const begin = column.start.toMillis();
        const length = column.stop.toMillis() - begin;
        const covered = Array.from({ length: parts }, (_unused, part) => {
            const from = begin + Math.round((length * part) / parts);
            const to = begin + Math.round((length * (part + 1)) / parts);
            return merged.some(([start, stop]) => start <= from && stop >= to);
        });
        if (covered.some(Boolean)) {
            result.set(index, covered);
        }
    });
    return result;
}

/**
 * R29: runs of foldable columns, `{first, last}` inclusive.
 * @param {Object} params
 * @param {Object[]} params.columns
 * @param {Map<number, boolean[]>[]} params.rowsUnavailable one map per non-group row with a value
 * @param {{from: number, to: number}[]} params.pillsSubRanges sub-column ranges of every pill
 * @param {string} params.scaleId
 * @param {number} [params.parts] parts per column (default: read from the maps, else 1)
 */
export function foldableRuns({ columns, rowsUnavailable, pillsSubRanges, scaleId, parts }) {
    if (!rowsUnavailable.length || rowsUnavailable.every((map) => !map.size)) {
        return [];
    }
    if (!parts) {
        const sample = rowsUnavailable.find((map) => map.size);
        parts = sample.values().next().value.length;
    }
    const runs = [];
    let current = null;
    columns.forEach((_column, index) => {
        const low = index * parts;
        const high = low + parts;
        const unavailable = rowsUnavailable.every((map) => map.get(index)?.every(Boolean));
        const touched = (pillsSubRanges || []).some(
            (range) => range.from < high && Math.max(range.to, range.from + 1) > low
        );
        if (unavailable && !touched) {
            if (current) {
                current.last = index;
            } else {
                current = { first: index, last: index };
                runs.push(current);
            }
        } else {
            current = null;
        }
    });
    return scaleId === "week" ? runs : runs.filter((run) => run.last > run.first);
}
