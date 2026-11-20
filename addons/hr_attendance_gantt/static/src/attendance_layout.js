// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { namedRange, stepRange } from "@web_gantt/timeline_dates";

/**
 * Pure functions of the attendance variant of the Gantt view: the one period of a range (R12),
 * the condition on the records shown (R13) and the label and bar of the hours worked (R17, R18).
 */

/** R17 point 1: the window width from which the label shows its long form. */
export const WIDE_LABEL_WIDTH = 1400;

/** R26 point 1: the inner heights of the two column header lines and of a drawn row (a 41 px row). */
export const HEADER_LINES_HEIGHT = 25 + 50;
export const ROW_INNER_HEIGHT = 40;

/**
 * R26 point 2: the fixed place of the phone's attendance helper, from the top of the control panel
 * (the bottom of the navigation bar): y 274.625 in a 46 px high navigation bar. It does not move
 * with the search bar, which pushes the grid down but not the helper.
 */
export const PHONE_HELPER_TOP = 228.625;

/**
 * R26 point 1: the distance from the top of the view's area (the area under the control panel) to
 * the top of the helper's layer: the header lines plus the inner heights of the employee rows
 * drawn (115 px with one row, 75 px with none). The control bar and the overview band are not
 * counted. It does not depend on the window's height.
 * @param {number} rowCount the employee rows drawn (a view without row headers draws none)
 */
export function helperOffset(rowCount) {
    return HEADER_LINES_HEIGHT + rowCount * ROW_INNER_HEIGHT;
}

/**
 * R12: the one period of a named range that contains `focus`: Day one day, Week one week,
 * Month one calendar month, Quarter one calendar quarter, Year one calendar year.
 * The result is a range `{kind, start, stop, focus}` like 002a's, with `stop` inclusive.
 */
export function onePeriod(kind, focus) {
    const day = focus.startOf("day");
    // 002a builds three periods around the focus: the middle one is the one wanted
    const first = stepRange(namedRange(kind, day), 1).start;
    const after = stepRange(stepRange(namedRange(kind, day), 1), 1).start;
    return { kind, start: first, stop: after.minus({ days: 1 }), focus: day };
}

/**
 * R13: the condition on the records shown for a period. Point 1: closed attendances whose
 * check-in is before the period's end and that end after its start or begin at or after it
 * (so one of zero length at the start shows); point 2, only when `now` is at or after the
 * period's start: open attendances that began before the period's end and before now.
 * The same shape as the server tests build (`R13_domain` in tests/hr_rows_fixtures.py).
 * @param {string} startText period start, server text (UTC)
 * @param {string} stopText period end, server text (UTC)
 * @param {string} nowText the browser's now, server text (UTC)
 * @param {boolean} started whether now is at or after the period's start
 */
export function periodDomain(startField, stopField, startText, stopText, nowText, started) {
    const closed = [
        "&",
        "&",
        [stopField, "!=", false],
        [startField, "<", stopText],
        "|",
        [stopField, ">", startText],
        [startField, ">=", startText],
    ];
    if (!started) {
        return closed;
    }
    const opened = [
        "&",
        "&",
        [stopField, "=", false],
        [startField, "<", stopText],
        [startField, "<", nowText],
    ];
    return ["|", ...closed, ...opened];
}

/**
 * Hours as whole minutes, rounded to the nearest, half a minute up (R17 point 1, decision D6: 30
 * seconds read as one minute). Hours are floats, so exactly half a minute can come out a hair
 * below it (8 h 0 m 30 s minus 8 h is 0.49999999999997 minutes): a tolerance of a millionth of a
 * minute settles it.
 */
export function wholeMinutes(hours) {
    return Math.floor(Math.abs(hours) * 60 + 0.5 + 1e-6);
}

/** The hours and minutes format of the Community: "29h", "3h 30m", "0h" (minutes only when not zero). */
export function hoursText(hours) {
    const total = wholeMinutes(hours);
    const minutes = total % 60;
    const text = minutes ? `${Math.floor(total / 60)}h ${minutes}m` : `${Math.floor(total / 60)}h`;
    return hours < 0 ? `-${text}` : text;
}

/**
 * The percentage of the tooltip: rounded to the nearest whole number, half up, not cut (R17 point
 * 5: 43.75 is "44", 72.49 is "72", 112.46 is "112"); a small epsilon keeps a half that a float
 * left a hair below it on the upper side.
 */
export function percentText(ratio) {
    return String(Math.round(ratio + 1e-9));
}

/** R17 point 2: "danger", "warning" or "success" from the ratio (in percent) and the tracking. */
export function progressStatus(ratio, tracked) {
    if (ratio >= 200) {
        return "danger";
    }
    if ((ratio > 100 && ratio < 200) || (ratio === 0 && tracked)) {
        return "warning";
    }
    return "success";
}

const LABEL_CLASSES = {
    success: "o_hag_success",
    warning: "o_hag_warning text-warning",
    danger: "o_hag_danger text-danger",
};

/**
 * R17, R18: what a row header shows for the answer of the server for one employee
 * (`{value, max_value, hag_fully_flexible, hag_tracked}`), in the shape 002a's template reads.
 * @param {Object} entry
 * @param {{wide: boolean}} options `wide`: the long form of the label (point 1)
 */
export function progressView(entry, { wide }) {
    const value = Number(entry.value) || 0;
    const maximum = Number(entry.max_value) || 0;
    const flexible = Boolean(entry.hag_fully_flexible);
    const ratio = maximum > 0 ? (value / maximum) * 100 : 0;
    const status = progressStatus(ratio, Boolean(entry.hag_tracked));
    const hasBar = maximum > 0 && !flexible;
    let extra = "";
    // a difference that rounds to no minute is no difference (no "+0h", no "0h left")
    const minutesApart = wholeMinutes(value - maximum);
    if (minutesApart > 0 && ratio > 100) {
        extra = `+${hoursText(value - maximum)}`;
    } else if (minutesApart > 0 && ratio > 0 && ratio < 100) {
        extra = _t("%(hours)s left", { hours: hoursText(maximum - value) }).toString();
    }
    let label;
    if (flexible) {
        label = hoursText(value);
    } else if (wide) {
        label = `${hoursText(value)} / ${hoursText(maximum)}`;
        if (extra) {
            label += ` (${extra})`;
        }
    } else {
        label = extra || hoursText(value);
    }
    return {
        label,
        status,
        labelClass: LABEL_CLASSES[status],
        fillClass: `o_hag_fill_${status}`,
        // 002a's own red above 100 % does not apply (R17 point 3)
        over: false,
        hasBar,
        fill: hasBar ? Math.min(ratio, 100) : 0,
        tooltip: hasBar
            ? `${hoursText(value)}/${hoursText(maximum)} (${percentText(ratio)}%)`
            : null,
        // R17 point 6: the attendance hook gives no warning text
        warning: null,
    };
}
