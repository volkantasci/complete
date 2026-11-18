// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { TimelineModel } from "@web_gantt/timeline_model";
import { lunchRoundedParts } from "./employee_layout";

const { DateTime } = luxon;

/**
 * The model of the employee variant of the Gantt view: it hands the user's search to the server
 * (R3), builds a range chosen from the menu around today when today is displayed (R6) and draws
 * a pill over two half days on one of them at lunch (R8).
 */
export class EmployeeTimelineModel extends TimelineModel {
    /** R3: the user's own conditions (filters, search field, favourites) as the context key. */
    async load(searchParams = {}) {
        this._userDomain = this._readUserDomain(searchParams);
        return super.load(searchParams);
    }

    /**
     * The search conditions without the action's domain, the grouping and the period.
     * @returns {Array}
     */
    _readUserDomain(searchParams) {
        const searchModel = this.env.searchModel;
        if (searchModel && typeof searchModel._getDomain === "function") {
            return searchModel._getDomain({ withGlobal: false });
        }
        return searchParams.domain || [];
    }

    _request(range, offset) {
        const request = super._request(range, offset);
        request.kwargs.context = { ...request.kwargs.context, user_domain: this._userDomain || [] };
        return request;
    }

    /**
     * R6: today when it lies inside the displayed period (the whole loaded range, whatever part
     * of it is in view), else the middle of the visible part (002a R10 point 3).
     */
    _focusForKind(kind) {
        const today = DateTime.now().startOf("day");
        const period = this.period;
        if (period && today >= period.start && today < period.stop) {
            return today;
        }
        return super._focusForKind(kind);
    }

    /** R8: the sub-columns a pill covers; the lunch rounding applies at half-day precision. */
    _spanOf(record) {
        const span = super._spanOf(record);
        if (!span) {
            return span;
        }
        return this._lunchRounded(record, span);
    }

    _lunchRounded(record, span) {
        if (this.parts !== 2 || span.to - span.from !== 2) {
            return span;
        }
        const { startField, stopField } = this.config;
        const start = record[startField];
        const stop = record[stopField];
        if (!start || !stop || this.placement.startIsDate || this.placement.stopIsDate) {
            return span;
        }
        const periodStart = this.columns[0].start;
        const periodStop = this.columns.at(-1).stop;
        const from = start < periodStart ? periodStart : start;
        const to = stop > periodStop ? periodStop : stop;
        const day = from.startOf("day");
        // a stop at midnight still belongs to the day that ends there
        const lastMoment = to > from ? to.minus({ milliseconds: 1 }) : to;
        const sameDay = lastMoment.startOf("day").equals(day);
        const kept = lunchRoundedParts({
            startMinutes: from.diff(day, "minutes").minutes,
            stopMinutes: to.diff(day, "minutes").minutes,
            sameDay,
            parts: this.parts,
            subColumnsCovered: span.to - span.from,
        });
        if (kept === "first") {
            return { ...span, to: span.from + 1 };
        }
        if (kept === "second") {
            return { ...span, from: span.from + 1 };
        }
        return span;
    }
}
