// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { namedRange, stepRange } from "@web_gantt/timeline_dates";

/**
 * Pure functions of the time-off Gantt views.
 */

/**
 * R17: the one period of a named range that contains `focus`: Week one week from the
 * language's first day, Month one calendar month, Quarter one calendar quarter and so on.
 * The result is a range `{kind, start, stop, focus}` like 002a's, with `stop` inclusive.
 */
export function hhgOnePeriod(kind, focus) {
    const day = focus.startOf("day");
    // 002a builds three periods around the focus: the middle one is the one wanted
    const middle = stepRange(namedRange(kind, day), 1);
    const after = stepRange(middle, 1);
    return { kind, start: middle.start, stop: after.start.minus({ days: 1 }), focus: day };
}
