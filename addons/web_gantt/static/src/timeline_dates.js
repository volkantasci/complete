// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { localization } from "@web/core/l10n/localization";
import { _t } from "@web/core/l10n/translation";

const { DateTime } = luxon;

/**
 * Pure date engine of the timeline view: ranges, scales, columns, navigation.
 *
 * Every date is a luxon DateTime in the local zone. A range is
 * `{kind, start, stop, focus}` where `kind` is one of `day|week|month|quarter|year|custom`,
 * `start` and `stop` are starts of day and `stop` is inclusive.
 */

export const TIMELINE_KINDS = ["day", "week", "month", "quarter", "year"];
const SCALE_ORDER = ["day", "week", "month", "year"];
const MAX_YEARS = 10;

export const TIMELINE_SCALES = {
    day: {
        column: "hour",
        group: "day",
        minWidth: 40,
        defaultParts: 1,
        parts: { full: 1, half: 2, quarter: 4 },
    },
    week: {
        column: "day",
        group: "week",
        minWidth: 192,
        defaultParts: 2,
        parts: { full: 1, half: 2, quarter: 4 },
    },
    month: {
        column: "day",
        group: "month",
        minWidth: 52,
        defaultParts: 2,
        parts: { full: 1, half: 2, quarter: 4 },
    },
    year: {
        column: "month",
        group: "year",
        minWidth: 100,
        defaultParts: 1,
        parts: { full: 1 },
    },
};

/** @returns {string} the scale a range kind is drawn with (quarter uses months). */
export function scaleForKind(kind) {
    return kind === "quarter" ? "month" : kind;
}

/**
 * @param {string|string[]|undefined} scalesAttr comma separated names or a list
 * @param {string} [defaultKind]
 * @returns {string[]} offered kinds in the fixed order day ... year
 */
export function offeredKinds(scalesAttr, defaultKind) {
    const names = Array.isArray(scalesAttr) ? scalesAttr : String(scalesAttr || "").split(",");
    const wanted = new Set(names.map((name) => String(name).trim()));
    let kinds = TIMELINE_KINDS.filter((kind) => wanted.has(kind));
    if (!kinds.length) {
        kinds = [...TIMELINE_KINDS];
    }
    if (TIMELINE_KINDS.includes(defaultKind) && !kinds.includes(defaultKind)) {
        kinds = TIMELINE_KINDS.filter((kind) => kinds.includes(kind) || kind === defaultKind);
    }
    return kinds;
}

/** @returns {string} the scale of a custom range, given the offered kinds (R8, D7). */
export function scaleForCustom(start, stop, offered) {
    const days = Math.round(stop.startOf("day").diff(start.startOf("day"), "days").days);
    let wanted;
    if (days < 6) {
        wanted = "day";
    } else if (days < 27) {
        wanted = "week";
    } else if (days < 364) {
        wanted = "month";
    } else {
        wanted = "year";
    }
    let available = new Set((offered || []).map(scaleForKind));
    if (!available.size) {
        available = new Set(SCALE_ORDER);
    }
    if (available.has(wanted)) {
        return wanted;
    }
    const wantedIndex = SCALE_ORDER.indexOf(wanted);
    for (let i = wantedIndex - 1; i >= 0; i--) {
        if (available.has(SCALE_ORDER[i])) {
            return SCALE_ORDER[i];
        }
    }
    for (let i = wantedIndex + 1; i < SCALE_ORDER.length; i++) {
        if (available.has(SCALE_ORDER[i])) {
            return SCALE_ORDER[i];
        }
    }
    return wanted;
}

function startOfWeek(date) {
    const day = date.startOf("day");
    return day.minus({ days: (day.weekday + 7 - localization.weekStart) % 7 });
}

function startOfQuarter(date) {
    return date.startOf("month").set({ month: Math.floor((date.month - 1) / 3) * 3 + 1 });
}

/** @returns {{kind: string, start: DateTime, stop: DateTime, focus: DateTime}} three periods around focus. */
export function namedRange(kind, focus) {
    const day = focus.startOf("day");
    let start;
    let stop;
    switch (kind) {
        case "day":
            start = day.minus({ days: 1 });
            stop = day.plus({ days: 1 });
            break;
        case "week": {
            const first = startOfWeek(day);
            start = first.minus({ days: 7 });
            stop = first.plus({ days: 13 });
            break;
        }
        case "month": {
            const first = day.startOf("month");
            start = first.minus({ months: 1 });
            stop = first.plus({ months: 2 }).minus({ days: 1 });
            break;
        }
        case "quarter": {
            const first = startOfQuarter(day);
            start = first.minus({ months: 3 });
            stop = first.plus({ months: 6 }).minus({ days: 1 });
            break;
        }
        case "year": {
            const first = day.startOf("year");
            start = first.minus({ years: 1 });
            stop = first.plus({ years: 2 }).minus({ days: 1 });
            break;
        }
        default:
            throw new Error(`Unknown range kind "${kind}"`);
    }
    return { kind, start, stop, focus: day };
}

/**
 * Initial range (R6): stored kind, then context kind, then default kind, then custom.
 * A stored "custom" is never used.
 */
export function initialRange({
    storedKind,
    contextKind,
    defaultKind,
    contextStart,
    contextStop,
    focus,
    today,
    offered,
}) {
    const isOffered = (kind) => TIMELINE_KINDS.includes(kind) && (offered || []).includes(kind);
    const day = focus.startOf("day");
    if (isOffered(storedKind)) {
        return namedRange(storedKind, day);
    }
    if (isOffered(contextKind)) {
        return namedRange(contextKind, day);
    }
    if (TIMELINE_KINDS.includes(defaultKind)) {
        return namedRange(defaultKind, day);
    }
    const start = contextStart && contextStart.startOf("day");
    const stop = contextStop && contextStop.startOf("day");
    if (start && stop) {
        const now = (today || day).startOf("day");
        const inside = now < start ? start : now > stop ? stop : now;
        return { kind: "custom", start, stop, focus: inside };
    }
    if (start) {
        return {
            kind: "custom",
            start,
            stop: start.startOf("month").plus({ months: 3 }).minus({ days: 1 }),
            focus: start,
        };
    }
    if (stop) {
        const boundary = stop.day === 1 ? stop : stop.startOf("month").plus({ months: 1 });
        return {
            kind: "custom",
            start: boundary.minus({ months: 3 }),
            stop,
            focus: stop,
        };
    }
    const first = day.startOf("month");
    return {
        kind: "custom",
        start: first,
        stop: first.plus({ months: 3 }).minus({ days: 1 }),
        focus: day,
    };
}

function stepOf(kind) {
    switch (kind) {
        case "day":
            return { days: 1 };
        case "week":
            return { days: 7 };
        case "month":
            return { months: 1 };
        case "quarter":
            return { months: 3 };
        case "year":
            return { years: 1 };
    }
    return null;
}

function customLength(range) {
    return Math.round(range.stop.diff(range.start, "days").days) + 1;
}

/** Previous (-1) or next (+1) range: one period, or the length of a custom range. */
export function stepRange(range, direction) {
    if (range.kind === "custom") {
        const days = customLength(range) * direction;
        return {
            kind: "custom",
            start: range.start.plus({ days }),
            stop: range.stop.plus({ days }),
            focus: range.focus.plus({ days }),
        };
    }
    const unit = stepOf(range.kind);
    const delta = Object.fromEntries(Object.entries(unit).map(([k, v]) => [k, v * direction]));
    return {
        kind: range.kind,
        start: range.start.plus(delta),
        stop: range.stop.plus({ days: 1 }).plus(delta).minus({ days: 1 }),
        focus: range.focus.plus(delta),
    };
}

/** The range "Today" jumps to when today is outside the displayed period (D6). */
export function rangeAroundToday(range, today) {
    const day = today.startOf("day");
    if (range.kind !== "custom") {
        return namedRange(range.kind, day);
    }
    const length = Math.round(range.stop.diff(range.start, "days").days);
    const start = day.minus({ days: Math.floor(length / 2) });
    return { kind: "custom", start, stop: start.plus({ days: length }), focus: day };
}

/**
 * Keep custom dates coherent: start after stop moves the other date, and a range is never
 * longer than ten years minus one day.
 * @param {"start"|"stop"} edited the date the user changed
 */
export function fixCustomDates(start, stop, edited) {
    if (start > stop) {
        if (edited === "start") {
            stop = start;
        } else {
            start = stop;
        }
    }
    const longest = start.plus({ years: MAX_YEARS }).minus({ days: 1 });
    if (stop > longest) {
        if (edited === "start") {
            stop = longest;
        } else {
            start = stop.minus({ years: MAX_YEARS }).plus({ days: 1 });
        }
    }
    return { start, stop };
}

/** @returns {{start: DateTime, stop: DateTime}} whole columns covering the range, stop exclusive. */
export function displayedPeriod(range, scaleId) {
    if (TIMELINE_SCALES[scaleId].column === "month") {
        return {
            start: range.start.startOf("month"),
            stop: range.stop.startOf("month").plus({ months: 1 }),
        };
    }
    return {
        start: range.start.startOf("day"),
        stop: range.stop.startOf("day").plus({ days: 1 }),
    };
}

/** Columns of the period in local calendar time (a clock change gives 23 or 25 hours). */
export function buildColumns(scaleId, period) {
    const unit = TIMELINE_SCALES[scaleId].column;
    const unitOfToday = unit === "month" ? "month" : "day";
    const now = DateTime.now();
    const columns = [];
    let cursor = period.start;
    while (cursor < period.stop) {
        const next = cursor.plus({ [`${unit}s`]: 1 });
        const isToday =
            unit === "hour" ? cursor <= now && now < next : cursor.hasSame(now, unitOfToday);
        columns.push({ start: cursor, stop: next, isToday });
        cursor = next;
    }
    return columns;
}

function groupStart(scaleId, date) {
    switch (TIMELINE_SCALES[scaleId].group) {
        case "day":
            return date.startOf("day");
        case "week":
            return startOfWeek(date);
        case "month":
            return date.startOf("month");
        default:
            return date.startOf("year");
    }
}

function groupLabel(scaleId, first) {
    switch (TIMELINE_SCALES[scaleId].group) {
        case "day":
            return first.toLocaleString(DateTime.DATE_HUGE);
        case "week": {
            const last = first.plus({ days: 6 });
            const withYear = first.year !== DateTime.now().year;
            const format = withYear
                ? { month: "short", day: "numeric", year: "numeric" }
                : { month: "short", day: "numeric" };
            const number = first.plus({ days: 3 }).weekNumber;
            return _t("Week %(number)s, %(from)s - %(to)s", {
                number,
                from: first.toLocaleString(format),
                to: last.toLocaleString(format),
            }).toString();
        }
        case "month":
            return first.toLocaleString({ month: "long", year: "numeric" });
        default:
            return String(first.year);
    }
}

/** Groups of consecutive columns shown under one header. */
export function buildColumnGroups(scaleId, columns) {
    const groups = [];
    let current = null;
    columns.forEach((column, index) => {
        const first = groupStart(scaleId, column.start);
        if (!current || current.key !== first.toMillis()) {
            const label = groupLabel(scaleId, first);
            current = {
                key: first.toMillis(),
                start: column.start,
                stop: column.stop,
                firstColumn: index,
                span: 0,
                label,
                tooltip: label,
            };
            groups.push(current);
        }
        current.span++;
        current.stop = column.stop;
    });
    return groups.map(({ key, ...group }) => group);
}

function parsePrecision(precisionAttr) {
    if (!precisionAttr) {
        return {};
    }
    if (typeof precisionAttr === "object") {
        return precisionAttr;
    }
    for (const text of [precisionAttr, String(precisionAttr).replace(/'/g, '"')]) {
        try {
            const value = JSON.parse(text);
            if (value && typeof value === "object") {
                return value;
            }
        } catch {
            // try the next spelling
        }
    }
    return {};
}

/** @returns {1|2|4} how many parts a column is split in for pills (R9). */
export function partsFor(scaleId, precisionAttr) {
    const scale = TIMELINE_SCALES[scaleId];
    const setting = parsePrecision(precisionAttr)[scaleId];
    if (typeof setting === "string") {
        const [first, second] = setting.split(":").map((item) => item.trim());
        const unit = second === undefined ? scale.column : first;
        const name = (second === undefined ? first : second).replace("whole", "full");
        if (unit === scale.column && Object.hasOwn(scale.parts, name)) {
            return scale.parts[name];
        }
    }
    return scale.defaultParts;
}

/**
 * @returns {{width: number, scrolls: boolean}} columns share the width equally unless the share
 * falls below the scale minimum, which is then used (rounded down to a multiple of the parts).
 */
export function columnWidth(scaleId, columnsCount, parts, availableWidth) {
    const { minWidth } = TIMELINE_SCALES[scaleId];
    const share = columnsCount ? availableWidth / columnsCount : availableWidth;
    if (share >= minWidth) {
        return { width: share, scrolls: false };
    }
    return { width: Math.floor(minWidth / parts) * parts, scrolls: true };
}
